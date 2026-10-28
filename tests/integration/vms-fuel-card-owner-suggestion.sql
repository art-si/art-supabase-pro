-- Run in a transaction: the suggestion must mirror the create-time fallback without exposing
-- another tenant's driver-to-employee linkage.
begin;
set local role authenticated;
do $test$
declare
  v_vehicle uuid := 'd7670b37-2283-433e-95d2-7315829b0edc';
  v_ordinary uuid := 'ab881b32-87d4-4dce-9014-ce488b8069df';
  v_super uuid := '0a872664-874c-447d-a256-d0dbdca6ed45';
  v_other_tenant uuid := '2824c2b5-2774-4781-b995-f55e8bcee920';
  v_suggestion jsonb;
  v_denied boolean;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub',v_ordinary,'role','authenticated')::text, true);
  perform set_config('request.headers', '{}', true);
  v_suggestion := public.vms_fuel_card_owner_suggestion_secure(v_vehicle);
  if v_suggestion->>'employeeId' <> '2048f969-c68d-46c4-e572-7236b59a547c'
     or v_suggestion->>'tenantId' <> '7529f951-938e-4e2c-ac0d-316c136ae1f9' then
    raise exception 'Own-tenant driver employee suggestion mismatch';
  end if;

  perform set_config('request.headers', jsonb_build_object('x-art-tenant-scope',v_other_tenant)::text, true);
  if public.vms_fuel_card_owner_suggestion_secure(v_vehicle)->>'employeeId'
       <> v_suggestion->>'employeeId' then
    raise exception 'Forged ordinary tenant header changed owner suggestion';
  end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub',v_super,'role','authenticated')::text, true);
  v_denied := false;
  begin
    perform public.vms_fuel_card_owner_suggestion_secure(v_vehicle);
  exception when insufficient_privilege then v_denied := true;
  end;
  if not v_denied then raise exception 'Platform-selected other tenant leaked owner'; end if;

  perform set_config('request.headers', '{}', true);
  if public.vms_fuel_card_owner_suggestion_secure(v_vehicle)->>'employeeId'
       <> v_suggestion->>'employeeId' then
    raise exception 'Platform-all owner suggestion missing';
  end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub','9850d41a-77e9-40a7-b2cb-0ad02ac01440','role','authenticated')::text, true);
  v_denied := false;
  begin
    perform public.vms_fuel_card_owner_suggestion_secure(v_vehicle);
  exception when insufficient_privilege then v_denied := true;
  end;
  if not v_denied then raise exception 'Unprivileged user received owner suggestion'; end if;
end $test$;
reset role;
select 'fuel-card-owner-suggestion-passed' as result;
rollback;
