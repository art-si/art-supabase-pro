-- Existing supplier, inspection, part and vehicle fixtures. All claims are rolled back.
BEGIN;
SET LOCAL ROLE authenticated;
do $test$
declare
  r jsonb;
  baseline jsonb;
  old_supplier uuid := '70673e08-9851-438d-840e-d9caa6da2638';
  other_supplier uuid := '1b59ebbf-815b-492b-974c-2deb7cdca8cd';
  own_inspection uuid := 'b563dabd-3fbc-46c1-b114-033838c58841';
  ids uuid[] := array[old_supplier,other_supplier];
begin
  perform set_config('request.jwt.claims','{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
  perform set_config('request.headers','{}',true);
  r := public.vms_list_vehicle_suppliers_secure(p_ids=>ids,p_purpose=>'options');
  if (r->>'total')::int <> 2 then raise exception 'platform all supplier options expected two, got %',r; end if;
  r := public.vms_get_fleet_health_workspace(p_keyword=>'冀D28951D');
  if (r->'overview'->>'total')::int <> 1 then raise exception 'platform all fleet expected one approved vehicle, got %',r->'overview'; end if;
  perform set_config('request.headers','{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}',true);
  r := public.vms_list_vehicle_suppliers_secure(p_ids=>ids,p_purpose=>'options');
  if (r->>'total')::int <> 1 or (r->'records'->0->>'id')::uuid <> old_supplier then raise exception 'selected 7529 supplier options wrong: %',r; end if;
  r := public.vms_get_fleet_health_workspace(p_keyword=>'冀D28951D');
  if (r->'overview'->>'total')::int <> 1 then raise exception 'selected 7529 fleet expected one, got %',r->'overview'; end if;
  if public.vms_get_vehicle_inspection_secure(own_inspection) is null then raise exception 'selected 7529 inspection missing'; end if;
  if public.vms_get_vehicle_insurance_secure('14e16f64-f368-4469-8b6a-1847194392db') is null then raise exception 'selected 7529 insurance detail missing'; end if;
  if jsonb_array_length(public.vms_get_vehicle_insurance_expiry_context_secure()) < 1 then raise exception 'selected 7529 insurance context missing'; end if;
  perform set_config('request.headers','{"x-art-tenant-scope":"111e83d3-190e-4405-84c8-440d484d13a6"}',true);
  r := public.vms_list_vehicle_suppliers_secure(p_ids=>ids,p_purpose=>'options');
  if (r->>'total')::int <> 1 or (r->'records'->0->>'id')::uuid <> other_supplier then raise exception 'selected 111e supplier options wrong: %',r; end if;
  perform set_config('request.headers','{"x-art-tenant-scope":"2824c2b5-2774-4781-b995-f55e8bcee920"}',true);
  r := public.vms_get_fleet_health_workspace(p_keyword=>'冀D28951D');
  if (r->'overview'->>'total')::int <> 0 then raise exception 'selected QA fleet leaked other tenant: %',r->'overview'; end if;
  if public.vms_get_vehicle_inspection_secure(own_inspection) is not null then raise exception 'selected QA inspection detail leaked'; end if;
  if public.vms_get_vehicle_insurance_secure('14e16f64-f368-4469-8b6a-1847194392db') is not null then raise exception 'selected QA insurance detail leaked'; end if;
  if jsonb_array_length(public.vms_get_vehicle_insurance_expiry_context_secure()) <> 0 then raise exception 'selected QA insurance context leaked'; end if;
  if jsonb_array_length(public.vms_get_vehicle_accident_health_context_secure()) <> 0
     or jsonb_array_length(public.vms_get_vehicle_inspection_expiry_context_secure()) <> 0
     or jsonb_array_length(public.vms_get_vehicle_maintenance_health_context_secure()) <> 0
     or jsonb_array_length(public.vms_get_vehicle_mileage_health_context_secure()) <> 0
     or jsonb_array_length(public.vms_get_vehicle_routine_inspection_health_context_secure()) <> 0
  then raise exception 'selected QA fleet health context leaked'; end if;
  r := public.vms_get_vehicle_part_health_context_secure();
  if jsonb_array_length(r) <> 1 or r->0->>'part_name' <> 'QA演示·防滑绑带' then raise exception 'selected QA part health context wrong: %',r; end if;
  perform set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
  perform set_config('request.headers','{}',true);
  baseline := public.vms_list_vehicle_suppliers_secure(p_ids=>ids,p_purpose=>'options');
  if (baseline->>'total')::int <> 1 or (baseline->'records'->0->>'id')::uuid <> old_supplier then raise exception 'ordinary own supplier options wrong: %',baseline; end if;
  perform set_config('request.headers','{"x-art-tenant-scope":"2824c2b5-2774-4781-b995-f55e8bcee920"}',true);
  r := public.vms_list_vehicle_suppliers_secure(p_ids=>ids,p_purpose=>'options');
  if r <> baseline then raise exception 'ordinary forged header changed supplier options'; end if;
  r := public.vms_get_fleet_health_workspace(p_keyword=>'冀D28951D');
  if (r->'overview'->>'total')::int <> 1 then raise exception 'ordinary forged header changed fleet scope: %',r->'overview'; end if;
  if public.vms_get_vehicle_inspection_secure(own_inspection) is null then raise exception 'ordinary forged header lost own inspection'; end if;
  if public.vms_get_vehicle_insurance_secure('14e16f64-f368-4469-8b6a-1847194392db') is null then raise exception 'ordinary forged header lost own insurance detail'; end if;
  if jsonb_array_length(public.vms_get_vehicle_insurance_expiry_context_secure()) < 1 then raise exception 'ordinary forged header changed insurance context'; end if;
end $test$;
RESET ROLE;
ROLLBACK;
