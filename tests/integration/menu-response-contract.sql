-- Full menu value, hierarchy and ordering checks using catalog authorization as the oracle.
-- Existing metadata is read under four real database-role/request-claim contexts.
begin;
set local statement_timeout = '15s';

create function pg_temp.assert_menu_payload(payload jsonb, expected_flat jsonb)
returns void language plpgsql set search_path = pg_catalog as $check$
declare
  actual_flat jsonb;
  actual_edges jsonb;
  expected_edges jsonb;
  node_count integer;
  unique_count integer;
  valid_children boolean;
begin
  if payload->'flat' is distinct from expected_flat then
    raise exception '[menu-contract] Flat values, authorization or ordering changed';
  end if;
  with recursive nodes as (
    select r.value as node, '__root__'::text as parent, r.ordinality as ordinal
    from jsonb_array_elements(payload->'tree') with ordinality r
    union all
    select c.value, n.node->>'id', c.ordinality
    from nodes n cross join lateral jsonb_array_elements(n.node->'children') with ordinality c
  )
  select coalesce(jsonb_agg(node-'children' order by (node->>'sort')::numeric nulls last, (node->>'id')::uuid), '[]'::jsonb),
    count(*), count(distinct node->>'id'),
    coalesce(bool_and(coalesce(jsonb_typeof(node->'children'), '') = 'array'), true)
  into actual_flat, node_count, unique_count, valid_children from nodes;
  if actual_flat is distinct from expected_flat
    or node_count <> unique_count or not valid_children then
    raise exception '[menu-contract] Tree lost, duplicated or changed an authorized node';
  end if;
  with recursive nodes as (
    select r.value as node, '__root__'::text as parent, r.ordinality as ordinal
    from jsonb_array_elements(payload->'tree') with ordinality r
    union all
    select c.value, n.node->>'id', c.ordinality
    from nodes n cross join lateral jsonb_array_elements(n.node->'children') with ordinality c
  ), grouped as (
    select parent, jsonb_agg(node->>'id' order by ordinal) as ids from nodes group by parent
  ) select coalesce(jsonb_object_agg(parent, ids), '{}'::jsonb) into actual_edges from grouped;
  with flat as (select value as node from jsonb_array_elements(expected_flat)), grouped as (
    select case when node->>'parentId' is null or not exists (
      select 1 from flat p where p.node->>'id' = f.node->>'parentId'
    ) then '__root__' else node->>'parentId' end as parent,
    jsonb_agg(node->>'id' order by (node->>'sort')::numeric nulls last, (node->>'id')::uuid) as ids
    from flat f group by 1
  ) select coalesce(jsonb_object_agg(parent, ids), '{}'::jsonb) into expected_edges from grouped;
  if actual_edges is distinct from expected_edges then
    raise exception '[menu-contract] Parent links, orphan promotion or sibling order changed';
  end if;
end;
$check$;

do $test$
declare
  super_uid uuid;
  ordinary_uid uuid;
  own_tenant uuid;
  other_tenant uuid;
  actor jsonb;
  actor_uid uuid;
  is_super boolean;
  role_ids uuid[];
  menu_ids uuid[];
  v_application text;
  codes text[] := array['platform','fms','hr','mdm','mes','pmis','scm','smis','tms','vms','wms'];
  bulk jsonb;
  response jsonb;
  expected jsonb;
  ordinary_snapshot jsonb;
begin
  select u.auth_user_id into super_uid from public.sys_user u
  join public.sys_tenant t on t.id=u.tenant_id
  where u.status='1' and u.deleted_at is null and u.system_protected
    and t.builtin_type='platform' and exists (
      select 1 from public.sys_role r where r.tenant_id=u.tenant_id and r.enabled
        and r.builtin_type='platform_super' and r.role_code=any(u.user_roles)
    ) order by u.id limit 1;
  select u.auth_user_id,u.tenant_id into ordinary_uid,own_tenant from public.sys_user u
  join public.sys_tenant t on t.id=u.tenant_id
  where u.status='1' and u.deleted_at is null and t.status='1'
    and t.builtin_type is distinct from 'platform'
    and (t.service_start_date is null or t.service_start_date <= (now() at time zone 'Asia/Shanghai')::date)
    and (t.service_end_date is null or t.service_end_date >= (now() at time zone 'Asia/Shanghai')::date)
  order by u.tenant_id,u.id limit 1;
  select t.id into other_tenant from public.sys_tenant t where t.id<>own_tenant
    and t.status='1' and t.builtin_type is distinct from 'platform'
    and (t.service_start_date is null or t.service_start_date <= (now() at time zone 'Asia/Shanghai')::date)
    and (t.service_end_date is null or t.service_end_date >= (now() at time zone 'Asia/Shanghai')::date)
  order by t.id limit 1;
  if super_uid is null or ordinary_uid is null or other_tenant is null then
    raise exception '[menu-contract] Requires platform/ordinary users and two active tenants';
  end if;
  for actor in select value from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('name','platform-all','uid',super_uid,'header',null,'super',true),
    jsonb_build_object('name','platform-selected','uid',super_uid,'header',own_tenant,'super',true),
    jsonb_build_object('name','ordinary-own','uid',ordinary_uid,'header',null,'super',false),
    jsonb_build_object('name','ordinary-forged','uid',ordinary_uid,'header',other_tenant,'super',false)
  )) loop
    actor_uid := (actor->>'uid')::uuid;
    is_super := (actor->>'super')::boolean;
    perform set_config('request.jwt.claim.sub',actor_uid::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',actor_uid,'role','authenticated')::text,true);
    perform set_config('request.headers',case when actor->>'header' is null then '{}' else jsonb_build_object('x-art-tenant-scope',actor->>'header')::text end,true);
    select coalesce(array_agg(distinct r.id),'{}'::uuid[]) into role_ids
    from public.sys_user u join public.sys_role r
      on r.role_code=any(coalesce(u.user_roles,array[]::text[])) and r.enabled
      and (r.tenant_id=u.tenant_id or r.tenant_id is null)
    where u.auth_user_id=actor_uid and u.status='1' and u.deleted_at is null;
    select coalesce(array_agg(m.id),'{}'::uuid[]) into menu_ids from public.sys_menu m
    where is_super or exists(select 1 from public.sys_role_menu rm where rm.menu_id=m.id and rm.role_id=any(role_ids));
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',m.id,'parentId',m.parent_id,'name',m.name,'path',m.path,'component',m.component,
      'meta',m.meta,'sort',m.sort,'type',m.type
    ) order by m.sort nulls last,m.id),'[]'::jsonb) into expected
    from public.sys_menu m where m.id=any(menu_ids);
    execute 'set local role authenticated';
    response := public.get_menus_for_current_user();
    bulk := public.get_menus_for_current_applications(codes);
    execute 'reset role';
    perform pg_temp.assert_menu_payload(response,expected);
    if actor->>'name'='ordinary-own' then ordinary_snapshot:=bulk; end if;
    if actor->>'name'='ordinary-forged' and bulk is distinct from ordinary_snapshot then
      raise exception '[menu-contract] Forged header changed ordinary menus';
    end if;
    foreach v_application in array codes loop
      with recursive granted as (
        select m.id,m.parent_id from public.sys_menu m
        where m.app_code=v_application and (m.meta->>'is_enable') is distinct from 'false'
          and exists(select 1 from public.sys_application a where a.app_code=v_application and a.enabled)
          and (is_super or exists(select 1 from public.sys_role_menu rm where rm.menu_id=m.id and rm.role_id=any(role_ids)))
      ), parents as (
        select * from granted union
        select p.id,p.parent_id from public.sys_menu p join parents c on p.id=c.parent_id
        where p.app_code=v_application and (p.meta->>'is_enable') is distinct from 'false'
      ) select coalesce(jsonb_agg(jsonb_build_object(
        'id',m.id,'parentId',m.parent_id,'name',m.name,'path',m.path,'component',m.component,
        'meta',m.meta,'sort',m.sort,'type',m.type
      ) order by m.sort nulls last,m.id),'[]'::jsonb) into expected
      from public.sys_menu m join parents p on p.id=m.id;
      if bulk->v_application is distinct from expected then
        raise exception '[menu-contract] Wrong application grant/ancestry set: % / %',actor->>'name',v_application;
      end if;
      execute 'set local role authenticated';
      response := public.get_menus_for_current_application(v_application);
      execute 'reset role';
      perform pg_temp.assert_menu_payload(response,expected);
    end loop;
    execute 'set local role authenticated';
    response := public.get_menus_for_current_applications(array[' FMS ','fms','','unknown-quality-app']);
    execute 'reset role';
    if response <> jsonb_build_object('fms',bulk->'fms','unknown-quality-app','[]'::jsonb) then
      raise exception '[menu-contract] Normalization, duplicate or unknown-code behavior changed';
    end if;
    execute 'set local role authenticated';
    response := public.get_menus_for_current_applications(array_fill('fms'::text,array[20]));
    execute 'reset role';
    if response <> jsonb_build_object('fms',bulk->'fms') then
      raise exception '[menu-contract] Valid boundary-size request was rejected';
    end if;
    execute 'set local role authenticated';
    begin
      perform public.get_menus_for_current_applications(array_fill('fms'::text,array[21]));
      raise exception '[menu-contract] Request limit disappeared';
    exception when invalid_parameter_value then null;
    end;
    execute 'reset role';
  end loop;
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{}',true);
  execute 'set local role authenticated';
  if public.get_menus_for_current_applications(null) <> '{}'::jsonb
    or public.get_menus_for_current_applications(array[]::text[]) <> '{}'::jsonb
    or public.get_menus_for_current_user() <> jsonb_build_object('flat','[]'::jsonb,'tree','[]'::jsonb)
    or public.get_menus_for_current_application(null) <> jsonb_build_object('flat','[]'::jsonb,'tree','[]'::jsonb) then
    raise exception '[menu-contract] Missing identity/empty request behavior changed';
  end if;
  execute 'reset role';
  if has_function_privilege('authenticated','app_private.build_authorized_menu_tree(jsonb,uuid,text)','execute')
    or has_function_privilege('anon','app_private.get_authorized_application_menus_flat(text[])','execute') then
    raise exception '[menu-contract] Internal helper was exposed';
  end if;
end;
$test$;

select 'menu values, hierarchy, ordering and four-role authorization passed' as result;
rollback;
