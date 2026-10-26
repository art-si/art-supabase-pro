BEGIN;

DO $background_refund$
DECLARE
 tenant uuid:='111e83d3-190e-4405-84c8-440d484d13a6';actor uuid:='a9eeb9b7-e474-43e3-9cc2-c2f46c0f0ec3';role_id uuid:='40283472-f334-4cb9-84a0-2a41fcf7ab25';
 book uuid;fund uuid;organization uuid;material uuid;unit_id uuid;document_type uuid;purpose uuid;scheme uuid;configuration uuid;supplier uuid;payable uuid;receipt uuid;line_id uuid;old_execution uuid;new_execution uuid;old_job uuid;
 receipts uuid[]:='{}';result jsonb;finance jsonb;payload jsonb;record_row public.fms_payable_writeoff_record;job_row public.fms_payable_writeoff_automation_job;
 scenario integer;ledger_count bigint;original_headers text;original_sub text;original_claims text;today date:=app_private.payable_business_date();before_count bigint;
BEGIN
 INSERT INTO public.sys_role_menu(tenant_id,role_id,menu_id) SELECT tenant,role_id,id FROM public.sys_menu WHERE name IN('FinancePayableWriteoff:Automation','FinancePayableWriteoff:AutoWriteoff') ON CONFLICT DO NOTHING;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);PERFORM set_config('request.headers','{}',true);
 UPDATE public.fms_payable_writeoff_automation SET enabled=false WHERE tenant_id=tenant;
 UPDATE public.fms_payable_writeoff_automation_job SET available_at=clock_timestamp()+interval '1 day' WHERE status='pending';
 INSERT INTO app_private.payable_automation_worker_state(singleton,last_succeeded_at) VALUES(true,clock_timestamp()) ON CONFLICT(singleton) DO UPDATE SET last_succeeded_at=excluded.last_succeeded_at;
 SELECT id INTO book FROM public.fms_account_set WHERE tenant_id=tenant AND is_default AND status='active';
 SELECT id INTO organization FROM public.mdm_organization WHERE tenant_id=tenant AND organization_type='company' LIMIT 1;
 SELECT id,inventory_unit_id INTO material,unit_id FROM public.mdm_material WHERE tenant_id=tenant AND inventory_unit_id IS NOT NULL LIMIT 1;
 SELECT id INTO document_type FROM public.mdm_document_type WHERE tenant_id=tenant AND document_type_code='AP_FIN_EXPENSE';
 SELECT id INTO purpose FROM public.mdm_payment_purpose WHERE tenant_id=tenant AND code='205';
 SELECT account.id INTO fund FROM public.fms_fund_account account JOIN public.fms_currency currency ON currency.id=account.currency_id AND currency.tenant_id=account.tenant_id
 WHERE account.tenant_id=tenant AND account.account_set_id=book AND account.account_type='cash' AND account.status='active' AND currency.currency_code='CNY' LIMIT 1;
 scheme:=public.fms_save_payable_reference_secure('scheme',jsonb_build_object('configuration_version',2,'tenant_id',tenant,'code','QA_PRFB_'||upper(left(gen_random_uuid()::text,8)),'name','退款后台回滚方案','automatic',true,
  'rules',jsonb_build_array(jsonb_build_object('primary_field','supplier_id','secondary_field','supplier_id','operator','eq','empty_matches',false)),
  'relation_rules',jsonb_build_array(jsonb_build_object('relation','payable_refund','rules',jsonb_build_array(jsonb_build_object('primary_field','supplier_id','secondary_field','supplier_id','operator','eq','empty_matches',false))))));
 payload:=jsonb_build_object('configuration_version',1,'name','退款后台执行回滚配置','scheme_id',scheme,'expected_scheme_version',1,'account_set_id',book,'enabled',true,
  'relations',jsonb_build_array('payable_refund'),'cross_currency_mode','same_currency','allow_cross_party',false);
 configuration:=public.fms_save_payable_automation_secure(payload);
 BEGIN
  PERFORM public.fms_save_payable_automation_secure(payload||jsonb_build_object('name','同方案重复启用配置'));
  RAISE EXCEPTION 'Duplicate enabled scheme/book configuration was accepted';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 BEGIN
  PERFORM public.fms_save_payable_automation_secure(payload||jsonb_build_object('name','同方案重复停用配置','enabled',false));
  RAISE EXCEPTION 'Disabled duplicate scheme/book configuration was accepted';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 FOR scenario IN 1..3 LOOP
  INSERT INTO public.mdm_supplier(tenant_id,supplier_code,supplier_name) VALUES(tenant,'QA_PRFB_'||upper(left(gen_random_uuid()::text,8)),'退款后台回滚供应商'||scenario) RETURNING id INTO supplier;
  finance:=public.fms_save_purchase_payable_secure(jsonb_build_object('kind','financial','tenant_id',tenant,'supplier_id',supplier,'organization_id',organization,'document_type_id',document_type,
   'business_date',today,'currency_code','CNY','exchange_rate',1,'input_tax_inclusive_price',false,'is_credit',true,'lines',jsonb_build_array(jsonb_build_object('material_id',material,'inventory_unit_id',unit_id,'quantity',1,'unit_price',scenario*10,'tax_rate',0))));
  payable:=(finance->>'id')::uuid;PERFORM public.fms_act_purchase_payable_secure(array[payable],'submit');PERFORM public.fms_act_purchase_payable_secure(array[payable],'approve');
  receipt:=public.fms_save_receipt_secure(jsonb_build_object('supplierId',supplier,'purposeId',purpose,'settlementOrganizationId',organization,'fundAccountId',fund,'currencyCode','CNY','paymentMethod','cash',
   'businessDate',today,'lines',jsonb_build_array(jsonb_build_object('amount',scenario*10))));
  receipts:=array_append(receipts,receipt);
  PERFORM public.fms_act_receipt_secure(receipt,'submit');PERFORM public.fms_act_receipt_secure(receipt,'approve');PERFORM public.fms_act_receipt_secure(receipt,'confirm');
  SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
  SELECT id INTO line_id FROM public.fms_receipt_line WHERE receipt_id=receipt;
  IF NOT EXISTS(SELECT 1 FROM public.fms_payable_writeoff_automation_job WHERE automation_id=configuration AND relation='payable_refund' AND source_kind='payable' AND source_id=payable AND source_side='primary')
   OR NOT EXISTS(SELECT 1 FROM public.fms_payable_writeoff_automation_job WHERE automation_id=configuration AND source_kind='receipt_line' AND source_id=line_id AND source_side='secondary') THEN RAISE EXCEPTION 'Fifth source side missing; jobs: %',(SELECT jsonb_agg(jsonb_build_object('relation',relation,'kind',source_kind,'side',source_side,'source',source_id)) FROM public.fms_payable_writeoff_automation_job WHERE automation_id=configuration);END IF;
  IF scenario=2 THEN
   SELECT count(*) INTO ledger_count FROM public.fms_fund_ledger_entry;
   original_headers:=current_setting('request.headers',true);original_sub:=current_setting('request.jwt.claim.sub',true);original_claims:=current_setting('request.jwt.claims',true);
   result:=app_private.process_payable_automation_jobs(20);
   IF(result->>'succeeded')::integer<>2 OR(result->>'failed')::integer<>0 OR(result->>'blocked')::integer<>0 THEN RAISE EXCEPTION 'Two ordinary refund background executions failed: %',result;END IF;
   IF current_setting('request.headers',true) IS DISTINCT FROM original_headers OR current_setting('request.jwt.claim.sub',true) IS DISTINCT FROM original_sub
    OR current_setting('request.jwt.claims',true) IS DISTINCT FROM original_claims THEN RAISE EXCEPTION 'Fifth worker leaked source actor or tenant scope';END IF;
   IF(SELECT count(*) FROM public.fms_payable_writeoff_record WHERE relation='payable_refund' AND match_snapshot->>'automation_id'=configuration::text)<>2 THEN RAISE EXCEPTION 'Receipt and payable jobs duplicated fifth consumption';END IF;
   IF(SELECT count(*) FROM public.fms_fund_ledger_entry)<>ledger_count THEN RAISE EXCEPTION 'Fifth background job posted another cash movement';END IF;
   FOR record_row IN SELECT * FROM public.fms_payable_writeoff_record WHERE relation='payable_refund' AND match_snapshot->>'automation_id'=configuration::text LOOP
    IF NOT app_private.payable_receipt_refund_valid(record_row.id) OR record_row.actor<>actor OR record_row.match_snapshot->>'execution_kind'<>'background' THEN RAISE EXCEPTION 'Fifth background record lost ordinary actor or exact source';END IF;
    SELECT * INTO job_row FROM public.fms_payable_writeoff_automation_job WHERE id=(record_row.match_snapshot->>'automation_job_id')::uuid;
    IF job_row.automation_id<>configuration OR public.fms_get_payable_writeoff_record_secure(record_row.id)->'match_snapshot'->>'automation_job_id'<>job_row.id::text THEN RAISE EXCEPTION 'Fifth background history cannot resolve its job';END IF;
   END LOOP;
  ELSIF scenario=3 THEN
   SELECT id INTO old_execution FROM public.fms_receipt_fund_execution WHERE receipt_id=receipt AND status='posted';
   SELECT id INTO old_job FROM public.fms_payable_writeoff_automation_job WHERE automation_id=configuration AND source_kind='receipt_line' AND source_id=line_id AND source_revision=old_execution::text;
   PERFORM public.fms_cancel_supplier_receipt_secure(receipt,'排队期间取消原到账');PERFORM public.fms_act_receipt_secure(receipt,'confirm');
   SELECT id INTO new_execution FROM public.fms_receipt_fund_execution WHERE receipt_id=receipt AND status='posted';
   IF old_execution=new_execution THEN RAISE EXCEPTION 'Reconfirmation reused original funding epoch';END IF;
   result:=app_private.process_payable_automation_jobs(20);
   IF NOT EXISTS(SELECT 1 FROM public.fms_payable_writeoff_automation_job WHERE id=old_job AND status='cancelled')
    OR EXISTS(SELECT 1 FROM public.fms_payable_writeoff_record WHERE match_snapshot->>'automation_job_id'=old_job::text)
    OR EXISTS(SELECT 1 FROM public.fms_payable_writeoff_record WHERE receipt_execution_id=old_execution) THEN RAISE EXCEPTION 'Stale incoming receipt job consumed a different funding execution';END IF;
  END IF;
 END LOOP;
 SELECT count(*) INTO before_count FROM public.fms_payable_writeoff_record WHERE relation='payable_refund' AND match_snapshot->>'automation_id'=configuration::text;
 IF before_count<>3 THEN RAISE EXCEPTION 'Expected exactly three background matches';END IF;
 FOR record_row IN SELECT * FROM public.fms_payable_writeoff_record WHERE relation='payable_refund' AND match_snapshot->>'automation_id'=configuration::text LOOP
  PERFORM public.fms_reverse_payable_writeoff_secure(record_row.id,'手工反核销后禁止后台自动复活');
 END LOOP;
 payload:=payload||jsonb_build_object('id',configuration,'version',(SELECT version FROM public.fms_payable_writeoff_automation WHERE id=configuration),'expected_scheme_version',(SELECT version FROM public.fms_payable_writeoff_scheme WHERE id=scheme),'process_existing',true);
 PERFORM public.fms_save_payable_automation_secure(payload);
 result:=app_private.process_payable_automation_jobs(20);
 IF(SELECT count(*) FROM public.fms_payable_writeoff_record WHERE relation='payable_refund' AND match_snapshot->>'automation_id'=configuration::text)<>before_count THEN RAISE EXCEPTION 'Existing-source background replay resurrected reversed refund matches';END IF;
 FOREACH receipt IN ARRAY receipts LOOP PERFORM public.fms_cancel_supplier_receipt_secure(receipt,'回滚验收恢复模拟到账');END LOOP;
 SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
END $background_refund$;

ROLLBACK;
