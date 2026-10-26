BEGIN;

CREATE TEMP TABLE payable_virtual_fixtures ON COMMIT DROP AS
 SELECT source.id AS statement_id,row_number() OVER(ORDER BY source.id) AS case_number
 FROM public.tms_carrier_statement source
 WHERE source.status='confirmed' AND source.settled_amount=0
  AND(SELECT bool_and(item.line_amount>0) AND sum(item.line_amount)>8 FROM public.tms_carrier_statement_item item WHERE item.statement_id=source.id AND item.is_active)
  AND NOT EXISTS(SELECT 1 FROM public.fms_purchase_payable_document payable WHERE payable.tms_statement_id=source.id AND payable.kind='financial')
  AND EXISTS(SELECT 1 FROM public.mdm_settlement_method method WHERE method.tenant_id=source.tenant_id AND method.enabled AND method.category='virtual')
  AND EXISTS(SELECT 1 FROM public.fms_fund_account account JOIN public.fms_currency currency ON currency.id=account.currency_id AND currency.tenant_id=account.tenant_id
   WHERE account.tenant_id=source.tenant_id AND account.account_type='bank' AND account.status='active' AND currency.currency_code='CNY'
   AND account.account_set_id=app_private.resolve_fms_posting_account_set(source.tenant_id))
 ORDER BY source.id LIMIT 2;

CREATE FUNCTION pg_temp.check_payable_tms_virtual(p_case integer) RETURNS void
LANGUAGE plpgsql AS $transport_virtual$
DECLARE
 actor uuid;statement public.tms_carrier_statement;finance jsonb;payment jsonb;projection jsonb;report_fact jsonb;
 payment_id uuid;line_ident uuid;execution_id uuid;record_id uuid;scheme_ident uuid;method_id uuid;fund_id uuid;
 amount_value numeric;initial_settled numeric;ledger_count bigint;cash_count bigint;tested integer:=0;blocked boolean;
 native_cash uuid;native_allocation uuid;workspace jsonb;plan jsonb;
BEGIN
 SELECT auth_user_id INTO STRICT actor FROM public.sys_user WHERE system_protected AND user_roles @>ARRAY['R_SUPER'] AND status='1' ORDER BY id LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 PERFORM set_config('request.headers','{}',true);
 FOR statement IN
  SELECT source.* FROM public.tms_carrier_statement source
  JOIN pg_temp.payable_virtual_fixtures fixture ON fixture.statement_id=source.id AND fixture.case_number=p_case
 LOOP
  initial_settled:=statement.settled_amount;
  finance:=public.fms_import_carrier_payable_secure('financial',statement.id);
  PERFORM public.fms_act_purchase_payable_secure(ARRAY[(finance->>'id')::uuid],'submit');
  PERFORM public.fms_act_purchase_payable_secure(ARRAY[(finance->>'id')::uuid],'approve');
  SELECT id INTO STRICT method_id FROM public.mdm_settlement_method WHERE tenant_id=statement.tenant_id AND category='virtual' AND enabled ORDER BY code LIMIT 1;
  SELECT account.id INTO STRICT fund_id FROM public.fms_fund_account account JOIN public.fms_currency currency ON currency.id=account.currency_id AND currency.tenant_id=account.tenant_id
   WHERE account.tenant_id=statement.tenant_id AND account.account_set_id=(finance->>'account_set_id')::uuid AND account.account_type='bank' AND account.status='active' AND currency.currency_code='CNY' ORDER BY account.id LIMIT 1;
  payment:=public.fms_push_payable_settlement_secure((finance->>'id')::uuid,'payment');
  payment_id:=(payment->>'id')::uuid;
  amount_value:=least(10,round((payment->>'amount')::numeric/4,2));
  payment:=public.fms_save_payable_settlement_secure(payment||jsonb_build_object('lines',
   (SELECT jsonb_agg(line||jsonb_build_object('settlement_method_id',method_id,'fund_account_id',CASE WHEN p_case=1 THEN NULL ELSE fund_id END,
    'amount',amount_value,'approved_amount',amount_value,'planned_amount',amount_value)) FROM jsonb_array_elements(payment->'lines') line)));
  line_ident:=(payment->'lines'->0->>'id')::uuid;
  PERFORM public.fms_act_payable_settlement_secure(ARRAY[payment_id],'submit');
  PERFORM public.fms_act_payable_settlement_secure(ARRAY[payment_id],'approve');
  PERFORM public.fms_act_purchase_payable_secure(ARRAY[(finance->>'id')::uuid],'freeze','非现金结算也必须遵守争议冻结',1);
  blocked:=false;BEGIN PERFORM public.fms_act_payable_settlement_secure(ARRAY[payment_id],'confirm');EXCEPTION WHEN check_violation THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'Virtual carrier payment bypassed frozen payable';END IF;
  PERFORM public.fms_act_purchase_payable_secure(ARRAY[(finance->>'id')::uuid],'unfreeze','回滚测试核对');
  SELECT count(*) INTO ledger_count FROM public.fms_fund_ledger_entry;
  SELECT count(*) INTO cash_count FROM public.tms_cash_transaction;
  PERFORM public.fms_act_payable_settlement_secure(ARRAY[payment_id],'confirm');
  IF(SELECT count(*) FROM public.fms_fund_ledger_entry)<>ledger_count OR(SELECT count(*) FROM public.tms_cash_transaction)<>cash_count THEN RAISE EXCEPTION 'Virtual settlement manufactured real cash or fund-ledger entries';END IF;
  SELECT execution.id INTO STRICT execution_id FROM public.fms_payable_payment_execution execution WHERE execution.line_id=line_ident AND execution.document_id=payment_id AND execution.status='posted';
  IF EXISTS(SELECT 1 FROM public.fms_payable_payment_execution execution WHERE execution.id=execution_id AND(execution.cash_transaction_id IS NOT NULL OR execution.fund_ledger_id IS NOT NULL OR execution.account_set_id IS DISTINCT FROM(finance->>'account_set_id')::uuid)) THEN RAISE EXCEPTION 'Virtual execution lost its original book or became cash';END IF;
  SELECT matched.id,matched.scheme_id INTO STRICT record_id,scheme_ident FROM public.fms_payable_writeoff_record matched WHERE matched.payment_line_id=line_ident AND matched.status='active';
  IF(SELECT settled_amount FROM public.tms_carrier_statement WHERE id=statement.id)<>initial_settled+amount_value THEN RAISE EXCEPTION 'Transport liability was not reduced exactly once';END IF;
  SELECT value INTO STRICT report_fact FROM app_private.payable_report_source_balances(jsonb_build_object('kind','financial','tenant_id',statement.tenant_id)) value WHERE value->>'document_id'=finance->>'id';
  projection:=app_private.purchase_payable_json((finance->>'id')::uuid);
  IF report_fact->>'balance_state'<>'ready' OR(report_fact->>'balance_amount')::numeric<>(projection->>'unpaid_amount')::numeric OR(projection->>'written_off_amount')::numeric<>amount_value THEN RAISE EXCEPTION 'Noncash payable/report balance was missing or double-counted';END IF;
  blocked:=false;BEGIN PERFORM public.fms_push_payable_settlement_secure(payment_id,'refund','payment');EXCEPTION WHEN check_violation THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'A noncash execution was treated as refundable cash principal';END IF;
  blocked:=false;BEGIN UPDATE public.fms_payable_writeoff_record SET amount=amount+1,payment_amount=payment_amount+1 WHERE id=record_id;EXCEPTION WHEN check_violation THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'Stored noncash source or amount could be rewritten';END IF;
  blocked:=false;BEGIN DELETE FROM public.fms_payable_writeoff_record WHERE id=record_id;EXCEPTION WHEN foreign_key_violation THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'Noncash settlement history could be erased';END IF;
  PERFORM public.fms_act_payable_settlement_secure(ARRAY[payment_id],'confirm');
  IF(SELECT count(*) FROM public.fms_payable_payment_execution WHERE document_id=payment_id AND status='posted')<>1
   OR(SELECT settled_amount FROM public.tms_carrier_statement WHERE id=statement.id)<>initial_settled+amount_value THEN RAISE EXCEPTION 'Repeated virtual confirmation generated another execution or settlement';END IF;
  PERFORM public.fms_reverse_payable_writeoff_secure(record_id,'非现金运输反核销');
  IF(SELECT settled_amount FROM public.tms_carrier_statement WHERE id=statement.id)<>initial_settled OR(app_private.payable_payment_line_state(line_ident)->>'available_settlement_face')::numeric<>amount_value THEN RAISE EXCEPTION 'Virtual reversal failed to restore both sides';END IF;
  workspace:=public.fms_payable_writeoff_workspace_secure(jsonb_build_object('supplier_id',statement.carrier_id));
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(workspace->'primary') item WHERE item->>'id'=finance->>'id' AND item->>'counterparty_key'='carrier:'||statement.carrier_id::text)
   OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(workspace->'secondary') item WHERE item->>'id'=line_ident::text AND(item->>'same_source_only')::boolean AND item->>'source_payable_id'=finance->>'id') THEN RAISE EXCEPTION 'Noncash carrier sources are not available in the ordinary writeoff workspace';END IF;
  plan:=public.fms_auto_payable_writeoff_secure(scheme_ident,app_private.payable_business_date(),jsonb_build_object('supplier_id',statement.carrier_id),false,NULL);
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(plan->'items') item WHERE item->>'payable_id'=finance->>'id' AND item->>'payment_line_id'=line_ident::text AND(item->>'amount')::numeric=amount_value) THEN RAISE EXCEPTION 'Automatic preview omitted the same-source noncash carrier pair';END IF;
  plan:=public.fms_auto_payable_writeoff_secure(scheme_ident,app_private.payable_business_date(),jsonb_build_object('supplier_id',statement.carrier_id),true,plan->>'plan_token');
  SELECT matched.id INTO STRICT record_id FROM public.fms_payable_writeoff_record matched WHERE matched.payment_line_id=line_ident AND matched.status='active';
  PERFORM public.fms_reverse_payable_writeoff_secure(record_id,'自动核销后恢复手工同源核销');
  PERFORM public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('payable_id',finance->>'id','payment_line_id',line_ident,'amount',amount_value)),scheme_ident,app_private.payable_business_date(),'同源非现金重新核销');
  native_cash:=public.create_fms_carrier_payment_secure(statement.carrier_id,fund_id,app_private.payable_business_date(),2,'bank_transfer',NULL,'[]','与非现金同源并存的实际付款',jsonb_build_array(jsonb_build_object('statement_id',statement.id,'amount',2)),NULL);
  IF(SELECT settled_amount FROM public.tms_carrier_statement WHERE id=statement.id)<>initial_settled+amount_value+2 THEN RAISE EXCEPTION 'Native cash allocation erased the noncash settlement';END IF;
  PERFORM public.fms_act_payable_settlement_secure(ARRAY[payment_id],'cancel_payment','保留实际付款，仅取消非现金结算');
  IF(SELECT settled_amount FROM public.tms_carrier_statement WHERE id=statement.id)<>initial_settled+2 OR EXISTS(SELECT 1 FROM public.fms_payable_writeoff_record WHERE payment_line_id=line_ident AND status='active') THEN RAISE EXCEPTION 'Noncash cancellation changed native cash or left active offsets';END IF;
  IF(SELECT status FROM public.tms_cash_transaction WHERE id=native_cash)='voided' THEN RAISE EXCEPTION 'Cancelling virtual payment voided a real cash transaction';END IF;
  SELECT id INTO STRICT native_allocation FROM public.tms_carrier_cash_allocation WHERE transaction_id=native_cash AND statement_id=statement.id AND is_active;
  PERFORM public.reverse_tms_carrier_cash_allocation(native_allocation,'回滚测试恢复实际核销');
  PERFORM public.void_tms_cash_transaction(native_cash,'回滚测试结束');
  IF(SELECT settled_amount FROM public.tms_carrier_statement WHERE id=statement.id)<>initial_settled THEN RAISE EXCEPTION 'Native reversal did not restore original transport liability';END IF;
  tested:=tested+1;
 END LOOP;
 IF tested<>1 THEN RAISE EXCEPTION 'Missing complete noncash carrier scenario %',p_case;END IF;
END $transport_virtual$;

SELECT pg_temp.check_payable_tms_virtual(1);
SELECT pg_temp.check_payable_tms_virtual(2);
ROLLBACK;
