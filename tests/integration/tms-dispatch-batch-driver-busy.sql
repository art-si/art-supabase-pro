-- Same driver and vehicle can serve two executions of one authorized batch.
-- A following independent dispatch may reuse it with an explicit advisory. All writes roll back.
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
SELECT set_config('request.headers','{"x-art-tenant-scope":"2824c2b5-2774-4781-b995-f55e8bcee920"}',true);
DO $test$
DECLARE
  v_source public.tms_order%rowtype;
  v_vehicle public.mdm_vehicle%rowtype;
  v_driver public.mdm_driver%rowtype;
  v_order_ids uuid[] := '{}';
  v_created jsonb;
  v_plan jsonb;
  v_result jsonb;
  v_executions jsonb := '[]'::jsonb;
  v_index integer;
BEGIN
  SELECT * INTO STRICT v_source FROM public.tms_order
  WHERE id='a8fd42f0-20ac-4832-99e3-a82bed6eca11';
  SELECT * INTO STRICT v_vehicle FROM public.mdm_vehicle
  WHERE tenant_id=v_source.tenant_id AND audit_status='approved'
  ORDER BY create_time DESC LIMIT 1;
  SELECT * INTO STRICT v_driver FROM public.mdm_driver d
  WHERE d.tenant_id=v_source.tenant_id
    AND app_private.tms_dispatch_driver_eligible(d.id,d.tenant_id)
  ORDER BY d.id LIMIT 1;

  FOR v_index IN 1..3 LOOP
    v_created := public.tms_create_order_with_contract_secure(jsonb_build_object(
      'order_no','', 'order_status','pending_load',
      'origin_station',v_source.origin_station,
      'destination_station',v_source.destination_station,
      'delivery_method',v_source.delivery_method,
      'shipping_customer_id',v_source.shipping_customer_id,
      'receiving_customer_id',v_source.receiving_customer_id,
      'shipping_contact_name',v_source.shipping_contact_name,
      'shipping_contact_phone',v_source.shipping_contact_phone,
      'shipping_address_detail',v_source.shipping_address_detail,
      'receiving_contact_name',v_source.receiving_contact_name,
      'receiving_contact_phone',v_source.receiving_contact_phone,
      'receiving_address_detail',v_source.receiving_address_detail,
      'cargo_items',jsonb_build_array(jsonb_build_object(
        'cargo_name','批量配载司机占用回归','quantity',1,'unit','件','weight_kg',100,'volume_m3',1)),
      'cargo_quantity_total',1,'cargo_weight_total',100,'cargo_volume_total',1,
      'transport_fee',100,'total_fee',100,'payment_method',v_source.payment_method,
      'transport_mode',coalesce(v_source.transport_mode,'road'),
      'order_config',coalesce(v_source.order_config,'{}'::jsonb),
      'order_remark','[批量配载司机占用回滚验收]'
    ),null);
    v_order_ids := array_append(v_order_ids,(v_created->>'id')::uuid);
  END LOOP;

  FOR v_index IN 1..2 LOOP
    v_executions := v_executions || jsonb_build_array(jsonb_build_object(
      'dispatch_mode','legacy_vehicle',
      'dispatch_vehicle_id',v_vehicle.id,
      'dispatch_driver_id',v_driver.id,
      'planned_departure_time',now()+interval '1 day',
      'planned_arrival_time',now()+interval '2 days',
      'certificate_risk_override',true,
      'certificate_risk_override_reason','批量配载司机占用回归',
      'allocations',jsonb_build_array(jsonb_build_object(
        'order_id',v_order_ids[v_index],
        'lines',jsonb_build_array(jsonb_build_object(
          'line_index',0,'quantity',1,'weight_kg',100,'volume_m3',1
        ))
      ))
    ));
  END LOOP;
  v_plan := jsonb_build_object('kind','single','executions',v_executions);
  v_result := public.tms_create_dispatch_plan_secure(v_plan);
  IF jsonb_array_length(v_result->'waybill_ids')<>2 OR
    (SELECT count(*) FROM public.tms_waybill w
     WHERE w.id IN (SELECT value::uuid FROM jsonb_array_elements_text(v_result->'waybill_ids'))
       AND w.driver_id=v_driver.id AND w.vehicle_id=v_vehicle.id
       AND w.status='pending')<>2 THEN
    RAISE EXCEPTION '同批次双单司机车辆未正确配载：%',v_result;
  END IF;
  IF EXISTS (SELECT 1 FROM app_private.tms_dispatch_batch_driver_context
    WHERE transaction_id=txid_current() AND tenant_id=v_source.tenant_id
      AND driver_id=v_driver.id) THEN
    RAISE EXCEPTION '批次司机上下文未清除';
  END IF;
  IF app_private.tms_dispatch_driver_eligible(v_driver.id,v_source.tenant_id) THEN
    RAISE EXCEPTION '已配载司机仍被标记为空闲';
  END IF;

  v_result := public.tms_create_dispatch_plan_secure(jsonb_build_object(
      'kind','single','executions',jsonb_build_array(jsonb_build_object(
        'dispatch_mode','legacy_vehicle',
        'dispatch_vehicle_id',v_vehicle.id,
        'dispatch_driver_id',v_driver.id,
        'planned_departure_time',now()+interval '1 day',
        'planned_arrival_time',now()+interval '2 days',
        'certificate_risk_override',true,
        'certificate_risk_override_reason','独立批次的司机占用仅作提醒',
        'allocations',jsonb_build_array(jsonb_build_object(
          'order_id',v_order_ids[3],
          'lines',jsonb_build_array(jsonb_build_object(
            'line_index',0,'quantity',1,'weight_kg',100,'volume_m3',1
          ))
        ))
      ))
    ));
  IF jsonb_array_length(v_result->'waybill_ids')<>1 OR NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(v_result->'warnings') warning
    WHERE warning->>'subject_label'=v_driver.driver_name
      AND warning->>'message' LIKE '%未完成运输任务%'
  ) THEN RAISE EXCEPTION '独立批次复用在途司机应成功并明确提醒：%',v_result; END IF;
END $test$;
ROLLBACK;
