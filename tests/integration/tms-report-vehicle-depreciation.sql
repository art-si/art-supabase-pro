BEGIN;
DO $test$ DECLARE actor uuid; rows jsonb; BEGIN
 SELECT auth_user_id INTO actor FROM public.sys_user WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 PERFORM set_config('request.headers','{}',true);
 rows:=public.tms_management_report('vehicle-profit','2026-09-01','2026-09-30','报表验收',0,200)->'records';
 IF (SELECT sum((j->>'depreciation_posted')::numeric) FROM jsonb_array_elements(rows) j) IS DISTINCT FROM 13500::numeric THEN RAISE EXCEPTION 'Vehicle depreciation not reconciled %',rows; END IF;
 PERFORM set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
 IF jsonb_array_length(app_private.tms_vehicle_depreciation_rows('2026-09-01','2026-09-30'))<>0 THEN RAISE EXCEPTION 'Cross tenant depreciation'; END IF;
 IF has_function_privilege('authenticated','app_private.tms_vehicle_depreciation_rows(date,date)','EXECUTE') THEN RAISE EXCEPTION 'Private helper exposed'; END IF;
END $test$;
ROLLBACK;
