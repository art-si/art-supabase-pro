begin;

do $test$
declare
  v_number_count integer;
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname='public' and tablename='tms_waybill'
      and indexname='tms_waybill_tenant_all_status_no_uk'
      and indexdef not ilike '% where %'
  ) then raise exception 'Waybill number must be unique across every status'; end if;
  if position('YWD' in pg_get_functiondef('public.tms_dispatch_orders(uuid[],jsonb)'::regprocedure))=0
    or position('YWD' in pg_get_functiondef('public.tms_create_dispatch_plan_secure(jsonb)'::regprocedure))=0
  then raise exception 'Both dispatch paths must generate a distinct task number'; end if;
  select jsonb_array_length(snapshot) into v_number_count
  from app_private.backup_20261027_tms_waybill_commission where object_name='waybill_numbers';
  if v_number_count<>37 then raise exception 'Historical number backup is incomplete'; end if;
  if exists (
    select 1 from app_private.backup_20261027_tms_waybill_commission b
    cross join lateral jsonb_array_elements(b.snapshot) old
    left join public.tms_waybill w on w.id=(old->>'id')::uuid
    where b.object_name='waybill_numbers' and w.id is not null
      and w.waybill_no is distinct from old->>'waybill_no'
  ) then raise exception 'Historical task numbers were rewritten'; end if;
end $test$;

set local role authenticated;
do $test$
declare v_result jsonb;
begin
  perform set_config('request.jwt.claims','{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
  perform set_config('request.headers','{}',true);
  v_result:=public.tms_get_waybill_commission_secure('a9fc0006-1023-4620-9220-000000000008');
  if v_result->>'waybillNo'<>'VMS-QA-YD8' then raise exception 'Platform-all read failed'; end if;
  perform set_config('request.headers','{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}',true);
  perform public.tms_get_waybill_commission_secure('a9fc0006-1023-4620-9220-000000000008');
  perform set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
  begin
    perform public.tms_get_waybill_commission_secure('a9fc0006-1023-4620-9220-000000000008');
    raise exception 'Platform-selected cross-tenant read succeeded';
  exception when insufficient_privilege then null; end;

  perform set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
  perform set_config('request.headers','{}',true);
  perform public.tms_get_waybill_commission_secure('a9fc0006-1023-4620-9220-000000000008');
  v_result:=public.tms_override_forward_commission_secure(
    'a9fc0006-1023-4620-9220-000000000008',888,'验收调整正向司机提成'
  );
  if v_result->'estimate'->>'amount'<>'888.00' and v_result->'estimate'->>'amount'<>'888' then
    raise exception 'Manual override was not saved'; end if;
  if jsonb_array_length(public.tms_get_waybill_commission_secure('a9fc0006-1023-4620-9220-000000000008')->'history')<>1
  then raise exception 'Manual override was not audited'; end if;
  perform set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
  perform public.tms_get_waybill_commission_secure('a9fc0006-1023-4620-9220-000000000008');
  begin
    perform public.tms_get_waybill_commission_secure('022f24c7-9854-491b-9a4e-8c85727e1b6f');
    raise exception 'Ordinary user read another tenant';
  exception when insufficient_privilege then null; end;
  begin
    perform public.tms_override_forward_commission_secure(
      '022f24c7-9854-491b-9a4e-8c85727e1b6f',99,'跨租户非法调整'
    );
    raise exception 'Ordinary user changed another tenant';
  exception when insufficient_privilege then null; end;

  perform set_config('request.jwt.claims','{"sub":"5774aa51-3bbb-4da5-abd4-7ea44b44ea6a","role":"authenticated"}',true);
  perform set_config('request.headers','{}',true);
  begin
    perform public.tms_override_forward_commission_secure(
      'a9fc0006-1023-4620-9220-000000000008',99,'无权限调整司机提成'
    );
    raise exception 'Unassigned user changed commission';
  exception when insufficient_privilege then null; end;
end $test$;

reset role;
select set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
select set_config('request.headers','{}',true);
update public.tms_waybill set freight_amount=freight_amount
where id='a9fc0006-1023-4620-9220-000000000008';
do $test$
declare v_customer_id uuid;
begin
  if not exists (
    select 1 from public.tms_waybill_leg
    where waybill_id='a9fc0006-1023-4620-9220-000000000008' and leg_kind='forward'
      and commission_estimate->>'amount' in ('888','888.00')
      and commission_estimate ? 'manualOverride'
  ) then raise exception 'Task edit overwrote the audited manual commission'; end if;
  select id into v_customer_id from public.mdm_customer
  where tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9' and enabled
  order by id limit 1;
  perform public.tms_create_return_leg_secure(
    'a9fc0006-1023-4620-9220-000000000008',
    jsonb_build_object('origin_station','广州','destination_station','上海',
      'freight_income',500,'return_customer_id',v_customer_id)
  );
  if not exists (
    select 1 from public.tms_waybill_leg
    where waybill_id='a9fc0006-1023-4620-9220-000000000008' and leg_kind='forward'
      and commission_estimate->>'amount' in ('888','888.00')
      and commission_estimate ? 'manualOverride'
  ) then raise exception 'Adding return cargo overwrote the audited forward commission'; end if;
end $test$;

rollback;
