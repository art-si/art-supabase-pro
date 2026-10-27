BEGIN;

DO $test$
DECLARE
  platform_user uuid;
  ordinary_user uuid := 'ab881b32-87d4-4dce-9014-ce488b8069df';
  own_tenant uuid;
  other_tenant uuid;
  own_driver uuid;
  own_path text;
  other_path text;
  object_id text := 'd7463104-86e6-4ce3-b25b-b356ed76cdb0.png';
BEGIN
  SELECT auth_user_id INTO platform_user FROM public.sys_user
  WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1;
  SELECT tenant_id INTO own_tenant FROM public.sys_user WHERE auth_user_id=ordinary_user;
  SELECT id INTO own_driver FROM public.mdm_driver WHERE tenant_id=own_tenant LIMIT 1;
  SELECT tenant_row.id INTO other_tenant FROM public.sys_tenant tenant_row
  WHERE tenant_row.id<>own_tenant AND tenant_row.status='1'
    AND (tenant_row.service_start_date IS NULL OR tenant_row.service_start_date<=current_date)
    AND (tenant_row.service_end_date IS NULL OR tenant_row.service_end_date>=current_date)
  LIMIT 1;
  IF platform_user IS NULL OR own_driver IS NULL OR other_tenant IS NULL THEN
    RAISE EXCEPTION 'Private driver document fixtures unavailable';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='tms-driver-private' AND public=false)
    OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='tms_driver_private_insert')
    OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='tms_driver_private_select')
  THEN RAISE EXCEPTION 'Driver private bucket or policies missing'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.sys_menu WHERE name='TmsDriver:UploadDocument'
      AND parent_id=(SELECT id FROM public.sys_menu WHERE name='TmsDriver')
  ) THEN RAISE EXCEPTION 'Driver upload button permission missing'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.mdm_driver d WHERE
      coalesce(d.id_card_front_url,'') LIKE '%/storage/v1/object/public/%' OR
      coalesce(d.id_card_back_url,'') LIKE '%/storage/v1/object/public/%' OR
      coalesce(d.driver_license_front_url,'') LIKE '%/storage/v1/object/public/%' OR
      coalesce(d.driver_license_back_url,'') LIKE '%/storage/v1/object/public/%' OR
      coalesce(d.id_card_front_url,'') LIKE '%/storage/v1/object/sign/%' OR
      coalesce(d.driver_license_front_url,'') LIKE '%/storage/v1/object/sign/%'
  ) THEN RAISE EXCEPTION 'Driver sensitive images still reference public or temporary URLs'; END IF;

  own_path := own_tenant::text || '/' || ordinary_user::text || '/' || object_id;
  other_path := other_tenant::text || '/' || ordinary_user::text || '/' || object_id;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ordinary_user,'role','authenticated')::text,true);
  PERFORM set_config('request.headers','{}',true);
  IF NOT app_private.tms_driver_private_upload_allowed(own_path)
    OR NOT app_private.tms_driver_private_read_allowed(own_path)
  THEN RAISE EXCEPTION 'Ordinary own draft upload/read denied'; END IF;
  IF app_private.tms_driver_private_upload_allowed(other_path)
    OR app_private.tms_driver_private_read_allowed(other_path)
  THEN RAISE EXCEPTION 'Ordinary cross-tenant private document allowed'; END IF;
  PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
  IF app_private.tms_driver_private_upload_allowed(other_path)
    OR NOT app_private.tms_driver_private_upload_allowed(own_path)
  THEN RAISE EXCEPTION 'Forged ordinary header changed upload scope'; END IF;
  IF app_private.tms_driver_private_path_valid('../private.png')
    OR app_private.tms_driver_private_path_valid(own_tenant::text || '/' || ordinary_user::text || '/' || object_id || '/extra')
  THEN RAISE EXCEPTION 'Malformed private document path accepted'; END IF;

  INSERT INTO storage.objects(bucket_id,name,owner,owner_id,metadata)
  VALUES ('tms-driver-private',own_path,ordinary_user,ordinary_user::text,
    '{"mimetype":"image/png","size":3}'::jsonb);
  UPDATE public.mdm_driver SET id_card_front_url=own_path WHERE id=own_driver;
  IF NOT app_private.tms_driver_private_read_allowed(own_path) THEN
    RAISE EXCEPTION 'Referenced own driver image not readable';
  END IF;
  IF app_private.tms_driver_private_read_allowed(other_path) THEN
    RAISE EXCEPTION 'Foreign driver image became readable';
  END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',platform_user,'role','authenticated')::text,true);
  PERFORM set_config('request.headers','{}',true);
  IF NOT app_private.tms_driver_private_upload_allowed(
    other_tenant::text || '/' || platform_user::text || '/' || object_id
  ) THEN RAISE EXCEPTION 'Platform all-tenant explicit upload denied'; END IF;
  PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',own_tenant)::text,true);
  IF app_private.tms_driver_private_upload_allowed(
    other_tenant::text || '/' || platform_user::text || '/' || object_id
  ) THEN RAISE EXCEPTION 'Platform selected-tenant upload crossed scope'; END IF;

  BEGIN
    UPDATE public.mdm_driver SET id_card_front_url='https://example.test/public-id.jpg'
    WHERE id=own_driver;
    RAISE EXCEPTION 'Public driver ID URL persisted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  IF EXISTS (
    SELECT 1 FROM public.mdm_driver
    WHERE id=own_driver AND id_card_front_url='https://example.test/public-id.jpg'
  ) THEN RAISE EXCEPTION 'Rejected public URL mutated driver row'; END IF;
END;
$test$;

ROLLBACK;
