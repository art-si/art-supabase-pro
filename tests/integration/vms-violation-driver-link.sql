-- Candidate or deployed driver-link contract. All assignments and grants roll back.
BEGIN;
INSERT INTO public.sys_menu(name,type,path,component,parent_id,app_code,sort,meta)
SELECT 'VehicleViolation:LinkDriver','button','','',id,'vms',2,
 jsonb_build_object('title','关联司机','is_enable',true,'is_auth_button',true)
FROM public.sys_menu WHERE name='VehicleViolation'
AND NOT EXISTS(SELECT 1 FROM public.sys_menu WHERE name='VehicleViolation:LinkDriver');
INSERT INTO public.sys_role_menu(role_id,menu_id,tenant_id)
SELECT r.id,m.id,r.tenant_id FROM public.sys_role r CROSS JOIN public.sys_menu m
WHERE r.role_code='yq_2026_001' AND r.tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9'
AND m.name='VehicleViolation:LinkDriver'
AND NOT EXISTS(SELECT 1 FROM public.sys_role_menu rm WHERE rm.role_id=r.id AND rm.menu_id=m.id);
SELECT set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
SELECT set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE row_id uuid; driver_id uuid; before_row jsonb; saved jsonb; i integer;
BEGIN
 FOR i IN 1..2 LOOP
  row_id:=('a9fc0009-1023-4620-9220-'||lpad(i::text,12,'0'))::uuid;
  driver_id:=('a9fc0003-1023-4620-9220-'||lpad(i::text,12,'0'))::uuid;
  before_row:=public.vms_list_vehicle_violations_secure(p_ids=>ARRAY[row_id])->'records'->0;
  IF before_row IS NULL THEN RAISE EXCEPTION 'Missing violation fixture'; END IF;
  saved:=public.vms_link_violation_driver_secure(row_id,driver_id,(before_row->>'update_time')::timestamptz);
  IF saved->>'driver_id' IS DISTINCT FROM driver_id::text
  OR saved->>'driver_name' IS DISTINCT FROM before_row->>'driver_name'
  THEN RAISE EXCEPTION 'Driver link or historical name incorrect'; END IF;
  BEGIN
   PERFORM public.vms_link_violation_driver_secure(row_id,NULL,(before_row->>'update_time')::timestamptz);
   RAISE EXCEPTION 'Stale write accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN
   PERFORM public.vms_link_violation_driver_secure(row_id,gen_random_uuid(),(saved->>'update_time')::timestamptz);
   RAISE EXCEPTION 'Missing driver accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
 END LOOP;
END $test$;
RESET ROLE;
DO $mask$
DECLARE row_data public.vehicle_violation_record; masked jsonb; access text;
BEGIN
 SELECT * INTO STRICT row_data FROM public.vehicle_violation_record WHERE id='a9fc0009-1023-4620-9220-000000000001';
 FOREACH access IN ARRAY ARRAY['hidden','masked'] LOOP
  masked:=app_private.vehicle_violation_to_secure_json(row_data,jsonb_build_object('driverIdentity',access));
  IF masked ? 'driver_id' THEN RAISE EXCEPTION 'Driver ID leaks through masked identity'; END IF;
 END LOOP;
END $mask$;
DELETE FROM public.sys_role_menu rm USING public.sys_role r,public.sys_menu m
WHERE rm.role_id=r.id AND rm.menu_id=m.id AND r.role_code='yq_2026_001'
AND r.tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9' AND m.name='VehicleViolation:LinkDriver';
SET LOCAL ROLE authenticated;
DO $denied$
BEGIN
 BEGIN
  PERFORM public.vms_link_violation_driver_secure('a9fc0009-1023-4620-9220-000000000001',NULL,now());
  RAISE EXCEPTION 'Unprivileged link accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $denied$;
RESET ROLE;
ROLLBACK;
