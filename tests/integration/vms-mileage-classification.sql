-- Classification filters and vehicle relationships preserve canonical read scope.
-- No persistent writes; use the existing QA tenant and authorized test actors.
begin;
do $test$
declare
  super_actor uuid;
  ordinary_actor uuid := 'ab881b32-87d4-4dce-9014-ce488b8069df';
  qa_tenant uuid := '7529f951-938e-4e2c-ac0d-316c136ae1f9';
  other_tenant uuid := '111e83d3-190e-4405-84c8-440d484d13a6';
  scenario jsonb;
  result jsonb;
  expected integer;
  v_ownership text;
  v_vehicle_type text;
begin
  select u.auth_user_id into super_actor from public.sys_user u
  join public.sys_tenant t on t.id=u.tenant_id
  where t.builtin_type='platform' and u.system_protected and u.status='1'
    and u.deleted_at is null
    and exists(select 1 from public.sys_role r where r.tenant_id=u.tenant_id
      and r.builtin_type='platform_super' and r.role_code=any(u.user_roles) and r.enabled)
  order by u.id limit 1;
  if super_actor is null then raise exception 'Platform super actor unavailable'; end if;
  for scenario in select value from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('name','platform_all','actor',super_actor,'scope',null,'tenant',null),
    jsonb_build_object('name','platform_selected','actor',super_actor,'scope',qa_tenant,'tenant',qa_tenant),
    jsonb_build_object('name','platform_other','actor',super_actor,'scope',other_tenant,'tenant',other_tenant),
    jsonb_build_object('name','ordinary_own','actor',ordinary_actor,'scope',null,'tenant',qa_tenant),
    jsonb_build_object('name','ordinary_forged','actor',ordinary_actor,'scope',other_tenant,'tenant',qa_tenant)
  )) loop
    select count(*) into expected from public.vehicle_mileage_record m
      where scenario->>'tenant' is null or m.tenant_id=(scenario->>'tenant')::uuid;
    perform set_config('request.jwt.claim.sub',scenario->>'actor',true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',scenario->>'actor','role','authenticated')::text,true);
    perform set_config('request.headers',case when scenario->>'scope' is null then '{}'
      else jsonb_build_object('x-art-tenant-scope',scenario->>'scope')::text end,true);
    execute 'set local role authenticated';
    result:=public.vms_list_vehicle_mileage_secure(0,499);
    if (result->>'total')::integer<>expected then
      raise exception '% mileage scope mismatch',scenario->>'name'; end if;
    if exists(select 1 from jsonb_array_elements(result->'records') row_data
      where not (row_data ? 'waybill_no')) then
      raise exception '% missing waybill context',scenario->>'name'; end if;
    execute 'reset role';
    select coalesce(nullif(v.vehicle_ownership,''),'unassigned'),coalesce(nullif(v.vehicle_type,''),'unassigned')
      into v_ownership,v_vehicle_type from public.vehicle_mileage_record m
      join public.mdm_vehicle v on v.id=m.vehicle_id and v.tenant_id=m.tenant_id
      where scenario->>'tenant' is null or m.tenant_id=(scenario->>'tenant')::uuid limit 1;
    if v_ownership is not null then
      select count(*) into expected from public.vehicle_mileage_record m
        join public.mdm_vehicle v on v.id=m.vehicle_id and v.tenant_id=m.tenant_id
        where (scenario->>'tenant' is null or m.tenant_id=(scenario->>'tenant')::uuid)
          and coalesce(nullif(v.vehicle_ownership,''),'unassigned')=v_ownership
          and coalesce(nullif(v.vehicle_type,''),'unassigned')=v_vehicle_type;
      execute 'set local role authenticated';
      result:=public.vms_list_vehicle_mileage_secure(p_from=>0,p_to=>499,
        p_vehicle_ownership=>v_ownership,p_vehicle_type=>v_vehicle_type);
      if (result->>'total')::integer<>expected then
        raise exception '% classification total mismatch',scenario->>'name'; end if;
      if exists(select 1 from jsonb_array_elements(result->'records') row_data
        where not (row_data ?& array['vehicle_ownership','driver_name','driver_phone','carrier_name','waybill_no'])) then
        raise exception '% missing vehicle context',scenario->>'name'; end if;
      execute 'reset role';
    end if;
  end loop;
end;
$test$;
rollback;
