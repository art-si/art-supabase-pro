BEGIN;
DO $scope$
DECLARE actor uuid; source text:='d3e16c67-f606-45fe-b96b-bdf0e37bc439'; j jsonb; forged jsonb;
BEGIN
perform set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
perform set_config('request.headers','{}',true);
select coalesce(jsonb_agg(d),'[]') into j from public.vms_get_maintenance_delete_dependencies_secure(ARRAY[source],null)d;
perform set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
select coalesce(jsonb_agg(d),'[]') into forged from public.vms_get_maintenance_delete_dependencies_secure(ARRAY[source],null)d;
IF forged IS DISTINCT FROM j THEN RAISE EXCEPTION 'Forged scope changes dependencies'; END IF;
SELECT auth_user_id INTO actor FROM public.sys_user WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1;
perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
BEGIN
PERFORM * FROM public.vms_get_maintenance_delete_dependencies_secure(ARRAY[source],null);
RAISE EXCEPTION 'Selected foreign tenant source disclosed';
EXCEPTION WHEN insufficient_privilege THEN NULL; END;
BEGIN
PERFORM public.vms_delete_vehicle_maintenance_secure(ARRAY[source::uuid]);
RAISE EXCEPTION 'Selected foreign tenant deleted';
EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'One or more vehicle maintenance%' THEN RAISE; END IF; END;
perform set_config('request.headers','{}',true);
PERFORM * FROM public.vms_get_maintenance_delete_dependencies_secure(ARRAY[source],null);
perform set_config('request.headers','{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}',true);
PERFORM * FROM public.vms_get_maintenance_delete_dependencies_secure(ARRAY[source],null);
perform set_config('request.jwt.claims','{"sub":"9850d41a-77e9-40a7-b2cb-0ad02ac01440","role":"authenticated"}',true);
BEGIN
PERFORM * FROM public.vms_get_maintenance_delete_dependencies_secure(ARRAY[source],null);
RAISE EXCEPTION 'No-permission dependency access accepted';
EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $scope$;
ROLLBACK;

