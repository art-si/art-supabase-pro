BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
SELECT set_config('request.headers','{}',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE run jsonb; run_id uuid; result jsonb;
BEGIN
 SELECT (j->>'id')::uuid INTO run_id FROM jsonb_array_elements(public.fms_list_payroll_runs_secure(0,199,'2282ea13-3c7d-48b6-aab8-1fc7d67e7b1b',null,null)->'records') j WHERE j->>'remark'='TMS司机分类验收202610：提成与扣款分类';
 IF run_id IS NULL THEN
 run:=public.save_fms_payroll_run_secure('{"accountingPeriodId":"80a26c82-6d75-4606-a960-17418c1e2459","remark":"TMS司机分类验收202610：提成与扣款分类"}');
 run_id:=(run->>'id')::uuid;
 PERFORM public.save_fms_payroll_line_secure(run_id,'{"employeeId":"26bcab53-f7a1-252b-ed0f-c306aff803c2","earningItems":{"基本工资":6000,"提成":1800,"补助":200},"deductionItems":{"违章扣款":100,"事故扣款":0,"其他扣款":100},"employerCostItems":{"社保":1200},"grossAmount":8000,"deductionAmount":200,"employerCostAmount":1200}');
 PERFORM public.save_fms_payroll_line_secure(run_id,'{"employeeId":"fba456e0-f7b6-56ba-99fa-2d2750c17a61","earningItems":{"基本工资":6000,"提成":2800,"补助":200},"deductionItems":{"违章扣款":0,"事故扣款":200,"其他扣款":100},"employerCostItems":{"社保":1300},"grossAmount":9000,"deductionAmount":300,"employerCostAmount":1300}');
 PERFORM public.act_fms_payroll_run_secure(run_id,'approve','{}');
 END IF;
 result:=public.tms_management_report('driver-productivity','2026-10-01','2026-10-31','报表验收',0,200);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result->'records') j WHERE (j->>'payroll_commission')::numeric=1800 AND (j->>'payroll_traffic_deductions')::numeric=100 AND (j->>'payroll_accident_deductions')::numeric=0) OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result->'records') j WHERE (j->>'payroll_commission')::numeric=2800 AND (j->>'payroll_traffic_deductions')::numeric=0 AND (j->>'payroll_accident_deductions')::numeric=200) THEN RAISE EXCEPTION 'Payroll workflow report mismatch: %',result; END IF;
END $test$;
ROLLBACK;
