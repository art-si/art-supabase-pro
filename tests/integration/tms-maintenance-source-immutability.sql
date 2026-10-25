BEGIN;
DO $test$
DECLARE source uuid; payload jsonb; other_vehicle uuid;
BEGIN
PERFORM set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
PERFORM set_config('request.headers','{}',true);
FOREACH source IN ARRAY ARRAY['d3e16c67-f606-45fe-b96b-bdf0e37bc439'::uuid,'277a5215-864c-4496-b388-5b5a6c6e8a78'::uuid] LOOP
IF NOT EXISTS(SELECT 1 FROM public.tms_waybill_cost WHERE source_type='vehicle_maintenance' AND source_id=source) THEN RAISE EXCEPTION 'Missing linked fixture'; END IF;
SELECT other.vehicle_id INTO STRICT other_vehicle
FROM public.vehicle_maintenance_record other
WHERE other.id = CASE source
  WHEN 'd3e16c67-f606-45fe-b96b-bdf0e37bc439'::uuid THEN '277a5215-864c-4496-b388-5b5a6c6e8a78'::uuid
  ELSE 'd3e16c67-f606-45fe-b96b-bdf0e37bc439'::uuid END;
FOR payload IN SELECT value FROM jsonb_array_elements(
  '[{"cost_amount":12345},{"end_time":null},{"start_time":"2026-09-17T01:00:00Z"},{"items":[{"name":"changed"}]}]'::jsonb
  || jsonb_build_array(jsonb_build_object('vehicle_id',other_vehicle))) LOOP
BEGIN
PERFORM public.vms_update_vehicle_maintenance_secure(source,payload);
RAISE EXCEPTION 'Linked accounting source unexpectedly editable: %',payload;
EXCEPTION WHEN check_violation THEN
IF SQLERRM <> '该维修记录已归集运单费用，不可修改车辆、金额、维修时间或项目；可补充备注和附件' THEN RAISE; END IF;
END;
END LOOP;
PERFORM public.vms_update_vehicle_maintenance_secure(source,'{"remark":"ROLLBACK ONLY 来源锁定回归"}'::jsonb);
END LOOP;
END $test$;
ROLLBACK;

