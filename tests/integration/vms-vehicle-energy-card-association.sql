begin;
do $test$
declare
 v_uid uuid:='0a872664-874c-447d-a256-d0dbdca6ed45';
 v_vehicle uuid; v_tenant uuid; v_fuel uuid; v_electric uuid;
 v_result jsonb; v_blocked boolean;
begin
 perform set_config('request.jwt.claim.sub',v_uid::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_uid,'role','authenticated')::text,true);
 perform set_config('request.headers','{}',true);
 select id,tenant_id into v_vehicle,v_tenant from public.mdm_vehicle where audit_status='approved' order by id limit 1;
 if v_vehicle is null then raise exception 'Approved vehicle fixture missing'; end if;
 perform public.vms_update_vehicle_archive_secure(v_vehicle,'{"is_new_energy":false}'::jsonb);
 v_fuel:=public.vms_create_fuel_card('QA-ENERGY-FUEL-ROLLBACK',v_vehicle);
 v_blocked:=false;
 begin perform public.vms_create_electric_card('QA-ENERGY-WRONG-ROLLBACK',v_vehicle);
 exception when sqlstate '23514' then v_blocked:=true; end;
 if not v_blocked then raise exception 'Electric card accepted combustion vehicle'; end if;
 perform public.vms_update_vehicle_archive_secure(v_vehicle,'{"is_new_energy":true}'::jsonb);
 v_blocked:=false;
 begin perform public.vms_create_fuel_card('QA-ENERGY-WRONG-ROLLBACK',v_vehicle);
 exception when sqlstate '23514' then v_blocked:=true; end;
 if not v_blocked then raise exception 'Fuel card accepted electric vehicle'; end if;
 v_electric:=public.vms_create_electric_card('QA-ENERGY-ELECTRIC-ROLLBACK',v_vehicle,p_opening_balance=>10);
 v_result:=public.vms_list_electric_cards_secure_v2(p_vehicle_id=>v_vehicle);
 if not exists(select 1 from jsonb_array_elements(v_result->'records') r where (r->>'id')::uuid=v_electric)
    or exists(select 1 from jsonb_array_elements(v_result->'records') r where (r->>'vehicleId')::uuid<>v_vehicle) then
  raise exception 'Electric archive vehicle filter failed';
 end if;
 v_result:=public.vms_list_electric_card_entries_secure_v2(p_vehicle_id=>v_vehicle);
 if (v_result->>'total')::integer<1 or exists(select 1 from jsonb_array_elements(v_result->'records') r where (r->>'vehicleId')::uuid<>v_vehicle) then
  raise exception 'Electric ledger vehicle filter failed';
 end if;
 if (public.vms_list_electric_card_entries_secure_v2(p_vehicle_id=>'00000000-0000-4000-8000-000000000001')->>'total')::integer<>0 then
  raise exception 'Electric filter count ignores vehicle';
 end if;
 v_result:=public.vms_list_energy_vehicle_options_secure(true,0,499);
 if exists(select 1 from jsonb_array_elements(v_result->'records') r where not (r->>'is_new_energy')::boolean) then raise exception 'Electric selector includes fuel vehicle'; end if;
 -- A concrete platform selection cannot read the card from a different tenant.
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',case when v_tenant='7529f951-938e-4e2c-ac0d-316c136ae1f9' then '2824c2b5-2774-4781-b995-f55e8bcee920' else '7529f951-938e-4e2c-ac0d-316c136ae1f9' end)::text,true);
 if (public.vms_list_electric_cards_secure_v2(p_vehicle_id=>v_vehicle)->>'total')::integer<>0
   or (public.vms_list_electric_card_entries_secure_v2(p_vehicle_id=>v_vehicle)->>'total')::integer<>0 then
  raise exception 'Selected tenant electric reads leaked';
 end if;
end $test$;
rollback;
