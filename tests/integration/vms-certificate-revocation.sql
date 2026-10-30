BEGIN;

DO $test$
DECLARE
  platform_uid uuid := '0a872664-874c-447d-a256-d0dbdca6ed45';
  ordinary_uid uuid := 'ab881b32-87d4-4dce-9014-ce488b8069df';
  own_tenant uuid := '7529f951-938e-4e2c-ac0d-316c136ae1f9';
  qa_tenant uuid := '2824c2b5-2774-4781-b995-f55e8bcee920';
  vehicle_certificate_id uuid := '1131289c-a753-4de5-9f16-6093ec397616';
  qa_certificate_id uuid := '88a4d1cb-59d9-44c2-bad7-045673779233';
  vehicle_id uuid := 'a9fc0004-1023-4620-9220-000000000001';
  driver_id uuid := '119a7398-3952-426f-af0e-4fbe8233453d';
  qa_responsible_id uuid := '7446b152-4057-47af-b4c1-bcbb74491880';
  replacement_id uuid;
  driver_certificate_id uuid;
  driver_replacement_id uuid;
  event_pending_id uuid;
  event_failed_id uuid;
  event_count_before integer;
  result jsonb;
  blocked boolean;
BEGIN
  IF to_regprocedure('public.vms_revoke_certificate_secure(uuid,text)') IS NULL
    OR NOT has_function_privilege('authenticated',
      'public.vms_revoke_certificate_secure(uuid,text)', 'EXECUTE')
    OR has_function_privilege('anon',
      'public.vms_revoke_certificate_secure(uuid,text)', 'EXECUTE')
    OR NOT EXISTS (SELECT 1 FROM public.sys_menu WHERE name='CertificateCenter:Revoke'
      AND type='button' AND parent_id=(SELECT id FROM public.sys_menu WHERE name='CertificateCenter'))
  THEN RAISE EXCEPTION 'Certificate revocation function or managed permission is missing'; END IF;

  PERFORM set_config('request.jwt.claim.sub',ordinary_uid::text,true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub',ordinary_uid,'role','authenticated')::text,true);
  PERFORM set_config('request.headers','{}',true);
  IF NOT app_private.has_permission('CertificateCenter:Revoke') THEN
    RAISE EXCEPTION 'Authorized ordinary vehicle manager lacks revoke permission';
  END IF;
  SELECT e.id INTO event_pending_id
  FROM public.sys_notification_event e JOIN public.sys_notification_subject s ON s.id=e.subject_id
  WHERE s.business_type='vehicle_certificate' AND s.business_id=vehicle_certificate_id
  ORDER BY e.create_time LIMIT 1;
  SELECT e.id INTO event_failed_id
  FROM public.sys_notification_event e JOIN public.sys_notification_subject s ON s.id=e.subject_id
  WHERE s.business_type='vehicle_certificate' AND s.business_id=vehicle_certificate_id
    AND e.id<>event_pending_id ORDER BY e.create_time LIMIT 1;
  IF event_pending_id IS NULL OR event_failed_id IS NULL THEN
    RAISE EXCEPTION 'Pending/failed reminder fixtures unavailable'; END IF;
  UPDATE public.sys_notification_event SET status='pending' WHERE id=event_pending_id;
  UPDATE public.sys_notification_event SET status='failed' WHERE id=event_failed_id;
  UPDATE public.sys_notification_delivery SET status='pending' WHERE event_id=event_pending_id;
  UPDATE public.sys_notification_delivery SET status='failed' WHERE event_id=event_failed_id;
  SELECT count(*) INTO event_count_before FROM public.sys_notification_event e
    JOIN public.sys_notification_subject s ON s.id=e.subject_id
    WHERE s.business_type='vehicle_certificate' AND s.business_id=vehicle_certificate_id;
  result:=public.vms_revoke_certificate_secure(vehicle_certificate_id,'回滚验收：旧车险证件作废');
  IF result->>'status'<>'revoked' OR result->>'revokedReason'<>'回滚验收：旧车险证件作废'
    OR result->>'revokedBy' IS NULL OR result->>'revokedAt' IS NULL
    OR result->>'revokedOn' IS NULL
    OR (SELECT status FROM public.sys_notification_subject
      WHERE business_type='vehicle_certificate' AND business_id=vehicle_certificate_id) <> 'resolved'
    OR jsonb_array_length(app_private.vms_revoked_certificate_blockers(own_tenant,vehicle_id,NULL))<>1
    OR app_private.vms_vehicle_certificate_risk_json(vehicle_id,own_tenant)->>'certificateRisk'<>'revoked'
  THEN RAISE EXCEPTION 'Revocation audit, reminder stop, or vehicle risk failed'; END IF;
  IF EXISTS (SELECT 1 FROM public.sys_notification_delivery
    WHERE event_id IN (event_pending_id,event_failed_id) AND status<>'skipped')
    OR EXISTS (SELECT 1 FROM public.sys_notification_event
      WHERE id IN (event_pending_id,event_failed_id) AND status<>'skipped')
  THEN RAISE EXCEPTION 'Pending or failed reminder was not skipped on revocation'; END IF;
  PERFORM app_private.process_notification_reminders_for_tenant(own_tenant,100);
  IF (SELECT count(*) FROM public.sys_notification_event e
      JOIN public.sys_notification_subject s ON s.id=e.subject_id
      WHERE s.business_type='vehicle_certificate' AND s.business_id=vehicle_certificate_id)
      <>event_count_before
  THEN RAISE EXCEPTION 'Revoked certificate emitted a new reminder'; END IF;

  blocked:=false;
  BEGIN
    PERFORM app_private.vms_authorize_dispatch_certificate_risk(
      own_tenant,ARRAY[]::uuid[],vehicle_id,NULL,true,'回滚验收：即使拥有强制派单权限也不能使用作废证件');
  EXCEPTION WHEN check_violation THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Revoked vehicle bypassed dispatch override'; END IF;

  blocked:=false;
  BEGIN PERFORM public.vms_mark_certificate_handled_secure(vehicle_certificate_id);
  EXCEPTION WHEN invalid_parameter_value THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Revoked certificate was handled as a renewal'; END IF;

  PERFORM set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope',qa_tenant)::text,true);
  blocked:=false;
  BEGIN PERFORM public.vms_revoke_certificate_secure(qa_certificate_id,'回滚验收：越权作废');
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Forged tenant header enabled cross-tenant revocation'; END IF;

  PERFORM set_config('request.jwt.claim.sub',platform_uid::text,true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub',platform_uid,'role','authenticated')::text,true);
  PERFORM set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope',own_tenant)::text,true);
  blocked:=false;
  BEGIN PERFORM public.vms_revoke_certificate_secure(qa_certificate_id,'回滚验收：选定租户越权作废');
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Platform-selected scope allowed another tenant'; END IF;
  result:=public.vms_check_dispatch_certificate_risk_secure(vehicle_id,NULL);
  IF result->>'blocked'<>'true' OR result->>'canOverride'<>'false'
    OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(result->'risks') risk
      WHERE risk->>'riskKind'='revoked' AND risk->>'certificateId'=vehicle_certificate_id::text)
  THEN RAISE EXCEPTION 'Dispatch precheck did not show a non-overridable revoked certificate'; END IF;

  replacement_id:=(public.vms_save_certificate_secure(NULL,jsonb_build_object(
    'subject_type','vehicle','subject_id',vehicle_id,
    'certificate_type','compulsory_insurance','certificate_no','QA-ROLLBACK-REPLACEMENT',
    'valid_from',(now() AT TIME ZONE 'Asia/Shanghai')::date,
    'expires_on',(now() AT TIME ZONE 'Asia/Shanghai')::date+400,
    'responsible_user_id','51080ef5-46a4-4d0c-a229-c97c6fccda93',
    'renewal_of_id',vehicle_certificate_id,'attachments','[]'::jsonb
  ))->>'id')::uuid;
  IF replacement_id IS NULL
    OR jsonb_array_length(app_private.vms_revoked_certificate_blockers(own_tenant,vehicle_id,NULL))<>0
    OR app_private.vms_vehicle_certificate_risk_json(vehicle_id,own_tenant)->>'certificateRisk'<>'valid'
  THEN RAISE EXCEPTION 'Linked valid vehicle replacement did not restore dispatch eligibility'; END IF;
  result:=public.vms_list_certificates_secure(p_from:=0,p_to:=99,
    p_subject_type:='vehicle',p_subject_id:=vehicle_id,p_status:='revoked');
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(result->'records') r
    WHERE r->>'id'=vehicle_certificate_id::text AND r->>'isCurrent'='false')
  THEN RAISE EXCEPTION 'Revoked vehicle history or list filter was lost'; END IF;

  PERFORM set_config('request.headers','{}',true);
  driver_certificate_id:=(public.vms_save_certificate_secure(NULL,jsonb_build_object(
    'subject_type','driver','subject_id',driver_id,
    'certificate_type','driver_license','certificate_no','QA-ROLLBACK-DRIVER-LICENSE',
    'valid_from',(now() AT TIME ZONE 'Asia/Shanghai')::date,
    'expires_on',(now() AT TIME ZONE 'Asia/Shanghai')::date+365,
    'responsible_user_id',qa_responsible_id,'attachments','[]'::jsonb
  ))->>'id')::uuid;
  PERFORM app_private.tms_assert_driver_certified(qa_tenant,driver_id,'self');
  result:=public.vms_revoke_certificate_secure(driver_certificate_id,'回滚验收：司机驾驶证作废');
  IF result->>'status'<>'revoked'
    OR jsonb_array_length(app_private.vms_revoked_certificate_blockers(qa_tenant,NULL,driver_id))<>1
  THEN RAISE EXCEPTION 'Driver revocation was not recorded'; END IF;
  blocked:=false;
  BEGIN PERFORM app_private.tms_assert_driver_certified(qa_tenant,driver_id,'self');
  EXCEPTION WHEN check_violation THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Self-owned driver bypassed a revoked certificate'; END IF;

  driver_replacement_id:=(public.vms_save_certificate_secure(NULL,jsonb_build_object(
    'subject_type','driver','subject_id',driver_id,
    'certificate_type','driver_license','certificate_no','QA-ROLLBACK-DRIVER-REPLACEMENT',
    'valid_from',(now() AT TIME ZONE 'Asia/Shanghai')::date,
    'expires_on',(now() AT TIME ZONE 'Asia/Shanghai')::date+90,
    'responsible_user_id',qa_responsible_id,'renewal_of_id',driver_certificate_id,
    'attachments','[]'::jsonb
  ))->>'id')::uuid;
  IF driver_replacement_id IS NULL
    OR jsonb_array_length(app_private.vms_revoked_certificate_blockers(qa_tenant,NULL,driver_id))<>0
  THEN RAISE EXCEPTION 'Shorter but currently valid linked driver replacement did not clear revoked blocker'; END IF;
  PERFORM app_private.tms_assert_driver_certified(qa_tenant,driver_id,'self');

  result:=public.vms_revoke_certificate_secure(qa_certificate_id,'回滚验收：平台全部租户作废');
  IF result->>'status'<>'revoked' THEN
    RAISE EXCEPTION 'Platform-all revocation failed for an explicitly targeted row';
  END IF;
  blocked:=false;
  BEGIN
    UPDATE public.tms_order SET dispatch_vehicle_id='bf876203-a11e-454e-b56a-72d3429dfd17'
    WHERE id='a8fd42f0-20ac-4832-99e3-a82bed6eca11' AND dispatch_status='loaded';
  EXCEPTION WHEN check_violation THEN
    IF position('作废' IN SQLERRM)>0 THEN blocked:=true; ELSE RAISE; END IF;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'TMS order dispatch trigger accepted a revoked vehicle'; END IF;
END
$test$;

ROLLBACK;
