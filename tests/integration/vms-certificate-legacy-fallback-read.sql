BEGIN;

DO $test$
DECLARE
  platform_uid uuid := '0a872664-874c-447d-a256-d0dbdca6ed45';
  ordinary_uid uuid := 'ab881b32-87d4-4dce-9014-ce488b8069df';
  own_tenant uuid := '7529f951-938e-4e2c-ac0d-316c136ae1f9';
  other_tenant uuid := '2824c2b5-2774-4781-b995-f55e8bcee920';
  qa_vehicle_id uuid := 'a9fc0004-1023-4620-9220-000000000001';
  insurance_id uuid;
  responsible_id uuid;
  new_certificate_id uuid;
  context_name text;
  scoped_uid uuid;
  selected_tenant uuid;
  result jsonb;
  full_result jsonb;
  due_result jsonb;
  legacy_record jsonb;
  certificate_record jsonb;
BEGIN
  IF to_regprocedure('app_private.vms_certificate_center_source(text,uuid)') IS NULL
    OR has_function_privilege('authenticated',
      'app_private.vms_certificate_center_source(text,uuid)','EXECUTE')
  THEN RAISE EXCEPTION 'Private certificate read source is unavailable or exposed'; END IF;
  SELECT id INTO insurance_id FROM public.vehicle_insurance
  WHERE tenant_id=own_tenant AND vehicle_id=qa_vehicle_id LIMIT 1;
  SELECT responsible_user_id INTO responsible_id FROM public.vehicle_certificate
  WHERE tenant_id=own_tenant AND subject_id=qa_vehicle_id
    AND certificate_type='compulsory_insurance' LIMIT 1;
  IF insurance_id IS NULL OR responsible_id IS NULL THEN
    RAISE EXCEPTION 'Legacy certificate fallback fixtures unavailable';
  END IF;

  FOREACH context_name IN ARRAY ARRAY[
    'platform_all','platform_selected','ordinary_own','ordinary_forged'
  ] LOOP
    scoped_uid:=CASE WHEN context_name LIKE 'platform%' THEN platform_uid ELSE ordinary_uid END;
    selected_tenant:=CASE
      WHEN context_name='platform_selected' THEN own_tenant
      WHEN context_name='ordinary_forged' THEN other_tenant
      ELSE NULL END;
    PERFORM set_config('request.jwt.claim.sub',scoped_uid::text,true);
    PERFORM set_config('request.jwt.claims',
      jsonb_build_object('sub',scoped_uid,'role','authenticated')::text,true);
    PERFORM set_config('request.headers',CASE WHEN selected_tenant IS NULL THEN '{}'
      ELSE jsonb_build_object('x-art-tenant-scope',selected_tenant)::text END,true);
    full_result:=public.vms_list_certificates_secure(p_from:=0,p_to:=99);
    IF jsonb_array_length(full_result->'records')<2
      OR (SELECT count(*) FROM jsonb_array_elements(full_result->'records') r
          WHERE context_name<>'platform_all' AND r->>'tenantId'<>own_tenant::text)>0
    THEN RAISE EXCEPTION 'Certificate fallback crossed tenant scope: %',context_name; END IF;
    IF (SELECT count(DISTINCT r->>'tenantId')
        FROM jsonb_array_elements(full_result->'records') r)<2
       AND context_name='platform_all'
    THEN RAISE EXCEPTION 'Platform-all certificate read lost other tenants'; END IF;
    SELECT r INTO legacy_record FROM jsonb_array_elements(full_result->'records') r
    WHERE r->>'subjectId'=qa_vehicle_id::text
      AND r->>'certificateType'='commercial_insurance';
    SELECT r INTO certificate_record FROM jsonb_array_elements(full_result->'records') r
    WHERE r->>'subjectId'=qa_vehicle_id::text
      AND r->>'certificateType'='compulsory_insurance';
    IF legacy_record->>'sourceKind'<>'legacy_insurance'
      OR legacy_record->>'responsibleName'<>'待指定'
      OR legacy_record->>'isCurrent'<>'true'
      OR certificate_record->>'sourceKind'<>'certificate'
      OR (SELECT count(*) FROM jsonb_array_elements(full_result->'records') r
          WHERE r->>'subjectId'=qa_vehicle_id::text
            AND r->>'certificateType'='compulsory_insurance')<>1
    THEN RAISE EXCEPTION 'Canonical certificate/fallback split is wrong in %',context_name; END IF;
    result:=public.vms_list_certificates_secure(
      p_from:=0,p_to:=99,p_subject_type:='vehicle',p_subject_id:=qa_vehicle_id,
      p_keyword:='测A验收001');
    IF (result->>'total')::integer<2
      OR EXISTS(
        SELECT 1 FROM jsonb_array_elements(result->'records') r
        WHERE r->>'subjectId'<>qa_vehicle_id::text
      ) THEN RAISE EXCEPTION 'Subject/keyword fallback filter failed: %',context_name; END IF;
  END LOOP;

  PERFORM set_config('request.jwt.claim.sub',platform_uid::text,true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub',platform_uid,'role','authenticated')::text,true);
  PERFORM set_config('request.headers','{}',true);
  result:=public.vms_list_certificates_secure(p_from:=0,p_to:=4);
  IF jsonb_array_length(result->'records')<>5
    OR (result->>'total')::integer<>(
      SELECT count(*) FROM app_private.vms_certificate_center_source(NULL,NULL))
  THEN RAISE EXCEPTION 'Certificate fallback pagination total mismatch'; END IF;

  UPDATE public.vehicle_insurance
  SET commercial_expire_date=(now() at time zone 'Asia/Shanghai')::date+12
  WHERE id=insurance_id;
  due_result:=public.vms_list_certificates_secure(
    p_from:=0,p_to:=99,p_status:='due_15');
  IF NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(due_result->'records') r
    WHERE r->>'sourceKind'='legacy_insurance'
      AND r->>'subjectId'=qa_vehicle_id::text
      AND r->>'certificateType'='commercial_insurance'
  ) THEN RAISE EXCEPTION 'Dashboard due-risk query omitted legacy fallback'; END IF;

  new_certificate_id:=(public.vms_save_certificate_secure(NULL,jsonb_build_object(
    'subject_type','vehicle','subject_id',qa_vehicle_id,
    'certificate_type','commercial_insurance',
    'certificate_no','QA-ROLLBACK-COMMERCIAL-NEW',
    'issue_date',(now() at time zone 'Asia/Shanghai')::date,
    'valid_from',(now() at time zone 'Asia/Shanghai')::date,
    'expires_on',(now() at time zone 'Asia/Shanghai')::date+365,
    'responsible_user_id',responsible_id,'attachments','[]'::jsonb
  ))->>'id')::uuid;
  result:=public.vms_list_certificates_secure(
    p_from:=0,p_to:=99,p_subject_type:='vehicle',p_subject_id:=qa_vehicle_id);
  IF new_certificate_id IS NULL
    OR EXISTS(
      SELECT 1 FROM jsonb_array_elements(result->'records') r
      WHERE r->>'sourceKind'='legacy_insurance'
        AND r->>'certificateType'='commercial_insurance'
    )
    OR NOT EXISTS(
      SELECT 1 FROM jsonb_array_elements(result->'records') r
      WHERE r->>'id'=new_certificate_id::text
        AND r->>'sourceKind'='certificate'
    )
  THEN RAISE EXCEPTION 'Registering canonical certificate did not replace read-only fallback'; END IF;
  due_result:=public.vms_list_certificates_secure(
    p_from:=0,p_to:=99,p_status:='due_15');
  IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(due_result->'records') r
    WHERE r->>'subjectId'=qa_vehicle_id::text
      AND r->>'certificateType'='commercial_insurance'
  ) THEN RAISE EXCEPTION 'Superseded fallback remains on due-risk dashboard'; END IF;
END;
$test$;

ROLLBACK;
