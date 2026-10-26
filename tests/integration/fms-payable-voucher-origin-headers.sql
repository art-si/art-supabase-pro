BEGIN;

DO $origin_headers$
DECLARE
 qa_tenant uuid:='111e83d3-190e-4405-84c8-440d484d13a6';
 qa_actor uuid:='a9eeb9b7-e474-43e3-9cc2-c2f46c0f0ec3';
 qa_role uuid:='40283472-f334-4cb9-84a0-2a41fcf7ab25';
 root_actor uuid;other_tenant uuid;relation_name text;source_record public.fms_payable_writeoff_record;
 result jsonb;expected_id uuid;record_count integer;source_id uuid;target_permission text;target_field text;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',qa_actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',qa_actor,'role','authenticated')::text,true);
 PERFORM set_config('request.headers','{}',true);
 IF app_private.is_platform_super() THEN RAISE EXCEPTION 'Source navigation fixture must be an ordinary user';END IF;
 IF has_function_privilege('anon','public.fms_get_payable_writeoff_record_secure(uuid)','EXECUTE') THEN RAISE EXCEPTION 'Writeoff origin reader is exposed anonymously';END IF;
 FOREACH relation_name IN ARRAY ARRAY['payable_payment','payment_refund','payable_receivable'] LOOP
  record_count:=0;
  FOR source_record IN SELECT * FROM public.fms_payable_writeoff_record WHERE tenant_id=qa_tenant AND relation=relation_name ORDER BY created_at DESC,id LIMIT 2 LOOP
   result:=public.fms_get_payable_writeoff_record_secure(source_record.id);
   IF result->>'id'<>source_record.id::text OR result->>'tenant_id'<>qa_tenant::text OR result->>'account_set_id' IS DISTINCT FROM source_record.account_set_id::text THEN RAISE EXCEPTION 'Original record scope changed';END IF;
   IF relation_name IN('payable_payment','payment_refund') THEN
    SELECT document_id INTO STRICT expected_id FROM public.fms_payable_settlement_line WHERE id=source_record.payment_line_id AND tenant_id=qa_tenant;
    IF result->>'payment_document_id' IS DISTINCT FROM expected_id::text OR expected_id=source_record.payment_line_id THEN RAISE EXCEPTION 'Payment link does not identify its original header';END IF;
   END IF;
   IF relation_name='payment_refund' THEN
    SELECT document_id INTO STRICT expected_id FROM public.fms_payable_settlement_line WHERE id=source_record.refund_line_id AND tenant_id=qa_tenant;
    IF result->>'refund_document_id' IS DISTINCT FROM expected_id::text OR expected_id=source_record.refund_line_id THEN RAISE EXCEPTION 'Refund link does not identify its original header';END IF;
   ELSIF relation_name='payable_receivable' THEN
    SELECT document_id INTO STRICT expected_id FROM public.fms_receivable_line WHERE id=source_record.receivable_line_id AND tenant_id=qa_tenant;
    IF result->>'receivable_document_id' IS DISTINCT FROM expected_id::text OR expected_id=source_record.receivable_line_id THEN RAISE EXCEPTION 'Receivable link does not identify its original header';END IF;
   END IF;
   record_count:=record_count+1;
  END LOOP;
  IF record_count<>2 THEN RAISE EXCEPTION 'Need two real historical records for %',relation_name;END IF;
 END LOOP;

 SELECT auth_user_id INTO STRICT root_actor FROM public.sys_user WHERE auth_user_id IS NOT NULL AND tenant_id<>qa_tenant AND 'R_SUPER'=ANY(user_roles) AND status='1' ORDER BY id LIMIT 1;
 SELECT id INTO STRICT other_tenant FROM public.sys_tenant WHERE id<>qa_tenant AND status='1' AND builtin_type IS DISTINCT FROM 'platform'
  AND(service_start_date IS NULL OR service_start_date<=app_private.payable_business_date()) AND(service_end_date IS NULL OR service_end_date>=app_private.payable_business_date()) ORDER BY id LIMIT 1;
 PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
 IF app_private.current_read_tenant_id()<>qa_tenant THEN RAISE EXCEPTION 'Forged header changed ordinary source scope';END IF;
 result:=public.fms_get_payable_writeoff_record_secure(source_record.id);
 IF result->>'tenant_id'<>qa_tenant::text THEN RAISE EXCEPTION 'Forged source tenant leaked';END IF;
 PERFORM set_config('request.jwt.claim.sub',root_actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',root_actor,'role','authenticated')::text,true);
 PERFORM set_config('request.headers','{}',true);
 IF NOT app_private.is_platform_super() OR app_private.current_read_tenant_id() IS NOT NULL THEN RAISE EXCEPTION 'Platform-all fixture is not all tenant';END IF;
 result:=public.fms_get_payable_writeoff_record_secure(source_record.id);
 IF result->>'receivable_document_id' IS DISTINCT FROM expected_id::text THEN RAISE EXCEPTION 'Platform-all source lost its parent';END IF;
 PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',qa_tenant)::text,true);
 result:=public.fms_get_payable_writeoff_record_secure(source_record.id);
 IF result->>'receivable_document_id' IS DISTINCT FROM expected_id::text THEN RAISE EXCEPTION 'Selected source lost its parent';END IF;
 PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
 BEGIN
  PERFORM public.fms_get_payable_writeoff_record_secure(source_record.id);
  RAISE EXCEPTION 'Selected foreign tenant could inspect source headers';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;

 PERFORM set_config('request.jwt.claim.sub',qa_actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',qa_actor,'role','authenticated')::text,true);
 PERFORM set_config('request.headers','{}',true);
 FOR relation_name,target_permission,target_field IN VALUES
  ('payable_payment','FinancePayablePayment:View','payment_document_id'),
  ('payment_refund','FinancePayableRefund:View','refund_document_id'),
  ('payable_receivable','FinanceFinancialReceivable:View','receivable_document_id') LOOP
  SELECT id INTO STRICT source_id FROM public.fms_payable_writeoff_record WHERE tenant_id=qa_tenant AND relation=relation_name ORDER BY created_at DESC,id LIMIT 1;
  BEGIN
   DELETE FROM public.sys_role_menu access USING public.sys_menu menu WHERE access.role_id=qa_role AND access.menu_id=menu.id AND menu.name=target_permission;
   BEGIN
    result:=public.fms_get_payable_writeoff_record_secure(source_id);
    IF result?target_field THEN RAISE EXCEPTION 'Revoked source permission still exposes %',target_field;END IF;
   EXCEPTION WHEN insufficient_privilege THEN NULL;
   END;
   RAISE EXCEPTION USING ERRCODE='ZX002',MESSAGE='Roll back temporary permission removal';
  EXCEPTION WHEN SQLSTATE 'ZX002' THEN NULL;
  END;
 END LOOP;
END $origin_headers$;

ROLLBACK;
