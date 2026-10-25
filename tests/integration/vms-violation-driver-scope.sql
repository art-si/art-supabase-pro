-- No persistent data changes. Run after schema deployment or in its candidate transaction.
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE scope text; row_id uuid:='a9fc0009-1023-4620-9220-000000000001'; current_row jsonb; saved jsonb;
BEGIN
 FOREACH scope IN ARRAY ARRAY['{}','{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}'] LOOP
  PERFORM set_config('request.headers',scope,true);
  current_row:=public.vms_list_vehicle_violations_secure(p_ids=>ARRAY[row_id])->'records'->0;
  saved:=public.vms_link_violation_driver_secure(row_id,'a9fc0003-1023-4620-9220-000000000001',(current_row->>'update_time')::timestamptz);
  IF saved->>'driver_id' IS DISTINCT FROM 'a9fc0003-1023-4620-9220-000000000001'
  THEN RAISE EXCEPTION 'Platform inherited record tenant link failed'; END IF;
  BEGIN
   PERFORM public.vms_link_violation_driver_secure(row_id,'2d9558a8-b106-4cc4-9078-4d45893201e7',(saved->>'update_time')::timestamptz);
   RAISE EXCEPTION 'Cross-tenant driver link accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
 END LOOP;
 PERFORM set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
 BEGIN
  PERFORM public.vms_link_violation_driver_secure(row_id,NULL,(saved->>'update_time')::timestamptz);
  RAISE EXCEPTION 'Platform selected outside record scope accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claims','{"sub":"9850d41a-77e9-40a7-b2cb-0ad02ac01440","role":"authenticated"}',true);
 BEGIN
  PERFORM public.vms_link_violation_driver_secure(row_id,NULL,(saved->>'update_time')::timestamptz);
  RAISE EXCEPTION 'No-role user linked driver';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
RESET ROLE;
ROLLBACK;
