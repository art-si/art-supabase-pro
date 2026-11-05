-- Uses two existing orders and two existing drivers; all mutations roll back.
begin;

do $test$
declare
  order_ids uuid[];
  driver_ids uuid[];
  v_order_id uuid;
  v_driver_id uuid;
  one_order public.tms_order%rowtype;
  driver_row public.mdm_driver%rowtype;
  supplement jsonb;
  rejected boolean;
begin
  select array_agg(id order by id) into order_ids from (
    select id from public.tms_order order by id limit 2
  ) sample;
  select array_agg(id order by id) into driver_ids from (
    select id from public.mdm_driver order by id limit 2
  ) sample;
  if cardinality(order_ids) <> 2 or cardinality(driver_ids) <> 2 then
    raise exception 'Need two real orders and two real drivers for this check';
  end if;

  foreach v_order_id in array order_ids loop
    select * into one_order from public.tms_order where id=v_order_id;
    rejected:=false;
    begin
      update public.tms_order set order_config=order_config || jsonb_build_object(
        'payable',jsonb_build_object('freight',-1)) where id=one_order.id;
    exception when check_violation then rejected:=true;
    end;
    if not rejected then raise exception 'Negative payable amount accepted for order %',one_order.id; end if;

    rejected:=false;
    begin
      update public.tms_order set transfer_station_ids=array[
        gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()
      ] where id=one_order.id;
    exception when check_violation then rejected:=true;
    end;
    if not rejected then raise exception 'Four transfer stations accepted for order %',one_order.id; end if;
  end loop;

  foreach v_driver_id in array driver_ids loop
    select * into driver_row from public.mdm_driver where id=v_driver_id;
    if app_private.tms_dispatch_driver_eligible(driver_row.id,driver_row.tenant_id)
      and (not driver_row.enabled or driver_row.is_blacklisted or exists(
        select 1 from public.tms_waybill w where w.driver_id=driver_row.id
          and w.tenant_id=driver_row.tenant_id and w.status not in ('completed','cancelled')
      )) then
      raise exception 'Ineligible driver appeared available: %',driver_row.id;
    end if;
  end loop;
end;
$test$;

set local role authenticated;
do $scope$
declare
  order_id uuid;
  order_tenant uuid;
  response jsonb;
  rejected boolean;
  own_order_id uuid;
  other_order_id uuid;
begin
  perform set_config('request.jwt.claim.sub','0a872664-874c-447d-a256-d0dbdca6ed45',true);
  perform set_config('request.jwt.claims','{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
  perform set_config('request.headers','{}',true);
  for order_id,order_tenant in select o.id,o.tenant_id from public.tms_order o order by o.id limit 2 loop
    response:=public.tms_get_order_execution_supplement_secure(order_id);
    if jsonb_typeof(response->'loading')<>'array' or jsonb_typeof(response->'unloading')<>'array'
      or jsonb_typeof(response->'signatures')<>'array'
      or jsonb_typeof(response->'carrier_reconciliation')<>'array' then
      raise exception 'Execution supplement has invalid shape for order %',order_id;
    end if;
    perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',order_tenant)::text,true);
    response:=public.tms_get_order_execution_supplement_secure(order_id);
    if response is null then raise exception 'Selected-tenant order supplement missing'; end if;
    perform set_config('request.headers','{}',true);
  end loop;

  select o.id into own_order_id from public.tms_order o
  where o.tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9' order by o.id limit 1;
  select o.id into other_order_id from public.tms_order o
  where o.tenant_id<>'7529f951-938e-4e2c-ac0d-316c136ae1f9' order by o.id limit 1;
  perform set_config('request.jwt.claim.sub','ab881b32-87d4-4dce-9014-ce488b8069df',true);
  perform set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
  perform set_config('request.headers','{"x-art-tenant-scope":"028e6a68-a9db-4055-974c-1e05bfe94b0f"}',true);
  if own_order_id is not null then
    response:=public.tms_get_order_execution_supplement_secure(own_order_id);
    if response is null then raise exception 'Ordinary own-tenant supplement missing'; end if;
  end if;
  if other_order_id is not null then
    rejected:=false;
    begin
      perform public.tms_get_order_execution_supplement_secure(other_order_id);
    exception when insufficient_privilege then rejected:=true;
    end;
    if not rejected then raise exception 'Forged ordinary scope exposed other-tenant order'; end if;
  end if;
end;
$scope$;

rollback;
