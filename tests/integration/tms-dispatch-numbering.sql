-- New single, batch, split and merged executions share source-order numbering.
-- Every synthetic order and execution is rolled back.
begin;
do $check$
declare
  source public.tms_order%rowtype;
  carrier uuid;
  created jsonb;
  order_ids uuid[] := '{}';
  executions jsonb;
  allocation jsonb;
  result jsonb;
  execution jsonb;
  item jsonb;
  rows jsonb;
  i integer;
  n integer;
  kind text;
  expected text;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
  perform set_config('request.headers',
    '{"x-art-tenant-scope":"2824c2b5-2774-4781-b995-f55e8bcee920"}',true);
  select * into strict source from public.tms_order
  where id='a8fd42f0-20ac-4832-99e3-a82bed6eca11';
  select id into strict carrier from public.mdm_carrier
  where tenant_id=source.tenant_id and enabled order by id limit 1;

  for i in 1..6 loop
    n:=case when i=4 then 2 else 1 end;
    created:=public.tms_create_order_with_contract_secure(jsonb_build_object(
      'order_no','','order_status','pending_load',
      'origin_station',source.origin_station,'destination_station',source.destination_station,
      'origin_station_id',source.origin_station_id,'destination_station_id',source.destination_station_id,
      'delivery_method',source.delivery_method,
      'shipping_customer_id',source.shipping_customer_id,'receiving_customer_id',source.receiving_customer_id,
      'shipping_contact_name',source.shipping_contact_name,'shipping_contact_phone',source.shipping_contact_phone,
      'shipping_address_detail',source.shipping_address_detail,
      'receiving_contact_name',source.receiving_contact_name,'receiving_contact_phone',source.receiving_contact_phone,
      'receiving_address_detail',source.receiving_address_detail,
      'cargo_items',jsonb_build_array(jsonb_build_object(
        'cargo_name','调度编号回滚验证','quantity',n,'unit','件','weight_kg',100*n,'volume_m3',n)),
      'cargo_quantity_total',n,'cargo_weight_total',100*n,'cargo_volume_total',n,
      'transport_fee',100*n,'total_fee',100*n,'payment_method',source.payment_method,
      'transport_mode',coalesce(source.transport_mode,'road'),
      'order_config',coalesce(source.order_config,'{}'::jsonb)||'{"allow_consolidation":true}'::jsonb,
      'order_remark','[调度编号事务回滚验收]'),null);
    order_ids:=array_append(order_ids,(created->>'id')::uuid);
  end loop;

  foreach kind in array array['single','batch','split','merge'] loop
    executions:='[]'::jsonb;
    for i in 1..case when kind in ('batch','split') then 2 else 1 end loop
      allocation:=jsonb_build_array(jsonb_build_object(
        'order_id',order_ids[case kind when 'single' then 1 when 'batch' then i+1
          when 'split' then 4 else 5 end],
        'lines',jsonb_build_array(jsonb_build_object(
          'line_index',0,'quantity',1,'weight_kg',100,'volume_m3',1))));
      if kind='merge' then
        allocation:=allocation||jsonb_build_array(jsonb_build_object('order_id',order_ids[6],
          'lines',jsonb_build_array(jsonb_build_object(
            'line_index',0,'quantity',1,'weight_kg',100,'volume_m3',1))));
      end if;
      executions:=executions||jsonb_build_array(jsonb_build_object(
        'dispatch_mode','carrier','dispatch_carrier_id',carrier,
        'planned_departure_time',now()+interval '1 day',
        'planned_arrival_time',now()+interval '2 days','allocations',allocation));
    end loop;
    result:=public.tms_create_dispatch_plan_secure(jsonb_build_object(
      'kind',case when kind='batch' then 'single' else kind end,'executions',executions));
    if jsonb_array_length(result->'waybill_ids')<>jsonb_array_length(executions) then
      raise exception 'Dispatch result count changed for %',kind;
    end if;
    for i in 0..jsonb_array_length(result->'waybill_ids')-1 loop
      select jsonb_build_object('id',w.id,'waybillNo',w.waybill_no,'orderNo',o.order_no)
        into execution from public.tms_waybill w join public.tms_order o on o.id=w.order_id
      where w.id=(result->'waybill_ids'->>i)::uuid;
      expected:=execution->>'orderNo'||'-'||lpad((case when kind='split' then i+1 else 1 end)::text,2,'0');
      if execution->>'waybillNo' is distinct from expected
        or result->'waybill_nos'->>i is distinct from expected then
        raise exception 'Source-order suffix missing for %: % / %',kind,execution,result;
      end if;
    end loop;
  end loop;

  -- The existing empty-return row must carry its real dispatch type to the table.
  perform set_config('request.headers','{}',true);
  rows:=public.tms_list_dispatch_workbench_secure('loaded',0,20,false,
    jsonb_build_object('cargo_keyword','YD202611-007-R01'));
  select value into item from jsonb_array_elements(rows->'records')
  where value->>'waybill_no'='YD202611-007-R01';
  if item->>'dispatch_type' is distinct from 'return_empty'
    or item->>'execution_kind' is distinct from 'return_trip'
    or item->>'forward_waybill_id' is null or item->>'forward_waybill_no' is null then
    raise exception 'Return dispatch identity omitted from loaded workbench';
  end if;
end $check$;
rollback;
