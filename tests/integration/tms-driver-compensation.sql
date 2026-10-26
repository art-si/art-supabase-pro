BEGIN;

DO $test$
DECLARE
  platform_user uuid;
  permitted_user uuid;
  permitted_tenant uuid;
  denied_user uuid;
  own_driver uuid;
  foreign_driver uuid;
  foreign_tenant uuid;
  own_result jsonb;
  forged_result jsonb;
  denied boolean := false;
BEGIN
  IF to_regprocedure('public.tms_get_driver_compensation_secure(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Driver compensation reader is missing';
  END IF;
  IF has_function_privilege(
    'anon', 'public.tms_get_driver_compensation_secure(uuid)', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Anonymous compensation access is allowed';
  END IF;

  SELECT auth_user_id INTO platform_user
  FROM public.sys_user
  WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL
  LIMIT 1;

  SELECT u.auth_user_id, u.tenant_id, d.id
  INTO permitted_user, permitted_tenant, own_driver
  FROM public.sys_user u
  JOIN public.mdm_driver d
    ON d.tenant_id = u.tenant_id AND d.employee_id IS NOT NULL
  WHERE u.auth_user_id IS NOT NULL
    AND NOT (u.user_roles @> ARRAY['R_SUPER'])
    AND EXISTS (
      SELECT 1 FROM public.sys_role r
      JOIN public.sys_role_menu rm ON rm.role_id = r.id AND rm.tenant_id = r.tenant_id
      JOIN public.sys_menu m ON m.id = rm.menu_id
      WHERE r.tenant_id = u.tenant_id AND r.role_code = ANY(u.user_roles)
        AND m.name = 'TmsDriverQuery:View'
    )
    AND EXISTS (
      SELECT 1 FROM public.sys_role r
      JOIN public.sys_role_menu rm ON rm.role_id = r.id AND rm.tenant_id = r.tenant_id
      JOIN public.sys_menu m ON m.id = rm.menu_id
      WHERE r.tenant_id = u.tenant_id AND r.role_code = ANY(u.user_roles)
        AND m.name = 'Hr:Compensation:View'
    )
    AND EXISTS (
      SELECT 1 FROM public.sys_role r
      JOIN public.sys_role_menu rm ON rm.role_id = r.id AND rm.tenant_id = r.tenant_id
      JOIN public.sys_menu m ON m.id = rm.menu_id
      WHERE r.tenant_id = u.tenant_id AND r.role_code = ANY(u.user_roles)
        AND m.name = 'Hr:Compensation:Amount:View'
    )
  LIMIT 1;

  SELECT u.auth_user_id INTO denied_user
  FROM public.sys_user u
  WHERE u.auth_user_id IS NOT NULL
    AND NOT (u.user_roles @> ARRAY['R_SUPER'])
    AND NOT EXISTS (
      SELECT 1 FROM public.sys_role r
      JOIN public.sys_role_menu rm ON rm.role_id = r.id AND rm.tenant_id = r.tenant_id
      JOIN public.sys_menu m ON m.id = rm.menu_id
      WHERE r.tenant_id = u.tenant_id AND r.role_code = ANY(u.user_roles)
        AND m.name = 'Hr:Compensation:Amount:View'
    )
  LIMIT 1;

  SELECT id, tenant_id INTO foreign_driver, foreign_tenant
  FROM public.mdm_driver WHERE tenant_id <> permitted_tenant LIMIT 1;
  IF platform_user IS NULL OR permitted_user IS NULL OR denied_user IS NULL
     OR own_driver IS NULL OR foreign_driver IS NULL THEN
    RAISE EXCEPTION 'Driver compensation test actors unavailable';
  END IF;

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', platform_user, 'role', 'authenticated')::text,
    true
  );
  PERFORM set_config('request.headers', '{}', true);
  IF public.tms_get_driver_compensation_secure(own_driver) IS NULL THEN
    RAISE EXCEPTION 'Platform-all cannot read permitted tenant driver';
  END IF;
  PERFORM set_config(
    'request.headers',
    jsonb_build_object('x-art-tenant-scope', permitted_tenant)::text,
    true
  );
  IF public.tms_get_driver_compensation_secure(foreign_driver) IS NOT NULL THEN
    RAISE EXCEPTION 'Platform selected tenant leaked another tenant';
  END IF;

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', permitted_user, 'role', 'authenticated')::text,
    true
  );
  PERFORM set_config('request.headers', '{}', true);
  own_result := public.tms_get_driver_compensation_secure(own_driver);
  IF own_result IS NULL OR own_result->>'employeeLinked' <> 'true' THEN
    RAISE EXCEPTION 'Authorized employee-linked driver was not resolved';
  END IF;
  IF public.tms_get_driver_compensation_secure(foreign_driver) IS NOT NULL THEN
    RAISE EXCEPTION 'Ordinary user can read another tenant driver';
  END IF;
  PERFORM set_config(
    'request.headers',
    jsonb_build_object('x-art-tenant-scope', foreign_tenant)::text,
    true
  );
  forged_result := public.tms_get_driver_compensation_secure(own_driver);
  IF forged_result IS DISTINCT FROM own_result THEN
    RAISE EXCEPTION 'Forged tenant header changed ordinary compensation result';
  END IF;

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', denied_user, 'role', 'authenticated')::text,
    true
  );
  PERFORM set_config('request.headers', '{}', true);
  BEGIN
    PERFORM public.tms_get_driver_compensation_secure(own_driver);
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'User without HR amount permission read driver compensation';
  END IF;
END;
$test$;

ROLLBACK;
