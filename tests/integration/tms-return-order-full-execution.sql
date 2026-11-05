-- Two real source orders in different tenants. Return creation and each execution step use secured RPCs.
-- Proofs, odometer, allocation receipt and tenant-scoped supplement readback all roll back.
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
SELECT set_config('request.headers','{"x-art-tenant-scope":"2824c2b5-2774-4781-b995-f55e8bcee920"}',true);
DO $test$ DECLARE fixture record;
v_count int:=0;
v_qa_order uuid;
v_other_order uuid;
v_denied boolean;
s public.tms_order%rowtype;
w public.tms_waybill%rowtype;
created jsonb;
payload jsonb;
v_id uuid;
v_alloc public.tms_waybill_order_allocation%rowtype;
v_return public.tms_order%rowtype;
v_waypoints uuid[];
supplement jsonb;
BEGIN FOR fixture IN SELECT * FROM (VALUES
 ('c359056a-2203-4274-826e-2cd634256722'::uuid,'a83978af-bc51-4dc1-aee4-c13dccaa9b64'::uuid,'2824c2b5-2774-4781-b995-f55e8bcee920'::uuid),
 ('116d4c15-1cde-4c5d-ab03-a5cef9bd800d'::uuid,'5897bebd-c163-4e69-8754-a862cc9ea998'::uuid,'7529f951-938e-4e2c-ac0d-316c136ae1f9'::uuid)
 ) AS input(order_id,waybill_id,tenant_id) LOOP
 PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',fixture.tenant_id)::text,true);
 SELECT * INTO STRICT s FROM public.tms_order WHERE id=fixture.order_id;
 SELECT * INTO STRICT w FROM public.tms_waybill WHERE id=fixture.waybill_id;
payload:=jsonb_build_object('order_no','','order_status','pending_load','origin_station',s.destination_station,'destination_station',s.origin_station,'delivery_method',s.delivery_method,'shipping_contact_name',s.receiving_contact_name,'shipping_contact_phone',s.receiving_contact_phone,'shipping_address_detail',s.receiving_address_detail,'receiving_contact_name',s.shipping_contact_name,'receiving_contact_phone',s.shipping_contact_phone,'receiving_address_detail',s.shipping_address_detail,'cargo_items',s.cargo_items,'cargo_quantity_total',s.cargo_quantity_total,'cargo_weight_total',s.cargo_weight_total,'cargo_volume_total',s.cargo_volume_total,'transport_fee',100,'total_fee',100,'payment_method',s.payment_method,'transport_mode',s.transport_mode,'order_config',jsonb_build_object('load_type','ltl','billing_mode','quantity','billing_unit','piece','cargo_category','general','packaging','bulk','transport_requirements','[]'::jsonb,'attachment_urls','[]'::jsonb),'shipping_longitude',116.4,'shipping_latitude',39.9,'receiving_longitude',117.2,'receiving_latitude',40.0,'order_remark','[Active source return QA]');
SELECT array_agg(id ORDER BY id) INTO v_waypoints FROM (
  SELECT station.id FROM public.mdm_station station
  JOIN public.tms_station_role role ON role.station_id=station.id AND role.tenant_id=station.tenant_id
  WHERE station.tenant_id=fixture.tenant_id AND station.enabled AND role.role_type='transfer'
  ORDER BY station.id LIMIT 3
) waypoint_rows;
IF cardinality(v_waypoints)<2 THEN RAISE EXCEPTION 'return fixture tenant needs two transfer stations: %',fixture.tenant_id; END IF;
payload:=payload || jsonb_build_object(
  'transfer_station_id',v_waypoints[1],
  'transfer_station_ids',to_jsonb(v_waypoints),
  'shipping_region_path',jsonb_build_array('浙江省','杭州市'),
  'receiving_region_path',jsonb_build_array('江苏省','南京市'),
  'shipping_longitude',120.12,'shipping_latitude',30.21,
  'receiving_longitude',118.78,'receiving_latitude',32.04,
  'distance_km',188.5,
  'order_config',payload->'order_config' || jsonb_build_object(
    'payable',jsonb_build_object('driver_freight',71,'carrier_freight',29,
      'driver_settlement_method','cash','carrier_settlement_method','receipt_payment'),
    'loading',jsonb_build_object('loaded_weight_ton',12.5,
      'load_photo_urls','[]'::jsonb,'load_ticket_urls','[]'::jsonb,
      'unload_photo_urls','[]'::jsonb,'unload_ticket_urls','[]'::jsonb,
      'signer_name','返程独立签收')
  )
);
created:=public.tms_create_return_order_secure(s.id,w.id,payload);
IF created->>'waybillId' IS NULL THEN RAISE EXCEPTION 'return create missing waybill';
END IF;
SELECT * INTO STRICT v_return FROM public.tms_order WHERE id=(created->>'orderId')::uuid;
IF v_return.transfer_station_ids IS DISTINCT FROM v_waypoints
 OR v_return.shipping_region_path IS DISTINCT FROM ARRAY['浙江省','杭州市']
 OR v_return.receiving_region_path IS DISTINCT FROM ARRAY['江苏省','南京市']
 OR v_return.shipping_longitude IS DISTINCT FROM 120.12
 OR v_return.shipping_latitude IS DISTINCT FROM 30.21
 OR v_return.receiving_longitude IS DISTINCT FROM 118.78
 OR v_return.receiving_latitude IS DISTINCT FROM 32.04
 OR v_return.distance_km IS DISTINCT FROM 188.5
 OR v_return.order_config#>>'{payable,driver_freight}' IS DISTINCT FROM '71'
 OR v_return.order_config#>>'{payable,carrier_settlement_method}' IS DISTINCT FROM 'receipt_payment'
 OR v_return.order_config#>>'{loading,loaded_weight_ton}' IS DISTINCT FROM '12.5'
 OR v_return.order_config#>>'{loading,signer_name}' IS DISTINCT FROM '返程独立签收'
 OR v_return.order_config->'attachment_urls' IS DISTINCT FROM '[]'::jsonb
 OR v_return.order_config#>'{loading,load_photo_urls}' IS DISTINCT FROM '[]'::jsonb
THEN RAISE EXCEPTION 'return route, address or independent config not persisted for %',v_return.id; END IF;
 v_id:=(created->>'waybillId')::uuid;
 PERFORM public.tms_accept_assigned_waybill(v_id);
 PERFORM public.tms_check_in_waybill_cargo_operation(v_id,'loading',116.4,39.9);
 PERFORM public.tms_complete_waybill_cargo_operation(v_id,'loading',12,jsonb_build_array('qa://load-photo'),jsonb_build_array('qa://load-ticket'),null);
 PERFORM public.tms_record_waybill_departure(v_id,now(),100,jsonb_build_array('qa://departure'),null);
 PERFORM public.tms_check_in_waybill_cargo_operation(v_id,'unloading',117.2,40.0);
 PERFORM public.tms_complete_waybill_cargo_operation(v_id,'unloading',12,jsonb_build_array('qa://unload-photo'),jsonb_build_array('qa://unload-ticket'),null);
 SELECT * INTO STRICT v_alloc FROM public.tms_waybill_order_allocation WHERE waybill_id=v_id;
 PERFORM public.tms_sign_execution_allocations_secure(v_id,now(),'QA签收人',jsonb_build_array('qa://receipt'),jsonb_build_array('qa://signature'),null,jsonb_build_array(jsonb_build_object('allocation_id',v_alloc.id,'signed_quantity',v_alloc.quantity,'exception_quantity',0)));
 PERFORM public.tms_complete_waybill_execution(v_id,now(),120,jsonb_build_array('qa://return'),null);
 supplement:=public.tms_get_order_execution_supplement_secure((created->>'orderId')::uuid);
 IF (SELECT status FROM public.tms_waybill WHERE id=v_id)<>'completed' OR jsonb_array_length(supplement->'loading')<1 OR jsonb_array_length(supplement->'unloading')<1 OR jsonb_array_length(supplement->'signatures')<1 THEN RAISE EXCEPTION 'lifecycle readback incomplete %',supplement;
END IF;
 IF fixture.tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9'::uuid THEN v_qa_order:=(created->>'orderId')::uuid;
 ELSE v_other_order:=(created->>'orderId')::uuid;
END IF;
 v_count:=v_count+1;
END LOOP;
 IF v_count<>2 THEN RAISE EXCEPTION 'expected two full lifecycles';
END IF;
 PERFORM set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
 PERFORM set_config('request.headers','{"x-art-tenant-scope":"2824c2b5-2774-4781-b995-f55e8bcee920"}',true);
 supplement:=public.tms_get_order_execution_supplement_secure(v_qa_order);
 IF jsonb_array_length(supplement->'loading')<1 OR jsonb_array_length(supplement->'unloading')<1
 OR jsonb_array_length(supplement->'signatures')<1 THEN RAISE EXCEPTION 'ordinary own supplement hidden';
END IF;
 v_denied:=false;
 BEGIN PERFORM public.tms_get_order_execution_supplement_secure(v_other_order);
 EXCEPTION WHEN insufficient_privilege THEN v_denied:=true;
END;
 IF NOT v_denied THEN RAISE EXCEPTION 'forged tenant read foreign return supplement';
END IF;
 END $test$;
SELECT 'verified_two_return_lifecycles_with_route_and_config' AS result;
ROLLBACK;

