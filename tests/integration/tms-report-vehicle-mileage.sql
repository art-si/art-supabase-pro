BEGIN;
DO $test$ declare a uuid; j jsonb; begin
select auth_user_id into a from public.sys_user where user_roles @> ARRAY['R_SUPER'] and auth_user_id is not null limit 1;
perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
perform set_config('request.headers','{}',true);
j:=public.tms_management_report('vehicle-profit','2026-09-01','2026-09-30','报表验收',0,200)->'records';
if (select sum((r->>'total_mileage')::numeric) from jsonb_array_elements(j) r) is distinct from 300::numeric or (select sum((r->>'empty_mileage')::numeric) from jsonb_array_elements(j) r) is distinct from 45::numeric then raise exception 'vehicle mileage sums mismatch'; end if;
if not exists(select 1 from jsonb_array_elements(j) r where (r->>'total_mileage')::numeric=100 and (r->>'loaded_mileage')::numeric=95 and (r->>'empty_rate')::numeric=5) then raise exception 'vehicle mileage detail mismatch'; end if;
end $test$;
DO $missing$
DECLARE j jsonb;
BEGIN
 UPDATE public.tms_waybill_execution_record SET empty_mileage_km=null WHERE waybill_id='a9fc0006-1023-4620-9220-000000000001';
 j:=public.tms_management_report('vehicle-profit','2026-09-01','2026-09-30','测A验收001',0,200)->'records';
 IF jsonb_array_length(j)<>1 OR j->0->>'empty_rate' IS NOT NULL OR j->0->>'loaded_mileage' IS NOT NULL THEN RAISE EXCEPTION 'Unknown mileage converted to zero'; END IF;
END $missing$;
ROLLBACK;
