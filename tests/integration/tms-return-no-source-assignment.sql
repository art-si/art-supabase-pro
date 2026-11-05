-- A return for a source order without a selected dispatch leg requires explicit
-- available driver and vehicle; the secure candidate APIs expose both IDs.
-- Synthetic driver changes and created documents roll back together.
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
SELECT set_config('request.headers','{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}',true);
UPDATE public.mdm_driver SET enabled=true
WHERE id='23d00e78-38a8-480d-a4f1-d2e8aa5666f6';
UPDATE public.tms_driver_profile SET driver_status='on_duty'
WHERE driver_id='23d00e78-38a8-480d-a4f1-d2e8aa5666f6';
UPDATE public.mdm_vehicle SET primary_driver_id='23d00e78-38a8-480d-a4f1-d2e8aa5666f6'
WHERE id='580231f6-ed44-44fa-91ab-ea86ea54b3e2';
DO $test$
DECLARE
  v_source public.tms_order%rowtype;
  v_driver uuid := '23d00e78-38a8-480d-a4f1-d2e8aa5666f6';
  v_vehicle uuid := '580231f6-ed44-44fa-91ab-ea86ea54b3e2';
  v_drivers jsonb;
  v_vehicles jsonb;
  v_payload jsonb;
  v_result jsonb;
  v_waybill public.tms_waybill%rowtype;
  v_denied boolean := false;
BEGIN
  SELECT * INTO STRICT v_source FROM public.tms_order
  WHERE id='9a9679c3-1b4e-4e01-8012-60b1087e0fb7';
  v_drivers := public.tms_list_dispatch_candidates_secure(
    'driver',v_source.tenant_id,null,0,100
  );
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_drivers->'records') item
    WHERE (item->>'id')::uuid=v_driver) THEN
    RAISE EXCEPTION '可用司机未出现在返程参选列表';
  END IF;
  v_vehicles := public.tms_list_dispatch_candidates_secure(
    'return_vehicle',v_source.tenant_id,v_vehicle::text,0,10
  );
  IF jsonb_array_length(v_vehicles->'records')<>1 OR
    (v_vehicles->'records'->0->>'id')::uuid<>v_vehicle THEN
    RAISE EXCEPTION '车辆 UUID 精确检索失败：%',v_vehicles;
  END IF;

  v_payload := jsonb_build_object(
    'order_no','','order_status','pending_load',
    'origin_station',v_source.destination_station,
    'destination_station',v_source.origin_station,
    'delivery_method',v_source.delivery_method,
    'shipping_contact_name',v_source.receiving_contact_name,
    'shipping_contact_phone',v_source.receiving_contact_phone,
    'shipping_address_detail',v_source.receiving_address_detail,
    'receiving_contact_name',v_source.shipping_contact_name,
    'receiving_contact_phone',v_source.shipping_contact_phone,
    'receiving_address_detail',v_source.shipping_address_detail,
    'cargo_items',v_source.cargo_items,
    'cargo_quantity_total',v_source.cargo_quantity_total,
    'cargo_weight_total',v_source.cargo_weight_total,
    'cargo_volume_total',v_source.cargo_volume_total,
    'transport_fee',100,'total_fee',100,
    'payment_method',v_source.payment_method,
    'transport_mode',v_source.transport_mode,
    'shipping_longitude',112.89926,'shipping_latitude',33.994075,
    'receiving_longitude',115.962574,'receiving_latitude',32.322418,
    'order_config',jsonb_build_object(
      'load_type','ltl','billing_mode','quantity','billing_unit','piece',
      'cargo_category','general','packaging','bulk',
      'transport_requirements','[]'::jsonb,'attachment_urls','[]'::jsonb
    ),
    'dispatch_driver_id',v_driver,'dispatch_vehicle_id',v_vehicle
  );
  v_result := public.tms_create_return_order_secure(v_source.id,null,v_payload);
  SELECT * INTO STRICT v_waybill FROM public.tms_waybill
  WHERE id=(v_result->>'waybillId')::uuid;
  IF v_waybill.driver_id<>v_driver OR v_waybill.vehicle_id<>v_vehicle
    OR v_waybill.status<>'pending' OR v_waybill.dispatch_mode<>'self_operated' THEN
    RAISE EXCEPTION '无来源返程未正确继承显式司机车辆：%',v_waybill.id;
  END IF;
  IF (SELECT return_source_waybill_id FROM public.tms_order
    WHERE id=(v_result->>'orderId')::uuid) IS NOT NULL THEN
    RAISE EXCEPTION '无来源返程错误地绑定正向执行单';
  END IF;
  BEGIN
    PERFORM public.tms_create_return_order_secure(v_source.id,null,v_payload);
  EXCEPTION WHEN check_violation THEN v_denied:=true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION '在途司机被重复配给第二张无来源返程单'; END IF;
END $test$;
ROLLBACK;
