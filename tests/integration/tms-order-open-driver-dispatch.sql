-- Remote integration fixture: two different tenant-owned source orders, secure order creation,
-- current dispatch-plan RPC, driver eligibility, waybill allocation, and transaction rollback.
-- Requires the linked project's platform-super fixture account and the two source orders below.
begin;
select set_config('request.jwt.claims','{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
select set_config('request.headers','{}',true);
do $$
declare
  v_source public.tms_order%rowtype;
  v_created jsonb;
  v_order_id uuid;
  v_vehicle public.mdm_vehicle%rowtype;
  v_driver public.mdm_driver%rowtype;
  v_waypoints uuid[];
  v_dispatched jsonb;
  v_order_json jsonb;
  v_waybill_json jsonb;
  v_waybill public.tms_waybill%rowtype;
  v_count integer := 0;
begin
  for v_source in
    select * from public.tms_order where id in (
      'a8fd42f0-20ac-4832-99e3-a82bed6eca11'::uuid,
      '9a9679c3-1b4e-4e01-8012-60b1087e0fb7'::uuid
    ) order by id
  loop
    perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',v_source.tenant_id)::text,true);
    select * into v_vehicle from public.mdm_vehicle
    where tenant_id=v_source.tenant_id and audit_status='approved'
    order by create_time desc limit 1;
    if not found then raise exception '验收租户无已审核车辆：%',v_source.tenant_id; end if;
    select * into v_driver from public.mdm_driver d
    where d.tenant_id=v_source.tenant_id
      and app_private.tms_dispatch_driver_eligible(d.id,d.tenant_id)
    order by d.id limit 1;
    if not found then raise exception '验收租户无可配载司机：%',v_source.tenant_id; end if;
    select array_agg(id order by id) into v_waypoints from (
      select s.id from public.mdm_station s
      join public.tms_station_role r on r.station_id=s.id and r.tenant_id=s.tenant_id
      where s.tenant_id=v_source.tenant_id and s.enabled and r.role_type='transfer'
      order by s.id limit 3
    ) stations;
    if cardinality(v_waypoints) < 2 then
      raise exception '验收租户缺少两条可用途经站：%',v_source.tenant_id;
    end if;

    v_created := public.tms_create_order_with_contract_secure(jsonb_build_object(
      'order_no','', 'order_status','pending_load',
      'origin_station',v_source.origin_station,
      'destination_station',v_source.destination_station,
      'transfer_station_id',v_waypoints[1],
      'transfer_station_ids',to_jsonb(v_waypoints),
      'delivery_method',v_source.delivery_method,
      'shipping_customer_id',v_source.shipping_customer_id,
      'receiving_customer_id',v_source.receiving_customer_id,
      'shipping_contact_name',v_source.shipping_contact_name,
      'shipping_contact_phone',v_source.shipping_contact_phone,
      'shipping_address_detail',v_source.shipping_address_detail,
      'receiving_contact_name',v_source.receiving_contact_name,
      'receiving_contact_phone',v_source.receiving_contact_phone,
      'receiving_address_detail',v_source.receiving_address_detail,
      'cargo_items',jsonb_build_array(jsonb_build_object('cargo_name','开单配载验收货物','quantity',1,'unit','件','weight_kg',100,'volume_m3',1)),
      'cargo_quantity_total',1,'cargo_weight_total',100,'cargo_volume_total',1,
      'transport_fee',100,'total_fee',100,'payment_method',v_source.payment_method,
      'transport_mode',coalesce(v_source.transport_mode,'road'),
      'order_config',coalesce(v_source.order_config,'{}'::jsonb) || jsonb_build_object(
        'payable',coalesce(v_source.order_config->'payable','{}'::jsonb) || jsonb_build_object(
          'driver_settlement_method','receipt_payment',
          'carrier_settlement_method','receipt_payment'
        )
      ),
      'order_remark','[开单配载双单验收]'
    ),null);
    v_order_id := (v_created->>'id')::uuid;
    if v_order_id is null then raise exception '开单 RPC 未返回订单 id：%',v_created; end if;

    v_dispatched := public.tms_create_dispatch_plan_secure(jsonb_build_object(
      'kind','single','executions',jsonb_build_array(jsonb_build_object(
        'dispatch_mode','legacy_vehicle',
        'dispatch_vehicle_id',v_vehicle.id,'dispatch_driver_id',v_driver.id,
        'planned_departure_time',now()+interval '1 day',
        'planned_arrival_time',now()+interval '2 days',
        'certificate_risk_override',true,
        'certificate_risk_override_reason','开单配载事务验收',
        'allocations',jsonb_build_array(jsonb_build_object(
          'order_id',v_order_id,
          'lines',jsonb_build_array(jsonb_build_object(
            'line_index',0,'quantity',1,'weight_kg',100,'volume_m3',1
          ))
        ))
      ))
    ));
    if not exists(select 1 from public.tms_order o join public.tms_waybill w
      on w.order_id=o.id and w.tenant_id=o.tenant_id
      where o.id=v_order_id and o.dispatch_status='loaded'
        and w.driver_id=v_driver.id and w.vehicle_id=v_vehicle.id
        and w.status='pending' and exists (
          select 1 from public.tms_waybill_order_allocation a
          where a.order_id=o.id and a.waybill_id=w.id and a.quantity=1
        ))
    then raise exception '开单后司机配载未形成一致订单和运单：%',v_dispatched; end if;
    select * into v_source from public.tms_order where id=v_order_id;
    if v_source.transfer_station_ids is distinct from v_waypoints then
      raise exception '途经点顺序未随开单保存：%',v_order_id;
    end if;
    if v_source.order_config#>>'{payable,driver_settlement_method}' is distinct from 'receipt_payment'
      or v_source.order_config#>>'{payable,carrier_settlement_method}' is distinct from 'receipt_payment'
    then raise exception '回单付未随开单持久化：%',v_order_id; end if;
    v_order_json := app_private.tms_order_to_secure_json(v_source,'tms.order','{}'::jsonb,null);
    select * into v_waybill from public.tms_waybill
      where order_id=v_order_id and tenant_id=v_source.tenant_id
      order by create_time desc limit 1;
    v_waybill_json := app_private.tms_waybill_to_secure_json(v_waybill,'{}'::jsonb);
    if v_order_json->>'driver_ownership' is distinct from (
      select profile.driver_ownership from public.tms_driver_profile profile
      where profile.driver_id=v_driver.id and profile.tenant_id=v_source.tenant_id
    ) then raise exception '订单司机归属投影不匹配：%',v_order_id; end if;
    if not exists (
      select 1 from jsonb_array_elements(v_order_json->'source_order_refs') ref
      where ref->>'id'=v_order_id::text
    ) or not exists (
      select 1 from jsonb_array_elements(v_waybill_json->'source_order_refs') ref
      where ref->>'id'=v_order_id::text
    ) then raise exception '订单或运单缺少可导航原订单来源：%',v_order_id; end if;
    v_count := v_count+1;
  end loop;
  if v_count<>2 then raise exception '实际仅验收 % 条订单',v_count; end if;
end $$;
do $driver_gate$
declare
  v_driver public.mdm_driver%rowtype;
  v_rejected boolean;
  v_count integer := 0;
begin
  for v_driver in select * from public.mdm_driver where id in (
    '530bad76-9129-4456-8920-5be4a524cfe6',
    '44e8419f-fc44-463b-ab94-383db2f7961d'
  ) loop
    perform app_private.tms_assert_driver_certified(v_driver.tenant_id,v_driver.id,'individual_driver');
    insert into public.sys_param (
      tenant_id,param_name,param_key,group_code,group_name,param_type,
      default_value,param_value,enabled
    ) values (
      v_driver.tenant_id,'司机认证要求','tms.driver.require_certification',
      'tms','运输','boolean','false','true',true
    );
    v_rejected := false;
    begin
      perform app_private.tms_assert_driver_certified(v_driver.tenant_id,v_driver.id,'individual_driver');
    exception when check_violation then v_rejected := true;
    end;
    if not v_rejected then raise exception '强制认证未拦截未认证司机：%',v_driver.id; end if;
    update public.sys_param set param_value='false'
      where tenant_id=v_driver.tenant_id and param_key='tms.driver.require_certification';
    perform app_private.tms_assert_driver_certified(v_driver.tenant_id,v_driver.id,'individual_driver');
    update public.mdm_driver set enabled=false where id=v_driver.id;
    v_rejected := false;
    begin
      perform app_private.tms_assert_driver_certified(v_driver.tenant_id,v_driver.id,'individual_driver');
    exception when check_violation then v_rejected := true;
    end;
    if not v_rejected then raise exception '停用司机仍通过验收：%',v_driver.id; end if;
    v_count := v_count+1;
  end loop;
  if v_count<>2 then raise exception '司机资格验收仅找到 % 条真实司机',v_count; end if;
  select * into v_driver from public.mdm_driver
    where id='1cd61841-a100-4a2d-9f4e-7e6f03677b13';
  v_rejected := false;
  begin
    perform app_private.tms_assert_driver_certified(v_driver.tenant_id,v_driver.id,'individual_driver');
  exception when check_violation then v_rejected := true;
  end;
  if not v_rejected then raise exception '黑名单司机仍通过验收'; end if;
end $driver_gate$;
select count(*) as verified_order_driver_pairs from public.tms_order
where order_remark='[开单配载双单验收]';
do $mask$
declare v_order public.tms_order%rowtype; v_json jsonb;
begin
  select * into v_order from public.tms_order
    where id='a9fc0005-1023-4620-9220-000000000003';
  v_order.order_config := jsonb_build_object(
    'payable',jsonb_build_object('freight',123),
    'attachment_urls',jsonb_build_array('proof'),
    'loading',jsonb_build_object(
      'load_ticket_urls',jsonb_build_array('ticket'),
      'load_photo_urls',jsonb_build_array('photo'),
      'unload_ticket_urls',jsonb_build_array('unload'),
      'unload_photo_urls',jsonb_build_array('unload-photo')
    )
  );
  v_json := app_private.tms_order_to_secure_json(v_order,'tms.order',
    jsonb_build_object('freightAmounts','hidden','proofAttachments','hidden'),null);
  if v_json#>'{order_config,payable}' is not null
    or v_json#>'{order_config,attachment_urls}' is not null
    or v_json#>'{order_config,loading,load_ticket_urls}' is not null
    or v_json#>'{order_config,loading,load_photo_urls}' is not null
    or v_json#>'{order_config,loading,unload_ticket_urls}' is not null
    or v_json#>'{order_config,loading,unload_photo_urls}' is not null then
    raise exception '订单配置泄露受保护的应付或凭证';
  end if;
end $mask$;
set local role authenticated;
do $scope$
declare
  v_super text := '0a872664-874c-447d-a256-d0dbdca6ed45';
  v_ordinary text := 'ab881b32-87d4-4dce-9014-ce488b8069df';
  v_qa text := '7529f951-938e-4e2c-ac0d-316c136ae1f9';
  v_other text := '2824c2b5-2774-4781-b995-f55e8bcee920';
  v_qa_order uuid := 'a9fc0005-1023-4620-9220-000000000003';
  v_other_order uuid := '80f79a8f-fc08-48f3-a6f2-8beb0a68171f';
  v_list jsonb;
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_super,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  if public.tms_get_order_detail_secure(v_qa_order)->>'driver_ownership' is distinct from 'carrier'
    or public.tms_get_order_detail_secure(v_other_order)->>'driver_ownership' is distinct from 'self'
  then raise exception '平台全部租户订单归属投影错误'; end if;
  v_list := public.tms_list_orders_secure(p_scope=>'loaded_waybill_list',p_record_id=>v_qa_order);
  if v_list#>>'{records,0,driver_ownership}' is distinct from 'carrier'
  then raise exception '已配载工作台缺少司机归属'; end if;
  v_list := public.tms_list_orders_secure(
    p_scope=>'loaded_waybill_list',
    p_record_id=>'80f79a8f-fc08-48f3-a6f2-8beb0a68171f'
  );
  if v_list#>>'{records,0,has_return_trip}' is distinct from 'true'
  then raise exception '返程开单未标记返程配货'; end if;
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',v_qa)::text,true);
  if public.tms_get_order_detail_secure(v_qa_order) is null
    or public.tms_get_order_detail_secure(v_other_order) is not null
  then raise exception '平台指定租户范围失效'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_ordinary,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  if public.tms_get_order_detail_secure(v_qa_order) is null
  then raise exception '普通用户本租户订单不可读'; end if;
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',v_other)::text,true);
  if public.tms_get_order_detail_secure(v_qa_order) is null
    or public.tms_get_order_detail_secure(v_other_order) is not null
  then raise exception '普通用户伪造租户请求越权'; end if;
end $scope$;
rollback;
