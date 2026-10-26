BEGIN;

DO $noncash_posting$
DECLARE
 actor uuid;source public.tms_carrier_statement;finance jsonb;payment jsonb;result jsonb;event public.fms_posting_event;
 payment_ident uuid;line_ident uuid;execution_ident uuid;old_execution uuid;record_ident uuid;method_ident uuid;
 rule_ident uuid;debit_subject uuid;credit_subject uuid;voucher_ident uuid;writeoff_voucher uuid;organization_ident uuid;event_ident uuid;original_ledger_count bigint;blocked boolean;
BEGIN
 SELECT auth_user_id INTO STRICT actor FROM public.sys_user WHERE system_protected AND user_roles @>ARRAY['R_SUPER'] AND status='1' ORDER BY id LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 PERFORM set_config('request.headers','{}',true);
 SELECT statement.* INTO STRICT source FROM public.tms_carrier_statement statement
 WHERE statement.status='confirmed' AND statement.settled_amount=0
  AND(SELECT bool_and(item.line_amount>0) AND sum(item.line_amount)>8 FROM public.tms_carrier_statement_item item WHERE item.statement_id=statement.id AND item.is_active)
  AND NOT EXISTS(SELECT 1 FROM public.fms_purchase_payable_document payable WHERE payable.tms_statement_id=statement.id AND payable.kind='financial')
  AND EXISTS(SELECT 1 FROM public.mdm_settlement_method method WHERE method.tenant_id=statement.tenant_id AND method.category='virtual' AND method.enabled)
 ORDER BY statement.id LIMIT 1;
 finance:=public.fms_import_carrier_payable_secure('financial',source.id);
 PERFORM public.fms_act_purchase_payable_secure(ARRAY[(finance->>'id')::uuid],'submit');
 PERFORM public.fms_act_purchase_payable_secure(ARRAY[(finance->>'id')::uuid],'approve');
 SELECT id INTO STRICT method_ident FROM public.mdm_settlement_method WHERE tenant_id=source.tenant_id AND category='virtual' AND enabled ORDER BY code LIMIT 1;
 SELECT id INTO STRICT organization_ident FROM public.mdm_organization WHERE tenant_id=source.tenant_id AND status='1' AND organization_type='company' ORDER BY id LIMIT 1;
 payment:=public.fms_push_payable_settlement_secure((finance->>'id')::uuid,'payment');
 payment_ident:=(payment->>'id')::uuid;
 payment:=public.fms_save_payable_settlement_secure(payment||jsonb_build_object('organization_id',organization_ident,'lines',(SELECT jsonb_agg(line||jsonb_build_object(
  'settlement_method_id',method_ident,'fund_account_id',NULL,'amount',1,'approved_amount',1,'planned_amount',1)) FROM jsonb_array_elements(payment->'lines') line)));
 line_ident:=(payment->'lines'->0->>'id')::uuid;
 SELECT count(*) INTO original_ledger_count FROM public.fms_fund_ledger_entry;
 PERFORM public.fms_act_payable_settlement_secure(ARRAY[payment_ident],'submit');
 PERFORM public.fms_act_payable_settlement_secure(ARRAY[payment_ident],'approve');
 PERFORM public.fms_act_payable_settlement_secure(ARRAY[payment_ident],'confirm');
 SELECT id INTO STRICT execution_ident FROM public.fms_payable_payment_execution WHERE document_id=payment_ident AND status='posted';
 SELECT matched.id INTO STRICT record_ident FROM public.fms_payable_writeoff_record matched WHERE matched.payment_line_id=line_ident AND matched.status='active';
 UPDATE public.fms_posting_rule SET is_enabled=false WHERE tenant_id=source.tenant_id AND account_set_id=(finance->>'account_set_id')::uuid AND source_type='system' AND event_code='ap_virtual_payment_confirmed';
 event_ident:=app_private.enqueue_fms_posting_event(source.tenant_id,'system','ap_payment_confirmed',execution_ident,payment->>'document_no',app_private.payable_business_date(),'旧实际付款事件不能处理非现金结算',jsonb_build_object('account_set_id',finance->>'account_set_id','gross_amount',1));
 SELECT * INTO STRICT event FROM public.fms_posting_event WHERE id=event_ident;
 IF event.status<>'ignored' OR event.voucher_id IS NOT NULL THEN RAISE EXCEPTION 'Virtual payment reused an actual-cash posting event';END IF;
 result:=public.fms_payable_settlement_voucher_secure(payment_ident,'payment',true);
 IF result->>'status'<>'pending_configuration' OR jsonb_array_length(result->'lines')<>0 THEN RAISE EXCEPTION 'Noncash posting fell back to a cash rule';END IF;
 SELECT subject.id INTO STRICT debit_subject FROM public.fms_subject subject WHERE subject.account_set_id=(finance->>'account_set_id')::uuid AND subject.is_enabled AND NOT subject.cash_flow_required
  AND subject.subject_code NOT LIKE '1001%' AND subject.subject_code NOT LIKE '1002%'
  AND NOT EXISTS(SELECT 1 FROM public.fms_subject child WHERE child.parent_id=subject.id)
  AND NOT EXISTS(SELECT 1 FROM public.fms_subject_auxiliary_type binding WHERE binding.subject_id=subject.id AND binding.is_required) ORDER BY subject.subject_code LIMIT 1;
 SELECT subject.id INTO STRICT credit_subject FROM public.fms_subject subject WHERE subject.account_set_id=(finance->>'account_set_id')::uuid AND subject.id<>debit_subject AND subject.is_enabled AND NOT subject.cash_flow_required
  AND subject.subject_code NOT LIKE '1001%' AND subject.subject_code NOT LIKE '1002%'
  AND NOT EXISTS(SELECT 1 FROM public.fms_subject child WHERE child.parent_id=subject.id)
  AND NOT EXISTS(SELECT 1 FROM public.fms_subject_auxiliary_type binding WHERE binding.subject_id=subject.id AND binding.is_required) ORDER BY subject.subject_code LIMIT 1;
 INSERT INTO public.fms_posting_rule(tenant_id,account_set_id,rule_code,rule_name,source_type,event_code,priority,submission_mode,voucher_type)
 VALUES(source.tenant_id,(finance->>'account_set_id')::uuid,'QA_VIRTUAL_'||upper(left(gen_random_uuid()::text,8)),'非现金结算原账套回滚规则','system','ap_virtual_payment_confirmed',999999,'draft','transfer') RETURNING id INTO rule_ident;
 INSERT INTO public.fms_posting_rule_line(tenant_id,account_set_id,rule_id,line_no,subject_id,direction,amount_key)
 VALUES(source.tenant_id,(finance->>'account_set_id')::uuid,rule_ident,1,debit_subject,'debit','gross_amount'),(source.tenant_id,(finance->>'account_set_id')::uuid,rule_ident,2,credit_subject,'credit','gross_amount');
 result:=public.fms_payable_settlement_voucher_secure(payment_ident,'payment',true);
 IF jsonb_array_length(result->'lines')<>2 THEN RAISE EXCEPTION 'Dedicated noncash posting preview lost configured lines';END IF;
 result:=public.fms_payable_settlement_voucher_secure(payment_ident,'payment',false);
 voucher_ident:=(result->'voucher_ids'->>0)::uuid;
 IF result->>'status'<>'generated' OR voucher_ident IS NULL THEN RAISE EXCEPTION 'Noncash settlement did not generate its configured balanced voucher';END IF;
 SELECT * INTO STRICT event FROM public.fms_posting_event WHERE tenant_id=source.tenant_id AND source_type='system' AND source_id=execution_ident AND event_code='ap_virtual_payment_confirmed';
 IF event.account_set_id<>(finance->>'account_set_id')::uuid OR event.payload->>'settlement_category'<>'virtual' OR(event.payload->>'has_actual_cash')::boolean IS DISTINCT FROM false THEN RAISE EXCEPTION 'Noncash posting lost its original book or cash classification';END IF;
 IF(SELECT sum(debit_amount)-sum(credit_amount) FROM public.fms_voucher_line WHERE voucher_id=voucher_ident)<>0 OR(SELECT count(*) FROM public.fms_fund_ledger_entry)<>original_ledger_count THEN RAISE EXCEPTION 'Noncash voucher is unbalanced or manufactured cash';END IF;
 IF NOT(SELECT needs_voucher FROM public.fms_payable_writeoff_record WHERE id=record_ident) THEN RAISE EXCEPTION 'Different settlement organizations lost their writeoff voucher requirement';END IF;
 UPDATE public.fms_posting_rule SET is_enabled=false WHERE tenant_id=source.tenant_id AND account_set_id=(finance->>'account_set_id')::uuid AND source_type='system' AND event_code='ap_writeoff_approved';
 INSERT INTO public.fms_posting_rule(tenant_id,account_set_id,rule_code,rule_name,source_type,event_code,priority,submission_mode,voucher_type)
 VALUES(source.tenant_id,(finance->>'account_set_id')::uuid,'QA_NC_MATCH_'||upper(left(gen_random_uuid()::text,8)),'运输非现金核销回滚规则','system','ap_writeoff_approved',999999,'draft','transfer') RETURNING id INTO rule_ident;
 INSERT INTO public.fms_posting_rule_line(tenant_id,account_set_id,rule_id,line_no,subject_id,direction,amount_key)
 VALUES(source.tenant_id,(finance->>'account_set_id')::uuid,rule_ident,1,debit_subject,'debit','gross_amount'),(source.tenant_id,(finance->>'account_set_id')::uuid,rule_ident,2,credit_subject,'credit','gross_amount');
 result:=public.fms_payable_settlement_voucher_secure(record_ident,'writeoff',false);
 writeoff_voucher:=(result->'voucher_ids'->>0)::uuid;
 IF result->>'status'<>'generated' OR writeoff_voucher IS NULL OR NOT EXISTS(SELECT 1 FROM public.fms_posting_event WHERE source_id=record_ident AND source_type='system' AND event_code='ap_writeoff_approved' AND payload->>'carrier_id'=source.carrier_id::text AND payload->>'counterparty_carrier_id'=source.carrier_id::text) THEN RAISE EXCEPTION 'Transport writeoff lost its real carrier auxiliary payload or voucher';END IF;
 blocked:=false;BEGIN PERFORM public.fms_reverse_payable_writeoff_secure(record_ident,'已记账的非现金结算不能直接反核销');EXCEPTION WHEN check_violation THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Posted noncash payment voucher allowed reversing its settlement';END IF;
 blocked:=false;BEGIN PERFORM public.fms_act_payable_settlement_secure(ARRAY[payment_ident],'cancel_payment','已记账不能直接取消');EXCEPTION WHEN check_violation THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Posted noncash payment voucher allowed cancelling its execution';END IF;
 PERFORM public.transition_fms_voucher(voucher_ident,'void','回滚验证保留作废凭证历史',NULL);
 event:=app_private.process_fms_posting_event(event.id,true);
 IF event.status<>'ignored' THEN RAISE EXCEPTION 'Forced posting reused a voided noncash voucher';END IF;
 blocked:=false;BEGIN PERFORM public.fms_act_payable_settlement_secure(ARRAY[payment_ident],'cancel_payment','核销凭证仍有效');EXCEPTION WHEN check_violation THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Voiding only the payment voucher bypassed an active writeoff voucher';END IF;
 PERFORM public.transition_fms_voucher(writeoff_voucher,'void','回滚验证保留核销凭证历史',NULL);
 old_execution:=execution_ident;
 PERFORM public.fms_act_payable_settlement_secure(ARRAY[payment_ident],'cancel_payment','作废凭证后取消非现金结算');
 event:=app_private.process_fms_posting_event(event.id,true);
 IF event.status<>'ignored' OR(SELECT settled_amount FROM public.tms_carrier_statement WHERE id=source.id)<>0 THEN RAISE EXCEPTION 'Cancelled noncash posting was reactivated';END IF;
 PERFORM public.fms_act_payable_settlement_secure(ARRAY[payment_ident],'confirm');
 SELECT id INTO STRICT execution_ident FROM public.fms_payable_payment_execution WHERE document_id=payment_ident AND status='posted';
 IF execution_ident=old_execution THEN RAISE EXCEPTION 'Reconfirmed noncash payment reused the cancelled execution';END IF;
 result:=public.fms_payable_settlement_voucher_secure(payment_ident,'payment',false);
 IF result->>'status'<>'generated' OR(result->'voucher_ids'->>0)::uuid=voucher_ident OR(SELECT count(*) FROM public.fms_fund_ledger_entry)<>original_ledger_count THEN RAISE EXCEPTION 'Reconfirmed noncash posting reused old history or created a cash flow';END IF;
END $noncash_posting$;

ROLLBACK;
