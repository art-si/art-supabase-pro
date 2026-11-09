-- Transaction-only proof that multiple return dispatches share one forward trip
-- without copying forward income into a return or empty-return profit row.
begin;

do $check$
declare
  v_forward uuid := '5897bebd-c163-4e69-8754-a862cc9ea998';
  v_customer uuid := 'a9fc0001-1023-4620-9220-000000000001';
  v_loaded jsonb;
  v_empty jsonb;
  v_third jsonb;
  v_summary jsonb;
  v_report jsonb;
  v_loaded_id uuid;
  v_empty_id uuid;
  v_third_id uuid;
  v_forward_amount numeric;
  v_shared_toll numeric;
  v_root_origin text;
  v_root_destination text;
  v_legacy_return uuid;
  v_legacy_forward uuid;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
  perform set_config('request.headers','{}',true);
  select coalesce(sum(a.freight_amount),0) into v_forward_amount
  from public.tms_waybill_order_allocation a where a.waybill_id=v_forward;
  if v_forward_amount=0 then raise exception 'Forward fixture has no allocation'; end if;
  select coalesce(sum(c.amount),0) into v_shared_toll
  from public.tms_waybill_cost c
  where c.waybill_id=v_forward and c.audit_status='approved'
    and c.cost_type='toll' and c.leg_id is null;
  select o.origin_station,o.destination_station
  into strict v_root_origin,v_root_destination
  from public.tms_waybill w join public.tms_order o on o.id=w.order_id
  where w.id=v_forward;

  v_loaded:=public.tms_create_return_leg_secure(v_forward,jsonb_build_object(
    'return_customer_id',v_customer,'origin_station',v_root_destination,
    'destination_station',v_root_origin,
    'freight_income',500,'information_fee',100,'technical_service_fee',50,
    'direct_toll_fee',200,'direct_misc_fee',20,'shared_cost_allocation_pct',60));
  v_loaded_id:=(v_loaded->>'waybill_id')::uuid;
  if v_loaded_id is null or v_loaded_id=v_forward then
    raise exception 'Loaded return did not create an independent dispatch';
  end if;
  v_empty:=public.tms_create_empty_return_secure(v_forward,jsonb_build_object(
    'origin_station',v_root_origin,'destination_station',v_root_destination,
    'remark','事务回滚空载返程核算'));
  v_empty_id:=(v_empty->>'waybillId')::uuid;
  if v_empty_id is null or v_empty_id=v_forward or v_empty_id=v_loaded_id then
    raise exception 'Empty return did not create an independent dispatch';
  end if;
  v_third:=public.tms_create_return_leg_secure(v_forward,jsonb_build_object(
    'return_customer_id',v_customer,'origin_station',v_root_destination,
    'destination_station',v_root_origin,
    'freight_income',200,'shared_cost_allocation_pct',40));
  v_third_id:=(v_third->>'waybill_id')::uuid;
  if v_third_id is null or v_third_id in (v_forward,v_loaded_id,v_empty_id) then
    raise exception 'Third return did not create an independent dispatch';
  end if;
  if (select count(*) from public.tms_waybill
      where id in (v_loaded_id,v_empty_id,v_third_id) and forward_waybill_id=v_forward)<>3
    or (select count(*) from public.tms_waybill
      where id in (v_loaded_id,v_empty_id,v_third_id) and return_sequence in (1,2,3))<>3 then
    raise exception 'Return sequence or forward link is incomplete';
  end if;

  v_summary:=public.tms_get_return_trip_summary_secure(v_forward);
  if (v_summary->>'forwardWaybillId')::uuid<>v_forward
    or jsonb_array_length(v_summary->'returns')<>3
    or (v_summary->>'forwardRevenue')::numeric<>v_forward_amount
    or (v_summary->>'returnRevenue')::numeric<>700
    or (v_summary->>'tripPlannedRevenue')::numeric<>v_forward_amount+700
    or (v_summary->>'returnDirectPlannedExpense')::numeric<>370
    or (v_summary->>'returnAllocatedToll')::numeric<>
      round(v_shared_toll*0.6,2)+round(v_shared_toll*0.4,2)
    or (v_summary->>'returnProjectedGrossProfit')::numeric<>
      700-370-(v_summary->>'returnAllocatedToll')::numeric
      -(v_summary->>'returnPlannedCommission')::numeric then
    raise exception 'Multiple return summary counted income or shared cost incorrectly: %',v_summary;
  end if;
  if not exists (select 1 from jsonb_array_elements(v_summary->'returns') item
      where (item->>'waybillId')::uuid=v_loaded_id
        and item->>'dispatchType'='return_load'
        and (item->>'plannedRevenue')::numeric=500)
    or not exists (select 1 from jsonb_array_elements(v_summary->'returns') item
      where (item->>'waybillId')::uuid=v_empty_id
        and item->>'dispatchType'='return_empty'
        and (item->>'plannedRevenue')::numeric=0)
    or not exists (select 1 from jsonb_array_elements(v_summary->'returns') item
      where (item->>'waybillId')::uuid=v_third_id
        and item->>'dispatchType'='return_load'
        and (item->>'plannedRevenue')::numeric=200) then
    raise exception 'Return segment amounts or modes are incorrect';
  end if;
  if (select receivable_amount from public.tms_waybill_profit where waybill_id=v_loaded_id)<>500
    or (select receivable_amount from public.tms_waybill_profit where waybill_id=v_empty_id)<>0
    or (select receivable_amount from public.tms_waybill_profit where waybill_id=v_third_id)<>200 then
    raise exception 'FMS profit view duplicated the forward order revenue';
  end if;
  v_report:=public.tms_return_profit_report_secure(0,100,null,null,
    (select waybill_no from public.tms_waybill where id=v_forward));
  if not exists (select 1 from jsonb_array_elements(v_report->'records') item
      where (item->>'waybillId')::uuid=v_loaded_id
        and (item->>'plannedRevenue')::numeric=500)
    or not exists (select 1 from jsonb_array_elements(v_report->'records') item
      where (item->>'waybillId')::uuid=v_empty_id
        and (item->>'plannedRevenue')::numeric=0)
    or not exists (select 1 from jsonb_array_elements(v_report->'records') item
      where (item->>'waybillId')::uuid=v_third_id
        and (item->>'plannedRevenue')::numeric=200) then
    raise exception 'Return profit report omitted one of the sibling dispatches';
  end if;
  select w.id,o.return_source_waybill_id
  into v_legacy_return,v_legacy_forward
  from public.tms_waybill w join public.tms_order o on o.id=w.order_id
  where o.return_source_waybill_id is not null and w.forward_waybill_id is null
    and w.status<>'cancelled' and w.tenant_id=(select tenant_id from public.tms_waybill
      where id=v_forward)
  order by w.create_time desc limit 1;
  if v_legacy_return is not null then
    v_summary:=public.tms_get_return_trip_summary_secure(v_legacy_forward);
    if not exists (select 1 from jsonb_array_elements(v_summary->'returns') item
      where (item->>'waybillId')::uuid=v_legacy_return) then
      raise exception 'Historical return order lost its forward profit link';
    end if;
  end if;
end $check$;

rollback;
