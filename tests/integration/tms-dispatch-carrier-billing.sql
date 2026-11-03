-- Execute inside BEGIN/ROLLBACK. Verifies actual dispatch writes account ID and immutable invoice snapshot.
do $test$
declare
  v_order public.tms_order%rowtype;
  v_carrier public.mdm_carrier%rowtype;
  v_account uuid;
  v_actor uuid;
  v_result jsonb;
  v_waybill_id uuid;
  v_plan jsonb;
  v_accept_rejected boolean := false;
  v_mode_rejected boolean := false;
begin
  select o.* into v_order from public.tms_order o
    where o.order_status='pending_load' and o.dispatch_status='pending'
      and jsonb_array_length(o.cargo_items)=1
      and coalesce((o.cargo_items->0->>'quantity')::numeric,0)>0
      and not exists(select 1 from public.tms_waybill w
                     where w.order_id=o.id and w.status<>'cancelled')
    order by o.create_time desc limit 1;
  if v_order.id is null then raise exception 'Need pending single-line order fixture'; end if;
  select * into v_carrier from public.mdm_carrier
    where tenant_id=v_order.tenant_id and enabled order by id limit 1;
  if v_carrier.id is null then raise exception 'Need active same-tenant carrier fixture'; end if;
  select u.auth_user_id into v_actor from public.sys_user u
    join public.sys_tenant t on t.id=u.tenant_id
    where t.builtin_type='platform' and u.system_protected
      and u.status='1' and u.deleted_at is null
    order by u.id limit 1;
  if v_actor is null then raise exception 'Need platform super fixture'; end if;
  insert into public.mdm_carrier_billing_account
    (tenant_id,carrier_id,invoice_title,bank_name,bank_account,is_default)
  values (v_carrier.tenant_id,v_carrier.id,'测试承运商账户','测试银行','6222000000000000',true)
  returning id into v_account;
  v_plan := jsonb_build_object(
    'kind','single',
    'executions',jsonb_build_array(jsonb_build_object(
      'dispatch_mode','carrier','dispatch_carrier_id',v_carrier.id,
      'carrier_billing_account_id',v_account,
      'planned_departure_time',now()+interval '1 hour',
      'planned_arrival_time',now()+interval '5 hours',
      'allocations',jsonb_build_array(jsonb_build_object(
        'order_id',v_order.id,'lines',jsonb_build_array(jsonb_build_object(
          'line_index',0,
          'quantity',(v_order.cargo_items->0->>'quantity')::numeric,
          'weight_kg',coalesce((v_order.cargo_items->0->>'weight_kg')::numeric,0),
          'volume_m3',coalesce((v_order.cargo_items->0->>'volume_m3')::numeric,0)
        ))
      ))
    ))
  );
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_actor,'role','authenticated')::text,true);
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',v_order.tenant_id)::text,true);
  v_result := public.tms_create_dispatch_plan_secure(v_plan);
  v_waybill_id := (v_result->'waybill_ids'->>0)::uuid;
  execute 'reset role';
  if not exists (
    select 1 from public.tms_waybill w
    join public.tms_waybill_carrier_billing_snapshot s on s.waybill_id=w.id
    where w.id=v_waybill_id and w.carrier_id=v_carrier.id
      and w.carrier_billing_account_id=v_account
      and s.billing_account_id=v_account
      and s.invoice_title='测试承运商账户'
      and s.bank_account='6222000000000000'
  ) then raise exception 'Dispatch did not persist carrier account and invoice snapshot'; end if;
  begin
    update public.tms_waybill set status='accepted' where id=v_waybill_id;
  exception when sqlstate '23514' then v_accept_rejected := true;
  end;
  if not v_accept_rejected then
    raise exception 'Carrier waybill accepted without certified driver';
  end if;
  begin
    update public.tms_waybill set dispatch_mode='self_operated' where id=v_waybill_id;
  exception when sqlstate '23514' then v_mode_rejected := true;
  end;
  if not v_mode_rejected then
    raise exception 'Carrier waybill changed mode without certified driver';
  end if;
  raise notice 'Carrier dispatch persisted account ID and snapshot in one transaction';
end $test$;
