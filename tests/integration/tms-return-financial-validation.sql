begin;

do $test$
declare
  v_waybill_id uuid := '5897bebd-c163-4e69-8754-a862cc9ea998';
  v_order public.tms_order%rowtype;
  v_customer_id uuid;
  v_payload jsonb;
  v_key text;
  v_bad text;
  v_rejected integer := 0;
  v_created jsonb;
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',
    true
  );
  perform set_config('request.headers', '{}', true);
  select o.* into strict v_order from public.tms_order o
  join public.tms_waybill w on w.order_id=o.id where w.id=v_waybill_id;
  select id into v_customer_id from public.mdm_customer
  where tenant_id = (select tenant_id from public.tms_waybill where id = v_waybill_id)
    and enabled order by id limit 1;
  if v_customer_id is null then raise exception 'Return-trip QA customer missing'; end if;
  v_payload := jsonb_build_object(
    'origin_station', v_order.destination_station,
    'destination_station', v_order.origin_station,
    'return_customer_id', v_customer_id
  );

  foreach v_key in array array[
    'freight_income', 'information_fee', 'technical_service_fee',
    'direct_toll_fee', 'direct_misc_fee'
  ] loop
    foreach v_bad in array array['-0.01', '10000000000', 'NaN', 'Infinity', '0.001'] loop
      begin
        perform public.tms_create_return_leg_secure(
          v_waybill_id,
          v_payload || jsonb_build_object(v_key, v_bad)
        );
        raise exception 'Invalid return amount passed: %=%', v_key, v_bad;
      exception when check_violation then
        v_rejected := v_rejected + 1;
      end;
    end loop;
  end loop;
  foreach v_bad in array array['-1', '101', 'NaN', 'Infinity', '0.001'] loop
    begin
      perform public.tms_create_return_leg_secure(
        v_waybill_id,
        v_payload || jsonb_build_object('shared_cost_allocation_pct', v_bad)
      );
      raise exception 'Invalid return allocation passed: %', v_bad;
    exception when check_violation then
      v_rejected := v_rejected + 1;
    end;
  end loop;
  if v_rejected <> 30 then raise exception 'Validation cases missing: %', v_rejected; end if;
  if exists (select 1 from public.tms_waybill_leg l
    join public.tms_waybill w on w.id=l.waybill_id
    where w.forward_waybill_id=v_waybill_id and l.leg_kind='return') then
    raise exception 'Rejected amounts persisted a return dispatch';
  end if;

  v_created := public.tms_create_return_leg_secure(
    v_waybill_id,
    v_payload || jsonb_build_object(
      'freight_income', 9999999999.99,
      'information_fee', 0,
      'technical_service_fee', 0,
      'direct_toll_fee', 0,
      'direct_misc_fee', 0,
      'shared_cost_allocation_pct', 100
    )
  );
  if (select forward_waybill_id from public.tms_waybill
      where id=(v_created->>'waybill_id')::uuid) is distinct from v_waybill_id
    or (select freight_income from public.tms_waybill_leg
      where id = (v_created->>'id')::uuid) <> 9999999999.99 then
    raise exception 'Valid upper-bound amount was not accepted';
  end if;
end
$test$;

rollback;
