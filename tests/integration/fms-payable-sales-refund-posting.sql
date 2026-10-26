BEGIN;
SET LOCAL jit=off;
SET LOCAL statement_timeout='8s';

CREATE FUNCTION pg_temp.configure_sales_refund_posting(p_currency text) RETURNS jsonb
LANGUAGE plpgsql AS $test$
DECLARE context_value jsonb:=current_setting('qa.sales_refund_kernel_'||lower(p_currency))::jsonb;
 tenant uuid:=(context_value->>'tenant')::uuid;book uuid:=(context_value->>'book')::uuid;
 customer_type uuid;customer_item uuid;receivable_subject uuid;cash_subject uuid;exchange_subject uuid;rule_ident uuid;
 suffix text:=to_char(clock_timestamp(),'YYYYMMDDHH24MISSUS');result jsonb;line_ident uuid;payload jsonb;other_book uuid;
BEGIN
 UPDATE public.sys_user SET user_roles=ARRAY[context_value->>'fixture_role_code'] WHERE id=(context_value->>'profile')::uuid;
 PERFORM set_config('request.jwt.claim.sub',context_value->>'actor',true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',context_value->>'actor','role','authenticated')::text,true);
 PERFORM set_config('request.headers','{}',true);
 INSERT INTO public.sys_role_menu(role_id,menu_id,tenant_id)
 SELECT role.id,menu.id,tenant FROM public.sys_role role CROSS JOIN public.sys_menu menu
 WHERE role.tenant_id=tenant AND role.role_code=context_value->>'fixture_role_code'
  AND menu.name IN('FinancePayablePayment:Voucher','FinanceVoucherCenter','FinanceVoucherCenter:View','FinanceVoucherCenter:Add','FinanceVoucherCenter:Void',
   'FinanceVoucherCenter:Submit','FinanceVoucherCenter:Approve','FinanceVoucherCenter:Post','FinanceVoucherCenter:Reverse','FinanceLedgerCenter','FinanceLedgerCenter:View')
 ON CONFLICT DO NOTHING;
 SELECT id INTO STRICT line_ident FROM public.fms_payable_settlement_line WHERE document_id=(context_value->>'payment')::uuid;
 payload:=app_private.payable_settlement_posting_payload(line_ident);
 UPDATE public.fms_posting_rule SET is_enabled=false WHERE tenant_id=tenant AND account_set_id=book AND source_type='system' AND event_code='ar_credit_payment_paid';
 result:=public.fms_payable_settlement_voucher_secure((context_value->>'payment')::uuid,'payment',true);
 IF result->>'status' IS DISTINCT FROM 'pending_configuration' OR jsonb_array_length(result->'lines')<>0 THEN
  RAISE EXCEPTION 'Missing sales refund rules falsely produced a voucher preview';END IF;
 result:=public.fms_payable_settlement_voucher_secure((context_value->>'payment')::uuid,'payment',false);
 IF result->>'status' IS DISTINCT FROM 'pending_configuration' OR jsonb_array_length(result->'voucher_ids')<>0 THEN
  RAISE EXCEPTION 'Missing sales refund rules falsely generated a voucher';END IF;
 INSERT INTO public.fms_subject(tenant_id,account_set_id,subject_code,subject_name,category,balance_direction,allow_foreign_currency)
 VALUES(tenant,book,'971'||suffix,'销售退款原应收回滚科目','asset','debit',true) RETURNING id INTO receivable_subject;
 INSERT INTO public.fms_subject(tenant_id,account_set_id,subject_code,subject_name,category,balance_direction,allow_foreign_currency)
 VALUES(tenant,book,'972'||suffix,'销售退款实际资金回滚科目','asset','debit',true) RETURNING id INTO cash_subject;
 INSERT INTO public.fms_subject(tenant_id,account_set_id,subject_code,subject_name,category,balance_direction)
 VALUES(tenant,book,'973'||suffix,'销售退款实际汇兑损益回滚科目','expense','debit') RETURNING id INTO exchange_subject;
 INSERT INTO public.fms_auxiliary_type(tenant_id,account_set_id,type_code,type_name,source_type)
 VALUES(tenant,book,'SALES_CUS_'||upper(left(gen_random_uuid()::text,8)),'销售退款客户回滚维度','customer') RETURNING id INTO customer_type;
 INSERT INTO public.fms_auxiliary_item(tenant_id,account_set_id,auxiliary_type_id,item_code,item_name,external_entity_type,external_entity_id)
 VALUES(tenant,book,customer_type,'CUSTOMER_'||upper(left(gen_random_uuid()::text,8)),'销售退款原客户回滚项','mdm_customer',(context_value->>'customer')::uuid) RETURNING id INTO customer_item;
 INSERT INTO public.fms_subject_auxiliary_type(tenant_id,account_set_id,subject_id,auxiliary_type_id,is_required)
 VALUES(tenant,book,receivable_subject,customer_type,true);
 INSERT INTO public.fms_posting_rule(tenant_id,account_set_id,rule_code,rule_name,source_type,event_code,priority,submission_mode,voucher_type,match_conditions)
 VALUES(tenant,book,'SALES_REFUND_'||upper(left(gen_random_uuid()::text,8)),'销售退款原应收双汇率回滚规则','system','ar_credit_payment_paid',999999,'draft','transfer',
  jsonb_build_object('customer_id',context_value->>'customer','fx_snapshot_version',1)) RETURNING id INTO rule_ident;
 INSERT INTO public.fms_posting_rule_line(tenant_id,account_set_id,rule_id,line_no,subject_id,direction,amount_key,auxiliary_bindings)
 VALUES(tenant,book,rule_ident,10,receivable_subject,'debit','receivable_amount',jsonb_build_object(customer_type,'customer_id')),
  (tenant,book,rule_ident,20,cash_subject,'credit','paid_amount','{}'),
  (tenant,book,rule_ident,30,exchange_subject,'debit','exchange_gain_loss','{}');
 INSERT INTO public.fms_account_set(tenant_id,account_set_code,account_set_name,legal_entity_name,base_currency_code,enabled_on,status)
 VALUES(tenant,'SALES_OTHER_'||upper(left(gen_random_uuid()::text,8)),'不属于原退款的回滚账套','虚构回滚主体','CNY',app_private.payable_business_date(),'active') RETURNING id INTO other_book;
 UPDATE public.fms_account_set SET is_default=false WHERE id=book;
 UPDATE public.fms_account_set SET is_default=true WHERE id=other_book;
 UPDATE public.fms_exchange_rate SET direct_rate=99 WHERE account_set_id=book AND currency_id=(context_value->>'currency_id')::uuid
  AND rate_date=app_private.payable_business_date() AND rate_type='spot' AND p_currency='USD';
 context_value:=context_value||jsonb_build_object('payment_line',line_ident,'receivable_subject',receivable_subject,'cash_subject',cash_subject,'other_book',other_book,
  'exchange_subject',exchange_subject,'customer_type',customer_type,'customer_item',customer_item,'rule',rule_ident,
  'fund_count',(SELECT count(*) FROM public.fms_fund_ledger_entry));
 PERFORM set_config('qa.sales_refund_kernel_'||lower(p_currency),context_value::text,true);
 RETURN jsonb_build_object('currency',p_currency,'configured',true);
END $test$;

CREATE FUNCTION pg_temp.post_sales_refund_voucher(p_currency text) RETURNS jsonb
LANGUAGE plpgsql AS $test$
DECLARE context_value jsonb:=current_setting('qa.sales_refund_kernel_'||lower(p_currency))::jsonb;
 tenant uuid:=(context_value->>'tenant')::uuid;book uuid:=(context_value->>'book')::uuid;
 payment_ident uuid:=(context_value->>'payment')::uuid;source_rate numeric:=(context_value->>'source_rate')::numeric;
 payment_rate numeric:=(context_value->>'payment_rate')::numeric;
 principal numeric:=(context_value->>'principal')::numeric;
 carrying_amount numeric:=round(principal*source_rate,2);cash_amount numeric:=round(principal*payment_rate,2);
 result jsonb;voucher_ident uuid;line_ident uuid;blocked boolean;forged_item uuid;event public.fms_posting_event;
BEGIN
 PERFORM set_config('app.fms_system_posting','off',true);
 BEGIN
  DELETE FROM public.sys_role_menu permission USING public.sys_role role,public.sys_menu menu
  WHERE permission.role_id=role.id AND permission.menu_id=menu.id AND role.tenant_id=tenant
   AND role.role_code=context_value->>'fixture_role_code' AND menu.name='FinancePayablePayment:Voucher';
  blocked:=false;
  BEGIN PERFORM public.fms_payable_settlement_voucher_secure(payment_ident,'payment',true);EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'Sales refund preview bypassed its exact voucher button permission';END IF;
  RAISE SQLSTATE 'ZX002' USING MESSAGE='Rollback intentional missing-permission verification';
 EXCEPTION WHEN SQLSTATE 'ZX002' THEN NULL;
 END;
 BEGIN
  UPDATE public.sys_role_field_permission permission SET access_level='hidden' FROM public.sys_role role,public.sys_permission_field field,public.sys_permission_resource resource
  WHERE permission.role_id=role.id AND role.tenant_id=tenant AND role.role_code=context_value->>'fixture_role_code'
   AND permission.field_id=field.id AND field.resource_id=resource.id AND resource.tenant_id=tenant AND resource.resource_key='fms.receivable' AND field.field_key='amounts';
  blocked:=false;
  BEGIN PERFORM public.fms_payable_settlement_voucher_secure(payment_ident,'payment',true);EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'Sales refund preview leaked hidden original receivable carrying amounts';END IF;
  RAISE SQLSTATE 'ZX003' USING MESSAGE='Rollback intentional hidden-amount verification';
 EXCEPTION WHEN SQLSTATE 'ZX003' THEN NULL;
 END;
 result:=public.fms_payable_settlement_voucher_secure(payment_ident,'payment',true);
 IF result->>'status' IS DISTINCT FROM 'generated' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result->'lines') line
  WHERE line->>'subject_name'='销售退款原应收回滚科目' AND(line->>'debit_amount')::numeric=carrying_amount)
  OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result->'lines') line
   WHERE line->>'subject_name'='销售退款实际资金回滚科目' AND(line->>'credit_amount')::numeric=cash_amount) THEN
  RAISE EXCEPTION 'Sales refund preview replaced original receivable carrying value or actual cash';END IF;
 IF p_currency='USD' AND(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result->'lines') line WHERE line->>'subject_name'='销售退款原应收回滚科目'
  AND(line->>'currency_id')::uuid=(context_value->>'currency_id')::uuid AND(line->>'original_amount')::numeric=principal AND(line->>'exchange_rate')::numeric=source_rate)
  OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result->'lines') line WHERE line->>'subject_name'='销售退款实际资金回滚科目'
   AND(line->>'currency_id')::uuid=(context_value->>'currency_id')::uuid AND(line->>'original_amount')::numeric=principal AND(line->>'exchange_rate')::numeric=payment_rate)) THEN
  RAISE EXCEPTION 'Sales refund preview omitted independent historical receivable and actual payment rates';END IF;
 result:=public.fms_payable_settlement_voucher_secure(payment_ident,'payment',false);
 IF result->>'status' IS DISTINCT FROM 'generated' OR jsonb_array_length(result->'voucher_ids')<>1 THEN
  RAISE EXCEPTION 'Configured sales refund did not generate its actual voucher: %',result;END IF;
 voucher_ident:=(result->'voucher_ids'->>0)::uuid;
 IF NOT EXISTS(SELECT 1 FROM public.fms_voucher WHERE id=voucher_ident AND tenant_id=tenant AND account_set_id=book
  AND source_type='system' AND source_event_code='ar_credit_payment_paid' AND source_id=(context_value->>'execution')::uuid
  AND total_debit=greatest(carrying_amount,cash_amount) AND total_credit=total_debit)
  OR NOT EXISTS(SELECT 1 FROM public.fms_voucher_line WHERE voucher_id=voucher_ident AND subject_id=(context_value->>'receivable_subject')::uuid
   AND debit_amount=carrying_amount AND auxiliary_values->>(context_value->>'customer_type')=context_value->>'customer_item')
  OR NOT EXISTS(SELECT 1 FROM public.fms_voucher_line WHERE voucher_id=voucher_ident AND subject_id=(context_value->>'cash_subject')::uuid AND credit_amount=cash_amount) THEN
  RAISE EXCEPTION 'Actual sales refund voucher lost its original book, source execution, customer auxiliary or balanced carrying values';END IF;
 IF p_currency='USD' AND(NOT EXISTS(SELECT 1 FROM public.fms_voucher_line WHERE voucher_id=voucher_ident AND subject_id=(context_value->>'receivable_subject')::uuid
  AND currency_id=(context_value->>'currency_id')::uuid AND original_amount=principal AND exchange_rate=source_rate)
  OR NOT EXISTS(SELECT 1 FROM public.fms_voucher_line WHERE voucher_id=voucher_ident AND subject_id=(context_value->>'cash_subject')::uuid
   AND currency_id=(context_value->>'currency_id')::uuid AND original_amount=principal AND exchange_rate=payment_rate)
  OR NOT EXISTS(SELECT 1 FROM public.fms_voucher_line WHERE voucher_id=voucher_ident AND subject_id=(context_value->>'exchange_subject')::uuid
   AND debit_amount=greatest(cash_amount-carrying_amount,0) AND credit_amount=greatest(carrying_amount-cash_amount,0)
   AND currency_id IS NULL AND original_amount=0 AND exchange_rate=1)) THEN
  RAISE EXCEPTION 'Actual sales refund voucher repriced the receivable or reversed realized FX gain/loss';END IF;
 IF p_currency='CNY' AND EXISTS(SELECT 1 FROM public.fms_voucher_line WHERE voucher_id=voucher_ident
  AND(currency_id IS NOT NULL OR original_amount<>0 OR exchange_rate<>1 OR subject_id=(context_value->>'exchange_subject')::uuid)) THEN
  RAISE EXCEPTION 'Base-currency sales refund produced foreign currency or fictitious exchange difference';END IF;
 SELECT id INTO STRICT line_ident FROM public.fms_voucher_line WHERE voucher_id=voucher_ident AND subject_id=(context_value->>'receivable_subject')::uuid;
 blocked:=false;
 BEGIN UPDATE public.fms_voucher_line SET debit_amount=debit_amount+0.02 WHERE id=line_ident;EXCEPTION WHEN check_violation THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Source sales refund voucher carrying value could be edited independently of its source';END IF;
 blocked:=false;
 BEGIN UPDATE public.fms_voucher_line SET exchange_rate=99 WHERE id=line_ident;EXCEPTION WHEN check_violation THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Source sales refund voucher could use a different historical rate';END IF;
 INSERT INTO public.fms_auxiliary_item(tenant_id,account_set_id,auxiliary_type_id,item_code,item_name,external_entity_type,external_entity_id)
 VALUES(tenant,book,(context_value->>'customer_type')::uuid,'OTHER_'||upper(left(gen_random_uuid()::text,8)),'不是原退款客户的回滚项','mdm_customer',gen_random_uuid()) RETURNING id INTO forged_item;
 blocked:=false;
 BEGIN UPDATE public.fms_voucher_line SET auxiliary_values=jsonb_set(auxiliary_values,ARRAY[context_value->>'customer_type'],to_jsonb(forged_item::text)) WHERE id=line_ident;
 EXCEPTION WHEN check_violation THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Source sales refund voucher could be reassigned to another customer';END IF;
 UPDATE public.fms_voucher_line SET summary=summary||'，核对原退款来源' WHERE id=line_ident;
 result:=public.fms_payable_settlement_voucher_secure(payment_ident,'payment',false);
 IF(result->'voucher_ids'->>0)::uuid IS DISTINCT FROM voucher_ident THEN RAISE EXCEPTION 'Repeated sales refund posting duplicated the voucher';END IF;
 blocked:=false;
 BEGIN PERFORM public.fms_act_payable_settlement_secure(ARRAY[payment_ident],'cancel_payment','已有有效凭证不得取消');EXCEPTION WHEN check_violation THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Customer payment was cancelled while its actual voucher remained valid';END IF;
 IF(SELECT count(*) FROM public.fms_fund_ledger_entry)<>(context_value->>'fund_count')::bigint THEN
  RAISE EXCEPTION 'Voucher generation duplicated actual cash movement';END IF;
 BEGIN
  UPDATE public.fms_posting_event SET payload=jsonb_set(payload,'{receivable_amount}',to_jsonb(carrying_amount+1))
  WHERE tenant_id=tenant AND source_type='system' AND source_id=(context_value->>'execution')::uuid AND event_code='ar_credit_payment_paid' RETURNING * INTO STRICT event;
  event:=app_private.process_fms_posting_event(event.id,true);
  IF event.status IS DISTINCT FROM 'ignored' THEN RAISE EXCEPTION 'Background posting trusted a forged sales refund carrying payload';END IF;
  RAISE SQLSTATE 'ZX001' USING MESSAGE='Rollback intentional forged-event verification';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
 END;
 PERFORM set_config('qa.sales_refund_kernel_'||lower(p_currency),(context_value||jsonb_build_object('voucher',voucher_ident))::text,true);
 RETURN jsonb_build_object('currency',p_currency,'generated',true,'carrying_amount',carrying_amount,'cash_amount',cash_amount);
END $test$;

CREATE FUNCTION pg_temp.reverse_sales_refund_voucher(p_currency text) RETURNS jsonb
LANGUAGE plpgsql AS $test$
DECLARE context_value jsonb:=current_setting('qa.sales_refund_kernel_'||lower(p_currency))::jsonb;blocked boolean;event public.fms_posting_event;
BEGIN
 UPDATE public.fms_account_set SET is_default=false WHERE id=(context_value->>'other_book')::uuid;
 UPDATE public.fms_account_set SET is_default=true WHERE id=(context_value->>'book')::uuid;
 PERFORM public.transition_fms_voucher((context_value->>'voucher')::uuid,'void','回滚验收先作废原销售退款凭证',NULL);
 blocked:=false;
 BEGIN PERFORM public.fms_payable_settlement_voucher_secure((context_value->>'payment')::uuid,'payment',false);EXCEPTION WHEN check_violation THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Voided customer refund voucher was reported as a valid generated voucher';END IF;
 PERFORM pg_temp.check_sales_refund_kernel(p_currency,3);
 SELECT * INTO STRICT event FROM public.fms_posting_event WHERE tenant_id=(context_value->>'tenant')::uuid AND source_type='system'
  AND source_id=(context_value->>'execution')::uuid AND event_code='ar_credit_payment_paid';
 event:=app_private.process_fms_posting_event(event.id,true);
 IF event.status IS DISTINCT FROM 'ignored' OR EXISTS(SELECT 1 FROM public.fms_voucher WHERE id=event.voucher_id AND status<>'voided') THEN
  RAISE EXCEPTION 'Background retry revived a cancelled sales refund execution';END IF;
 RETURN jsonb_build_object('currency',p_currency,'reversed',true);
END $test$;

CREATE FUNCTION pg_temp.post_and_reverse_sales_refund_general_ledger(p_currency text) RETURNS jsonb
LANGUAGE plpgsql AS $test$
DECLARE context_value jsonb:=current_setting('qa.sales_refund_kernel_'||lower(p_currency))::jsonb;
 tenant uuid:=(context_value->>'tenant')::uuid;book uuid:=(context_value->>'book')::uuid;
 voucher public.fms_voucher;source_amount numeric:=round((context_value->>'principal')::numeric*(context_value->>'source_rate')::numeric,2);
 cash_amount numeric:=round((context_value->>'principal')::numeric*(context_value->>'payment_rate')::numeric,2);expectation jsonb;ledger jsonb;subject_ident uuid;blocked boolean;
BEGIN
 INSERT INTO public.sys_role_field_permission(tenant_id,role_id,resource_id,field_id,access_level,create_by)
 SELECT tenant,role.id,resource.id,field.id,'edit',context_value->>'actor' FROM public.sys_role role
 JOIN public.sys_permission_resource resource ON resource.tenant_id=role.tenant_id AND resource.resource_key='fms.ledger_center'
 JOIN public.sys_permission_field field ON field.resource_id=resource.id AND field.tenant_id=resource.tenant_id AND field.field_key IN('ledgerAmounts','voucherReferences')
 WHERE role.tenant_id=tenant AND role.role_code=context_value->>'fixture_role_code';
 SELECT * INTO STRICT voucher FROM public.fms_voucher WHERE id=(context_value->>'voucher')::uuid;
 PERFORM set_config('app.fms_system_posting','off',true);
 IF app_private.is_platform_super() OR app_private.is_fms_system_posting() THEN RAISE EXCEPTION 'Actual posting must use ordinary explicit permissions';END IF;
 ledger:=public.fms_general_ledger_report_secure(book,voucher.fiscal_year,(context_value->>'receivable_subject')::uuid,voucher.period_no,voucher.period_no);
 IF(ledger->'records'->0->>'voucher_count')::numeric IS DISTINCT FROM 0::numeric THEN RAISE EXCEPTION 'Draft refund vouchers appeared in posted general ledger';END IF;
 PERFORM public.transition_fms_voucher(voucher.id,'submit',NULL,NULL);
 PERFORM public.transition_fms_voucher(voucher.id,'approve',NULL,NULL);
 PERFORM public.transition_fms_voucher(voucher.id,'post',NULL,NULL);
 IF NOT EXISTS(SELECT 1 FROM public.fms_voucher WHERE id=voucher.id AND status='posted') THEN RAISE EXCEPTION 'Customer refund voucher was not actually posted';END IF;
 FOR expectation IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
  jsonb_build_object('subject',context_value->>'receivable_subject','debit',source_amount,'credit',0),
  jsonb_build_object('subject',context_value->>'cash_subject','debit',0,'credit',cash_amount),
  jsonb_build_object('subject',context_value->>'exchange_subject','debit',greatest(cash_amount-source_amount,0),'credit',greatest(source_amount-cash_amount,0)))) LOOP
  subject_ident:=(expectation->>'subject')::uuid;
  ledger:=public.fms_general_ledger_report_secure(book,voucher.fiscal_year,subject_ident,voucher.period_no,voucher.period_no);
  IF(ledger->'records'->0->>'debit_amount')::numeric IS DISTINCT FROM(expectation->>'debit')::numeric
   OR(ledger->'records'->0->>'credit_amount')::numeric IS DISTINCT FROM(expectation->>'credit')::numeric THEN
   RAISE EXCEPTION 'Posted general ledger disagrees with the refund carrying/cash/FX source';END IF;
 END LOOP;
 blocked:=false;
 BEGIN PERFORM public.fms_act_payable_settlement_secure(ARRAY[(context_value->>'payment')::uuid],'cancel_payment','已过账凭证不得直接取消');EXCEPTION WHEN check_violation THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Actual posted sales refund voucher did not block direct cash cancellation';END IF;
 PERFORM public.transition_fms_voucher(voucher.id,'reverse','按原分录冲销销售退款过账',voucher.voucher_date);
 IF NOT EXISTS(SELECT 1 FROM public.fms_voucher original JOIN public.fms_voucher reversal ON reversal.id=original.reversal_voucher_id
  AND reversal.tenant_id=original.tenant_id AND reversal.account_set_id=original.account_set_id
  WHERE original.id=voucher.id AND original.status='reversed' AND reversal.status='posted' AND reversal.source_type='reversal' AND reversal.source_id=original.id) THEN
  RAISE EXCEPTION 'Posted sales refund reversal lost its linked original book and history';END IF;
 FOR subject_ident IN SELECT(value->>'subject')::uuid FROM jsonb_array_elements(jsonb_build_array(
  jsonb_build_object('subject',context_value->>'receivable_subject'),jsonb_build_object('subject',context_value->>'cash_subject'),jsonb_build_object('subject',context_value->>'exchange_subject'))) LOOP
  ledger:=public.fms_general_ledger_report_secure(book,voucher.fiscal_year,subject_ident,voucher.period_no,voucher.period_no);
  IF(ledger->'records'->0->>'ending_balance')::numeric IS DISTINCT FROM 0::numeric THEN RAISE EXCEPTION 'General ledger reversal did not preserve exactly offsetting original entries';END IF;
 END LOOP;
 blocked:=false;
 BEGIN PERFORM public.fms_payable_settlement_voucher_secure((context_value->>'payment')::uuid,'payment',false);EXCEPTION WHEN check_violation THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Reversed sales refund voucher was reported as an effective generated voucher';END IF;
 IF(SELECT count(*) FROM public.fms_fund_ledger_entry)<>(context_value->>'fund_count')::bigint THEN RAISE EXCEPTION 'General ledger posting or reversal executed another bank payment';END IF;
 UPDATE public.fms_account_set SET is_default=false WHERE id=(context_value->>'other_book')::uuid;
 UPDATE public.fms_account_set SET is_default=true WHERE id=book;
 UPDATE public.sys_user SET user_roles=ARRAY(SELECT jsonb_array_elements_text(context_value->'original_roles')) WHERE id=(context_value->>'profile')::uuid;
 RETURN jsonb_build_object('currency',p_currency,'actual_posted_general_ledger_and_reversal',true,'carrying',source_amount,'cash',cash_amount,'fx_loss',cash_amount-source_amount);
END $test$;

SELECT pg_temp.prepare_sales_refund_kernel('USD');
SELECT pg_temp.check_sales_refund_kernel('USD',1);
SELECT pg_temp.check_sales_refund_kernel('USD',2);
SELECT pg_temp.configure_sales_refund_posting('USD');
SELECT pg_temp.post_sales_refund_voucher('USD');
SELECT pg_temp.reverse_sales_refund_voucher('USD');
SELECT pg_temp.prepare_sales_refund_kernel('CNY');
SELECT pg_temp.check_sales_refund_kernel('CNY',1);
SELECT pg_temp.check_sales_refund_kernel('CNY',2);
SELECT pg_temp.configure_sales_refund_posting('CNY');
SELECT pg_temp.post_sales_refund_voucher('CNY');
SELECT pg_temp.reverse_sales_refund_voucher('CNY');
SELECT pg_temp.prepare_sales_refund_kernel('USD',7.5,7.333333);
SELECT pg_temp.check_sales_refund_kernel('USD',1);
SELECT pg_temp.check_sales_refund_kernel('USD',2);
SELECT pg_temp.configure_sales_refund_posting('USD');
SELECT pg_temp.post_sales_refund_voucher('USD');
SELECT pg_temp.reverse_sales_refund_voucher('USD');

SELECT pg_temp.prepare_sales_refund_kernel('USD',7.5,7.333333);
SELECT pg_temp.check_sales_refund_kernel('USD',1);
SELECT pg_temp.check_sales_refund_kernel('USD',2);
SELECT pg_temp.configure_sales_refund_posting('USD');
SELECT pg_temp.post_sales_refund_voucher('USD');
SELECT pg_temp.post_and_reverse_sales_refund_general_ledger('USD');

SELECT pg_temp.prepare_sales_refund_kernel('USD',7,7.2,100);
SELECT pg_temp.check_sales_refund_kernel('USD',1);
SELECT pg_temp.check_sales_refund_kernel('USD',2);
SELECT pg_temp.configure_sales_refund_posting('USD');
SELECT pg_temp.post_sales_refund_voucher('USD');
SELECT pg_temp.reverse_sales_refund_voucher('USD');

ROLLBACK;
