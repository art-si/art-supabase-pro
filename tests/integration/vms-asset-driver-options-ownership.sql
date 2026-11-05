-- Archive driver choices follow vehicle ownership and the resolved asset tenant.
BEGIN;

DO $audit$
DECLARE
  platform_user uuid := '0a872664-874c-447d-a256-d0dbdca6ed45';
  ordinary_user uuid := 'ab881b32-87d4-4dce-9014-ce488b8069df';
  platform_tenant uuid;
  own_tenant uuid;
  other_tenant uuid;
  own_vehicle_id uuid;
  self_driver uuid;
  carrier_driver uuid;
  carrier_id uuid;
  other_carrier_id uuid;
  individual_driver uuid;
  other_driver uuid;
  inactive_driver uuid;
  inactive_ownership text;
  unprofiled_driver uuid;
  unprofiled_carrier_id uuid;
  ownership text;
  expected_ownership text;
  expected_driver uuid;
  target_carrier_id uuid;
  result jsonb;
  own_result jsonb;
  blocked boolean;
BEGIN
  SELECT tenant_id INTO platform_tenant FROM public.sys_user
  WHERE auth_user_id = platform_user AND user_roles @> ARRAY['R_SUPER'];
  SELECT tenant_id INTO own_tenant FROM public.sys_user WHERE auth_user_id = ordinary_user;
  SELECT id INTO own_vehicle_id FROM public.mdm_vehicle
  WHERE tenant_id = own_tenant ORDER BY id LIMIT 1;
  IF platform_tenant IS NULL OR own_tenant IS NULL OR own_vehicle_id IS NULL THEN
    RAISE EXCEPTION 'Platform, ordinary account, or vehicle fixture missing';
  END IF;

  SELECT d.id INTO self_driver FROM public.mdm_driver d
  JOIN public.tms_driver_profile p ON p.driver_id = d.id AND p.tenant_id = d.tenant_id
  WHERE d.tenant_id = own_tenant AND d.enabled AND d.carrier_id IS NULL
    AND p.driver_ownership = 'self' ORDER BY d.id LIMIT 1;
  SELECT d.id, d.carrier_id INTO carrier_driver, carrier_id FROM public.mdm_driver d
  JOIN public.tms_driver_profile p ON p.driver_id = d.id AND p.tenant_id = d.tenant_id
  JOIN public.mdm_carrier c ON c.id = d.carrier_id AND c.tenant_id = d.tenant_id AND c.enabled
  WHERE d.tenant_id = own_tenant AND d.enabled AND p.driver_ownership = 'carrier'
  ORDER BY d.id LIMIT 1;
  SELECT id INTO other_carrier_id FROM public.mdm_carrier
  WHERE tenant_id = own_tenant AND enabled AND id <> carrier_id ORDER BY id LIMIT 1;
  SELECT d.id INTO individual_driver FROM public.mdm_driver d
  JOIN public.tms_driver_profile p ON p.driver_id = d.id AND p.tenant_id = d.tenant_id
  WHERE d.tenant_id = own_tenant AND d.enabled AND d.carrier_id IS NULL
    AND p.driver_ownership = 'individual' ORDER BY d.id LIMIT 1;
  SELECT d.tenant_id, d.id INTO other_tenant, other_driver FROM public.mdm_driver d
  JOIN public.tms_driver_profile p ON p.driver_id = d.id AND p.tenant_id = d.tenant_id
  JOIN public.sys_tenant t ON t.id = d.tenant_id
  WHERE d.tenant_id <> own_tenant AND d.enabled AND d.carrier_id IS NULL
    AND p.driver_ownership = 'self' AND t.status = '1'
    AND (t.service_start_date IS NULL OR t.service_start_date <= current_date)
    AND (t.service_end_date IS NULL OR t.service_end_date >= current_date)
  ORDER BY d.tenant_id, d.id LIMIT 1;
  SELECT d.id, p.driver_ownership INTO inactive_driver, inactive_ownership
  FROM public.mdm_driver d
  JOIN public.tms_driver_profile p ON p.driver_id = d.id AND p.tenant_id = d.tenant_id
  WHERE d.tenant_id = own_tenant AND NOT d.enabled AND d.carrier_id IS NULL
    AND p.driver_ownership IN ('self', 'individual') ORDER BY d.id LIMIT 1;
  SELECT d.id, d.carrier_id INTO unprofiled_driver, unprofiled_carrier_id
  FROM public.mdm_driver d
  LEFT JOIN public.tms_driver_profile p ON p.driver_id = d.id AND p.tenant_id = d.tenant_id
  JOIN public.mdm_carrier c ON c.id = d.carrier_id AND c.tenant_id = d.tenant_id AND c.enabled
  WHERE d.tenant_id = own_tenant AND d.enabled AND p.driver_id IS NULL
  ORDER BY d.id LIMIT 1;
  IF self_driver IS NULL OR carrier_driver IS NULL OR other_carrier_id IS NULL
    OR individual_driver IS NULL OR other_driver IS NULL OR inactive_driver IS NULL
    OR unprofiled_driver IS NULL THEN
    RAISE EXCEPTION 'Archive driver ownership fixtures missing';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', platform_user::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', platform_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', '{}', true);
  FOR ownership, expected_ownership, expected_driver, target_carrier_id IN
    SELECT * FROM (VALUES
      ('self_operated', 'self', self_driver, NULL::uuid),
      ('carrier', 'carrier', carrier_driver, carrier_id),
      ('individual_affiliation', 'individual', individual_driver, NULL::uuid)
    ) choices(vehicle_ownership, driver_ownership, driver_id, carrier_id)
  LOOP
    result := public.vms_list_asset_driver_options_secure(
      p_tenant_id => own_tenant, p_vehicle_ownership => ownership,
      p_carrier_id => target_carrier_id, p_max_rows => 1000);
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(result) item
      WHERE item->>'id' = expected_driver::text
    ) THEN RAISE EXCEPTION 'Expected % driver missing', ownership; END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(result) item
      WHERE NOT EXISTS (
        SELECT 1 FROM public.mdm_driver d
        JOIN public.tms_driver_profile p ON p.driver_id = d.id AND p.tenant_id = d.tenant_id
        WHERE d.id = (item->>'id')::uuid AND d.tenant_id = own_tenant AND d.enabled
          AND p.driver_ownership = expected_ownership
          AND (target_carrier_id IS NULL AND d.carrier_id IS NULL
            OR target_carrier_id IS NOT NULL AND d.carrier_id = target_carrier_id)
      )
    ) THEN RAISE EXCEPTION 'Wrong tenant, ownership, carrier, or status in % choices', ownership; END IF;
  END LOOP;

  result := public.vms_list_asset_driver_options_secure(
    p_tenant_id => own_tenant, p_vehicle_id => own_vehicle_id,
    p_vehicle_ownership => 'self_operated', p_max_rows => 1000);
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(result) item
    WHERE item->>'id' = self_driver::text) THEN
    RAISE EXCEPTION 'Edit vehicle tenant did not resolve to its driver pool';
  END IF;

  result := public.vms_list_asset_driver_options_secure(
    p_tenant_id => own_tenant, p_vehicle_ownership => 'carrier',
    p_carrier_id => other_carrier_id, p_max_rows => 1000);
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(result) item
    WHERE item->>'id' = carrier_driver::text) THEN
    RAISE EXCEPTION 'Carrier driver appeared under a different carrier';
  END IF;
  result := public.vms_list_asset_driver_options_secure(
    p_tenant_id => own_tenant,
    p_vehicle_ownership => CASE inactive_ownership
      WHEN 'self' THEN 'self_operated' ELSE 'individual_affiliation' END,
    p_max_rows => 1000);
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(result) item
    WHERE item->>'id' = inactive_driver::text) THEN
    RAISE EXCEPTION 'Inactive driver appeared in archive choices';
  END IF;
  result := public.vms_list_asset_driver_options_secure(
    p_tenant_id => own_tenant, p_vehicle_ownership => 'carrier',
    p_carrier_id => unprofiled_carrier_id, p_max_rows => 1000);
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(result) item
    WHERE item->>'id' = unprofiled_driver::text) THEN
    RAISE EXCEPTION 'Driver without ownership profile appeared in archive choices';
  END IF;

  -- Platform-all may target a concrete tenant; an omitted target defaults to its home tenant.
  result := public.vms_list_asset_driver_options_secure(
    p_tenant_id => other_tenant, p_vehicle_ownership => 'self_operated', p_max_rows => 1000);
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(result) item
    WHERE item->>'id' = other_driver::text) THEN
    RAISE EXCEPTION 'Platform-all explicit target tenant unavailable';
  END IF;
  result := public.vms_list_asset_driver_options_secure(
    p_vehicle_ownership => 'self_operated', p_max_rows => 1000);
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(result) item
    JOIN public.mdm_driver d ON d.id = (item->>'id')::uuid
    WHERE d.tenant_id <> platform_tenant) THEN
    RAISE EXCEPTION 'Platform-all default leaked outside home tenant';
  END IF;

  PERFORM set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope', own_tenant)::text, true);
  result := public.vms_list_asset_driver_options_secure(
    p_tenant_id => own_tenant, p_vehicle_ownership => 'self_operated', p_max_rows => 1000);
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(result) item
    WHERE item->>'id' = self_driver::text) THEN
    RAISE EXCEPTION 'Platform-selected own driver missing';
  END IF;
  blocked := false;
  BEGIN
    PERFORM public.vms_list_asset_driver_options_secure(
      p_tenant_id => other_tenant, p_vehicle_ownership => 'self_operated');
  EXCEPTION WHEN SQLSTATE '42501' THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Platform-selected foreign target accepted'; END IF;

  PERFORM set_config('request.jwt.claim.sub', ordinary_user::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', ordinary_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', '{}', true);
  own_result := public.vms_list_asset_driver_options_secure(
    p_tenant_id => own_tenant, p_vehicle_ownership => 'self_operated', p_max_rows => 1000);
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(own_result) item
    WHERE item->>'id' = self_driver::text) THEN
    RAISE EXCEPTION 'Ordinary own driver missing';
  END IF;
  PERFORM set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope', other_tenant)::text, true);
  result := public.vms_list_asset_driver_options_secure(
    p_tenant_id => own_tenant, p_vehicle_ownership => 'self_operated', p_max_rows => 1000);
  IF result IS DISTINCT FROM own_result THEN
    RAISE EXCEPTION 'Forged ordinary scope changed driver choices';
  END IF;
  blocked := false;
  BEGIN
    PERFORM public.vms_list_asset_driver_options_secure(
      p_tenant_id => other_tenant, p_vehicle_ownership => 'self_operated');
  EXCEPTION WHEN SQLSTATE '42501' THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Ordinary foreign target accepted'; END IF;

  IF has_function_privilege('anon',
    'public.vms_list_asset_driver_options_secure(uuid,uuid,text,uuid,text,text,integer)',
    'EXECUTE') THEN RAISE EXCEPTION 'Anonymous archive driver options grant'; END IF;
END $audit$;

ROLLBACK;
