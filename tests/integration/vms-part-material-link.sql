-- MDM material and unit references remain tenant-bound for VMS parts.
begin;
do $test$
declare
  super_actor uuid;
  ordinary_actor uuid := '5774aa51-3bbb-4da5-abd4-7ea44b44ea6a';
  own_tenant uuid := '7529f951-938e-4e2c-ac0d-316c136ae1f9';
  other_tenant uuid := '67c9741f-c98a-4cd1-a7ec-0ebd5ed5b61d';
  first_material public.mdm_material%rowtype;
  second_material public.mdm_material%rowtype;
  own_unit public.mdm_unit_of_measure%rowtype;
  other_material uuid;
  other_unit uuid;
  part_row public.mdm_part%rowtype;
  all_count integer;
  own_count integer;
begin
  select u.auth_user_id into super_actor
  from public.sys_user u
  join public.sys_tenant t on t.id = u.tenant_id and t.builtin_type = 'platform'
  join public.sys_role r on r.tenant_id = u.tenant_id and r.builtin_type = 'platform_super'
    and r.role_code = any(coalesce(u.user_roles, array[]::text[]))
  where u.auth_user_id is not null and u.system_protected and u.status = '1'
  limit 1;
  if super_actor is null then raise exception 'Platform actor unavailable'; end if;

  select m.* into first_material from public.mdm_material m
  join public.mdm_unit_of_measure u on u.id = m.base_unit_id and u.tenant_id = m.tenant_id
  where m.tenant_id = own_tenant and m.status = 'enabled' and u.status = 'enabled'
  order by m.id limit 1;
  select m.* into second_material from public.mdm_material m
  join public.mdm_unit_of_measure u on u.id = m.base_unit_id and u.tenant_id = m.tenant_id
  where m.tenant_id = own_tenant and m.id <> first_material.id
    and m.status = 'enabled' and u.status = 'enabled'
  order by m.id limit 1;
  select * into own_unit from public.mdm_unit_of_measure where id = first_material.base_unit_id;
  select id into other_material from public.mdm_material where tenant_id = other_tenant limit 1;
  select id into other_unit from public.mdm_unit_of_measure where tenant_id = other_tenant limit 1;
  if first_material.id is null or second_material.id is null
    or other_material is null or other_unit is null
  then raise exception 'Material fixtures unavailable'; end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', super_actor::text, true);
  perform set_config('request.headers', '{}', true);
  select count(*) into all_count from public.mdm_material;
  perform set_config('request.headers', jsonb_build_object('x-art-tenant-scope', own_tenant)::text, true);
  if exists (select 1 from public.mdm_material where tenant_id <> own_tenant)
    or exists (select 1 from public.mdm_unit_of_measure where tenant_id <> own_tenant)
  then raise exception 'Platform selected tenant leaked references'; end if;
  select count(*) into own_count from public.mdm_material;
  if own_count = 0 or all_count <= own_count then raise exception 'Platform scope did not change'; end if;

  perform set_config('request.jwt.claim.sub', ordinary_actor::text, true);
  perform set_config('request.headers', '{}', true);
  if not app_private.has_permission('Parts:Add') then raise exception 'Parts Add fixture unavailable'; end if;
  if exists (select 1 from public.mdm_material where tenant_id <> own_tenant)
    or exists (select 1 from public.mdm_unit_of_measure where tenant_id <> own_tenant)
  then raise exception 'Ordinary user read another tenant'; end if;
  perform set_config('request.headers', jsonb_build_object('x-art-tenant-scope', other_tenant)::text, true);
  if (select count(*) from public.mdm_material) <> own_count
    or exists (select 1 from public.mdm_material where tenant_id <> own_tenant)
  then raise exception 'Forged scope changed ordinary material reads'; end if;

  insert into public.mdm_part(tenant_id, material_id, unit_id, part_name, part_code, unit)
  values (own_tenant, first_material.id, own_unit.id, '伪造名称', 'FAKE-CODE', '伪造单位')
  returning * into part_row;
  if part_row.part_name <> first_material.material_name
    or part_row.part_code <> first_material.material_code
    or part_row.unit <> own_unit.unit_name
  then raise exception 'Selected material was not authoritative'; end if;
  begin
    insert into public.mdm_part(tenant_id, material_id, unit_id, part_name, part_code, unit)
    values (own_tenant, other_material, own_unit.id, 'x', 'x', 'x');
    raise exception 'Cross-tenant material accepted';
  exception when others then
    if sqlerrm <> '所选物料编码不属于当前零部件租户' then raise; end if;
  end;
  begin
    insert into public.mdm_part(tenant_id, material_id, unit_id, part_name, part_code, unit)
    values (own_tenant, second_material.id, other_unit, 'x', 'x', 'x');
    raise exception 'Cross-tenant unit accepted';
  exception when others then
    if sqlerrm <> '所选计量单位不属于当前零部件租户' then raise; end if;
  end;
  begin
    insert into public.mdm_part(tenant_id, unit_id, part_name, part_code, unit)
    values (own_tenant, own_unit.id, 'x', 'x', 'x');
    raise exception 'Missing material accepted';
  exception when others then
    if sqlerrm <> '新增零部件必须选择物料编码' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', super_actor::text, true);
  perform set_config('request.headers', '{}', true);
  insert into public.mdm_part(tenant_id, material_id, unit_id, part_name, part_code, unit)
  values (own_tenant, second_material.id, second_material.base_unit_id, 'x', 'x', 'x')
  returning * into part_row;
  update public.mdm_part set part_name = '再次伪造' where id = part_row.id returning * into part_row;
  if part_row.part_name <> second_material.material_name
  then raise exception 'Platform all-tenant edit bypassed material sync'; end if;
  execute 'reset role';
end $test$;
rollback;
