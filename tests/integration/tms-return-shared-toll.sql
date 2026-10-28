begin;

do $test$
declare
  v_shared_waybill uuid := 'd30aed6b-6dfa-484c-97af-4f1559fabf2a';
  v_return_waybill uuid := 'a57530d2-b6d7-43e7-89f6-048a32a5891f';
begin
  if position(
    'and leg_id is null' in
    pg_get_functiondef('public.tms_get_return_shared_toll_secure(uuid)'::regprocedure)
  ) = 0 then
    raise exception 'Shared toll reader must exclude costs assigned to a leg';
  end if;

  perform set_config(
    'request.jwt.claims',
    '{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',
    true
  );
  perform set_config('request.headers', '{}', true);
  if public.tms_get_return_shared_toll_secure(v_shared_waybill) <> 50
    or public.tms_get_return_shared_toll_secure(v_return_waybill) <> 0 then
    raise exception 'Platform-all shared toll does not match approved master cost';
  end if;
  perform set_config(
    'request.headers',
    '{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',
    true
  );
  begin
    perform public.tms_get_return_shared_toll_secure(v_shared_waybill);
    raise exception 'Platform-selected cross-tenant shared toll succeeded';
  exception when insufficient_privilege then null;
  end;

  perform set_config(
    'request.jwt.claims',
    '{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',
    true
  );
  perform set_config('request.headers', '{}', true);
  if public.tms_get_return_shared_toll_secure(v_shared_waybill) <> 50 then
    raise exception 'Ordinary own-tenant shared toll failed';
  end if;
  perform set_config(
    'request.headers',
    '{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',
    true
  );
  if public.tms_get_return_shared_toll_secure(v_shared_waybill) <> 50 then
    raise exception 'Forged header changed ordinary tenant scope';
  end if;
  begin
    perform public.tms_get_return_shared_toll_secure('f9600000-0000-4000-8000-000000000001');
    raise exception 'Ordinary cross-tenant shared toll succeeded';
  exception when insufficient_privilege then null;
  end;
end
$test$;

rollback;
