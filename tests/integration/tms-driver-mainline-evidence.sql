BEGIN;

DO $test$
DECLARE
  platform_user uuid;
  ordinary_user uuid := 'ab881b32-87d4-4dce-9014-ce488b8069df';
  own_tenant uuid;
  other_tenant uuid;
  own_driver uuid;
  other_driver uuid;
  result jsonb;
  qualification_result jsonb;
BEGIN
  IF to_regprocedure('public.tms_list_driver_mainline_safety_secure(uuid,text,integer,integer)') IS NULL
    OR to_regprocedure('public.tms_list_driver_mainline_qualifications_secure(uuid,integer,integer)') IS NULL THEN
    RAISE EXCEPTION 'Driver mainline readers are missing';
  END IF;
  IF has_function_privilege('anon', 'public.tms_list_driver_mainline_safety_secure(uuid,text,integer,integer)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.tms_list_driver_mainline_qualifications_secure(uuid,integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous role can execute a driver mainline reader';
  END IF;

  SELECT auth_user_id INTO platform_user FROM public.sys_user
  WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1;
  SELECT tenant_id INTO own_tenant FROM public.sys_user WHERE auth_user_id = ordinary_user;
  SELECT id INTO own_driver FROM public.mdm_driver WHERE tenant_id = own_tenant LIMIT 1;
  SELECT id, tenant_id INTO other_driver, other_tenant FROM public.mdm_driver
  WHERE tenant_id <> own_tenant LIMIT 1;
  IF platform_user IS NULL OR own_driver IS NULL OR other_driver IS NULL THEN
    RAISE EXCEPTION 'Driver mainline test actors or records unavailable';
  END IF;

  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', platform_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', '{}', true);
  result := public.tms_list_driver_mainline_safety_secure(own_driver, 'violation', 0, 19);
  qualification_result := public.tms_list_driver_mainline_qualifications_secure(own_driver, 0, 19);
  IF result->>'available' <> 'true' OR qualification_result->>'available' <> 'true' THEN
    RAISE EXCEPTION 'Platform all-tenant evidence unavailable';
  END IF;

  PERFORM set_config('request.headers', jsonb_build_object('x-art-tenant-scope', own_tenant)::text, true);
  result := public.tms_list_driver_mainline_safety_secure(own_driver, 'accident', 0, 19);
  IF result->>'available' <> 'true' THEN RAISE EXCEPTION 'Platform selected-tenant evidence unavailable'; END IF;
  PERFORM set_config('request.headers', jsonb_build_object('x-art-tenant-scope', other_tenant)::text, true);
  BEGIN
    PERFORM public.tms_list_driver_mainline_safety_secure(own_driver, 'violation', 0, 19);
    RAISE EXCEPTION 'Platform selected-tenant scope leaked driver safety';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL;
  END;

  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', ordinary_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', '{}', true);
  result := public.tms_list_driver_mainline_safety_secure(own_driver, 'violation', 0, 19);
  IF (result->>'available')::boolean = false AND (result->>'total')::integer <> 0 THEN
    RAISE EXCEPTION 'Ordinary user received denied safety totals';
  END IF;
  qualification_result := public.tms_list_driver_mainline_qualifications_secure(own_driver, 0, 19);
  IF (qualification_result->>'available')::boolean = false AND (qualification_result->>'total')::integer <> 0 THEN
    RAISE EXCEPTION 'Ordinary user received denied qualification totals';
  END IF;
  PERFORM set_config('request.headers', jsonb_build_object('x-art-tenant-scope', other_tenant)::text, true);
  result := public.tms_list_driver_mainline_safety_secure(own_driver, 'violation', 0, 19);
  IF result->>'available' IS NULL THEN RAISE EXCEPTION 'Forged header hid own driver'; END IF;
  BEGIN
    PERFORM public.tms_list_driver_mainline_qualifications_secure(other_driver, 0, 19);
    RAISE EXCEPTION 'Forged header exposed another tenant driver';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL;
  END;
END;
$test$;

ROLLBACK;
