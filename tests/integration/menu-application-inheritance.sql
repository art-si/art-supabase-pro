-- Menu application membership follows the parent through inserts and moves.
-- All fixture rows and changes to the real purchase-inbound subtree roll back.
begin;
set local lock_timeout = '500ms';
set local statement_timeout = '15s';

create function pg_temp.assert_subtree_application(root_id uuid, expected_code text)
returns void language plpgsql set search_path = pg_catalog as $check$
declare
  wrong_count integer;
  node_count integer;
begin
  with recursive subtree as (
    select id, parent_id, app_code from public.sys_menu where id = root_id
    union all
    select child.id, child.parent_id, child.app_code
    from public.sys_menu child join subtree parent on child.parent_id = parent.id
  )
  select count(*), count(*) filter (where app_code is distinct from expected_code)
  into node_count, wrong_count from subtree;
  if node_count = 0 or wrong_count <> 0 then
    raise exception '[menu-application] Subtree % has % nodes outside %', root_id, wrong_count, expected_code;
  end if;
end;
$check$;

create function pg_temp.assert_application_tree(payload jsonb, root_id uuid, child_id uuid, present boolean)
returns void language plpgsql set search_path = pg_catalog as $check$
declare
  flat_has_root boolean;
  flat_has_child boolean;
  tree_has_edge boolean;
begin
  select exists(select 1 from jsonb_array_elements(payload->'flat') item where (item->>'id')::uuid = root_id),
    exists(select 1 from jsonb_array_elements(payload->'flat') item where (item->>'id')::uuid = child_id)
  into flat_has_root, flat_has_child;
  with recursive nodes as (
    select item.value as node from jsonb_array_elements(payload->'tree') item
    union all
    select child.value from nodes parent cross join lateral jsonb_array_elements(parent.node->'children') child
  )
  select exists(select 1 from nodes where (node->>'id')::uuid = root_id
    and exists(select 1 from jsonb_array_elements(node->'children') child
      where (child->>'id')::uuid = child_id)) into tree_has_edge;
  if flat_has_root is distinct from present or flat_has_child is distinct from present
    or tree_has_edge is distinct from present then
    raise exception '[menu-application] RPC lost application scope or parent-child edge % -> %', root_id, child_id;
  end if;
end;
$check$;

create function pg_temp.menu_full_path(menu_id uuid)
returns text language plpgsql set search_path = pg_catalog as $path$
declare
  current_id uuid := menu_id;
  parent_id uuid;
  current_path text;
  parts text[] := array[]::text[];
begin
  while current_id is not null loop
    select m.parent_id, m.path into strict parent_id, current_path
    from public.sys_menu m where m.id = current_id;
    if current_path like '/%' then
      return rtrim(current_path, '/') || case when cardinality(parts) = 0
        then '' else '/' || array_to_string(parts, '/') end;
    end if;
    if btrim(coalesce(current_path, ''), '/') <> '' then
      parts := array_prepend(btrim(current_path, '/'), parts);
    end if;
    current_id := parent_id;
  end loop;
  return '/' || array_to_string(parts, '/');
end;
$path$;

do $test$
declare
  super_uid uuid;
  ordinary_uid uuid;
  ordinary_tenant uuid;
  other_tenant uuid;
  scm_parent uuid;
  wms_parent uuid;
  real_menu uuid;
  real_child uuid;
  fixture_folder uuid;
  fixture_menu uuid;
  fixture_button uuid;
  fixture_name text := 'QaMenuApplication' || replace(gen_random_uuid()::text, '-', '');
  before_parent uuid;
  before_code text;
  folder_route text;
  menu_route text;
  real_child_route text;
  explicit_route text;
  blocked boolean;
  affected integer;
  response jsonb;
begin
  select u.auth_user_id into super_uid from public.sys_user u
  join public.sys_tenant t on t.id = u.tenant_id
  where u.status = '1' and u.deleted_at is null and u.system_protected
    and t.builtin_type = 'platform' and exists (
      select 1 from public.sys_role r where r.tenant_id = u.tenant_id and r.enabled
        and r.builtin_type = 'platform_super' and r.role_code = any(u.user_roles)
    ) order by u.id limit 1;
  select u.auth_user_id, u.tenant_id into ordinary_uid, ordinary_tenant
  from public.sys_user u join public.sys_tenant t on t.id = u.tenant_id
  where u.status = '1' and u.deleted_at is null and t.status = '1'
    and t.builtin_type is distinct from 'platform'
    and (t.service_start_date is null or t.service_start_date <= (now() at time zone 'Asia/Shanghai')::date)
    and (t.service_end_date is null or t.service_end_date >= (now() at time zone 'Asia/Shanghai')::date)
  order by u.tenant_id, u.id limit 1;
  select id into other_tenant from public.sys_tenant
  where id <> ordinary_tenant and status = '1' and builtin_type is distinct from 'platform'
  order by id limit 1;
  select id into scm_parent from public.sys_menu
  where name = 'ScmPurchaseManagement' and app_code = 'scm' limit 1;
  select id into wms_parent from public.sys_menu
  where app_code = 'wms' and parent_id is null and type = 'folder'
    and (meta->>'is_enable') is distinct from 'false'
  order by sort nulls last, id limit 1;
  select id, parent_id, app_code into real_menu, before_parent, before_code
  from public.sys_menu where name = 'WmsPurchaseInbound' limit 1;
  select id into real_child from public.sys_menu where parent_id = real_menu
  order by id limit 1;
  if super_uid is null or ordinary_uid is null or other_tenant is null
    or scm_parent is null or wms_parent is null or real_menu is null or real_child is null then
    raise exception '[menu-application] Required actors or menu fixtures are missing';
  end if;
  if before_parent is distinct from scm_parent or before_code is distinct from 'scm' then
    raise exception '[menu-application] Purchase inbound is not below SCM purchase management';
  end if;
  if (select path from public.sys_menu where id = real_menu)
    is distinct from '/wms/inbound-business/purchase-inbound' then
    raise exception '[menu-application] Purchase inbound address changed before test';
  end if;
  real_child_route := pg_temp.menu_full_path(real_child);
  perform pg_temp.assert_subtree_application(real_menu, 'scm');

  perform set_config('request.jwt.claim.sub', super_uid::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', super_uid, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{}', true);
  execute 'set local role authenticated';

  -- A new descendant must inherit its parent even when the submitted code is forged.
  insert into public.sys_menu(name, path, component, parent_id, type, app_code, meta, sort)
  values (fixture_name, lower(fixture_name), '', wms_parent, 'folder', 'scm',
    jsonb_build_object('title', '菜单应用回归目录', 'is_enable', true), 9998)
  returning id into fixture_folder;
  insert into public.sys_menu(name, path, component, parent_id, type, app_code, meta, sort)
  values (fixture_name || 'Menu', lower(fixture_name) || '-menu', '/wms/' || lower(fixture_name) || '-menu',
    fixture_folder, 'menu', 'scm', jsonb_build_object('title', '菜单应用回归菜单', 'is_enable', true), 1)
  returning id into fixture_menu;
  insert into public.sys_menu(name, path, component, parent_id, type, app_code, meta, sort)
  values (fixture_name || ':View', '', '', fixture_menu, 'button', 'scm',
    jsonb_build_object('title', '查看', 'is_enable', true), 1)
  returning id into fixture_button;
  perform pg_temp.assert_subtree_application(fixture_folder, 'wms');
  folder_route := pg_temp.menu_full_path(fixture_folder);
  menu_route := pg_temp.menu_full_path(fixture_menu);
  response := public.get_menus_for_current_application('wms');
  perform pg_temp.assert_application_tree(response, fixture_folder, fixture_menu, true);
  response := public.get_menus_for_current_application('scm');
  perform pg_temp.assert_application_tree(response, fixture_folder, fixture_menu, false);

  -- Moving the folder changes its entire subtree and the application's RPC tree.
  update public.sys_menu set parent_id = scm_parent, app_code = 'wms' where id = fixture_folder;
  perform pg_temp.assert_subtree_application(fixture_folder, 'scm');
  if (select path from public.sys_menu where id = fixture_folder) is distinct from folder_route
    or pg_temp.menu_full_path(fixture_folder) is distinct from folder_route
    or pg_temp.menu_full_path(fixture_menu) is distinct from menu_route then
    raise exception '[menu-application] Folder move changed its or its child menu URL';
  end if;
  response := public.get_menus_for_current_application('scm');
  perform pg_temp.assert_application_tree(response, fixture_folder, fixture_menu, true);
  response := public.get_menus_for_current_application('wms');
  perform pg_temp.assert_application_tree(response, fixture_folder, fixture_menu, false);
  update public.sys_menu set app_code = 'wms' where id = fixture_menu;
  perform pg_temp.assert_subtree_application(fixture_folder, 'scm');

  -- A path supplied in the same update as a move is intentional and must win.
  explicit_route := '/wms/' || lower(fixture_name) || '-explicit';
  update public.sys_menu set parent_id = wms_parent, path = explicit_route
  where id = fixture_folder;
  if (select path from public.sys_menu where id = fixture_folder) is distinct from explicit_route then
    raise exception '[menu-application] Explicit route was overwritten during move';
  end if;
  perform pg_temp.assert_subtree_application(fixture_folder, 'wms');
  update public.sys_menu set parent_id = scm_parent where id = fixture_folder;
  if (select path from public.sys_menu where id = fixture_folder) is distinct from explicit_route then
    raise exception '[menu-application] Absolute route changed during later move';
  end if;
  perform pg_temp.assert_subtree_application(fixture_folder, 'scm');

  -- Exercise the actual purchase-inbound menu and its existing descendants.
  update public.sys_menu set parent_id = wms_parent where id = real_menu;
  perform pg_temp.assert_subtree_application(real_menu, 'wms');
  if (select path from public.sys_menu where id = real_menu)
    is distinct from '/wms/inbound-business/purchase-inbound'
    or pg_temp.menu_full_path(real_child) is distinct from real_child_route then
    raise exception '[menu-application] Purchase inbound URL changed after moving to WMS';
  end if;
  response := public.get_menus_for_current_application('wms');
  perform pg_temp.assert_application_tree(response, real_menu, real_child, true);
  response := public.get_menus_for_current_application('scm');
  perform pg_temp.assert_application_tree(response, real_menu, real_child, false);
  update public.sys_menu set parent_id = scm_parent where id = real_menu;
  perform pg_temp.assert_subtree_application(real_menu, 'scm');
  if (select path from public.sys_menu where id = real_menu)
    is distinct from '/wms/inbound-business/purchase-inbound'
    or pg_temp.menu_full_path(real_child) is distinct from real_child_route then
    raise exception '[menu-application] Purchase inbound URL changed after moving back to SCM';
  end if;
  response := public.get_menus_for_current_application('scm');
  perform pg_temp.assert_application_tree(response, real_menu, real_child, true);
  response := public.get_menus_for_current_application('wms');
  perform pg_temp.assert_application_tree(response, real_menu, real_child, false);
  execute 'reset role';

  -- A real ordinary identity cannot move menus, even with a foreign tenant header.
  perform set_config('request.jwt.claim.sub', ordinary_uid::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', ordinary_uid, 'role', 'authenticated')::text, true);
  for response in select value from jsonb_array_elements(jsonb_build_array(
    '{}'::jsonb, jsonb_build_object('x-art-tenant-scope', other_tenant))) loop
    perform set_config('request.headers', response::text, true);
    blocked := false;
    execute 'set local role authenticated';
    begin
      update public.sys_menu set parent_id = wms_parent where id = fixture_folder;
      get diagnostics affected = row_count;
      blocked := affected = 0;
    exception when others then
      if sqlstate not in ('42501', '23514', 'P0001') then raise; end if;
      blocked := true;
    end;
    execute 'reset role';
    if not blocked or (select parent_id from public.sys_menu where id = fixture_folder) is distinct from scm_parent then
      raise exception '[menu-application] Ordinary identity moved a menu with headers %', response;
    end if;
  end loop;

  -- A concrete tenant selection retains the platform-super edit capability.
  perform set_config('request.jwt.claim.sub', super_uid::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', super_uid, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', jsonb_build_object('x-art-tenant-scope', ordinary_tenant)::text, true);
  execute 'set local role authenticated';
  update public.sys_menu set parent_id = wms_parent where id = fixture_folder;
  execute 'reset role';
  perform pg_temp.assert_subtree_application(fixture_folder, 'wms');
end;
$test$;

select 'menu application inheritance, stable routes, authorization and RPC hierarchy passed' as result;
rollback;
