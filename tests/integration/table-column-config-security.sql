begin;

create temporary table column_config_test_context on commit drop as
select
  (select auth_user_id from public.sys_user where system_protected and status='1' and deleted_at is null order by create_time limit 1) as super_uid,
  u.auth_user_id as ordinary_uid,u.id as ordinary_id,u.tenant_id,
  c.menu_id,c.route_path,c.columns,
  (select id from public.sys_tenant where id<>u.tenant_id order by id limit 1) as other_tenant_id
from public.sys_user u
join public.sys_role r on r.tenant_id=u.tenant_id and r.enabled and r.builtin_type is distinct from 'platform_super' and r.role_code=any(coalesce(u.user_roles,array[]::text[]))
join public.sys_role_menu rm on rm.role_id=r.id and rm.tenant_id=r.tenant_id
join public.sys_table_column_catalog c on c.menu_id=rm.menu_id
where u.status='1' and u.deleted_at is null and not u.system_protected and u.auth_user_id is not null
order by u.id,c.menu_id limit 1;

do $$
declare ctx record; v_count integer; v_profile jsonb; v_runtime jsonb; v_revision integer; v_other_path text; v_other_before jsonb;
begin
  select * into ctx from column_config_test_context;
  if ctx.super_uid is null or ctx.ordinary_uid is null or ctx.other_tenant_id is null then raise exception 'Missing authenticated security acceptance identities'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',ctx.super_uid,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  if not app_private.is_platform_super() then raise exception 'Test identity is not platform super'; end if;
  select route_path into v_other_path from public.sys_table_column_catalog where menu_id<>ctx.menu_id order by menu_id limit 1;
  v_other_before:=public.get_table_column_runtime(v_other_path);
  select coalesce(max(revision),0) into v_revision from public.sys_table_column_profile where menu_id=ctx.menu_id and scope='platform';
  v_profile:=jsonb_build_object('menuId',ctx.menu_id,'scope','platform','tenantId',null,'subjectId',null,'source','configured','columns',ctx.columns,'priority',0,'expectedRevision',v_revision);
  begin
    perform public.save_table_column_profile(v_profile||jsonb_build_object('columns',jsonb_set(ctx.columns,'{0,filterType}','"unsupported"')));
    raise exception 'Unsupported filter accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.save_table_column_profile(v_profile||jsonb_build_object('columns',jsonb_set(ctx.columns,'{0,showOverflowTooltip}','"invalid"')));
    raise exception 'Invalid tooltip type accepted';
  exception when invalid_parameter_value then null; end;
  perform public.save_table_column_profile(v_profile);
  if public.get_table_column_runtime(v_other_path)<>v_other_before then raise exception 'Saving one table changed another table'; end if;
  begin perform public.save_table_column_profile(v_profile); raise exception 'Stale revision accepted'; exception when serialization_failure then null; end;
  v_runtime:=public.get_table_column_runtime(ctx.route_path);
  if jsonb_array_length(v_runtime->'profiles')<>1 then raise exception 'Platform-all must resolve only platform defaults in isolated acceptance'; end if;
  perform public.save_table_column_profile(v_profile||jsonb_build_object('source','frontend','expectedRevision',v_revision+1));
  if (public.get_table_column_runtime(ctx.route_path)->>'enabled')::boolean or public.get_table_column_runtime(ctx.route_path)->'catalog'<>'null'::jsonb then raise exception 'Frontend table mode should not transfer configuration columns'; end if;
  perform public.save_table_column_profile(v_profile||jsonb_build_object('expectedRevision',v_revision+2));

  select coalesce(max(revision),0) into v_revision from public.sys_table_column_profile where menu_id=ctx.menu_id and scope='tenant' and tenant_id=ctx.tenant_id;
  perform public.save_table_column_profile(v_profile||jsonb_build_object('scope','tenant','tenantId',ctx.tenant_id,'expectedRevision',v_revision));
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',ctx.tenant_id)::text,true);
  v_runtime:=public.get_table_column_runtime(ctx.route_path);
  if not exists(select 1 from jsonb_array_elements(v_runtime->'profiles') p where p->>'scope'='tenant' and p->>'tenantId'=ctx.tenant_id::text) then raise exception 'Platform-selected tenant profile missing'; end if;
  begin
    perform public.save_table_column_profile(v_profile||jsonb_build_object('scope','user','tenantId',ctx.other_tenant_id,'subjectId',ctx.ordinary_id,'expectedRevision',0));
    raise exception 'Cross-tenant subject accepted';
  exception when invalid_parameter_value then null; end;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',ctx.ordinary_uid,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  if app_private.is_platform_super() then raise exception 'Ordinary test identity has super authority'; end if;
  v_runtime:=public.get_table_column_runtime(ctx.route_path);
  if not exists(select 1 from jsonb_array_elements(v_runtime->'profiles') p where p->>'scope'='tenant' and p->>'tenantId'=ctx.tenant_id::text) then raise exception 'Ordinary own tenant profile missing'; end if;
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',ctx.other_tenant_id)::text,true);
  if public.get_table_column_runtime(ctx.route_path)<>v_runtime then raise exception 'Forged tenant header changed ordinary configuration'; end if;
  begin perform public.save_table_column_profile(v_profile); raise exception 'Ordinary user saved profile'; exception when insufficient_privilege then null; end;
  begin perform public.sync_table_column_catalog('[]'); raise exception 'Ordinary user synced directory'; exception when insufficient_privilege then null; end;
  begin perform public.get_table_column_admin(); raise exception 'Ordinary user read administrator directory'; exception when insufficient_privilege then null; end;

  if has_table_privilege('authenticated','public.sys_table_column_profile','INSERT') or has_table_privilege('authenticated','public.sys_table_column_profile','UPDATE') then raise exception 'Direct table writes must be unavailable'; end if;
  if has_function_privilege('anon','public.save_table_column_profile(jsonb)','EXECUTE') or has_function_privilege('anon','app_private.save_table_column_profile(jsonb)','EXECUTE') then raise exception 'Anonymous write function grant found'; end if;
  select count(*) into v_count from public.sys_menu where name in ('ColumnConfig','System:ColumnConfig:Manage','System:ColumnConfig:Sync');
  if v_count<>3 then raise exception 'Column configuration menu or exact button permission missing'; end if;
end $$;

select 'column configuration: super-all, super-selected, ordinary-own, forged-header, write denial, scope ownership and concurrency passed' as result;
rollback;
