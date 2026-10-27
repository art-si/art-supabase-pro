-- Cost evidence stays under the FMS permission boundary; VMS private voucher
-- paths must not contain URLs from the separate public attachments bucket.
begin;

select set_config('request.jwt.claims',
  '{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}', true);
select set_config('request.headers',
  '{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}', true);

update public.tms_waybill_cost
set attachments = (
  select attachments
  from public.tms_waybill_cost
  where cost_no = 'YDFY202610-0006'
)
where cost_no = 'YDFY202610-0019'
  and tenant_id = '7529f951-938e-4e2c-ac0d-316c136ae1f9';

do $qa$
declare
  v_cost public.tms_waybill_cost%rowtype;
  v_hidden jsonb;
begin
  select * into strict v_cost from public.tms_waybill_cost
  where cost_no = 'YDFY202610-0019';
  if jsonb_array_length(v_cost.attachments) = 0 then
    raise exception 'Source fixture has no cost evidence';
  end if;
  v_hidden := app_private.tms_waybill_cost_to_secure_json(
    app_private.tms_waybill_cost_raw_json(v_cost.id),
    v_cost.created_by_user_id,
    '{"expenseEvidence":"hidden"}'::jsonb
  );
  if v_hidden ? 'attachments' then
    raise exception 'FMS field policy exposed hidden evidence';
  end if;
  if (select count(*) from public.vms_fuel_card_entry
      where source_cost_id = v_cost.id and entry_type = 'consume') <> 1 then
    raise exception 'Evidence edit changed fuel-card posting count';
  end if;
end $qa$;

set local role authenticated;
do $qa$
declare
  v_cost_id uuid := '30b497fa-ee80-4afc-b638-bcf3568d8f9a';
  v_entry_id uuid := '97af7227-cf5e-4ec4-a9e5-545892f7858b';
  v_cost jsonb;
  v_ledger jsonb;
begin
  v_cost := public.tms_get_waybill_cost_secure(v_cost_id);
  if jsonb_array_length(v_cost->'attachments') = 0 then
    raise exception 'Authorized FMS viewer cannot see cost evidence';
  end if;
  v_ledger := public.vms_list_fuel_card_entries_secure(p_ids => array[v_entry_id]);
  if v_ledger->'records'->0->>'sourceCostId' is distinct from v_cost_id::text then
    raise exception 'VMS ledger lost its source-cost link';
  end if;
  if jsonb_array_length(v_ledger->'records'->0->'voucherPaths') <> 0 then
    raise exception 'VMS private vouchers contain a foreign-bucket reference';
  end if;

  perform set_config('request.jwt.claims',
    '{"sub":"9850d41a-77e9-40a7-b2cb-0ad02ac01440","role":"authenticated"}', true);
  begin
    perform public.tms_get_waybill_cost_secure(v_cost_id);
    raise exception 'User without FMS View obtained source evidence';
  exception when insufficient_privilege then null;
  end;
end $qa$;

select 'FMS evidence and VMS source link remain permission separated' result;
rollback;
