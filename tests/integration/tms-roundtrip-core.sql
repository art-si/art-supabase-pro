-- One forward task owns every return dispatch; all assertions roll back.
begin;

do $check$
declare
  v_forward uuid := '5897bebd-c163-4e69-8754-a862cc9ea998';
  v_order public.tms_order%rowtype;
  v_parent public.tms_waybill%rowtype;
  v_customer uuid;
  v_base text;
  v_r01 jsonb;
  v_r02 jsonb;
  v_r03 jsonb;
  v_r100 jsonb;
  v_denied boolean;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
  perform set_config('request.headers','{}',true);
  select * into strict v_parent from public.tms_waybill where id=v_forward;
  select * into strict v_order from public.tms_order where id=v_parent.order_id;
  select id into strict v_customer from public.mdm_customer
    where tenant_id=v_parent.tenant_id and enabled order by id limit 1;
  v_base:=app_private.tms_return_number_base(v_forward);

  v_r01:=public.tms_create_return_leg_secure(v_forward,jsonb_build_object(
    'return_customer_id',v_customer,'origin_station',v_order.destination_station,
    'destination_station',v_order.origin_station,'freight_income',500,
    'shared_cost_allocation_pct',60));
  v_r02:=public.tms_create_empty_return_secure(v_forward,jsonb_build_object(
    'origin_station',v_order.origin_station,'destination_station',v_order.destination_station));
  v_r03:=public.tms_create_return_leg_secure(v_forward,jsonb_build_object(
    'return_customer_id',v_customer,'origin_station',v_order.destination_station,
    'destination_station',v_order.origin_station,'freight_income',200,
    'shared_cost_allocation_pct',40));

  if (select count(*) from public.tms_waybill w
      where w.id in ((v_r01->>'waybill_id')::uuid,(v_r02->>'waybillId')::uuid,
        (v_r03->>'waybill_id')::uuid)
        and w.forward_waybill_id=v_forward
        and w.tenant_id=v_parent.tenant_id
        and w.waybill_no=v_base||'-R'||lpad(w.return_sequence::text,2,'0'))<>3
    or (select array_agg(return_sequence order by return_sequence) from public.tms_waybill
      where forward_waybill_id=v_forward) is distinct from array[1,2,3]
    or (select count(*) from public.tms_waybill
      where forward_waybill_id=v_forward and dispatch_type='return_empty')<>1 then
    raise exception 'R01 loaded, R02 empty, R03 loaded numbering or parent drifted';
  end if;

  v_denied:=false;
  begin
    perform public.tms_create_return_leg_secure(v_forward,jsonb_build_object(
      'return_customer_id',v_customer,'origin_station',v_order.origin_station,
      'destination_station',v_order.destination_station,'freight_income',100,
      'shared_cost_allocation_pct',1));
  exception when check_violation then v_denied:=true;
  end;
  if not v_denied then raise exception 'Shared cost allocation exceeded 100 percent'; end if;

  insert into public.tms_waybill(
    tenant_id,waybill_no,order_id,execution_kind,dispatch_type,
    forward_waybill_id,return_sequence,dispatch_mode,status,driver_id,vehicle_id,
    origin_city,destination_city,shipper_name,shipper_phone,shipper_address,
    receiver_name,receiver_phone,receiver_address,
    cargo_name,cargo_weight_ton,cargo_volume_m3,
    cargo_quantity,freight_amount)
  values(v_parent.tenant_id,v_base||'-R99',v_parent.order_id,'return_trip','return_empty',
    v_forward,99,v_parent.dispatch_mode,'pending',v_parent.driver_id,v_parent.vehicle_id,
    v_order.destination_station,v_order.origin_station,
    v_parent.receiver_name,v_parent.receiver_phone,v_parent.receiver_address,
    v_parent.shipper_name,v_parent.shipper_phone,v_parent.shipper_address,
    '序号边界验证',0,0,'0',0);
  v_r100:=public.tms_create_empty_return_secure(v_forward,jsonb_build_object(
    'origin_station',v_order.origin_station,'destination_station',v_order.destination_station));
  if v_r100->>'waybillNo' is distinct from v_base||'-R100'
    or (v_r100->>'returnSequence')::integer<>100 then
    raise exception 'R100 suffix was truncated: %',v_r100;
  end if;

  v_denied:=false;
  begin update public.tms_waybill set waybill_no=waybill_no||'-X' where id=v_forward;
  exception when check_violation then v_denied:=true; end;
  if not v_denied then raise exception 'Forward dispatch number was mutable'; end if;
  v_denied:=false;
  begin update public.tms_waybill set dispatch_type='return_load' where id=v_forward;
  exception when check_violation then v_denied:=true; end;
  if not v_denied then raise exception 'Forward dispatch type was mutable'; end if;
  v_denied:=false;
  begin update public.tms_waybill set forward_waybill_id=(v_r01->>'waybill_id')::uuid
    where id=v_forward;
  exception when check_violation then v_denied:=true; end;
  if not v_denied then raise exception 'Forward parent was mutable'; end if;

  v_denied:=false;
  begin
    insert into public.tms_waybill(
      tenant_id,waybill_no,order_id,execution_kind,dispatch_type,
      forward_waybill_id,return_sequence,dispatch_mode,status,driver_id,vehicle_id,
      origin_city,destination_city,cargo_name,cargo_weight_ton,cargo_volume_m3,
      cargo_quantity,freight_amount)
    values('2824c2b5-2774-4781-b995-f55e8bcee920'::uuid,
      v_base||'-R101',v_parent.order_id,'return_trip','return_empty',
      v_forward,101,v_parent.dispatch_mode,'pending',v_parent.driver_id,v_parent.vehicle_id,
      v_order.destination_station,v_order.origin_station,'跨租户父单验证',0,0,'0',0);
  exception when check_violation then v_denied:=true; end;
  if not v_denied then raise exception 'Cross-tenant return parent was accepted'; end if;
end $check$;

rollback;
