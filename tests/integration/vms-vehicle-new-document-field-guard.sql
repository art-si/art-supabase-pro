BEGIN;

DO $test$
DECLARE
  platform_uid uuid := '0a872664-874c-447d-a256-d0dbdca6ed45';
  owner_uid uuid := 'ab881b32-87d4-4dce-9014-ce488b8069df';
  colleague_uid uuid := '2e294b61-24a9-4eaf-8fac-1daffc1e6131';
  own_tenant uuid := '7529f951-938e-4e2c-ac0d-316c136ae1f9';
  other_tenant uuid := '2824c2b5-2774-4781-b995-f55e8bcee920';
  vehicle_id uuid := 'a9fc0004-1023-4620-9220-000000000001';
  cross_vehicle_id uuid := '283514f3-6fac-48f0-afbe-8e893ddf2f67';
  document_field_id uuid := '289f5673-0c80-4d36-bd23-ced86e18eb89';
  document_resource_id uuid := '28ab7b17-7dc4-431d-afe5-54431b8ceb79';
  colleague_id uuid := 'bc991839-348a-4f66-a2bc-a21ccb0765f4';
  original_photo text;
  field_name text;
  context_name text;
  active_uid uuid;
  selected_tenant uuid;
  expected_tenant uuid;
  result jsonb;
BEGIN
  SELECT person_vehicle_photo_url INTO original_photo
  FROM public.mdm_vehicle WHERE id = vehicle_id;

  -- The colleague can edit ordinary archive fields but has read-only document access.
  INSERT INTO public.sys_user_field_permission (
    id, tenant_id, user_id, resource_id, field_id, access_level
  ) VALUES (
    gen_random_uuid(), own_tenant, colleague_id,
    document_resource_id, document_field_id, 'read'
  );
  PERFORM set_config('request.jwt.claim.sub', colleague_uid::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', colleague_uid, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', '{}', true);
  IF app_private.resolve_field_access('vms.vehicle_archive', 'documents',
       (SELECT created_by_user_id FROM public.mdm_vehicle WHERE id = vehicle_id)) <> 'read'
    OR NOT app_private.can_execute_business_action(
       'VehicleArchiveManage', 'VehicleArchive:Edit',
       (SELECT created_by_user_id FROM public.mdm_vehicle WHERE id = vehicle_id), true)
  THEN RAISE EXCEPTION 'Document read-only test user is not otherwise able to edit'; END IF;

  FOREACH field_name IN ARRAY ARRAY[
    'driving_license_back_reverse_url',
    'person_vehicle_photo_url',
    'vehicle_head_photo_url'
  ] LOOP
    BEGIN
      PERFORM public.vms_update_vehicle_archive_secure(vehicle_id,
        jsonb_build_object(field_name, 'forbidden-private-document.png'));
      RAISE EXCEPTION 'Read-only document field was writable: %', field_name;
    EXCEPTION WHEN SQLSTATE '42501' THEN
      IF SQLERRM <> 'No edit permission for vehicle documents' THEN
        RAISE EXCEPTION 'Wrong rejection for document field %: %', field_name, SQLERRM;
      END IF;
    END;
  END LOOP;
  IF (SELECT person_vehicle_photo_url FROM public.mdm_vehicle WHERE id = vehicle_id)
       IS DISTINCT FROM original_photo
  THEN RAISE EXCEPTION 'Rejected document mutation changed the vehicle'; END IF;

  FOREACH context_name IN ARRAY ARRAY[
    'platform_all', 'platform_selected', 'ordinary_own', 'ordinary_forged'
  ] LOOP
    active_uid := CASE WHEN context_name LIKE 'platform%' THEN platform_uid ELSE owner_uid END;
    selected_tenant := CASE
      WHEN context_name = 'platform_selected' THEN own_tenant
      WHEN context_name = 'ordinary_forged' THEN other_tenant
      ELSE NULL END;
    expected_tenant := CASE WHEN context_name = 'platform_all' THEN NULL ELSE own_tenant END;
    PERFORM set_config('request.jwt.claim.sub', active_uid::text, true);
    PERFORM set_config('request.jwt.claims',
      jsonb_build_object('sub', active_uid, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.headers',
      CASE WHEN selected_tenant IS NULL THEN '{}'
        ELSE jsonb_build_object('x-art-tenant-scope', selected_tenant)::text END, true);

    result := public.vms_update_vehicle_archive_secure(vehicle_id,
      jsonb_build_object('purchase_date', '2023-10-27', 'usage_nature', 'freight'));
    IF result->>'purchase_date' <> '2023-10-27'
      OR result->>'usage_nature' <> 'freight'
    THEN RAISE EXCEPTION 'Vehicle completion fields were not saved: %', context_name; END IF;

    IF expected_tenant IS NOT NULL THEN
      BEGIN
        PERFORM public.vms_update_vehicle_archive_secure(cross_vehicle_id,
          jsonb_build_object('remark', 'cross-tenant mutation'));
        RAISE EXCEPTION 'Cross-tenant vehicle was writable: %', context_name;
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE 'Cross-tenant vehicle was writable:%' THEN RAISE; END IF;
      END;
    END IF;
  END LOOP;
END;
$test$;

ROLLBACK;
