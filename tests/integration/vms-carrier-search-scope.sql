begin;
do $test$
declare
 super_actor uuid:='0a872664-874c-447d-a256-d0dbdca6ed45';
 ordinary_actor uuid:='ab881b32-87d4-4dce-9014-ce488b8069df';
 own_tenant uuid:='7529f951-938e-4e2c-ac0d-316c136ae1f9';
 foreign_tenant uuid:='2824c2b5-2774-4781-b995-f55e8bcee920';
 scope integer; result jsonb; expected_tenant uuid; expected_count integer;
begin
 for scope in 1..4 loop
  perform set_config('request.jwt.claim.sub',case when scope<=2 then super_actor else ordinary_actor end::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',case when scope<=2 then super_actor else ordinary_actor end,'role','authenticated')::text,true);
  perform set_config('request.headers',case when scope=2 then jsonb_build_object('x-art-tenant-scope',own_tenant)::text when scope=4 then jsonb_build_object('x-art-tenant-scope',foreign_tenant)::text else '{}' end,true);
  expected_tenant:=case when scope=1 then null else own_tenant end;
  result:=public.tms_list_carrier_options_secure(p_max_rows=>1000);
  if exists(select 1 from jsonb_array_elements(result) r join public.mdm_carrier c on c.id=(r->>'id')::uuid
    where expected_tenant is not null and c.tenant_id<>expected_tenant) then
   raise exception 'Carrier selection escaped tenant scope in case %',scope;
  end if;
  select least(count(*),1000)::integer into expected_count from public.mdm_carrier c
  where c.enabled and (expected_tenant is null or c.tenant_id=expected_tenant);
  if jsonb_array_length(result)<>expected_count then raise exception 'Carrier choices missing in case %',scope; end if;
 end loop;
end $test$;
rollback;
