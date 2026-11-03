-- Four energy-card lists share tenant-safe ownership/type filtering and redacted phone output.
begin;
do $test$
declare
  super_actor uuid;
  ordinary_actor uuid := 'ab881b32-87d4-4dce-9014-ce488b8069df';
  other_tenant uuid := '111e83d3-190e-4405-84c8-440d484d13a6';
  result jsonb;
  item jsonb;
  page_name text;
  expected_phone text;
begin
  select auth_user_id into super_actor from public.sys_user
  where user_roles @> array['R_SUPER'] and auth_user_id is not null limit 1;
  if super_actor is null then raise exception 'Platform actor unavailable'; end if;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', super_actor::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', super_actor, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{}', true);
  for page_name, result in
    select 'fuel-card', public.vms_list_fuel_cards_secure(p_vehicle_ownership=>'carrier',p_vehicle_type=>'半挂车')
    union all select 'fuel-ledger', public.vms_list_fuel_card_entries_secure(p_vehicle_ownership=>'carrier',p_vehicle_type=>'半挂车')
    union all select 'electric-card', public.vms_list_electric_cards_secure_v2(p_vehicle_ownership=>'carrier',p_vehicle_type=>'半挂车')
    union all select 'electric-ledger', public.vms_list_electric_card_entries_secure_v2(p_vehicle_ownership=>'carrier',p_vehicle_type=>'半挂车')
  loop
    if (result->>'total')::integer < 1 then raise exception '% classification lost matching data', page_name; end if;
    for item in select value from jsonb_array_elements(result->'records') loop
      if item->>'vehicleOwnership' <> 'carrier' then raise exception '% ownership leak', page_name; end if;
      execute 'reset role';
      select app_private.tms_driver_option_to_secure_json(d)->>'phone' into expected_phone
        from public.mdm_vehicle v left join public.mdm_driver d on d.id=v.primary_driver_id and d.tenant_id=v.tenant_id
        where v.id=(item->>'vehicleId')::uuid;
      execute 'set local role authenticated';
      if item ? 'driverPhone' and item->>'driverPhone' is distinct from expected_phone
      then raise exception '% exposed unredacted driver phone', page_name; end if;
      if item ? 'vehicleDriverPhone' and item->>'vehicleDriverPhone' is distinct from expected_phone
      then raise exception '% exposed unredacted vehicle driver phone', page_name; end if;
    end loop;
  end loop;
  perform set_config('request.headers', jsonb_build_object('x-art-tenant-scope',other_tenant)::text, true);
  if (public.vms_list_fuel_cards_secure(p_vehicle_ownership=>'carrier')->>'total')::integer <> 0
    or (public.vms_list_electric_cards_secure_v2(p_vehicle_ownership=>'carrier')->>'total')::integer <> 0
  then raise exception 'Platform selected tenant leaked energy cards'; end if;
  perform set_config('request.jwt.claim.sub', ordinary_actor::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', ordinary_actor, 'role', 'authenticated')::text, true);
  if (public.vms_list_fuel_cards_secure(p_vehicle_ownership=>'carrier',p_vehicle_type=>'半挂车')->>'total')::integer <> 1
    or (public.vms_list_electric_cards_secure_v2(p_vehicle_ownership=>'carrier',p_vehicle_type=>'半挂车')->>'total')::integer <> 1
  then raise exception 'Forged tenant scope changed ordinary card results'; end if;
  execute 'reset role';
end $test$;
rollback;
