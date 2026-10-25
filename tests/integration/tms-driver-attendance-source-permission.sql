BEGIN;
SET LOCAL ROLE authenticated;
DO $scope$
DECLARE actor uuid; header text; rows jsonb;
BEGIN
 FOREACH actor IN ARRAY ARRAY['ab881b32-87d4-4dce-9014-ce488b8069df'::uuid,'0a872664-874c-447d-a256-d0dbdca6ed45'::uuid] LOOP
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 FOREACH header IN ARRAY ARRAY['{}','{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}'] LOOP
 PERFORM set_config('request.headers',header,true);
 rows:=public.tms_management_report('driver-operations','2026-09-10','2026-09-10','报表验收',0,200)->'records';
 IF actor='0a872664-874c-447d-a256-d0dbdca6ed45' AND header LIKE '%6675%' THEN
  IF jsonb_array_length(rows)<>0 THEN RAISE EXCEPTION 'Foreign selected attendance leaked'; END IF;
 ELSE
  IF jsonb_array_length(rows)<>2 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(rows) j WHERE j->>'attendance'='normal') OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(rows) j WHERE j->>'attendance'='late') THEN RAISE EXCEPTION 'Authorized attendance missing: %',rows; END IF;
 END IF;
 END LOOP;
 END LOOP;
END $scope$;
RESET ROLE;

DELETE FROM public.sys_role_menu WHERE menu_id IN (SELECT id FROM public.sys_menu WHERE name='Hr:Attendance:View');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
SELECT set_config('request.headers','{}',true);
DO $test$
DECLARE rows jsonb;
BEGIN
 rows:=public.tms_management_report('driver-operations','2026-09-10','2026-09-10','报表验收',0,200)->'records';
 IF jsonb_array_length(rows)<>2 THEN RAISE EXCEPTION 'Driver report unavailable'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(rows) j WHERE j->>'attendance' IS NOT NULL) THEN RAISE EXCEPTION 'Attendance exposed without source permission'; END IF;
END $test$;
ROLLBACK;
