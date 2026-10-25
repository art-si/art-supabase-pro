BEGIN;
DO $test$
DECLARE actor uuid; rows jsonb; own_rows jsonb; forged_rows jsonb;
BEGIN
 SELECT auth_user_id INTO actor FROM public.sys_user WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 PERFORM set_config('request.headers','{}',true);
 rows:=public.tms_management_report('vehicle-profit','2026-09-01','2026-09-30','报表验收',0,200)->'records';
 IF jsonb_array_length(rows)<>2 OR (SELECT sum((j->>'insurance_period_cost')::numeric) FROM jsonb_array_elements(rows) j) IS DISTINCT FROM 990::numeric THEN RAISE EXCEPTION 'Insurance September amount mismatch'; END IF;
 IF (SELECT sum((j->>'insurance_period_cost')::numeric) FROM jsonb_array_elements(app_private.tms_vehicle_insurance_costs('2025-12-31','2026-01-01')) j WHERE j->>'vehicle_id' IN ('a9fc0004-1023-4620-9220-000000000001','a9fc0004-1023-4620-9220-000000000002')) IS DISTINCT FROM 33::numeric THEN RAISE EXCEPTION 'Insurance inclusive start boundary mismatch'; END IF;
 PERFORM set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(app_private.tms_vehicle_insurance_costs('2026-09-01','2026-09-30')) j WHERE j->>'vehicle_id' LIKE 'a9fc0004%') THEN RAISE EXCEPTION 'Insurance selected tenant leak'; END IF;
 PERFORM set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
 PERFORM set_config('request.headers','{}',true);
 own_rows:=app_private.tms_vehicle_insurance_costs('2026-09-01','2026-09-30');
 PERFORM set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
 forged_rows:=app_private.tms_vehicle_insurance_costs('2026-09-01','2026-09-30');
 IF own_rows IS DISTINCT FROM forged_rows OR jsonb_array_length(own_rows)<2 THEN RAISE EXCEPTION 'Insurance ordinary tenant scope mismatch'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 PERFORM set_config('request.headers','{}',true);
 UPDATE public.vehicle_insurance SET commercial_insure_date=NULL WHERE remark='[TMS报表验收20261024] 车辆保险摊销测试';
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(app_private.tms_vehicle_insurance_costs('2026-09-01','2026-09-30')) j WHERE j->>'vehicle_id' LIKE 'a9fc0004%' AND jsonb_typeof(j->'insurance_period_cost')='number') THEN RAISE EXCEPTION 'Missing insurance date presented as known cost'; END IF;
 IF has_function_privilege('authenticated','app_private.tms_vehicle_insurance_costs(date,date)','EXECUTE') OR has_function_privilege('anon','app_private.tms_vehicle_insurance_costs(date,date)','EXECUTE') THEN RAISE EXCEPTION 'Private insurance helper exposed'; END IF;
END $test$;
ROLLBACK;
