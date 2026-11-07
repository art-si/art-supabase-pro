-- Page-only WMS readers retain package metadata; every permission fixture rolls back.
begin;

do $test$
declare
  package public.mes_work_order_pack%rowtype;
  platform_actor uuid;
  ordinary_actor uuid;
  fixture_role uuid;
  fixture_code text:='QA_WMS_LIST_'||left(replace(gen_random_uuid()::text,'-',''),8);
  other_tenant uuid;
  page_name text;
  metadata jsonb;
  scoped_rows bigint;
begin
  select p.* into strict package from public.mes_work_order_pack p
    where exists(select 1 from public.mes_work_order_pack_item i where i.pack_id=p.id)
      and exists(select 1 from public.wms_production_material_line l where l.pack_id=p.id)
    order by p.id limit 1;
  select u.auth_user_id into strict platform_actor from public.sys_user u
    join public.sys_role r on r.tenant_id=u.tenant_id and r.role_code=any(u.user_roles)
    where u.system_protected and u.status='1' and u.deleted_at is null
      and r.builtin_type='platform_super' and r.enabled limit 1;
  select u.auth_user_id into strict ordinary_actor from public.sys_user u
    where u.tenant_id=package.tenant_id and u.auth_user_id is not null
      and u.status='1' and u.deleted_at is null and not u.system_protected
    order by u.id limit 1;
  select id into strict other_tenant from public.sys_tenant where id<>package.tenant_id limit 1;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',platform_actor,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  insert into public.sys_role(tenant_id,role_code,role_name,enabled)
    values(package.tenant_id,fixture_code,'WMS列表读取回滚角色',true) returning id into fixture_role;
  update public.sys_user set user_roles=array[fixture_code] where auth_user_id=ordinary_actor;

  foreach page_name in array array['WmsProductionIssue','WmsProductionReturn','WmsFinishedInbound','WmsFinishedReturn'] loop
    perform set_config('request.jwt.claims',jsonb_build_object('sub',platform_actor,'role','authenticated')::text,true);
    perform set_config('request.headers','{}',true);
    delete from public.sys_role_menu where role_id=fixture_role;
    insert into public.sys_role_menu(tenant_id,role_id,menu_id)
      select package.tenant_id,fixture_role,id from public.sys_menu where name in (page_name,page_name||':View');
    perform set_config('request.jwt.claims',jsonb_build_object('sub',ordinary_actor,'role','authenticated')::text,true);
    if app_private.is_platform_super() or not app_private.has_permission(page_name||':View')
      or app_private.has_permission('MesPacking:View') or app_private.has_permission('WmsStock:View') then
      raise exception 'Page-only reader fixture did not isolate permission';
    end if;
    execute 'set local role authenticated';
    metadata:=app_private.wms_pack_composition_secure(package.id,package.tenant_id);
    if metadata->>'packNo' is distinct from package.pack_no
      or jsonb_array_length(metadata->'packDetails')<1 then
      raise exception 'Page-only WMS reader lost package metadata: %',page_name;
    end if;
    select count(*) into scoped_rows from public.wms_production_material_list where tenant_id=package.tenant_id;
    if scoped_rows<1 then raise exception 'Page-only WMS reader lost production documents'; end if;
    perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
    if app_private.wms_pack_composition_secure(package.id,package.tenant_id) is distinct from metadata
      or exists(select 1 from public.wms_production_material_list where tenant_id<>package.tenant_id)
      or app_private.wms_pack_composition_secure(package.id,other_tenant)->>'packNo' is not null then
      raise exception 'Forged ordinary tenant header changed package/list scope';
    end if;
    execute 'reset role';
  end loop;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',platform_actor,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  execute 'set local role authenticated';
  if app_private.wms_pack_composition_secure(package.id,package.tenant_id)->>'packNo' is distinct from package.pack_no then
    raise exception 'Platform-all reader lost package metadata';
  end if;
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
  if app_private.wms_pack_composition_secure(package.id,package.tenant_id)->>'packNo' is not null
    or exists(select 1 from public.wms_production_material_list where tenant_id=package.tenant_id) then
    raise exception 'Platform selected tenant leaked package/list data';
  end if;
  execute 'reset role';

  perform set_config('request.jwt.claims',jsonb_build_object('sub',platform_actor,'role','authenticated')::text,true);
  delete from public.sys_role_menu where role_id=fixture_role;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',ordinary_actor,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  execute 'set local role authenticated';
  begin
    perform app_private.wms_pack_composition_secure(package.id,package.tenant_id);
    raise exception 'Unassigned WMS user read package metadata';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
end $test$;

rollback;
