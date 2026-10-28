BEGIN;

DO $test$
DECLARE
  platform_uid uuid := '0a872664-874c-447d-a256-d0dbdca6ed45';
  ordinary_add_uid uuid := 'ab881b32-87d4-4dce-9014-ce488b8069df';
  ordinary_no_add_uid uuid := '9850d41a-77e9-40a7-b2cb-0ad02ac01440';
  platform_tenant uuid := '028e6a68-a9db-4055-974c-1e05bfe94b0f';
  own_tenant uuid := '7529f951-938e-4e2c-ac0d-316c136ae1f9';
  foreign_tenant uuid := '2824c2b5-2774-4781-b995-f55e8bcee920';
  created_id uuid;
  blocked boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', platform_uid::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', platform_uid, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', '{}', true);
  created_id := public.vms_create_vehicle_archive_secure(jsonb_build_object(
    'plate_no', '测A归属回滚平台', 'vehicle_type', '厢式货车',
    'vehicle_ownership', 'self_operated'
  ));
  IF (SELECT tenant_id FROM public.mdm_vehicle WHERE id = created_id)
     IS DISTINCT FROM platform_tenant THEN
    RAISE EXCEPTION 'Platform-all default create did not use authenticated tenant';
  END IF;

  PERFORM set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope', own_tenant)::text, true);
  created_id := public.vms_create_vehicle_archive_secure(jsonb_build_object(
    'plate_no', '测A归属回滚选中', 'vehicle_type', '厢式货车',
    'vehicle_ownership', 'self_operated'
  ));
  IF (SELECT tenant_id FROM public.mdm_vehicle WHERE id = created_id)
     IS DISTINCT FROM own_tenant THEN
    RAISE EXCEPTION 'Platform-selected create ignored selected tenant';
  END IF;

  PERFORM set_config('request.headers', '{}', true);
  created_id := public.vms_create_vehicle_archive_secure(jsonb_build_object(
    'tenant_id', foreign_tenant, 'plate_no', '测A归属回滚显式',
    'vehicle_type', '厢式货车', 'vehicle_ownership', 'self_operated'
  ));
  IF (SELECT tenant_id FROM public.mdm_vehicle WHERE id = created_id)
     IS DISTINCT FROM foreign_tenant THEN
    RAISE EXCEPTION 'Platform-all explicit target was not honored';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', ordinary_add_uid::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', ordinary_add_uid, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', '{}', true);
  created_id := public.vms_create_vehicle_archive_secure(jsonb_build_object(
    'plate_no', '测A归属回滚普通', 'vehicle_type', '厢式货车',
    'vehicle_ownership', 'self_operated'
  ));
  IF (SELECT tenant_id FROM public.mdm_vehicle WHERE id = created_id)
     IS DISTINCT FROM own_tenant THEN
    RAISE EXCEPTION 'Ordinary create did not use own tenant';
  END IF;

  PERFORM set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope', foreign_tenant)::text, true);
  created_id := public.vms_create_vehicle_archive_secure(jsonb_build_object(
    'plate_no', '测A归属回滚伪造头', 'vehicle_type', '厢式货车',
    'vehicle_ownership', 'self_operated'
  ));
  IF (SELECT tenant_id FROM public.mdm_vehicle WHERE id = created_id)
     IS DISTINCT FROM own_tenant THEN
    RAISE EXCEPTION 'Ordinary forged header changed create tenant';
  END IF;

  blocked := false;
  BEGIN
    PERFORM public.vms_create_vehicle_archive_secure(jsonb_build_object(
      'tenant_id', foreign_tenant, 'plate_no', '测A归属回滚越权',
      'vehicle_type', '厢式货车', 'vehicle_ownership', 'self_operated'
    ));
  EXCEPTION WHEN SQLSTATE '42501' THEN
    blocked := true;
  END;
  IF NOT blocked THEN
    RAISE EXCEPTION 'Ordinary explicit cross-tenant create was accepted';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', ordinary_no_add_uid::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', ordinary_no_add_uid, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', '{}', true);
  blocked := false;
  BEGIN
    PERFORM public.vms_create_vehicle_archive_secure(jsonb_build_object(
      'plate_no', '测A归属回滚无权限', 'vehicle_type', '厢式货车',
      'vehicle_ownership', 'self_operated'
    ));
  EXCEPTION WHEN SQLSTATE '42501' THEN
    blocked := true;
  END;
  IF NOT blocked THEN
    RAISE EXCEPTION 'Create without VehicleArchive:Add permission was accepted';
  END IF;
END;
$test$;

SELECT 'vms vehicle archive tenant default passed' AS result;
ROLLBACK;
