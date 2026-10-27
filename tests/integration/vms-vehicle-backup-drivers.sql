BEGIN;

DO $test$
DECLARE
  platform_uid uuid := '0a872664-874c-447d-a256-d0dbdca6ed45';
  ordinary_uid uuid := 'ab881b32-87d4-4dce-9014-ce488b8069df';
  own_tenant uuid := '7529f951-938e-4e2c-ac0d-316c136ae1f9';
  other_tenant uuid := '2824c2b5-2774-4781-b995-f55e8bcee920';
  qa_vehicle_id uuid := 'ccbfc1d7-b063-4d14-a7c5-11883547dd9d';
  original_backup uuid := '4ca24d4e-faa6-4262-8635-3498106a1c76';
  added_backup uuid := '22ba3705-7da6-46b6-9fc4-79f632ed8a11';
  qa_backup_a uuid := 'fe8298b1-215b-43be-b330-74018e162d48';
  qa_backup_b uuid := '55776adc-23e2-4a53-8a11-23ff43465ca2';
  qa_created_vehicle uuid;
  qa_profile uuid;
  context_name text;
  scoped_uid uuid;
  selected_tenant uuid;
  result jsonb;
  unrelated_driver uuid;
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM public.vehicle_backup_driver b
    WHERE b.vehicle_id=qa_vehicle_id AND b.driver_id=original_backup AND b.sort_order=1
  ) THEN RAISE EXCEPTION 'Existing secondary driver was not backfilled'; END IF;
  IF has_function_privilege('anon',
    'public.vms_list_driver_assigned_vehicles_secure(uuid,uuid)','EXECUTE')
    OR has_function_privilege('authenticated',
      'app_private.vms_replace_vehicle_backup_drivers(uuid,uuid[])','EXECUTE')
  THEN RAISE EXCEPTION 'Backup-driver internal boundary exposed'; END IF;
  SELECT id INTO unrelated_driver FROM public.mdm_driver
  WHERE tenant_id=other_tenant LIMIT 1;
  IF unrelated_driver IS NULL THEN RAISE EXCEPTION 'Cross-tenant driver fixture unavailable'; END IF;

  PERFORM set_config('request.jwt.claim.sub',platform_uid::text,true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub',platform_uid,'role','authenticated')::text,true);
  PERFORM set_config('request.headers','{}',true);
  result:=public.vms_update_vehicle_archive_secure(qa_vehicle_id,jsonb_build_object(
    'backup_driver_ids',jsonb_build_array(original_backup,added_backup)
  ));
  IF result->'backup_driver_ids'<>jsonb_build_array(original_backup,added_backup)
    OR (SELECT secondary_driver_id FROM public.mdm_vehicle WHERE id=qa_vehicle_id)<>original_backup
    OR (SELECT count(*) FROM public.vehicle_backup_driver WHERE vehicle_id=qa_vehicle_id)<>2
  THEN RAISE EXCEPTION 'Ordered backup-driver save lost old assignment or first-driver compatibility'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(
      public.vms_list_driver_assigned_vehicles_secure(added_backup,null)
    ) v WHERE v->>'id'=qa_vehicle_id::text
  ) THEN RAISE EXCEPTION 'New backup driver missing assigned vehicle'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.get_record_delete_dependency_details(
      'mdm_driver',array[added_backup::text],null
    ) d WHERE d.source_table='vehicle_backup_driver'
      AND d.record_no='冀D28951D'
  ) THEN RAISE EXCEPTION 'Driver delete guard lacks recognizable linked vehicle'; END IF;
  BEGIN
    PERFORM public.vms_update_vehicle_archive_secure(qa_vehicle_id,jsonb_build_object(
      'backup_driver_ids',jsonb_build_array(original_backup,original_backup)
    ));
    RAISE EXCEPTION 'Duplicate backup driver accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  BEGIN
    PERFORM public.vms_update_vehicle_archive_secure(qa_vehicle_id,jsonb_build_object(
      'backup_driver_ids',jsonb_build_array(original_backup,unrelated_driver)
    ));
    RAISE EXCEPTION 'Cross-tenant backup driver accepted';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  IF (SELECT count(*) FROM public.vehicle_backup_driver WHERE vehicle_id=qa_vehicle_id)<>2
  THEN RAISE EXCEPTION 'Rejected assignment changed saved links'; END IF;

  SELECT id INTO qa_profile FROM public.vehicle_type_profile
  WHERE tenant_id=other_tenant AND category='厢式货车' AND length_m=9.6 LIMIT 1;
  IF qa_profile IS NULL THEN RAISE EXCEPTION 'QA vehicle profile unavailable'; END IF;
  qa_created_vehicle:=public.vms_create_vehicle_archive_secure(jsonb_build_object(
    'tenant_id',other_tenant,
    'plate_no','测A·轮班回滚',
    'plate_color','yellow',
    'vehicle_type','厢式货车',
    'vehicle_ownership','self_operated',
    'vehicle_type_profile_id',qa_profile,
    'carrier_id','54eaf0e7-4ecf-4fdd-a6d5-2e8583e37c87',
    'primary_driver_id','2fcd4c03-5dbc-4c6d-8d7b-94963635b1b7',
    'backup_driver_ids',jsonb_build_array(qa_backup_a,qa_backup_b)
  ));
  IF qa_created_vehicle IS NULL
    OR (SELECT count(*) FROM public.vehicle_backup_driver
        WHERE vehicle_id=qa_created_vehicle)<>2
    OR (SELECT secondary_driver_id FROM public.mdm_vehicle
        WHERE id=qa_created_vehicle)<>qa_backup_a
  THEN RAISE EXCEPTION 'New vehicle did not persist ordered backup drivers atomically'; END IF;

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
    PERFORM set_config('request.headers',
      CASE WHEN selected_tenant IS NULL THEN '{}'
      ELSE jsonb_build_object('x-art-tenant-scope',selected_tenant)::text END,true);
    result:=public.vms_list_vehicle_archives_secure(p_record_id:=qa_vehicle_id);
    IF jsonb_array_length(result->'records')<>1
      OR result->'records'->0->'backup_driver_ids'
        <>jsonb_build_array(original_backup,added_backup)
    THEN RAISE EXCEPTION 'Backup-driver list lost tenant or ordering in %',context_name; END IF;
    IF NOT EXISTS(
      SELECT 1 FROM jsonb_array_elements(
        public.vms_list_driver_assigned_vehicles_secure(added_backup,null)
      ) v WHERE v->>'id'=qa_vehicle_id::text
    ) THEN RAISE EXCEPTION 'Driver assignment hidden in %',context_name; END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claim.sub',platform_uid::text,true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub',platform_uid,'role','authenticated')::text,true);
  PERFORM set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
  BEGIN
    PERFORM public.vms_list_driver_assigned_vehicles_secure(added_backup,null);
    RAISE EXCEPTION 'Platform-selected other tenant read linked driver';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END;
$test$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','0a872664-874c-447d-a256-d0dbdca6ed45',true);
SELECT set_config('request.jwt.claims',
  '{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
SELECT set_config('request.headers',
  '{"x-art-tenant-scope":"2824c2b5-2774-4781-b995-f55e8bcee920"}',true);
DO $rls$
BEGIN
  IF EXISTS(
    SELECT 1 FROM public.vehicle_backup_driver
    WHERE tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9'::uuid
  ) THEN RAISE EXCEPTION 'Platform-selected direct link read leaked other tenant'; END IF;
END;
$rls$;
SELECT set_config('request.jwt.claim.sub','ab881b32-87d4-4dce-9014-ce488b8069df',true);
SELECT set_config('request.jwt.claims',
  '{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
DO $rls$
BEGIN
  IF EXISTS(
    SELECT 1 FROM public.vehicle_backup_driver
    WHERE tenant_id='2824c2b5-2774-4781-b995-f55e8bcee920'::uuid
  ) THEN RAISE EXCEPTION 'Forged ordinary direct link read leaked other tenant'; END IF;
END;
$rls$;

ROLLBACK;
