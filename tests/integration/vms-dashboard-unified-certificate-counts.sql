BEGIN;

DO $test$
DECLARE
  platform_uid uuid := '0a872664-874c-447d-a256-d0dbdca6ed45';
  ordinary_uid uuid := 'ab881b32-87d4-4dce-9014-ce488b8069df';
  own_tenant uuid := '7529f951-938e-4e2c-ac0d-316c136ae1f9';
  other_tenant uuid := '2824c2b5-2774-4781-b995-f55e8bcee920';
  context_name text;
  scoped_uid uuid;
  selected_tenant uuid;
  result jsonb;
  reminders jsonb;
  insurance_count integer;
  inspection_count integer;
  expected_insurance integer;
  expected_inspection integer;
  expected_vehicles integer;
  legacy_insurance_id uuid;
  baseline_insurance integer;
BEGIN
  IF position('vms_certificate_center_source' in (
    SELECT pg_get_functiondef(p.oid) FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='get_dashboard_console'
  ))=0 OR EXISTS(
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='get_dashboard_console'
      AND pg_get_functiondef(p.oid) LIKE '%v_is_platform_super or%'
  ) THEN RAISE EXCEPTION 'Dashboard still uses the parallel legacy count or unsafe tenant scope'; END IF;

  FOREACH context_name IN ARRAY ARRAY[
    'platform_all','platform_selected','ordinary_own','ordinary_forged'
  ] LOOP
    scoped_uid:=CASE WHEN context_name LIKE 'platform%' THEN platform_uid ELSE ordinary_uid END;
    selected_tenant:=CASE
      WHEN context_name='platform_selected' THEN other_tenant
      WHEN context_name='ordinary_forged' THEN other_tenant
      ELSE NULL END;
    PERFORM set_config('request.jwt.claim.sub',scoped_uid::text,true);
    PERFORM set_config('request.jwt.claims',
      jsonb_build_object('sub',scoped_uid,'role','authenticated')::text,true);
    PERFORM set_config('request.headers',CASE WHEN selected_tenant IS NULL THEN '{}'
      ELSE jsonb_build_object('x-art-tenant-scope',selected_tenant)::text END,true);
    result:=public.get_dashboard_console();
    reminders:=result->'reminders';
    SELECT (r->>'count')::integer INTO insurance_count
    FROM jsonb_array_elements(reminders) r WHERE r->>'key'='insurance';
    SELECT (r->>'count')::integer INTO inspection_count
    FROM jsonb_array_elements(reminders) r WHERE r->>'key'='inspection';
    SELECT count(*) filter (
      WHERE source.record->>'certificateType'
        IN ('commercial_insurance','compulsory_insurance')
    ),count(*) filter (
      WHERE source.record->>'certificateType'='annual_inspection'
    ) INTO expected_insurance,expected_inspection
    FROM app_private.vms_certificate_center_source('vehicle',NULL) source
    WHERE source.record->>'isCurrent'='true'
      AND source.record->>'status' IN ('expired','due_today','due_15','due_30');
    SELECT count(*) INTO expected_vehicles FROM public.mdm_vehicle v
    WHERE app_private.tenant_in_current_read_scope(v.tenant_id);
    IF insurance_count IS DISTINCT FROM expected_insurance
      OR inspection_count IS DISTINCT FROM expected_inspection
      OR (result->>'vehicle_count')::integer IS DISTINCT FROM expected_vehicles
    THEN RAISE EXCEPTION 'Dashboard counts differ from unified source in %',context_name; END IF;
    IF context_name='platform_all' AND expected_vehicles<=(
      SELECT count(*) FROM public.mdm_vehicle WHERE tenant_id=own_tenant
    ) THEN RAISE EXCEPTION 'Platform-all dashboard failed to include other tenant'; END IF;
    IF context_name='ordinary_forged' AND expected_vehicles<>(
      SELECT count(*) FROM public.mdm_vehicle WHERE tenant_id=own_tenant
    ) THEN RAISE EXCEPTION 'Forged ordinary tenant header changed dashboard count'; END IF;
  END LOOP;

  PERFORM set_config('request.jwt.claim.sub',platform_uid::text,true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub',platform_uid,'role','authenticated')::text,true);
  PERFORM set_config('request.headers','{}',true);
  SELECT id INTO legacy_insurance_id FROM public.vehicle_insurance
  WHERE tenant_id=own_tenant
    AND vehicle_id='a9fc0004-1023-4620-9220-000000000002'::uuid LIMIT 1;
  IF legacy_insurance_id IS NULL THEN RAISE EXCEPTION 'Legacy fallback fixture unavailable'; END IF;
  SELECT (r->>'count')::integer INTO baseline_insurance
  FROM jsonb_array_elements(public.get_dashboard_console()->'reminders') r
  WHERE r->>'key'='insurance';
  UPDATE public.vehicle_insurance
  SET commercial_expire_date=(now() at time zone 'Asia/Shanghai')::date+12
  WHERE id=legacy_insurance_id;
  SELECT (r->>'count')::integer INTO insurance_count
  FROM jsonb_array_elements(public.get_dashboard_console()->'reminders') r
  WHERE r->>'key'='insurance';
  IF insurance_count<>baseline_insurance+1
    OR NOT EXISTS(
      SELECT 1 FROM jsonb_array_elements(
        public.vms_list_certificates_secure(p_from:=0,p_to:=99,p_status:='due_15')->'records'
      ) r WHERE r->>'sourceKind'='legacy_insurance'
        AND r->>'subjectId'='a9fc0004-1023-4620-9220-000000000002'
        AND r->>'certificateType'='commercial_insurance'
    )
  THEN RAISE EXCEPTION 'Legacy due risk did not update both dashboard and certificate center'; END IF;
END;
$test$;

ROLLBACK;
