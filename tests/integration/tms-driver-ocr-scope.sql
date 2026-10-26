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
BEGIN
  SELECT auth_user_id INTO platform_user FROM public.sys_user
  WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1;
  SELECT tenant_id INTO own_tenant FROM public.sys_user WHERE auth_user_id = ordinary_user;
  SELECT id INTO own_driver FROM public.mdm_driver WHERE tenant_id = own_tenant LIMIT 1;
  SELECT driver_row.id, driver_row.tenant_id INTO other_driver, other_tenant
  FROM public.mdm_driver driver_row
  JOIN public.sys_tenant tenant_row ON tenant_row.id = driver_row.tenant_id
  WHERE driver_row.tenant_id <> own_tenant AND tenant_row.status = '1'
    AND (tenant_row.service_start_date IS NULL OR tenant_row.service_start_date <= current_date)
    AND (tenant_row.service_end_date IS NULL OR tenant_row.service_end_date >= current_date)
  LIMIT 1;
  IF platform_user IS NULL OR own_driver IS NULL OR other_driver IS NULL THEN
    RAISE EXCEPTION 'Driver OCR scope fixtures unavailable';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.sys_menu WHERE name = 'TmsDriver:Ocr'
      AND parent_id = (SELECT id FROM public.sys_menu WHERE name = 'TmsDriver')
  ) THEN RAISE EXCEPTION 'Driver OCR action missing from driver menu'; END IF;

  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', platform_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', '{}', true);
  result := public.tms_get_driver_secure(other_driver);
  IF result->>'tenant_id' IS DISTINCT FROM other_tenant::text THEN
    RAISE EXCEPTION 'Platform all-tenant driver read lost row tenant';
  END IF;
  PERFORM set_config('request.headers', jsonb_build_object('x-art-tenant-scope', other_tenant)::text, true);
  result := public.tms_get_driver_secure(other_driver);
  IF result->>'tenant_id' IS DISTINCT FROM other_tenant::text THEN
    RAISE EXCEPTION 'Selected-tenant driver read lost row tenant';
  END IF;
  PERFORM set_config('request.headers', jsonb_build_object('x-art-tenant-scope', own_tenant)::text, true);
  IF public.tms_get_driver_secure(other_driver) IS NOT NULL THEN
    RAISE EXCEPTION 'Selected-tenant driver read crossed scope';
  END IF;

  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', ordinary_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', '{}', true);
  result := public.tms_get_driver_secure(own_driver);
  IF result->>'tenant_id' IS DISTINCT FROM own_tenant::text THEN
    RAISE EXCEPTION 'Ordinary own driver read lost row tenant';
  END IF;
  PERFORM set_config('request.headers', jsonb_build_object('x-art-tenant-scope', other_tenant)::text, true);
  result := public.tms_get_driver_secure(own_driver);
  IF result->>'tenant_id' IS DISTINCT FROM own_tenant::text
    OR public.tms_get_driver_secure(other_driver) IS NOT NULL THEN
    RAISE EXCEPTION 'Forged ordinary tenant header changed driver scope';
  END IF;
END;
$test$;

ROLLBACK;
