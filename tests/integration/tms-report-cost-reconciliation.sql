BEGIN;
DO $t$ DECLARE a uuid; report text; rows jsonb; expected_cost numeric; BEGIN
SELECT auth_user_id INTO a FROM public.sys_user WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1;
PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
PERFORM set_config('request.headers','{}',true);
-- Source costs are independent of the six reporting aggregations below.
SELECT 33990 + coalesce(sum(c.amount),0) INTO expected_cost
FROM public.tms_waybill_cost c JOIN public.tms_expense_item i ON i.id=c.expense_item_id AND i.tenant_id=c.tenant_id
WHERE c.tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9'
AND c.waybill_id IN ('a9fc0006-1023-4620-9220-000000000001','a9fc0006-1023-4620-9220-000000000002')
AND c.audit_status='approved'
AND i.business_category NOT IN ('driver_payroll','vehicle_insurance','vehicle_depreciation');
FOREACH report IN ARRAY ARRAY['monthly-overview','vehicle-profit','driver-productivity','order-profit','route-profit','customer-profit'] LOOP
rows:=public.tms_management_report(report,'2026-09-01','2026-09-30','报表验收',0,200)->'records';
IF (SELECT sum((j->>'reconciled_cost')::numeric) FROM jsonb_array_elements(rows) j) IS DISTINCT FROM expected_cost THEN RAISE EXCEPTION 'Reconciliation mismatch % %',report,rows; END IF;
IF (SELECT sum((j->>'reconciled_profit')::numeric) FROM jsonb_array_elements(rows) j) IS DISTINCT FROM 20000-expected_cost THEN RAISE EXCEPTION 'Profit mismatch %',report; END IF;
END LOOP;
END $t$;
DO $dedup$ DECLARE category text; item uuid; result jsonb; cid uuid; attempt integer; before_cost numeric; after_row jsonb; expected_cost numeric; BEGIN
PERFORM set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
PERFORM set_config('request.headers','{}',true);
before_cost:=(public.tms_management_report('vehicle-profit','2026-09-01','2026-09-30','测A验收001',0,200)->'records'->0->>'reconciled_cost')::numeric;
SELECT 14030 + coalesce(sum(c.amount),0) INTO expected_cost
FROM public.tms_waybill_cost c JOIN public.tms_expense_item i ON i.id=c.expense_item_id AND i.tenant_id=c.tenant_id
WHERE c.tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9'
AND c.waybill_id='a9fc0006-1023-4620-9220-000000000001'
AND c.audit_status='approved'
AND i.business_category NOT IN ('driver_payroll','vehicle_insurance','vehicle_depreciation');
IF before_cost IS DISTINCT FROM expected_cost THEN RAISE EXCEPTION 'Unexpected vehicle baseline %',before_cost; END IF;
FOREACH category IN ARRAY ARRAY['driver_payroll','vehicle_insurance','vehicle_depreciation','other'] LOOP
 SELECT id INTO item FROM public.tms_expense_item WHERE tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9' AND business_category=category AND is_selectable LIMIT 1;
 result:=public.tms_save_waybill_cost_secure(NULL,jsonb_build_object('waybill_id','a9fc0006-1023-4620-9220-000000000001','expense_item_id',item,'amount',100,'occurred_on','2026-09-12','remark','ROLLBACK ONLY 成本去重回归'));
 cid:=(result->>'id')::uuid;
 PERFORM public.start_workflow('tms_waybill_cost',cid,'成本去重回归','{}'::jsonb,gen_random_uuid()::text);
 FOR attempt IN 1..5 LOOP
  EXIT WHEN (SELECT audit_status FROM public.tms_waybill_cost WHERE id=cid)='approved';
  PERFORM public.act_workflow_by_business('tms_waybill_cost',cid,'approve','事务回归',gen_random_uuid()::text);
 END LOOP;
 IF (SELECT audit_status FROM public.tms_waybill_cost WHERE id=cid)<>'approved' THEN RAISE EXCEPTION 'Approval not complete'; END IF;
 after_row:=public.tms_management_report('vehicle-profit','2026-09-01','2026-09-30','测A验收001',0,200)->'records'->0;
 IF category<>'other' AND (after_row->>'reconciled_cost')::numeric IS DISTINCT FROM before_cost THEN RAISE EXCEPTION 'Duplicate cost included % %',category,after_row; END IF;
 IF category='other' AND (jsonb_typeof(after_row->'reconciled_cost')<>'null' OR after_row->>'reconciliation_status'<>'待核对费用分类') THEN RAISE EXCEPTION 'Unknown classification treated as reconciled'; END IF;
END LOOP;
END $dedup$;
ROLLBACK;
