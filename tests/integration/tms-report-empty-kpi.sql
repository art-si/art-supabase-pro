BEGIN;
DO $test$ declare a uuid; j jsonb; begin
select auth_user_id into a from public.sys_user where user_roles @> ARRAY['R_SUPER'] and auth_user_id is not null limit 1;
perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
perform set_config('request.headers','{}',true);
j:=public.tms_management_report('operations-kpi','2026-09-01','2026-09-30','报表验收',0,200)->'records';
if not exists(select 1 from jsonb_array_elements(j) r where r->>'code'='empty' and (r->>'actual')::numeric=15 and r->>'warning'='预警') then raise exception 'weighted empty mileage KPI mismatch'; end if;
end $test$;
DO $boundaries$
DECLARE j jsonb; sample record;
BEGIN
 FOR sample IN SELECT * FROM (VALUES (25::numeric,'达标'),(26,'预警'),(40,'预警'),(41,'未达标')) v(mileage,expected) LOOP
  UPDATE public.tms_waybill_execution_record SET empty_mileage_km=sample.mileage WHERE waybill_id='a9fc0006-1023-4620-9220-000000000002';
  j:=public.tms_management_report('operations-kpi','2026-09-01','2026-09-30','报表验收',0,200)->'records';
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(j) r WHERE r->>'code'='empty' AND r->>'warning'=sample.expected) THEN RAISE EXCEPTION 'Empty mileage warning boundary failed: %',sample.mileage; END IF;
 END LOOP;
END $boundaries$;
DO $missing$
DECLARE j jsonb;
BEGIN
 UPDATE public.tms_waybill_execution_record SET empty_mileage_km=null WHERE waybill_id='a9fc0006-1023-4620-9220-000000000001';
 j:=public.tms_management_report('operations-kpi','2026-09-01','2026-09-30','报表验收',0,200)->'records';
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(j) r WHERE r->>'code'='empty' AND r->>'actual' IS NOT NULL) THEN RAISE EXCEPTION 'Missing empty mileage treated as zero'; END IF;
END $missing$;
ROLLBACK;
