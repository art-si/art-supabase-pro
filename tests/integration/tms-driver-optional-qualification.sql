BEGIN;

DO $test$
DECLARE
  qa_tenant uuid := '7529f951-938e-4e2c-ac0d-316c136ae1f9';
  platform_tenant uuid := '028e6a68-a9db-4055-974c-1e05bfe94b0f';
  super_auth uuid := '0a872664-874c-447d-a256-d0dbdca6ed45';
  ordinary_auth uuid := '5774aa51-3bbb-4da5-abd4-7ea44b44ea6a';
  v_self uuid;
  v_external uuid;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', super_auth::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', super_auth, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope', qa_tenant)::text, true);

  v_self := public.tms_create_driver_secure(jsonb_build_object(
    'driver_name', 'QA无资格证类型司机回滚',
    'phone', '13900002171',
    'gender', 'male',
    'id_card_no', '110101199001010071',
    'license_type', 'A2',
    'target_tenant_id', qa_tenant,
    'profile', jsonb_build_object(
      'driver_ownership', 'self',
      'driver_status', 'on_duty',
      'qualification_type', null)
  ));
  IF NOT EXISTS (SELECT 1 FROM public.tms_driver_profile
      WHERE driver_id = v_self AND qualification_type IS NULL) THEN
    RAISE EXCEPTION 'Optional qualification type was not stored as NULL';
  END IF;

  v_external := public.tms_create_driver_secure(jsonb_build_object(
    'driver_name', 'QA有资格证类型司机回滚',
    'phone', '13900002172',
    'gender', 'male',
    'id_card_no', '110101199001010072',
    'license_type', 'A2',
    'target_tenant_id', qa_tenant,
    'profile', jsonb_build_object(
      'driver_ownership', 'individual',
      'driver_status', 'on_duty',
      'qualification_type', 'road_freight')
  ));
  IF (SELECT qualification_type FROM public.tms_driver_profile
      WHERE driver_id = v_external) IS DISTINCT FROM 'road_freight' THEN
    RAISE EXCEPTION 'Valid external-driver qualification type was changed';
  END IF;

  BEGIN
    PERFORM public.tms_create_driver_secure(jsonb_build_object(
      'driver_name', 'QA错误资格证类型回滚',
      'phone', '13900002173',
      'gender', 'male',
      'id_card_no', '110101199001010073',
      'license_type', 'A2',
      'target_tenant_id', qa_tenant,
      'profile', jsonb_build_object(
        'driver_ownership', 'individual',
        'qualification_type', 'invalid_type')
    ));
    RAISE EXCEPTION 'Invalid qualification type bypassed the database check';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;

  BEGIN
    PERFORM public.tms_create_driver_secure(jsonb_build_object(
      'driver_name', 'QA跨租户司机回滚',
      'phone', '13900002174',
      'gender', 'male',
      'id_card_no', '110101199001010074',
      'license_type', 'A2',
      'target_tenant_id', platform_tenant,
      'profile', jsonb_build_object('driver_ownership', 'self')
    ));
    RAISE EXCEPTION 'Selected-tenant scope allowed a cross-tenant driver';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;

  PERFORM set_config('request.jwt.claim.sub', ordinary_auth::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', ordinary_auth, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope', platform_tenant)::text, true);
  BEGIN
    PERFORM public.tms_create_driver_secure(jsonb_build_object(
      'driver_name', 'QA普通用户越权司机回滚',
      'phone', '13900002175',
      'gender', 'male',
      'id_card_no', '110101199001010075',
      'license_type', 'A2',
      'target_tenant_id', platform_tenant,
      'profile', jsonb_build_object('driver_ownership', 'self')
    ));
    RAISE EXCEPTION 'Ordinary user forged a cross-tenant driver';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END $test$;

ROLLBACK;
