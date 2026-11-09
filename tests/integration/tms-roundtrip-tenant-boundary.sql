-- Round-trip reads and child creation respect the authenticated tenant.
begin;

do $check$
declare
  v_forward uuid := '5897bebd-c163-4e69-8754-a862cc9ea998';
  v_other_forward uuid := 'f9600000-0000-4000-8000-000000000001';
  v_order_id uuid;
  v_tenant_id uuid;
  v_order public.tms_order%rowtype;
  v_created jsonb;
  v_candidates jsonb;
  v_denied boolean;
begin
  select order_id,tenant_id into v_order_id,v_tenant_id
  from public.tms_waybill where id=v_forward;
  select * into strict v_order from public.tms_order where id=v_order_id;

  perform set_config('request.jwt.claims',
    '{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
  perform set_config('request.headers','{}',true);
  v_candidates:=public.tms_list_return_trip_candidates_secure(v_order_id);
  if not exists(select 1 from jsonb_array_elements(v_candidates) c
      where (c->>'id')::uuid=v_forward) then
    raise exception 'Platform-all cannot read forward candidate';
  end if;
  v_created:=public.tms_create_empty_return_secure(v_forward,jsonb_build_object(
    'origin_station',v_order.destination_station,
    'destination_station',v_order.origin_station,
    'remark','全部租户下继承父单租户'));
  if (select tenant_id from public.tms_waybill
      where id=(v_created->>'waybillId')::uuid) is distinct from v_tenant_id then
    raise exception 'Platform-all child did not inherit forward tenant';
  end if;

  perform set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope',v_tenant_id)::text,true);
  perform public.tms_list_return_trip_candidates_secure(v_order_id);
  perform set_config('request.headers',
    '{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
  v_denied:=false;
  begin
    perform public.tms_list_return_trip_candidates_secure(v_order_id);
  exception when insufficient_privilege then v_denied:=true;
  end;
  if not v_denied then raise exception 'Platform-selected cross-tenant read was accepted'; end if;

  perform set_config('request.jwt.claims',
    '{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
  perform set_config('request.headers','{}',true);
  perform public.tms_list_return_trip_candidates_secure(v_order_id);
  perform set_config('request.headers',
    '{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
  perform public.tms_list_return_trip_candidates_secure(v_order_id);
  v_denied:=false;
  begin
    perform public.tms_create_empty_return_secure(v_other_forward,jsonb_build_object(
      'origin_station','测试起点','destination_station','测试终点'));
  exception when insufficient_privilege then v_denied:=true;
  end;
  if not v_denied then raise exception 'Ordinary cross-tenant empty return was accepted'; end if;

  perform set_config('request.jwt.claims',
    '{"sub":"0d0ca69b-9efb-4a13-b33e-ab689e8f70a0","role":"authenticated"}',true);
  v_denied:=false;
  begin
    perform public.tms_create_empty_return_secure(v_forward,jsonb_build_object(
      'origin_station',v_order.destination_station,
      'destination_station',v_order.origin_station));
  exception when insufficient_privilege then v_denied:=true;
  end;
  if not v_denied then raise exception 'Actor without AddReturnTrip created an empty return'; end if;
end $check$;

rollback;
