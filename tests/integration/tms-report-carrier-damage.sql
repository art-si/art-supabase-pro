BEGIN;
DO $test$ declare a uuid; j jsonb; begin
select auth_user_id into a from public.sys_user where user_roles @> ARRAY['R_SUPER'] and auth_user_id is not null limit 1;
perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
perform set_config('request.headers','{}',true);
j:=public.tms_management_report('carrier-performance','2026-09-01','2026-09-30','报表验收',0,200)->'records';
if jsonb_array_length(j)<>2 or (select sum((r->>'damage')::numeric) from jsonb_array_elements(j) r) is distinct from 300::numeric then raise exception 'carrier damage mismatch'; end if;
end $test$;
DO $scope$
DECLARE j jsonb;
BEGIN
 PERFORM set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
 j:=app_private.tms_operational_report_rows('carrier','2026-09-01','2026-09-30','报表验收');
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(j) r WHERE (r->>'damage')::numeric>0) THEN RAISE EXCEPTION 'Carrier damage selected tenant leak'; END IF;
 PERFORM set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
 j:=app_private.tms_operational_report_rows('carrier','2026-09-01','2026-09-30','报表验收');
 IF (SELECT sum((r->>'damage')::numeric) FROM jsonb_array_elements(j) r) IS DISTINCT FROM 300::numeric THEN RAISE EXCEPTION 'Carrier forged tenant changes scope'; END IF;
 PERFORM set_config('request.jwt.claims','{"sub":"9850d41a-77e9-40a7-b2cb-0ad02ac01440","role":"authenticated"}',true);
 j:=app_private.tms_operational_report_rows('carrier','2026-09-01','2026-09-30','报表验收');
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(j) r WHERE r->>'damage' IS NOT NULL) THEN RAISE EXCEPTION 'Carrier source permission bypass'; END IF;
END $scope$;
ROLLBACK;
