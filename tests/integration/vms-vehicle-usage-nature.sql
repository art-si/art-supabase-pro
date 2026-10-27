BEGIN;

DO $test$
DECLARE
  platform_uid uuid := '0a872664-874c-447d-a256-d0dbdca6ed45';
  ordinary_uid uuid := 'ab881b32-87d4-4dce-9014-ce488b8069df';
  own_tenant uuid := '7529f951-938e-4e2c-ac0d-316c136ae1f9';
  qa_tenant uuid := '2824c2b5-2774-4781-b995-f55e8bcee920';
  qa_vehicle uuid := '283514f3-6fac-48f0-afbe-8e893ddf2f67';
  profile_id uuid;
  created_vehicle uuid;
  old_business_type text;
  context_name text;
  scoped_uid uuid;
  selected_tenant uuid;
  result jsonb;
BEGIN
  IF NOT app_private.is_enabled_dictionary_value('vehicleUsageNature','freight')
    OR NOT EXISTS(
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='vehicle_archive'
        AND column_name='usage_nature'
    )
  THEN RAISE EXCEPTION 'Usage nature dictionary or view not ready'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.mdm_vehicle
    WHERE transport_industry='city-bus' AND usage_nature IS NULL
  ) THEN RAISE EXCEPTION 'Historical bus was silently misclassified as freight'; END IF;
  SELECT id INTO profile_id FROM public.vehicle_type_profile
  WHERE tenant_id=qa_tenant AND category='厢式货车' AND length_m=9.6 LIMIT 1;
  SELECT business_type INTO old_business_type FROM public.mdm_vehicle WHERE id=qa_vehicle;
  IF profile_id IS NULL THEN RAISE EXCEPTION 'QA vehicle type profile unavailable'; END IF;

  PERFORM set_config('request.jwt.claim.sub',platform_uid::text,true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub',platform_uid,'role','authenticated')::text,true);
  PERFORM set_config('request.headers','{}',true);
  created_vehicle:=public.vms_create_vehicle_archive_secure(jsonb_build_object(
    'tenant_id',qa_tenant,'plate_no','测A·性质回滚','plate_color','yellow',
    'vehicle_type','厢式货车','vehicle_type_profile_id',profile_id,
    'vehicle_ownership','self_operated'
  ));
  IF (SELECT usage_nature FROM public.mdm_vehicle WHERE id=created_vehicle)<>'freight'
    OR (SELECT usage_nature FROM public.vehicle_archive WHERE id=created_vehicle)<>'freight'
  THEN RAISE EXCEPTION 'New vehicle did not default to freight in table and view'; END IF;
  BEGIN
    PERFORM public.vms_update_vehicle_archive_secure(
      created_vehicle,'{"usage_nature":"invalid-usage"}'::jsonb);
    RAISE EXCEPTION 'Invalid usage nature accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  PERFORM public.vms_update_vehicle_archive_secure(
    qa_vehicle,'{"usage_nature":"freight"}'::jsonb);
  IF (SELECT usage_nature FROM public.mdm_vehicle WHERE id=qa_vehicle)<>'freight'
    OR (SELECT business_type FROM public.mdm_vehicle WHERE id=qa_vehicle)
      IS DISTINCT FROM old_business_type
  THEN RAISE EXCEPTION 'Usage nature update changed old business type'; END IF;

  FOREACH context_name IN ARRAY ARRAY[
    'platform_all','platform_selected','ordinary_own','ordinary_forged'
  ] LOOP
    scoped_uid:=CASE WHEN context_name LIKE 'platform%' THEN platform_uid ELSE ordinary_uid END;
    selected_tenant:=CASE
      WHEN context_name='platform_selected' THEN qa_tenant
      WHEN context_name='ordinary_forged' THEN qa_tenant
      ELSE NULL END;
    PERFORM set_config('request.jwt.claim.sub',scoped_uid::text,true);
    PERFORM set_config('request.jwt.claims',
      jsonb_build_object('sub',scoped_uid,'role','authenticated')::text,true);
    PERFORM set_config('request.headers',CASE WHEN selected_tenant IS NULL THEN '{}'
      ELSE jsonb_build_object('x-art-tenant-scope',selected_tenant)::text END,true);
    result:=public.vms_list_vehicle_archives_secure(p_from:=0,p_to:=99);
    IF context_name LIKE 'platform%' THEN
      IF NOT EXISTS(
        SELECT 1 FROM jsonb_array_elements(result->'records') r
        WHERE r->>'id'=qa_vehicle::text AND r->>'usage_nature'='freight'
      ) THEN RAISE EXCEPTION 'Usage nature missing for %',context_name; END IF;
    ELSIF EXISTS(
      SELECT 1 FROM jsonb_array_elements(result->'records') r
      WHERE r->>'id'=qa_vehicle::text
    ) THEN RAISE EXCEPTION 'Ordinary user read another tenant: %',context_name; END IF;
    IF context_name='ordinary_forged' AND EXISTS(
      SELECT 1 FROM jsonb_array_elements(result->'records') r
      JOIN public.mdm_vehicle v ON v.id=(r->>'id')::uuid
      WHERE v.tenant_id<>own_tenant
    ) THEN RAISE EXCEPTION 'Forged header changed vehicle list scope'; END IF;
  END LOOP;
END;
$test$;

ROLLBACK;
