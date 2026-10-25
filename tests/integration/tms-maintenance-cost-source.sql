BEGIN;
-- Contract for maintenance-source ingestion; run after the source integration is deployed.
DO $test$
DECLARE n int; maintenance_source uuid; w uuid; item uuid; result jsonb; cid uuid; before_cost numeric; after_cost numeric; attempt int;
BEGIN
perform set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
perform set_config('request.headers','{}',true);
FOR n IN 1..2 LOOP
maintenance_source:=case n when 1 then 'd3e16c67-f606-45fe-b96b-bdf0e37bc439'::uuid else '277a5215-864c-4496-b388-5b5a6c6e8a78'::uuid end;
w:=('a9fc0006-1023-4620-9220-'||lpad(n::text,12,'0'))::uuid;
UPDATE public.vehicle_maintenance_record SET end_time=now()-interval '1 day' WHERE id=maintenance_source;
SELECT id INTO STRICT item FROM public.tms_expense_item WHERE tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9' AND business_category='vehicle_maintenance' AND is_selectable;
before_cost:=(public.tms_management_report('vehicle-profit','2026-09-01','2026-09-30','测A验收00'||n,0,20)->'records'->0->>'vehicle_maintenance_cost')::numeric;
result:=public.tms_save_waybill_cost_secure(null,jsonb_build_object('waybill_id',w,'expense_item_id',item,'maintenance_record_id',maintenance_source,'amount',case n when 1 then 600 else 900 end,'occurred_on','2026-09-18'));
cid:=(result->>'id')::uuid;
BEGIN
PERFORM public.vms_delete_vehicle_maintenance_secure(ARRAY[maintenance_source]);
RAISE EXCEPTION 'Linked maintenance deleted';
EXCEPTION WHEN foreign_key_violation THEN NULL; END;
IF NOT EXISTS(SELECT 1 FROM public.vms_get_maintenance_delete_dependencies_secure(ARRAY[maintenance_source::text],null) d WHERE d.target_id=cid::text AND d.source_table='tms_waybill_cost' AND d.record_status='draft') THEN RAISE EXCEPTION 'Missing cost dependency details'; END IF;
IF NOT EXISTS(select 1 from public.vehicle_maintenance_record WHERE id=maintenance_source) THEN RAISE EXCEPTION 'Source disappeared'; END IF;
IF NOT EXISTS(select 1 from public.tms_waybill_cost where id=cid and source_type='vehicle_maintenance' and tms_waybill_cost.source_id=maintenance_source) THEN RAISE EXCEPTION 'Source not retained'; END IF;
BEGIN
PERFORM public.tms_save_waybill_cost_secure(null,jsonb_build_object('waybill_id',w,'expense_item_id',item,'maintenance_record_id',maintenance_source,'amount',case n when 1 then 600 else 900 end));
RAISE EXCEPTION 'Duplicate unexpectedly accepted';
EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'该维修记录已归集费用，请查看已有费用单' THEN RAISE; END IF; END;
after_cost:=(public.tms_management_report('vehicle-profit','2026-09-01','2026-09-30','测A验收00'||n,0,20)->'records'->0->>'vehicle_maintenance_cost')::numeric;
IF after_cost IS DISTINCT FROM before_cost THEN RAISE EXCEPTION 'Draft counted'; END IF;
PERFORM public.start_workflow('tms_waybill_cost',cid,'维修来源归集回归','{}'::jsonb,gen_random_uuid()::text);
FOR attempt IN 1..5 LOOP
EXIT WHEN (SELECT audit_status FROM public.tms_waybill_cost WHERE id=cid)='approved';
PERFORM public.act_workflow_by_business('tms_waybill_cost',cid,'approve','事务回归',gen_random_uuid()::text);
END LOOP;
after_cost:=(public.tms_management_report('vehicle-profit','2026-09-01','2026-09-30','测A验收00'||n,0,20)->'records'->0->>'vehicle_maintenance_cost')::numeric;
IF after_cost IS DISTINCT FROM (before_cost+(case n when 1 then 600 else 900 end)) THEN RAISE EXCEPTION 'Approved maintenance mismatch'; END IF;
END LOOP;
END $test$;
ROLLBACK;

