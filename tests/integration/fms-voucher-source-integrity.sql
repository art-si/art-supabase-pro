BEGIN;

DO $voucher_sources$
DECLARE
 tenant uuid:='111e83d3-190e-4405-84c8-440d484d13a6';actor uuid:='a9eeb9b7-e474-43e3-9cc2-c2f46c0f0ec3';qa_role uuid:='40283472-f334-4cb9-84a0-2a41fcf7ab25';
 book uuid;debit_subject uuid;credit_subject uuid;payload jsonb;result jsonb;entry public.fms_voucher;original_source jsonb;changed record;scenario integer;identifiers uuid[]:='{}';
BEGIN
 INSERT INTO public.sys_role_menu(tenant_id,role_id,menu_id)
 SELECT tenant,qa_role,id FROM public.sys_menu WHERE name IN('FinanceVoucherCenter:Add','FinanceVoucherCenter:Edit') ON CONFLICT DO NOTHING;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);PERFORM set_config('request.headers','{}',true);
 IF app_private.is_platform_super() THEN RAISE EXCEPTION 'Ordinary voucher fixture became an administrator';END IF;
 IF has_function_privilege('authenticated','public.save_fms_voucher(jsonb)','EXECUTE') OR has_table_privilege('authenticated','public.fms_voucher','UPDATE') THEN RAISE EXCEPTION 'Unmanaged voucher source mutation bypass remains';END IF;
 SELECT id INTO STRICT book FROM public.fms_account_set WHERE tenant_id=tenant AND is_default AND status='active';
 SELECT id INTO STRICT debit_subject FROM public.fms_subject WHERE tenant_id=tenant AND account_set_id=book AND subject_code='224199';
 SELECT id INTO STRICT credit_subject FROM public.fms_subject WHERE tenant_id=tenant AND account_set_id=book AND subject_code='220299';
 FOR scenario IN 1..2 LOOP
  payload:=jsonb_build_object('accountSetId',book,'voucherType','transfer','voucherDate',app_private.payable_business_date(),'summary','独立来源完整性回滚验收',
   'sourceType','system','sourceId',gen_random_uuid(),'sourceNo','QA-VREF-SQL-'||upper(left(gen_random_uuid()::text,8)),'sourceEventCode','ap_payable_refund_writeoff_approved',
   'lines',jsonb_build_array(jsonb_build_object('lineNo',10,'summary','回滚验收借方','subjectId',debit_subject,'debitAmount',scenario*100,'creditAmount',0),
    jsonb_build_object('lineNo',20,'summary','回滚验收贷方','subjectId',credit_subject,'debitAmount',0,'creditAmount',scenario*100)));
  entry:=public.save_fms_voucher(payload);
  identifiers:=array_append(identifiers,entry.id);
  original_source:=jsonb_build_array(entry.source_type,entry.source_id,entry.source_no,entry.source_event_code);
  payload:=(payload-'sourceEventCode')||jsonb_build_object('id',entry.id,'summary','普通草稿保存不能抹去来源');
  result:=public.save_fms_voucher_secure(payload);
  SELECT * INTO entry FROM public.fms_voucher WHERE id=entry.id;
  IF jsonb_build_array(entry.source_type,entry.source_id,entry.source_no,entry.source_event_code) IS DISTINCT FROM original_source THEN RAISE EXCEPTION 'Regular voucher draft save changed its authoritative source tuple';END IF;
  IF result?'tenant_id' OR(result->>'account_set_id')::uuid<>book THEN RAISE EXCEPTION 'Protected voucher scope projection changed';END IF;
  FOR changed IN SELECT key,value FROM jsonb_each(jsonb_build_object('sourceType','manual','sourceId',gen_random_uuid(),'sourceNo','FORGED-SOURCE','sourceEventCode','forged_event')) LOOP
   BEGIN
    PERFORM public.save_fms_voucher_secure(payload||jsonb_build_object(changed.key,changed.value));
    RAISE EXCEPTION 'Forged source field % was accepted',changed.key;
   EXCEPTION WHEN check_violation THEN NULL;
   END;
  END LOOP;
  BEGIN
   PERFORM public.save_fms_voucher_secure(payload||jsonb_build_object('accountSetId',gen_random_uuid()));
   RAISE EXCEPTION 'Existing voucher moved to a different book';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
   PERFORM public.save_fms_voucher_secure(payload-'id');
   RAISE EXCEPTION 'Ordinary manual Add forged a system posting source';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
 END LOOP;
 PERFORM set_config('qa.voucher_source_ids',to_jsonb(identifiers)::text,true);
 PERFORM set_config('qa.voucher_source_payload',payload::text,true);
END $voucher_sources$;

DO $voucher_scope$
DECLARE
 tenant uuid:='111e83d3-190e-4405-84c8-440d484d13a6';actor uuid:='a9eeb9b7-e474-43e3-9cc2-c2f46c0f0ec3';root_actor uuid;root_tenant uuid;other_tenant uuid;voucher_ident uuid;
 payload jsonb:=current_setting('qa.voucher_source_payload')::jsonb;result jsonb;scenario integer;
BEGIN
 payload:=payload-'sourceType'-'sourceId'-'sourceNo'-'sourceEventCode';
 SELECT auth_user_id,tenant_id INTO STRICT root_actor,root_tenant FROM public.sys_user WHERE auth_user_id IS NOT NULL AND tenant_id<>tenant AND 'R_SUPER'=ANY(user_roles) AND status='1' ORDER BY id LIMIT 1;
 SELECT id INTO STRICT other_tenant FROM public.sys_tenant WHERE id<>tenant AND status='1' AND builtin_type IS DISTINCT FROM 'platform'
  AND(service_start_date IS NULL OR service_start_date<=app_private.payable_business_date()) AND(service_end_date IS NULL OR service_end_date>=app_private.payable_business_date()) ORDER BY id LIMIT 1;
 PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
 IF app_private.current_read_tenant_id()<>tenant THEN RAISE EXCEPTION 'Ordinary forged scope escaped its tenant';END IF;
 PERFORM public.save_fms_voucher_secure(payload||jsonb_build_object('summary','普通伪造范围仍只保存自有租户'));
 PERFORM set_config('request.jwt.claim.sub',root_actor::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',root_actor,'role','authenticated')::text,true);PERFORM set_config('request.headers','{}',true);
 IF NOT app_private.is_platform_super() OR app_private.current_read_tenant_id() IS NOT NULL THEN RAISE EXCEPTION 'Platform-all fixture is not genuinely all-tenant';END IF;
 FOR voucher_ident,scenario IN SELECT value::uuid,ordinal::integer FROM jsonb_array_elements_text(current_setting('qa.voucher_source_ids')::jsonb) WITH ORDINALITY rows(value,ordinal) LOOP
  payload:=jsonb_set(jsonb_set(payload,'{lines,0,debitAmount}',to_jsonb(scenario*100)),'{lines,1,creditAmount}',to_jsonb(scenario*100));
  result:=public.save_fms_voucher_secure(payload||jsonb_build_object('id',voucher_ident,'summary','全部租户按原凭证账套保存'));
  IF(result->>'id')::uuid<>voucher_ident THEN RAISE EXCEPTION 'Platform-all voucher edit did not preserve identity';END IF;
 END LOOP;
 PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',tenant)::text,true);
 PERFORM public.save_fms_voucher_secure(payload||jsonb_build_object('summary','平台选定业务租户保存原凭证'));
 PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
 BEGIN
  PERFORM public.save_fms_voucher_secure(payload);
  RAISE EXCEPTION 'Selected foreign tenant could mutate QA voucher';
 EXCEPTION WHEN no_data_found OR insufficient_privilege THEN NULL;
 END;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);PERFORM set_config('request.headers','{}',true);
 DELETE FROM public.sys_role_menu access USING public.sys_menu menu WHERE access.role_id='40283472-f334-4cb9-84a0-2a41fcf7ab25' AND access.menu_id=menu.id AND menu.name='FinanceVoucherCenter:Edit';
 BEGIN
  PERFORM public.save_fms_voucher_secure(payload);
  RAISE EXCEPTION 'Voucher edit ignored revoked managed permission';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
END $voucher_scope$;

ROLLBACK;
