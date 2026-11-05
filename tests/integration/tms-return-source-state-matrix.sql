-- Real pending source progresses through six secured execution states.
-- Each state creates a sibling return inside a nested rollback; cancelled source is denied.
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
SELECT set_config('request.headers','{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}',true);
DO $test$
DECLARE s public.tms_order%rowtype; w public.tms_waybill%rowtype; a public.tms_waybill_order_allocation%rowtype;
  v_payload jsonb; v_created jsonb; v_stage text; v_count int:=0; v_blocked boolean;
BEGIN
 SELECT * INTO STRICT s FROM public.tms_order WHERE id='116d4c15-1cde-4c5d-ab03-a5cef9bd800d';
 SELECT * INTO STRICT w FROM public.tms_waybill WHERE id='5897bebd-c163-4e69-8754-a862cc9ea998';
 SELECT * INTO STRICT a FROM public.tms_waybill_order_allocation WHERE waybill_id=w.id;
 v_payload:=jsonb_build_object('order_no','','order_status','pending_load',
  'origin_station',s.destination_station,'destination_station',s.origin_station,
  'delivery_method',s.delivery_method,'shipping_contact_name',s.receiving_contact_name,
  'shipping_contact_phone',s.receiving_contact_phone,'shipping_address_detail',s.receiving_address_detail,
  'receiving_contact_name',s.shipping_contact_name,'receiving_contact_phone',s.shipping_contact_phone,
  'receiving_address_detail',s.shipping_address_detail,'cargo_items',s.cargo_items,
  'cargo_quantity_total',s.cargo_quantity_total,'cargo_weight_total',s.cargo_weight_total,
  'cargo_volume_total',s.cargo_volume_total,'transport_fee',100,'total_fee',100,
  'payment_method',s.payment_method,'transport_mode',s.transport_mode,
  'shipping_longitude',112.89926,'shipping_latitude',33.994075,
  'receiving_longitude',115.962574,'receiving_latitude',32.322418,
  'order_config',jsonb_build_object('load_type','ltl','billing_mode','quantity','billing_unit','piece',
    'cargo_category','general','packaging','bulk','transport_requirements','[]'::jsonb,'attachment_urls','[]'::jsonb));
 FOREACH v_stage IN ARRAY ARRAY['pending','accepted','loading','transporting','signed','completed'] LOOP
  IF v_stage='accepted' THEN PERFORM public.tms_accept_assigned_waybill(w.id);
  ELSIF v_stage='loading' THEN
    PERFORM public.tms_check_in_waybill_cargo_operation(w.id,'loading',w.shipper_longitude,w.shipper_latitude);
    PERFORM public.tms_complete_waybill_cargo_operation(w.id,'loading',1,jsonb_build_array('qa://load'),jsonb_build_array('qa://ticket'),null);
  ELSIF v_stage='transporting' THEN
    PERFORM public.tms_record_waybill_departure(w.id,now(),100,jsonb_build_array('qa://depart'),null);
  ELSIF v_stage='signed' THEN
    PERFORM public.tms_check_in_waybill_cargo_operation(w.id,'unloading',w.receiver_longitude,w.receiver_latitude);
    PERFORM public.tms_complete_waybill_cargo_operation(w.id,'unloading',1,jsonb_build_array('qa://unload'),jsonb_build_array('qa://unload-ticket'),null);
    PERFORM public.tms_sign_execution_allocations_secure(w.id,now(),'QA签收人',
      jsonb_build_array('qa://receipt'),jsonb_build_array('qa://signature'),null,
      jsonb_build_array(jsonb_build_object('allocation_id',a.id,'signed_quantity',a.quantity,'exception_quantity',0)));
  ELSIF v_stage='completed' THEN
    PERFORM public.tms_complete_waybill_execution(w.id,now(),120,jsonb_build_array('qa://return'),null);
  END IF;
  IF (SELECT status FROM public.tms_waybill WHERE id=w.id) IS DISTINCT FROM v_stage THEN
    RAISE EXCEPTION 'source stage did not reach %',v_stage;
  END IF;
  BEGIN
    v_created:=public.tms_create_return_order_secure(s.id,w.id,v_payload);
    IF v_created->>'waybillId' IS NULL THEN RAISE EXCEPTION 'return missing at %',v_stage; END IF;
    RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='rollback staged return';
  EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
  END;
  v_count:=v_count+1;
 END LOOP;
 IF v_count<>6 THEN RAISE EXCEPTION 'tested % stages',v_count; END IF;
 v_blocked:=false;
 BEGIN
   PERFORM public.tms_create_return_order_secure('17c34905-facd-45f0-94cf-7ec5946f4614',
     '222cca9e-2f03-4b3e-8dee-e133c5dd8f37',v_payload);
 EXCEPTION WHEN foreign_key_violation THEN v_blocked:=true;
 END;
 IF NOT v_blocked THEN RAISE EXCEPTION 'cancelled source waybill accepted'; END IF;
END $test$;
ROLLBACK;

