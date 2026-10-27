-- Run with MCP execute_sql. All fixture writes are rolled back.
begin;
set local role authenticated;

do $qa$
declare
  v_waybill uuid := 'baee5a01-6ac6-4fd9-858a-67ffd14e554a';
  v_fuel_item uuid := '92026e97-3118-4347-9237-07d56c61de84';
  v_card uuid := '4dd0014c-cb7a-45dd-aa5f-efff5bcc89cb';
  v_options jsonb;
  v_cost uuid;
  v_count integer;
  v_sum numeric;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}', true);
  perform set_config('request.headers', '{}', true);
  v_options := public.tms_list_waybill_fuel_card_options_secure(v_waybill);
  if jsonb_array_length(v_options) <> 1 or (v_options->0->>'id')::uuid <> v_card then
    raise exception 'Platform all-tenant card list failed';
  end if;

  perform set_config('request.headers',
    '{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}', true);
  v_options := public.tms_list_waybill_fuel_card_options_secure(v_waybill);
  if jsonb_array_length(v_options) <> 1 then
    raise exception 'Platform selected-tenant card list failed';
  end if;

  perform set_config('request.headers',
    '{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}', true);
  begin
    perform public.tms_list_waybill_fuel_card_options_secure(v_waybill);
    raise exception 'Platform selected-foreign tenant leaked cards';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claims',
    '{"sub":"5774aa51-3bbb-4da5-abd4-7ea44b44ea6a","role":"authenticated"}', true);
  perform set_config('request.headers', '{}', true);
  v_options := public.tms_list_waybill_fuel_card_options_secure(v_waybill);
  if jsonb_array_length(v_options) <> 1 then
    raise exception 'Ordinary own-tenant card list failed';
  end if;
  perform set_config('request.headers',
    '{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}', true);
  v_options := public.tms_list_waybill_fuel_card_options_secure(v_waybill);
  if jsonb_array_length(v_options) <> 1 or (v_options->0->>'id')::uuid <> v_card then
    raise exception 'Forged ordinary tenant header changed card scope';
  end if;

  -- Finance Add permission is sufficient. It does not require VMS ledger permission.
  v_cost := (public.tms_save_waybill_cost_secure(null, jsonb_build_object(
    'waybill_id', v_waybill, 'expense_item_id', v_fuel_item,
    'amount', 25, 'occurred_on', current_date,
    'payment_channel', '油卡', 'fuel_card_id', v_card,
    'remark', 'QA FMS/VMS transactional regression'
  ))->>'id')::uuid;
  select count(*), sum(signed_amount) into v_count, v_sum
  from public.vms_fuel_card_entry where source_cost_id = v_cost;
  if v_count <> 1 or v_sum <> -25 then raise exception 'Initial debit failed'; end if;

  perform public.tms_save_waybill_cost_secure(v_cost, jsonb_build_object(
    'waybill_id', v_waybill, 'expense_item_id', v_fuel_item,
    'amount', 25, 'occurred_on', current_date,
    'payment_channel', '油卡', 'fuel_card_id', v_card
  ));
  select count(*) into v_count from public.vms_fuel_card_entry where source_cost_id = v_cost;
  if v_count <> 1 then raise exception 'Repeated save double-debited card'; end if;

  perform public.tms_save_waybill_cost_secure(v_cost, jsonb_build_object(
    'waybill_id', v_waybill, 'expense_item_id', v_fuel_item,
    'amount', 30, 'occurred_on', current_date,
    'payment_channel', '油卡', 'fuel_card_id', v_card
  ));
  select count(*), sum(signed_amount) into v_count, v_sum
  from public.vms_fuel_card_entry where source_cost_id = v_cost;
  if v_count <> 3 or v_sum <> -30 then raise exception 'Edit did not reverse and repost'; end if;

  -- Restore platform-selected context to exercise authorized void.
  perform set_config('request.jwt.claims',
    '{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}', true);
  perform set_config('request.headers',
    '{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}', true);
  perform public.tms_void_waybill_cost_secure(v_cost, 'QA regression');
  select count(*), sum(signed_amount) into v_count, v_sum
  from public.vms_fuel_card_entry where source_cost_id = v_cost;
  if v_count <> 4 or v_sum <> 0 then raise exception 'Void did not restore balance'; end if;

  begin
    perform public.tms_save_waybill_cost_secure(null, jsonb_build_object(
      'waybill_id', v_waybill, 'expense_item_id', v_fuel_item,
      'amount', 3, 'payment_channel', '油卡',
      'fuel_card_id', 'cc57cff8-2ee4-4c7d-bc02-a28e2f5ce4aa'
    ));
    raise exception 'Another vehicle card was accepted';
  exception when check_violation then
    if sqlerrm not like '%车辆或租户%' then raise; end if;
  end;
end $qa$;

select 'FMS/VMS fuel-card tenant and lifecycle checks passed' result;
rollback;
