BEGIN;
DO $t$ DECLARE a uuid; r jsonb; p jsonb; expected_cost numeric; BEGIN
SELECT auth_user_id INTO a FROM public.sys_user WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1;
PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
PERFORM set_config('request.headers','{}',true);
-- Independent source total: approved direct costs plus September payroll,
-- insurance and depreciation fixtures. Never derive expectations from the report.
SELECT 33990 + coalesce(sum(c.amount),0) INTO expected_cost
FROM public.tms_waybill_cost c JOIN public.tms_expense_item i ON i.id=c.expense_item_id AND i.tenant_id=c.tenant_id
WHERE c.tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9'
AND c.waybill_id IN ('a9fc0006-1023-4620-9220-000000000001','a9fc0006-1023-4620-9220-000000000002')
AND c.audit_status='approved'
AND i.business_category NOT IN ('driver_payroll','vehicle_insurance','vehicle_depreciation');
r:=public.tms_management_report('vehicle-profit','2026-09-01','2026-09-30','报表验收',0,200);
p:=public.tms_management_report('vehicle-profit','2026-09-01','2026-09-30','报表验收',0,1);
IF r->'summary' IS DISTINCT FROM p->'summary' OR (r->'summary'->>'reconciled_cost')::numeric IS DISTINCT FROM expected_cost OR (r->'summary'->>'reconciled_profit')::numeric IS DISTINCT FROM 20000-expected_cost THEN RAISE EXCEPTION 'Reconciled summary mismatch'; END IF;
IF (SELECT sum((j->>'reconciled_cost')::numeric) FROM jsonb_array_elements(r->'trend') j) IS DISTINCT FROM expected_cost THEN RAISE EXCEPTION 'Reconciled chart mismatch'; END IF;
r:=public.tms_management_report('monthly-overview','2026-09-01','2026-10-23','报表验收',0,200);
IF jsonb_typeof(r->'summary'->'reconciled_cost') IS DISTINCT FROM 'null' OR (r->'summary'->>'reconciliation_pending')::integer<1 THEN RAISE EXCEPTION 'Incomplete period aggregated as complete'; END IF;
END $t$;
ROLLBACK;
