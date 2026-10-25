BEGIN;
-- Pending maintenance-source deployment contract; all fixture changes are rolled back.
DO $negative$
DECLARE source uuid:='d3e16c67-f606-45fe-b96b-bdf0e37bc439'; item uuid; payload jsonb; cid uuid;
BEGIN
perform set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
perform set_config('request.headers','{}',true);
UPDATE public.vehicle_maintenance_record SET end_time=now()-interval '1 day' WHERE id=source;
SELECT id INTO STRICT item FROM public.tms_expense_item WHERE tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9' AND business_category='vehicle_maintenance' AND is_selectable;
payload:=jsonb_build_object('waybill_id','a9fc0006-1023-4620-9220-000000000001','expense_item_id',item,'maintenance_record_id',source,'amount',600);
BEGIN
PERFORM public.tms_save_waybill_cost_secure(null,payload||'{"waybill_id":"a9fc0006-1023-4620-9220-000000000002"}');
RAISE EXCEPTION 'Wrong vehicle accepted';
EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'维修车辆与运单车辆不一致' THEN RAISE; END IF; END;
BEGIN
PERFORM public.tms_save_waybill_cost_secure(null,payload||'{"amount":1}');
RAISE EXCEPTION 'Wrong amount accepted';
EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'归集金额须与维修记录金额一致' THEN RAISE; END IF; END;
UPDATE public.vehicle_maintenance_record SET end_time=null WHERE id=source;
BEGIN
PERFORM public.tms_save_waybill_cost_secure(null,payload);
RAISE EXCEPTION 'Unfinished maintenance accepted';
EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'维修尚未完成，暂不能归集费用' THEN RAISE; END IF; END;
UPDATE public.vehicle_maintenance_record SET end_time=now()-interval '1 day' WHERE id=source;
cid:=(public.tms_save_waybill_cost_secure(null,payload)->>'id')::uuid;
BEGIN
PERFORM public.tms_save_waybill_cost_secure(cid,payload||'{"maintenance_record_id":"277a5215-864c-4496-b388-5b5a6c6e8a78"}');
RAISE EXCEPTION 'Source replacement accepted';
EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'已有费用不允许更换维修来源' THEN RAISE; END IF; END;
BEGIN
PERFORM public.tms_save_waybill_cost_secure(cid,payload||'{"waybill_id":"a9fc0006-1023-4620-9220-000000000002"}');
RAISE EXCEPTION 'Wrong vehicle edit accepted';
EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'维修车辆与运单车辆不一致' THEN RAISE; END IF; END;
END $negative$;
ROLLBACK;

