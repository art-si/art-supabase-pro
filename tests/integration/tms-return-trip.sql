begin;

do $test$
declare
  v_waybill_id uuid := '5897bebd-c163-4e69-8754-a862cc9ea998';
  v_order public.tms_order%rowtype;
  v_forward_revenue numeric;
  v_other_tenant_waybill_id uuid := 'f9600000-0000-4000-8000-000000000001';
  v_before_cost_count bigint;
  v_after_cost_count bigint;
  v_before_fms_profit numeric;
  v_after_fms_profit numeric;
  v_created jsonb;
  v_summary jsonb;
  v_return_customer_id uuid;
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',
    true
  );
  perform set_config('request.headers', '{}', true);
  select o.* into strict v_order from public.tms_order o
  join public.tms_waybill w on w.order_id=o.id where w.id=v_waybill_id;
  select coalesce(sum(freight_amount),0) into v_forward_revenue
  from public.tms_waybill_order_allocation where waybill_id=v_waybill_id;
  if not app_private.has_permission('TmsOrderList:AddReturnTrip') then
    raise exception 'QA actor lacks return-trip permission';
  end if;

  select count(*) into v_before_cost_count from public.tms_waybill_cost
  where waybill_id = v_waybill_id;
  select gross_profit into v_before_fms_profit from public.tms_waybill_profit
  where waybill_id = v_waybill_id;
  select id into v_return_customer_id from public.mdm_customer
  where tenant_id = (select tenant_id from public.tms_waybill where id = v_waybill_id)
    and enabled order by id limit 1;
  if v_return_customer_id is null then
    raise exception 'Return-trip QA tenant needs an enabled customer';
  end if;

  v_created := public.tms_create_return_leg_secure(
    v_waybill_id,
    '{"distance_km":1300,"cargo_weight_tons":12,"cargo_volume_m3":26,"freight_income":1800,"information_fee":100,"technical_service_fee":50,"direct_toll_fee":200,"direct_misc_fee":20,"shared_cost_allocation_pct":35}'::jsonb
      || jsonb_build_object('return_customer_id', v_return_customer_id,
        'origin_station',v_order.destination_station,'destination_station',v_order.origin_station)
  );
  if v_created->>'forward_waybill_id' is distinct from v_waybill_id::text
    or (select forward_waybill_id from public.tms_waybill
        where id=(v_created->>'waybill_id')::uuid) is distinct from v_waybill_id
    or (select waybill_no from public.tms_waybill
        where id=(v_created->>'waybill_id')::uuid) not like '%-R01' then
    raise exception 'R01 was not linked to the forward execution';
  end if;
  if (select count(*) from public.tms_waybill_leg
      where waybill_id = v_waybill_id and leg_kind='forward') <> 1
    or (select count(*) from public.tms_waybill_leg
      where waybill_id=(v_created->>'waybill_id')::uuid and leg_kind='return') <> 1 then
    raise exception 'Forward and return must have one own leg each';
  end if;

  v_summary := public.tms_get_return_trip_summary_secure(v_waybill_id);
  if (v_summary->>'forwardRevenue')::numeric <> v_forward_revenue
    or (v_summary->>'returnRevenue')::numeric <> 1800
    or (v_summary->>'tripPlannedRevenue')::numeric <> v_forward_revenue+1800
    or (v_summary->>'returnProjectedGrossProfit') is null
    or v_summary->>'accountingStatus' <> 'planned_only' then
    raise exception 'Trip revenue or return profit calculation drifted: %', v_summary;
  end if;

  select count(*) into v_after_cost_count from public.tms_waybill_cost
  where waybill_id = v_waybill_id;
  select gross_profit into v_after_fms_profit from public.tms_waybill_profit
  where waybill_id = v_waybill_id;
  if v_after_cost_count <> v_before_cost_count
    or v_after_fms_profit is distinct from v_before_fms_profit then
    raise exception 'Planned return leg must not post or duplicate actual cost';
  end if;

  v_created := public.tms_create_return_leg_secure(
    v_waybill_id,
    '{"freight_income":100}'::jsonb
      || jsonb_build_object('return_customer_id', v_return_customer_id,
        'origin_station',v_order.origin_station,'destination_station',v_order.destination_station)
  );
  if (select waybill_no from public.tms_waybill
      where id=(v_created->>'waybill_id')::uuid) not like '%-R02'
    or (select forward_waybill_id from public.tms_waybill
      where id=(v_created->>'waybill_id')::uuid) is distinct from v_waybill_id then
    raise exception 'Second return must use R02 and the same forward parent';
  end if;

  begin
    perform public.tms_get_return_trip_summary_secure(v_other_tenant_waybill_id);
    raise exception 'Cross-tenant summary unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
end
$test$;

rollback;
