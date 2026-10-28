-- A return leg belongs to one existing trip. Dispatch must not create a second
-- active master task for the same source order. All business writes roll back.
begin;
select set_config(
  'request.jwt.claims',
  '{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',
  true
);
-- The QA tenant's only unassigned self driver is suspended. Enable this
-- synthetic record inside the rollback transaction for the happy paths.
update public.mdm_driver set enabled = true
where id = '23d00e78-38a8-480d-a4f1-d2e8aa5666f6';
update public.tms_driver_profile set driver_status = 'on_duty'
where driver_id = '23d00e78-38a8-480d-a4f1-d2e8aa5666f6';
-- The business role reads legs through secure RPCs. This transaction-local
-- assertion helper can inspect the private child ledger without broadening grants.
create function pg_temp.qa_forward_income_matches(p_waybill_id uuid)
returns boolean language sql stable security definer set search_path = '' as $helper$
  select exists (
    select 1 from public.tms_waybill_leg l
    join public.tms_waybill_order_allocation a
      on a.waybill_id = l.waybill_id and a.tenant_id = l.tenant_id
    where l.waybill_id = p_waybill_id and l.leg_kind = 'forward'
    group by l.id
    having max(l.freight_income) is not distinct from sum(a.freight_amount)
  )
$helper$;
set local role authenticated;

do $test$
declare
  v_order_id uuid;
  v_order_no text;
  v_plan jsonb;
  v_before_tasks integer;
  v_before_allocations integer;
  v_result jsonb;
  v_first uuid := '9a9679c3-1b4e-4e01-8012-60b1087e0fb7';
  v_merge_first uuid := '9c61f1e6-da91-45c5-9554-6a9486e30dde';
  v_split uuid := '904ab3d7-3113-484f-b7fa-10ffd630f7ba';
  v_carrier uuid := 'a9fc0002-1023-4620-9220-000000000001';
  v_vehicle uuid := 'd7670b37-2283-433e-95d2-7315829b0edc';
  v_merge_vehicle uuid := '5f54e555-9da3-4428-afaf-add1652a3f82';
  v_driver uuid := '23d00e78-38a8-480d-a4f1-d2e8aa5666f6';
  v_return_customer uuid;
  v_split_main uuid;
  v_candidates jsonb;
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',
    true
  );
  perform set_config('request.headers', '{}', true);

  foreach v_order_no in array array['YD202610-011', 'YD202610-012'] loop
    select id into strict v_order_id
    from public.tms_order where order_no = v_order_no
      and tenant_id = '7529f951-938e-4e2c-ac0d-316c136ae1f9';
    select count(*) into v_before_tasks from public.tms_waybill
    where order_id = v_order_id and status <> 'cancelled';
    select count(*) into v_before_allocations from public.tms_waybill_order_allocation
    where order_id = v_order_id;
    v_plan := jsonb_build_object(
      'kind', 'single',
      'executions', jsonb_build_array(jsonb_build_object(
        'dispatch_mode', 'carrier',
        'dispatch_carrier_id', v_carrier,
        'planned_departure_time', '2026-10-29T08:00:00+08:00',
        'planned_arrival_time', '2026-10-30T08:00:00+08:00',
        'allocations', jsonb_build_array(jsonb_build_object(
          'order_id', v_order_id,
          'lines', jsonb_build_array(jsonb_build_object(
            'line_index', 0, 'quantity', 1, 'weight_kg', 0, 'volume_m3', 0
          ))
        ))
      ))
    );
    begin
      perform public.tms_create_dispatch_plan_secure(v_plan);
      raise exception 'Duplicate dispatch was accepted for %', v_order_no;
    exception when check_violation then
      if sqlerrm not like '原始单已有未配载的返程主任务%' then raise; end if;
    end;
    if (select count(*) from public.tms_waybill
        where order_id = v_order_id and status <> 'cancelled') <> v_before_tasks
      or (select count(*) from public.tms_waybill_order_allocation
        where order_id = v_order_id) <> v_before_allocations
      or (select dispatch_status from public.tms_order where id = v_order_id) <> 'pending' then
      raise exception 'Blocked dispatch changed return-trip business data for %', v_order_no;
    end if;
  end loop;

  -- A selected different tenant and an ordinary forged header must not
  -- disclose that the QA order has a return leg.
  perform set_config(
    'request.headers',
    '{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',
    true
  );
  begin
    perform public.tms_create_dispatch_plan_secure(v_plan);
    raise exception 'Platform-selected cross-tenant dispatch was accepted';
  exception when insufficient_privilege then null;
  end;
  perform set_config(
    'request.jwt.claims',
    '{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',
    true
  );
  begin
    perform public.tms_create_dispatch_plan_secure(jsonb_set(
      v_plan,
      '{executions,0,allocations,0,order_id}',
      to_jsonb('6b9b14f0-1e5a-4352-93bf-c7a958257e50'::text)
    ));
    raise exception 'Forged ordinary cross-tenant dispatch was accepted';
  exception when insufficient_privilege then null;
  end;
  -- The forged header cannot hide the actor's own return master either.
  begin
    perform public.tms_create_dispatch_plan_secure(v_plan);
    raise exception 'Ordinary own-tenant duplicate dispatch was accepted';
  exception when check_violation then
    if sqlerrm not like '原始单已有未配载的返程主任务%' then raise; end if;
  end;
  perform set_config('request.headers', '{}', true);
  perform set_config(
    'request.jwt.claims',
    '{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',
    true
  );

  -- A first-time single dispatch still creates its one execution task.
  v_result := public.tms_create_dispatch_plan_secure(jsonb_build_object(
    'kind', 'single',
    'executions', jsonb_build_array(jsonb_build_object(
      'dispatch_mode', 'legacy_vehicle',
      'dispatch_vehicle_id', v_vehicle,
      'dispatch_driver_id', v_driver,
      'planned_departure_time', '2026-10-29T08:00:00+08:00',
      'planned_arrival_time', '2026-10-30T08:00:00+08:00',
      'allocations', jsonb_build_array(jsonb_build_object(
        'order_id', v_first,
        'lines', jsonb_build_array(
          jsonb_build_object('line_index', 0, 'quantity', 1, 'weight_kg', 20, 'volume_m3', 5),
          jsonb_build_object('line_index', 1, 'quantity', 1, 'weight_kg', 10, 'volume_m3', 3)
        )
      ))
    ))
  ));
  if jsonb_array_length(v_result->'waybill_ids') <> 1
    or (select count(*) from public.tms_waybill_order_allocation
        where order_id = v_first) <> 1
    or (select dispatch_status from public.tms_order where id = v_first) <> 'loaded' then
    raise exception 'First single dispatch no longer works';
  end if;

  -- The compatible orders can still merge. Roll this probe back before the
  -- following split probe reuses the second source order.
  begin
    v_result := public.tms_create_dispatch_plan_secure(jsonb_build_object(
      'kind', 'merge',
      'executions', jsonb_build_array(jsonb_build_object(
        'dispatch_mode', 'legacy_vehicle',
        'dispatch_vehicle_id', v_merge_vehicle,
        'dispatch_driver_id', v_driver,
        'planned_departure_time', '2026-09-28T18:00:00+08:00',
        'planned_arrival_time', '2026-09-28T23:00:00+08:00',
        'allocations', jsonb_build_array(
          jsonb_build_object(
            'order_id', v_merge_first,
            'lines', jsonb_build_array(
              jsonb_build_object('line_index', 0, 'quantity', 20, 'weight_kg', 20000, 'volume_m3', 0),
              jsonb_build_object('line_index', 1, 'quantity', 18, 'weight_kg', 18000, 'volume_m3', 0)
            )
          ),
          jsonb_build_object(
            'order_id', v_split,
            'lines', jsonb_build_array(
              jsonb_build_object('line_index', 0, 'quantity', 23, 'weight_kg', 23000, 'volume_m3', 0),
              jsonb_build_object('line_index', 1, 'quantity', 12, 'weight_kg', 12000, 'volume_m3', 0)
            )
          )
        )
      ))
    ));
    if jsonb_array_length(v_result->'waybill_ids') <> 1
      or (select count(*) from public.tms_waybill_order_allocation
          where order_id in (v_merge_first, v_split)) <> 2 then
      raise exception 'Legitimate merge dispatch no longer works';
    end if;
    if not pg_temp.qa_forward_income_matches((v_result->'waybill_ids'->>0)::uuid) then
      raise exception 'Merged forward leg income differs from both allocations';
    end if;
    raise exception 'merge_probe_complete';
  exception when raise_exception then
    if sqlerrm <> 'merge_probe_complete' then raise; end if;
  end;

  -- A partly dispatched source can attach return cargo to one real trip and
  -- then continue split dispatching its remaining forward cargo.
  v_result := public.tms_create_dispatch_plan_secure(jsonb_build_object(
    'kind', 'split',
    'executions', jsonb_build_array(
      jsonb_build_object(
        'dispatch_mode', 'legacy_vehicle',
        'dispatch_vehicle_id', v_vehicle,
        'dispatch_driver_id', v_driver,
        'planned_departure_time', '2026-10-29T08:00:00+08:00',
        'planned_arrival_time', '2026-10-30T08:00:00+08:00',
        'allocations', jsonb_build_array(jsonb_build_object(
          'order_id', v_split,
          'lines', jsonb_build_array(jsonb_build_object(
            'line_index', 0, 'quantity', 10, 'weight_kg', 10000, 'volume_m3', 0
          ))
        ))
      ),
      jsonb_build_object(
        'dispatch_mode', 'legacy_vehicle',
        'dispatch_vehicle_id', v_vehicle,
        'dispatch_driver_id', v_driver,
        'planned_departure_time', '2026-10-29T09:00:00+08:00',
        'planned_arrival_time', '2026-10-30T09:00:00+08:00',
        'allocations', jsonb_build_array(jsonb_build_object(
          'order_id', v_split,
          'lines', jsonb_build_array(jsonb_build_object(
            'line_index', 0, 'quantity', 5, 'weight_kg', 5000, 'volume_m3', 0
          ))
        ))
      )
    )
  ));
  if jsonb_array_length(v_result->'waybill_ids') <> 2
    or (select count(*) from public.tms_waybill_order_allocation
        where order_id = v_split) <> 2
    or (select dispatch_status from public.tms_order where id = v_split) <> 'partial' then
    raise exception 'Partial split dispatch no longer works';
  end if;
  v_candidates := public.tms_list_return_trip_candidates_secure(v_split);
  if jsonb_array_length(v_candidates) <> 2
    or exists (
      select 1 from jsonb_array_elements(v_candidates) candidate
      where candidate->>'hasForwardAllocation' <> 'true'
        or candidate->>'canAddReturn' <> 'true'
    ) then
    raise exception 'Partly dispatched split tasks must be return-trip candidates';
  end if;
  v_split_main := (v_result->'waybill_ids'->>0)::uuid;
  select id into v_return_customer from public.mdm_customer
  where tenant_id = '7529f951-938e-4e2c-ac0d-316c136ae1f9' and enabled
  order by id limit 1;
  if v_return_customer is null then raise exception 'Return customer fixture missing'; end if;
  begin
    perform public.tms_create_return_leg_secure(
      '8be0adc5-10ab-48b0-bc40-8ebceaeb9065',
      jsonb_build_object(
        'return_customer_id', v_return_customer,
        'origin_station', '南京',
        'destination_station', '上海',
        'freight_income', 500
      )
    );
    raise exception 'An unallocated placeholder accepted return cargo';
  exception when check_violation then
    if sqlerrm not like '请先为主运输任务完成正向配载%' then raise; end if;
  end;
  perform public.tms_create_return_leg_secure(
    v_split_main,
    jsonb_build_object(
      'return_customer_id', v_return_customer,
      'origin_station', '六安',
      'destination_station', '平顶山',
      'freight_income', 500
    )
  );
  v_candidates := public.tms_list_return_trip_candidates_secure(v_split);
  if (select candidate->>'canAddReturn' from jsonb_array_elements(v_candidates) candidate
      where candidate->>'id' = v_split_main::text) <> 'false'
    or (select candidate->>'canAddReturn' from jsonb_array_elements(v_candidates) candidate
      where candidate->>'id' <> v_split_main::text limit 1) <> 'true' then
    raise exception 'Return candidate eligibility did not follow each split task';
  end if;
  v_result := public.tms_create_dispatch_plan_secure(jsonb_build_object(
    'kind', 'split',
    'executions', jsonb_build_array(jsonb_build_object(
      'dispatch_mode', 'legacy_vehicle',
      'dispatch_vehicle_id', v_vehicle,
      'dispatch_driver_id', v_driver,
      'planned_departure_time', '2026-10-29T10:00:00+08:00',
      'planned_arrival_time', '2026-10-30T10:00:00+08:00',
      'allocations', jsonb_build_array(jsonb_build_object(
        'order_id', v_split,
        'lines', jsonb_build_array(
          jsonb_build_object('line_index', 0, 'quantity', 8, 'weight_kg', 8000, 'volume_m3', 0),
          jsonb_build_object('line_index', 1, 'quantity', 12, 'weight_kg', 12000, 'volume_m3', 0)
        )
      ))
    ))
  ));
  if jsonb_array_length(v_result->'waybill_ids') <> 1
    or (select count(*) from public.tms_waybill_order_allocation
        where order_id = v_split) <> 3
    or (select dispatch_status from public.tms_order where id = v_split) <> 'loaded' then
    raise exception 'Remaining split cargo cannot dispatch after a return leg';
  end if;
  if exists (
    select 1 from public.tms_waybill w
    where w.order_id in (v_first, v_split) and w.status <> 'cancelled'
      and not pg_temp.qa_forward_income_matches(w.id)
  ) then
    raise exception 'Single or split forward leg income differs from its allocation';
  end if;
  if (public.tms_get_return_trip_summary_secure(v_split_main)->>'tripPlannedRevenue')::numeric
    is distinct from (
      select sum(a.freight_amount) + 500
      from public.tms_waybill_order_allocation a
      where a.waybill_id = v_split_main
    ) then
    raise exception 'Trip summary counted forward revenue more than once';
  end if;
end $test$;

rollback;
