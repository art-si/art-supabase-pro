BEGIN;
DO $test$ DECLARE category text; item uuid; result jsonb; BEGIN
PERFORM set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
PERFORM set_config('request.headers','{}',true);
FOREACH category IN ARRAY ARRAY['driver_payroll','vehicle_insurance','vehicle_depreciation','vehicle_maintenance','traffic_fine'] LOOP
 SELECT id INTO STRICT item FROM public.tms_expense_item WHERE tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9' AND business_category=category AND is_selectable;
 result:=public.tms_save_waybill_cost_secure(NULL,jsonb_build_object('waybill_id','a9fc0006-1023-4620-9220-000000000001','expense_item_id',item,'amount',100,'occurred_on','2026-09-12','remark','费用分类事务验证'));
 IF result->>'cost_type' IS DISTINCT FROM category OR result->>'audit_status' IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'Cost classification not preserved %',category; END IF;
END LOOP;
END $test$;
ROLLBACK;
