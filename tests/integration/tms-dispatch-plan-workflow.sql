BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
SELECT set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE vid uuid; original jsonb; saved jsonb; rows jsonb; i integer;
BEGIN
 FOR i IN 1..2 LOOP
  vid:=('a9fc0004-1023-4620-9220-'||lpad(i::text,12,'0'))::uuid;
  original:=public.tms_get_vehicle_dispatch_plan_secure(vid);
  IF original->>'waybillId' IS NULL THEN RAISE EXCEPTION 'Test vehicle must have current task'; END IF;
  saved:=public.tms_save_vehicle_dispatch_plan_secure(vid,(original->>'waybillId')::uuid,'2099-01-02 08:00+08','2099-01-03 09:00+08','维修计划回归-'||i,(original->>'updatedAt')::timestamptz);
  IF saved->>'maintenanceNote' IS DISTINCT FROM '维修计划回归-'||i THEN RAISE EXCEPTION 'Plan save mismatch'; END IF;
  BEGIN
   PERFORM public.tms_save_vehicle_dispatch_plan_secure(vid,(original->>'waybillId')::uuid,NULL,NULL,'',(original->>'updatedAt')::timestamptz);
   RAISE EXCEPTION 'Stale plan overwrite accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN
   PERFORM public.tms_save_vehicle_dispatch_plan_secure(vid,NULL,NULL,NULL,'',(saved->>'updatedAt')::timestamptz);
   RAISE EXCEPTION 'Changed task accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN
   PERFORM public.tms_save_vehicle_dispatch_plan_secure(vid,(original->>'waybillId')::uuid,NULL,NULL,'缺少预约时间',(saved->>'updatedAt')::timestamptz);
   RAISE EXCEPTION 'Incomplete maintenance accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  rows:=public.tms_management_report('vehicle-dispatch','2026-10-01','2026-10-31',NULL,0,200)->'records';
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(rows) r WHERE r->>'vehicle_id'=vid::text AND r->>'expected_return'='2099-01-02 08:00' AND r->>'maintenance_plan'='2099-01-03 09:00 · 维修计划回归-'||i)
  THEN RAISE EXCEPTION 'Plan not reflected in report'; END IF;
 END LOOP;
END $test$;
RESET ROLE;
-- A different current task must not inherit the previous task's estimate.
UPDATE app_private.tms_vehicle_dispatch_plan SET waybill_id='a9fc0006-1023-4620-9220-000000000001'
WHERE vehicle_id='a9fc0004-1023-4620-9220-000000000001';
SET LOCAL ROLE authenticated;
DO $test$
DECLARE rows jsonb; current_plan jsonb;
BEGIN
 current_plan:=public.tms_get_vehicle_dispatch_plan_secure('a9fc0004-1023-4620-9220-000000000001');
 IF current_plan->>'expectedReturnAt' IS NOT NULL THEN RAISE EXCEPTION 'Old task estimate shown in editor'; END IF;
 rows:=public.tms_management_report('vehicle-dispatch','2026-10-01','2026-10-31',NULL,0,200)->'records';
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(rows) r WHERE r->>'vehicle_id'='a9fc0004-1023-4620-9220-000000000001' AND r->>'expected_return' IS NOT NULL)
 THEN RAISE EXCEPTION 'Old task estimate shown in report'; END IF;
END $test$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE scope text; original jsonb;
BEGIN
 FOREACH scope IN ARRAY ARRAY['{}','{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}'] LOOP
  PERFORM set_config('request.headers',scope,true);
  original:=public.tms_get_vehicle_dispatch_plan_secure('a9fc0004-1023-4620-9220-000000000001');
  PERFORM public.tms_save_vehicle_dispatch_plan_secure('a9fc0004-1023-4620-9220-000000000001',(original->>'waybillId')::uuid,NULL,NULL,'',(original->>'updatedAt')::timestamptz);
 END LOOP;
 PERFORM set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
 BEGIN
  PERFORM public.tms_get_vehicle_dispatch_plan_secure('a9fc0004-1023-4620-9220-000000000001');
  RAISE EXCEPTION 'Cross tenant read accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.tms_save_vehicle_dispatch_plan_secure('a9fc0004-1023-4620-9220-000000000001',NULL,NULL,NULL,'',NULL);
  RAISE EXCEPTION 'Cross tenant write accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
RESET ROLE;
DELETE FROM public.sys_role_menu WHERE menu_id IN(SELECT id FROM public.sys_menu WHERE name='TmsReportVehicleDispatch:EditPlan');
SELECT set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
 BEGIN
  PERFORM public.tms_save_vehicle_dispatch_plan_secure('a9fc0004-1023-4620-9220-000000000001',NULL,NULL,NULL,'',NULL);
  RAISE EXCEPTION 'Missing edit permission accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
RESET ROLE;
ROLLBACK;
