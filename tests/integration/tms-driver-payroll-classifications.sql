BEGIN;
DO $test$
DECLARE rows jsonb; item jsonb; d uuid;
BEGIN
 PERFORM set_config('request.jwt.claims','{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
 PERFORM set_config('request.headers','{}',true);
 UPDATE public.fms_payroll_line l SET
 earning_items=jsonb_build_object('基本工资',l.gross_amount-1000,'提成',1000),
 deduction_items=jsonb_build_object('违章扣款',100,'事故扣款',50,'其他扣款',l.deduction_amount-150)
 FROM public.mdm_driver d,public.fms_payroll_run r
 WHERE l.employee_id=d.employee_id AND l.tenant_id=d.tenant_id AND r.id=l.run_id
 AND r.payroll_month='2026-09-01' AND d.id IN
 ('a9fc0003-1023-4620-9220-000000000001','a9fc0003-1023-4620-9220-000000000002');
 rows:=public.tms_management_report('driver-productivity','2026-09-01','2026-09-30','报表验收',0,200)->'records';
 IF (SELECT count(*) FROM jsonb_array_elements(rows) j WHERE (j->>'payroll_commission')::numeric=1000 AND (j->>'payroll_traffic_deductions')::numeric=100 AND (j->>'payroll_accident_deductions')::numeric=50)<>2 THEN
 RAISE EXCEPTION 'Two driver classification totals incorrect: %',rows; END IF;
 UPDATE public.fms_payroll_line l SET deduction_items=l.deduction_items-'事故扣款'
 FROM public.mdm_driver d WHERE d.employee_id=l.employee_id AND d.tenant_id=l.tenant_id
 AND d.id='a9fc0003-1023-4620-9220-000000000001';
 rows:=app_private.tms_driver_payroll_rows('2026-09-01','2026-09-30');
 SELECT j INTO item FROM jsonb_array_elements(rows) j WHERE j->>'driver_id'='a9fc0003-1023-4620-9220-000000000001';
 IF item->>'payroll_accident_deductions' IS NOT NULL OR (item->>'payroll_traffic_deductions')::numeric<>100 THEN RAISE EXCEPTION 'Missing classification guessed'; END IF;
 PERFORM set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
 rows:=app_private.tms_driver_payroll_rows('2026-09-01','2026-09-30');
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(rows) j WHERE j->>'driver_id' IN ('a9fc0003-1023-4620-9220-000000000001','a9fc0003-1023-4620-9220-000000000002')) THEN RAISE EXCEPTION 'Payroll crosses selected tenant'; END IF;
 IF has_function_privilege('authenticated','app_private.tms_driver_payroll_rows(date,date)','EXECUTE') THEN RAISE EXCEPTION 'Private payroll helper exposed'; END IF;
END $test$;
ROLLBACK;
