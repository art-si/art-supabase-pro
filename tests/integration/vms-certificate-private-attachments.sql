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
  PERFORM set_config('request.jwt.claim.sub','2e294b61-24a9-4eaf-8fac-1daffc1e6131',true);
  PERFORM set_config('request.jwt.claims','{"sub":"2e294b61-24a9-4eaf-8fac-1daffc1e6131","role":"authenticated"}',true);
  IF NOT app_private.vms_certificate_private_read_allowed(own_path)
    OR app_private.vms_certificate_private_read_allowed(other_path)
  THEN RAISE EXCEPTION 'Authorized non-owner certificate view or cross-tenant denial failed'; END IF;
  PERFORM set_config('request.jwt.claim.sub',ordinary_uid::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ordinary_uid,'role','authenticated')::text,true);
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

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','ab881b32-87d4-4dce-9014-ce488b8069df',true);
SELECT set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
SELECT set_config('request.headers','{}',true);
INSERT INTO storage.objects(bucket_id,name,owner_id,owner,metadata)
VALUES (
  'vms-certificate-private',
  '7529f951-938e-4e2c-ac0d-316c136ae1f9/ab881b32-87d4-4dce-9014-ce488b8069df/5af0059a-d776-46e9-95a0-fba743e236fa.pdf',
  'ab881b32-87d4-4dce-9014-ce488b8069df',
  'ab881b32-87d4-4dce-9014-ce488b8069df',
  '{"mimetype":"application/pdf","size":100}'::jsonb
);
SELECT public.vms_save_certificate_secure(
  '1131289c-a753-4de5-9f16-6093ec397616',
  '{"subject_type":"vehicle","subject_id":"a9fc0004-1023-4620-9220-000000000001","certificate_type":"compulsory_insurance","certificate_no":"VMS演示-交强险-001","issue_date":"2025-12-30","valid_from":"2025-12-30","expires_on":"2026-11-07","responsible_user_id":"51080ef5-46a4-4d0c-a229-c97c6fccda93","attachments":[{"name":"测试证件.pdf","url":"7529f951-938e-4e2c-ac0d-316c136ae1f9/ab881b32-87d4-4dce-9014-ce488b8069df/5af0059a-d776-46e9-95a0-fba743e236fa.pdf"}]}'::jsonb
);
SELECT set_config('storage.operation','object.sign',true);
DO $signed$
BEGIN
  IF (SELECT count(*) FROM storage.objects
    WHERE bucket_id='vms-certificate-private'
      AND name='7529f951-938e-4e2c-ac0d-316c136ae1f9/ab881b32-87d4-4dce-9014-ce488b8069df/5af0059a-d776-46e9-95a0-fba743e236fa.pdf')<>1
  THEN RAISE EXCEPTION 'Authorized certificate attachment could not be signed'; END IF;
END;
$signed$;

ROLLBACK;
