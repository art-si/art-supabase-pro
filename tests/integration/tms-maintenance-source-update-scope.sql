-- All writes are rolled back; exercise the deployed RPC with authenticated claims.
BEGIN;
DO $test$
DECLARE
  source uuid := 'd3e16c67-f606-45fe-b96b-bdf0e37bc439';
  owner_tenant uuid;
  foreign_tenant uuid := '6675a0d6-3ff6-4ab7-bb09-232d85ae96ad';
  super_actor uuid;
  marker text;
BEGIN
  SELECT tenant_id INTO STRICT owner_tenant
  FROM public.vehicle_maintenance_record WHERE id = source;
  SELECT auth_user_id INTO STRICT super_actor FROM public.sys_user
  WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1;

  PERFORM set_config('request.jwt.claims',
    '{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
  FOREACH marker IN ARRAY ARRAY['ordinary-own','ordinary-forged-header'] LOOP
    PERFORM set_config('request.headers', CASE WHEN marker='ordinary-own' THEN '{}'
      ELSE jsonb_build_object('x-art-tenant-scope',foreign_tenant)::text END,true);
    PERFORM public.vms_update_vehicle_maintenance_secure(source,jsonb_build_object('remark',marker));
    IF NOT EXISTS(SELECT 1 FROM public.vehicle_maintenance_record
      WHERE id=source AND tenant_id=owner_tenant AND remark=marker) THEN
      RAISE EXCEPTION 'Own-tenant update failed: %',marker;
    END IF;
  END LOOP;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',super_actor,'role','authenticated')::text,true);
  FOREACH marker IN ARRAY ARRAY['platform-all','platform-selected'] LOOP
    PERFORM set_config('request.headers', CASE WHEN marker='platform-all' THEN '{}'
      ELSE jsonb_build_object('x-art-tenant-scope',owner_tenant)::text END,true);
    PERFORM public.vms_update_vehicle_maintenance_secure(source,jsonb_build_object('remark',marker));
    IF NOT EXISTS(SELECT 1 FROM public.vehicle_maintenance_record
      WHERE id=source AND tenant_id=owner_tenant AND remark=marker) THEN
      RAISE EXCEPTION 'Platform scoped update failed: %',marker;
    END IF;
  END LOOP;

  PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',foreign_tenant)::text,true);
  BEGIN
    PERFORM public.vms_update_vehicle_maintenance_secure(source,'{"remark":"must reject"}'::jsonb);
    RAISE EXCEPTION 'Selected foreign tenant update accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Vehicle maintenance record not found' THEN RAISE; END IF;
  END;

  PERFORM set_config('request.headers','{}',true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"9850d41a-77e9-40a7-b2cb-0ad02ac01440","role":"authenticated"}',true);
  BEGIN
    PERFORM public.vms_update_vehicle_maintenance_secure(source,'{"remark":"must reject"}'::jsonb);
    RAISE EXCEPTION 'No-permission update accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $test$;
ROLLBACK;
