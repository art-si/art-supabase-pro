-- Completed historical return orders must resolve to the original forward trip.
-- Read-only assertions run in a rolled-back transaction across all tenant contexts.
begin;
do $check$
declare
  forward_row public.tms_waybill%rowtype;
  return_row public.tms_waybill%rowtype;
  candidates jsonb;
  item jsonb;
  summary jsonb;
  actor uuid;
  scope text;
begin
  select * into strict forward_row from public.tms_waybill
  where waybill_no='YWD2026110600000186';
  select * into strict return_row from public.tms_waybill
  where waybill_no='YD202611-004-R01' and tenant_id=forward_row.tenant_id;
  if forward_row.status<>'completed' or return_row.status<>'completed' then
    raise exception 'Historical completed-return fixture changed';
  end if;

  foreach actor in array array[
    '0a872664-874c-447d-a256-d0dbdca6ed45'::uuid,
    'ab881b32-87d4-4dce-9014-ce488b8069df'::uuid
  ] loop
    perform set_config('request.jwt.claims',jsonb_build_object(
      'sub',actor,'role','authenticated')::text,true);
    foreach scope in array array['',forward_row.tenant_id::text] loop
      perform set_config('request.headers',case when scope='' then '{}'
        else jsonb_build_object('x-art-tenant-scope',scope)::text end,true);
      candidates:=public.tms_list_return_trip_candidates_secure(forward_row.order_id);
      select entry into item from jsonb_array_elements(candidates) entry
      where entry->>'id'=forward_row.id::text;
      if item is null or item->>'hasReturnLeg'<>'true'
        or item->>'canAddReturn'<>'false' then
        raise exception 'Completed forward trip lost its historical return: %',candidates;
      end if;
      candidates:=public.tms_list_return_trip_candidates_secure(return_row.order_id);
      if jsonb_array_length(candidates)<>1
        or candidates->0->>'id'<>forward_row.id::text
        or candidates->0->>'hasReturnLeg'<>'true'
        or candidates->0->>'canAddReturn'<>'false' then
        raise exception 'Return order did not resolve to its exact forward trip: %',candidates;
      end if;
      summary:=public.tms_get_return_trip_summary_secure((candidates->0->>'id')::uuid);
      if not exists(select 1 from jsonb_array_elements(summary->'returns') entry
        where entry->>'waybillId'=return_row.id::text) then
        raise exception 'Historical return is missing from the resolved trip summary';
      end if;
    end loop;
  end loop;

  -- An ordinary user's forged header cannot switch their tenant.
  perform set_config('request.headers',
    '{"x-art-tenant-scope":"2824c2b5-2774-4781-b995-f55e8bcee920"}',true);
  candidates:=public.tms_list_return_trip_candidates_secure(return_row.order_id);
  if candidates->0->>'tenantId'<>forward_row.tenant_id::text then
    raise exception 'Forged header changed the ordinary user tenant';
  end if;
  begin
    perform public.tms_list_return_trip_candidates_secure((select order_id
      from public.tms_waybill where tenant_id<>forward_row.tenant_id
      and order_id is not null order by id limit 1));
    raise exception 'Ordinary user accessed another tenant';
  exception when insufficient_privilege then null;
  end;

  -- A platform administrator's concrete selection remains a read boundary.
  perform set_config('request.jwt.claims',
    '{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
  begin
    perform public.tms_list_return_trip_candidates_secure(return_row.order_id);
    raise exception 'Platform-selected scope accessed a different tenant';
  exception when insufficient_privilege then null;
  end;
end $check$;
rollback;
