BEGIN;

DO $test$
DECLARE
  ordinary_uid uuid := 'ab881b32-87d4-4dce-9014-ce488b8069df';
  platform_uid uuid;
  other_uid uuid;
  own_tenant uuid;
  other_tenant uuid;
  certificate_id uuid;
  own_path text;
  unowned_path text;
  other_path text;
  name_suffix text := '2a07424f-7ae4-44bd-a8f5-46bb1cc3d72f.pdf';
BEGIN
  SELECT auth_user_id INTO platform_uid FROM public.sys_user
  WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1;
  SELECT tenant_id INTO own_tenant FROM public.sys_user WHERE auth_user_id=ordinary_uid;
  SELECT auth_user_id INTO other_uid FROM public.sys_user
  WHERE tenant_id=own_tenant AND auth_user_id<>ordinary_uid AND auth_user_id IS NOT NULL LIMIT 1;
  SELECT id INTO other_tenant FROM public.sys_tenant
  WHERE id<>own_tenant AND status='1' LIMIT 1;
  SELECT id INTO certificate_id FROM public.vehicle_certificate
  WHERE tenant_id=own_tenant AND jsonb_array_length(attachments)=0 LIMIT 1;
  IF platform_uid IS NULL OR other_uid IS NULL OR other_tenant IS NULL OR certificate_id IS NULL THEN
    RAISE EXCEPTION 'VMS certificate private attachment fixtures unavailable';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='vms-certificate-private' AND public=false)
    OR (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
      AND policyname IN ('vms_certificate_private_insert','vms_certificate_private_select'))<>2
  THEN RAISE EXCEPTION 'VMS private bucket or policies missing'; END IF;

  own_path := own_tenant::text || '/' || ordinary_uid::text || '/' || name_suffix;
  unowned_path := own_tenant::text || '/' || other_uid::text || '/' || name_suffix;
  other_path := other_tenant::text || '/' || ordinary_uid::text || '/' || name_suffix;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ordinary_uid,'role','authenticated')::text,true);
  PERFORM set_config('request.headers','{}',true);
  IF NOT app_private.vms_certificate_private_upload_allowed(own_path)
    OR NOT app_private.vms_certificate_private_read_allowed(own_path)
    OR app_private.vms_certificate_private_upload_allowed(other_path)
    OR app_private.vms_certificate_private_read_allowed(other_path)
    OR app_private.vms_certificate_private_upload_allowed(unowned_path)
    OR app_private.vms_certificate_private_path_valid('../public.pdf')
  THEN RAISE EXCEPTION 'Ordinary private object scope invalid'; END IF;
  PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
  IF app_private.vms_certificate_private_upload_allowed(other_path)
    OR NOT app_private.vms_certificate_private_upload_allowed(own_path)
  THEN RAISE EXCEPTION 'Forged ordinary header changed private scope'; END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',platform_uid,'role','authenticated')::text,true);
  PERFORM set_config('request.headers','{}',true);
  IF NOT app_private.vms_certificate_private_upload_allowed(
    other_tenant::text || '/' || platform_uid::text || '/' || name_suffix
  ) THEN RAISE EXCEPTION 'Platform all-tenant upload denied'; END IF;
  PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',own_tenant)::text,true);
  IF app_private.vms_certificate_private_upload_allowed(
    other_tenant::text || '/' || platform_uid::text || '/' || name_suffix
  ) THEN RAISE EXCEPTION 'Platform selected scope leaked'; END IF;

  INSERT INTO storage.objects(bucket_id,name,owner_id)
  VALUES ('vms-certificate-private',own_path,ordinary_uid::text),
         ('vms-certificate-private',unowned_path,other_uid::text),
         ('vms-certificate-private',other_path,ordinary_uid::text);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ordinary_uid,'role','authenticated')::text,true);
  PERFORM set_config('request.headers','{}',true);
  UPDATE public.vehicle_certificate
    SET attachments=jsonb_build_array(jsonb_build_object('name','测试私有附件','url',own_path))
    WHERE id=certificate_id;
  IF NOT app_private.vms_certificate_private_read_allowed(own_path) THEN
    RAISE EXCEPTION 'Referenced private attachment unavailable to authorized viewer';
  END IF;
  BEGIN
    UPDATE public.vehicle_certificate
      SET attachments=jsonb_build_array(jsonb_build_object('name','他人附件','url',unowned_path))
      WHERE id=certificate_id;
    RAISE EXCEPTION 'Unowned private attachment accepted';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  BEGIN
    UPDATE public.vehicle_certificate
      SET attachments=jsonb_build_array(jsonb_build_object('name','公开附件','url','https://example.test/public.pdf'))
      WHERE id=certificate_id;
    RAISE EXCEPTION 'Public URL accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  BEGIN
    UPDATE public.vehicle_certificate
      SET attachments=jsonb_build_array(jsonb_build_object('name','跨租户附件','url',other_path))
      WHERE id=certificate_id;
    RAISE EXCEPTION 'Cross-tenant private attachment accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  IF (SELECT attachments->0->>'url' FROM public.vehicle_certificate WHERE id=certificate_id)<>own_path THEN
    RAISE EXCEPTION 'Rejected attachment changed certificate';
  END IF;
END;
$test$;

ROLLBACK;
