-- Parts reference options keep the selected target tenant without broadening supplier access.
begin;
do $test$
declare
  super_actor uuid := '0a872664-874c-447d-a256-d0dbdca6ed45';
  ordinary_actor uuid := '5774aa51-3bbb-4da5-abd4-7ea44b44ea6a';
  own_tenant uuid := '7529f951-938e-4e2c-ac0d-316c136ae1f9';
  other_tenant uuid := '67c9741f-c98a-4cd1-a7ec-0ebd5ed5b61d';
  result jsonb;
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',super_actor::text,true);
  perform set_config('request.headers','{}',true);
  result := public.vms_list_vehicle_supplier_options_for_tenant_secure(own_tenant);
  if (result->>'total')::integer <> 3
    or exists (select 1 from jsonb_array_elements(result->'records') item
      where item->>'tenant_id' <> own_tenant::text)
  then raise exception 'Platform all-tenant target returned mixed suppliers'; end if;

  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',own_tenant)::text,true);
  result := public.vms_list_vehicle_supplier_options_for_tenant_secure(own_tenant);
  if (result->>'total')::integer <> 3
  then raise exception 'Platform selected tenant options disappeared'; end if;
  begin
    perform public.vms_list_vehicle_supplier_options_for_tenant_secure(other_tenant);
    raise exception 'Platform selected target escaped scope';
  exception when others then
    if sqlerrm <> '目标租户不在当前读取范围' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub',ordinary_actor::text,true);
  perform set_config('request.headers','{}',true);
  result := public.vms_list_vehicle_supplier_options_for_tenant_secure(own_tenant);
  if (result->>'total')::integer <> 3
  then raise exception 'Ordinary own-tenant options disappeared'; end if;
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
  result := public.vms_list_vehicle_supplier_options_for_tenant_secure(own_tenant);
  if (result->>'total')::integer <> 3
  then raise exception 'Forged header changed ordinary own options'; end if;
  begin
    perform public.vms_list_vehicle_supplier_options_for_tenant_secure(other_tenant);
    raise exception 'Forged header exposed another tenant';
  exception when others then
    if sqlerrm <> '目标租户不在当前读取范围' then raise; end if;
  end;
  execute 'reset role';
end $test$;
rollback;
