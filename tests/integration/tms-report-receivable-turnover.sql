BEGIN;
DO $test$ declare a uuid; v numeric; begin
select auth_user_id into a from public.sys_user where user_roles @> ARRAY['R_SUPER'] and auth_user_id is not null limit 1;
perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
perform set_config('request.headers','{}',true);
v:=app_private.tms_receivable_turnover_days('2026-10-01','2026-10-23','TEST-AR-WAYBILL');
if v is distinct from 5.18::numeric then raise exception 'Turnover mismatch %',v; end if;
if app_private.tms_receivable_turnover_days('2026-09-01','2026-09-30','TEST-AR-WAYBILL') is not null then raise exception 'No period sales should be unknown'; end if;
end $test$;
DO $permission$
DECLARE admin_id uuid;
BEGIN
 SELECT auth_user_id INTO admin_id FROM public.sys_user WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub','9850d41a-77e9-40a7-b2cb-0ad02ac01440','role','authenticated')::text,true);
 IF app_private.tms_receivable_turnover_days('2026-10-01','2026-10-23','TEST-AR-WAYBILL') IS NOT NULL THEN RAISE EXCEPTION 'Turnover exposed without finance source permission'; END IF;
 PERFORM set_config('request.headers','{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}',true);
 IF app_private.tms_receivable_turnover_days('2026-10-01','2026-10-23','TEST-AR-WAYBILL') IS NOT NULL THEN RAISE EXCEPTION 'Forged header exposed turnover'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
 IF app_private.tms_receivable_turnover_days('2026-10-01','2026-10-23','TEST-AR-WAYBILL') IS NOT NULL THEN RAISE EXCEPTION 'Selected tenant leaked other tenant receivables'; END IF;
 PERFORM set_config('request.headers','{}',true);
END $permission$;
DO $currency$
BEGIN
 UPDATE public.fms_receivable_document SET currency_code='USD' WHERE id='593b7708-b744-44cf-bcb0-5b0521d95ae2';
 IF app_private.tms_receivable_turnover_days('2026-10-01','2026-10-23','TEST-AR-WAYBILL') IS NOT NULL THEN RAISE EXCEPTION 'Mixed currency turnover aggregated'; END IF;
 IF has_function_privilege('authenticated','app_private.tms_receivable_turnover_days(date,date,text)','EXECUTE') THEN RAISE EXCEPTION 'Private turnover helper exposed'; END IF;
END $currency$;
ROLLBACK;
