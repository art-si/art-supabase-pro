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
  archive_result jsonb;
  archive_options jsonb;
  dispatch_options jsonb;
  dispatch_context jsonb;
  expected_tenant uuid;
  cross_rows integer;
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname IN (
        'tms_get_dispatch_recommendation_context_secure',
        'vms_list_dispatch_vehicle_options_secure',
        'vms_list_vehicle_archive_options_secure',
        'vms_list_vehicle_archives_secure',
        'vms_update_vehicle_archive_secure')
        AND pg_get_functiondef(p.oid) LIKE '%vms.mdm_vehicle%')<>0
  THEN RAISE EXCEPTION 'Obsolete VMS field-permission resource key remains'; END IF;

  FOREACH context_name IN ARRAY ARRAY[
    'platform_all','platform_selected','ordinary_own','ordinary_forged'
  ] LOOP
    scoped_uid := CASE WHEN context_name LIKE 'platform%' THEN platform_uid ELSE ordinary_uid END;
    selected_tenant := CASE
      WHEN context_name='platform_selected' THEN own_tenant
      WHEN context_name='ordinary_forged' THEN other_tenant
      ELSE NULL END;
    expected_tenant := CASE WHEN context_name='platform_all' THEN NULL ELSE own_tenant END;
    PERFORM set_config('request.jwt.claim.sub',scoped_uid::text,true);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',scoped_uid,'role','authenticated')::text,true);
    PERFORM set_config('request.headers',
      CASE WHEN selected_tenant IS NULL THEN '{}'
        ELSE jsonb_build_object('x-art-tenant-scope',selected_tenant)::text END,true);

    archive_result := public.vms_list_vehicle_archives_secure(p_from:=0,p_to:=99);
    archive_options := public.vms_list_vehicle_archive_options_secure(p_max_rows:=200);
    dispatch_options := public.vms_list_dispatch_vehicle_options_secure(p_from:=0,p_to:=99);
    dispatch_context := public.tms_get_dispatch_recommendation_context_secure(
      '116d4c15-1cde-4c5d-ab03-a5cef9bd800d','2025-01-01'::timestamptz);
    IF jsonb_array_length(archive_result->'records')=0
      OR jsonb_array_length(archive_options)=0
      OR jsonb_array_length(dispatch_options->'records')=0
      OR dispatch_context->'order'->>'id'<>'116d4c15-1cde-4c5d-ab03-a5cef9bd800d'
    THEN RAISE EXCEPTION 'VMS/dispatch read unexpectedly empty: %',context_name; END IF;

    SELECT count(*) INTO cross_rows
    FROM jsonb_array_elements(archive_result->'records') item
    JOIN public.mdm_vehicle vehicle ON vehicle.id=(item->>'id')::uuid
    WHERE expected_tenant IS NOT NULL AND vehicle.tenant_id<>expected_tenant;
    IF cross_rows>0 THEN RAISE EXCEPTION 'Archive list crossed tenant scope: %',context_name; END IF;
    SELECT count(*) INTO cross_rows
    FROM jsonb_array_elements(archive_options) item
    JOIN public.mdm_vehicle vehicle ON vehicle.id=(item->>'id')::uuid
    WHERE expected_tenant IS NOT NULL AND vehicle.tenant_id<>expected_tenant;
    IF cross_rows>0 THEN RAISE EXCEPTION 'Archive options crossed tenant scope: %',context_name; END IF;
    SELECT count(*) INTO cross_rows
    FROM jsonb_array_elements(dispatch_options->'records') item
    JOIN public.mdm_vehicle vehicle ON vehicle.id=(item->>'id')::uuid
    WHERE expected_tenant IS NOT NULL AND vehicle.tenant_id<>expected_tenant;
    IF cross_rows>0 THEN RAISE EXCEPTION 'Dispatch options crossed tenant scope: %',context_name; END IF;
    SELECT count(*) INTO cross_rows
    FROM jsonb_array_elements(dispatch_context->'vehicles') item
    JOIN public.mdm_vehicle vehicle ON vehicle.id=(item->>'id')::uuid
    WHERE vehicle.tenant_id<>own_tenant;
    IF cross_rows>0 THEN RAISE EXCEPTION 'Dispatch recommendation crossed order tenant: %',context_name; END IF;
    IF context_name='platform_all' AND
      (SELECT count(DISTINCT vehicle.tenant_id)
       FROM jsonb_array_elements(archive_result->'records') item
       JOIN public.mdm_vehicle vehicle ON vehicle.id=(item->>'id')::uuid)<2
    THEN RAISE EXCEPTION 'Platform all-tenant archive did not include both demo tenants'; END IF;
    IF context_name='ordinary_own' AND
      app_private.resolve_field_access('vms.vehicle_archive','documents',
        (SELECT created_by_user_id FROM public.mdm_vehicle
         WHERE id='a9fc0004-1023-4620-9220-000000000001'))<>'edit'
    THEN RAISE EXCEPTION 'Ordinary vehicle document edit rule missing'; END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claim.sub','543f8dea-2e27-4fe0-b009-f80d86155be6',true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"543f8dea-2e27-4fe0-b009-f80d86155be6","role":"authenticated"}',true);
  PERFORM set_config('request.headers','{}',true);
  IF app_private.can_access_vms_vehicle_reference_data()
    OR app_private.resolve_field_access('vms.vehicle_archive','vehicleIdentifiers',
      (SELECT created_by_user_id FROM public.mdm_vehicle
       WHERE id='a9fc0004-1023-4620-9220-000000000001'))<>'hidden'
  THEN RAISE EXCEPTION 'Unassigned role gained vehicle reference or identifier access'; END IF;
END;
$test$;

ROLLBACK;
