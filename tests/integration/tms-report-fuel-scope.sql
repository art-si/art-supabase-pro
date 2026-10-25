BEGIN;
UPDATE public.tms_waybill_execution_record SET departure_fuel_liters=100,refueled_liters=30,return_fuel_liters=100 WHERE waybill_id='a9fc0006-1023-4620-9220-000000000001';
SET LOCAL ROLE authenticated;
DO $test$
DECLARE actor uuid; header text; rows jsonb;
BEGIN
 FOREACH actor IN ARRAY ARRAY['ab881b32-87d4-4dce-9014-ce488b8069df'::uuid,'0a872664-874c-447d-a256-d0dbdca6ed45'::uuid] LOOP
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 FOREACH header IN ARRAY ARRAY['{}','{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}'] LOOP
 PERFORM set_config('request.headers',header,true);
 rows:=public.tms_management_report('vehicle-profit','2026-09-01','2026-09-30','测A验收001',0,200)->'records';
 IF actor='0a872664-874c-447d-a256-d0dbdca6ed45' AND header LIKE '%6675%' THEN
 IF jsonb_array_length(rows)<>0 THEN RAISE EXCEPTION 'Foreign selected vehicle leaked'; END IF;
 ELSE
 IF jsonb_array_length(rows)<>1 OR (rows->0->>'fuel_per_100km')::numeric IS DISTINCT FROM 30::numeric THEN RAISE EXCEPTION 'Fuel scope mismatch'; END IF;
 END IF;
 END LOOP;
 END LOOP;
END $test$;
RESET ROLE;
DELETE FROM public.sys_role_menu WHERE menu_id IN (SELECT id FROM public.sys_menu WHERE name='TmsLoadedWaybillList' OR name LIKE 'TmsLoadedWaybillList:%');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
SELECT set_config('request.headers','{}',true);
DO $test$
DECLARE rows jsonb;
BEGIN
 rows:=public.tms_management_report('vehicle-profit','2026-09-01','2026-09-30','测A验收001',0,200)->'records';
 IF jsonb_array_length(rows)<>1 OR rows->0->>'fuel_per_100km' IS NOT NULL OR rows->0->>'consumed_fuel_liters' IS NOT NULL THEN RAISE EXCEPTION 'Fuel exposed without execution permission'; END IF;
END $test$;
ROLLBACK;
