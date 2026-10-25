BEGIN;
DO $test$ declare a uuid; j jsonb; begin
select auth_user_id into a from public.sys_user where user_roles @> ARRAY['R_SUPER'] and auth_user_id is not null limit 1;
perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
perform set_config('request.headers','{}',true);
j:=app_private.tms_operational_report_rows('risk','2026-09-01','2026-10-23','报表验收');
if (select count(*) from jsonb_array_elements(j) r where r->>'risk_type'='货损理赔')<>2 then raise exception 'damage risk row count'; end if;
if (select sum((r->>'risk_amount')::numeric) from jsonb_array_elements(j) r where r->>'risk_type'='货损理赔')<>300 then raise exception 'damage risk amount'; end if;
end $test$;
DO $scope$
DECLARE j jsonb;
BEGIN
 PERFORM set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
 PERFORM set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
 j:=app_private.tms_operational_report_rows('risk','2026-09-01','2026-10-23','报表验收');
 IF (SELECT count(*) FROM jsonb_array_elements(j) r WHERE r->>'risk_type'='货损理赔' AND r->>'status'='费用已审核' AND r->>'order_id' IS NOT NULL)<>2 THEN RAISE EXCEPTION 'Damage risk ordinary scope or state mismatch'; END IF;
 PERFORM set_config('request.jwt.claims','{"sub":"9850d41a-77e9-40a7-b2cb-0ad02ac01440","role":"authenticated"}',true);
 j:=app_private.tms_operational_report_rows('risk','2026-09-01','2026-10-23','报表验收');
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(j) r WHERE r->>'risk_type'='货损理赔') THEN RAISE EXCEPTION 'Damage risk source permission bypass'; END IF;
END $scope$;
ROLLBACK;
