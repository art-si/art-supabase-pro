BEGIN;
DO $test$
DECLARE actor uuid; rows jsonb; ordinary jsonb; forged jsonb;
BEGIN
 SELECT auth_user_id INTO actor FROM public.sys_user WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 PERFORM set_config('request.headers','{}',true);
 rows:=public.tms_management_report('driver-productivity','2026-09-01','2026-09-30','报表验收',0,200)->'records';
 IF jsonb_array_length(rows)<>2 OR (SELECT sum((j->>'payroll_gross')::numeric) FROM jsonb_array_elements(rows) j) IS DISTINCT FROM 17000::numeric OR (SELECT sum((j->>'payroll_net')::numeric) FROM jsonb_array_elements(rows) j) IS DISTINCT FROM 16500::numeric THEN RAISE EXCEPTION 'Driver payroll acceptance totals incorrect'; END IF;
 PERFORM set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
 IF jsonb_array_length(app_private.tms_driver_payroll_rows('2026-09-01','2026-09-30'))<>0 THEN RAISE EXCEPTION 'Selected tenant payroll leak'; END IF;
 PERFORM set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
 PERFORM set_config('request.headers','{}',true);
 ordinary:=app_private.tms_driver_payroll_rows('2026-09-01','2026-09-30');
 PERFORM set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
 forged:=app_private.tms_driver_payroll_rows('2026-09-01','2026-09-30');
 IF ordinary IS DISTINCT FROM forged OR jsonb_array_length(ordinary)<>2 THEN RAISE EXCEPTION 'Ordinary payroll scope mismatch'; END IF;
 PERFORM set_config('request.jwt.claims','{"sub":"9850d41a-77e9-40a7-b2cb-0ad02ac01440","role":"authenticated"}',true);
 IF jsonb_array_length(app_private.tms_driver_payroll_rows('2026-09-01','2026-09-30'))<>0 THEN RAISE EXCEPTION 'Salary source permission bypassed'; END IF;
 PERFORM set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
 UPDATE public.fms_payroll_run SET status='calculated' WHERE remark='[TMS报表验收20261024] 司机9月工资核算测试';
 IF jsonb_array_length(app_private.tms_driver_payroll_rows('2026-09-01','2026-09-30'))<>0 THEN RAISE EXCEPTION 'Unapproved salary included'; END IF;
 IF has_function_privilege('authenticated','app_private.tms_driver_payroll_rows(date,date)','EXECUTE') THEN RAISE EXCEPTION 'Private salary helper exposed'; END IF;
END $test$;
ROLLBACK;
