BEGIN;

DO $test$
DECLARE
  qa_tenant uuid := '7529f951-938e-4e2c-ac0d-316c136ae1f9';
  ordinary_auth uuid := '5774aa51-3bbb-4da5-abd4-7ea44b44ea6a';
  ordinary_user uuid := '51080ef5-46a4-4d0c-a229-c97c6fccda93';
  super_auth uuid := '0a872664-874c-447d-a256-d0dbdca6ed45';
  super_user uuid := '51760251-629d-4561-aeb8-0fbe62352494';
  v_invitation_id uuid;
  v_driver_id uuid;
  result jsonb;
BEGIN
  IF has_function_privilege('anon',
    'public.tms_create_driver_invitation_secure(text,text,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous role can create invitations';
  END IF;
  IF (SELECT count(*) FROM public.tms_driver_invitation
      WHERE tenant_id = qa_tenant AND phone IN ('13900002031', '13900002032')) <> 2 THEN
    RAISE EXCEPTION 'Two QA invitation samples are missing';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', ordinary_auth::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', ordinary_auth, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope', '028e6a68-a9db-4055-974c-1e05bfe94b0f')::text, true);
  IF NOT app_private.has_permission('TmsDriver:Invite')
     OR NOT app_private.has_permission('TmsDriver:Add') THEN
    RAISE EXCEPTION 'Ordinary QA actor lacks invitation/create permissions';
  END IF;
  BEGIN
    PERFORM public.tms_create_driver_invitation_secure(
      '13900002039', 'individual', NULL, '028e6a68-a9db-4055-974c-1e05bfe94b0f');
    RAISE EXCEPTION 'Forged tenant created an invitation';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;

  result := public.tms_create_driver_invitation_secure(
    '13900002039', 'individual', NULL, NULL);
  v_invitation_id := (result->>'id')::uuid;
  IF result->>'tenant_id' <> qa_tenant::text
     OR result->>'requested_by_name' <> '刘学乐' THEN
    RAISE EXCEPTION 'Ordinary invitation tenant or inviter is incorrect';
  END IF;
  v_driver_id := public.tms_create_driver_secure(jsonb_build_object(
    'driver_name', 'QA邀请流程回滚验证',
    'phone', '13900002039',
    'driver_type', 'primary',
    'gender', 'male',
    'id_card_no', '110101199001010011',
    'license_type', 'A2',
    'profile', jsonb_build_object(
      'driver_ownership', 'individual', 'driver_status', 'on_duty')
  ));
  IF NOT EXISTS (
    SELECT 1 FROM public.tms_driver_invitation i
    WHERE i.id = v_invitation_id
      AND i.tenant_id = qa_tenant
      AND i.linked_driver_id = v_driver_id
      AND i.status = 'profile_created'
      AND i.requested_by = ordinary_user
  ) OR NOT EXISTS (
    SELECT 1 FROM public.tms_driver_profile p
    WHERE p.driver_id = v_driver_id
      AND p.tenant_id = qa_tenant
      AND p.inviter_user_id = ordinary_user
      AND p.registration_status = 'unregistered'
  ) THEN
    RAISE EXCEPTION 'Ordinary invitation to draft profile lifecycle failed';
  END IF;
  IF (public.tms_get_driver_invitation_secure(v_invitation_id)->>'requested_by_name')
      <> '刘学乐' THEN
    RAISE EXCEPTION 'Scoped invitation detail omits inviter';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', super_auth::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', super_auth, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope', qa_tenant)::text, true);
  IF public.tms_get_driver_invitation_secure(v_invitation_id) IS NULL THEN
    RAISE EXCEPTION 'Platform selected tenant cannot read QA invitation';
  END IF;
  result := public.tms_create_driver_invitation_secure(
    '13900002041', 'self', NULL, qa_tenant);
  IF result->>'tenant_id' <> qa_tenant::text THEN
    RAISE EXCEPTION 'Platform selected tenant invitation targeted the wrong tenant';
  END IF;
  IF public.tms_get_driver_invitation_secure(
      '310596ce-57b0-4a82-a892-534a522225cd') IS NOT NULL THEN
    RAISE EXCEPTION 'Platform selected tenant read another tenant invitation';
  END IF;

  PERFORM set_config('request.headers', '{}', true);
  result := public.tms_create_driver_invitation_secure(
    '13900002040', 'individual', NULL, qa_tenant);
  v_invitation_id := (result->>'id')::uuid;
  v_driver_id := public.tms_create_driver_secure(jsonb_build_object(
    'driver_name', 'QA跨租户邀请回滚验证',
    'phone', '13900002040',
    'driver_type', 'primary',
    'gender', 'male',
    'id_card_no', '110101199001010011',
    'license_type', 'A2',
    'target_tenant_id', qa_tenant,
    'profile', jsonb_build_object(
      'driver_ownership', 'individual', 'driver_status', 'on_duty')
  ));
  IF NOT EXISTS (
    SELECT 1 FROM public.tms_driver_invitation i
    WHERE i.id = v_invitation_id
      AND i.tenant_id = qa_tenant
      AND i.linked_driver_id = v_driver_id
      AND i.status = 'profile_created'
      AND i.requested_by = super_user
  ) OR NOT EXISTS (
    SELECT 1 FROM public.tms_driver_profile p
    WHERE p.driver_id = v_driver_id
      AND p.tenant_id = qa_tenant
      AND p.inviter_user_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Cross-tenant invitation audit or profile FK failed';
  END IF;
  IF (public.tms_get_driver_invitation_secure(v_invitation_id)->>'requested_by_name')
      <> '懂了以后' THEN
    RAISE EXCEPTION 'Cross-tenant inviter display is missing';
  END IF;
END $test$;

ROLLBACK;
