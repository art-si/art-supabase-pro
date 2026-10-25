-- All acceptance records, role grants and user-role edits are rolled back.
begin;
do $$
declare
 v_super uuid; v_uid uuid; v_user uuid; v_tenant uuid;
 v_low uuid:=gen_random_uuid(); v_high uuid:=gen_random_uuid();
 v_catalog record; v_config jsonb; v_runtime jsonb; v_columns jsonb; v_index integer;
 v_tested integer:=0;
begin
 select auth_user_id into v_super from public.sys_user where system_protected and status='1' and deleted_at is null order by create_time limit 1;
 select u.auth_user_id,u.id,u.tenant_id into v_uid,v_user,v_tenant from public.sys_user u where not u.system_protected and u.status='1' and u.deleted_at is null and u.auth_user_id is not null and not exists(select 1 from public.sys_role r where r.tenant_id=u.tenant_id and r.enabled and r.builtin_type='platform_super' and r.role_code=any(coalesce(u.user_roles,array[]::text[]))) order by u.id limit 1;
 if v_uid is null or v_super is null then raise exception 'Missing scope acceptance identities'; end if;
 insert into public.sys_role(id,tenant_id,role_name,role_code,create_by) values
 (v_low,v_tenant,'列配置验收低优先级','COLUMN_CONFIG_ACCEPTANCE_LOW','acceptance'),
 (v_high,v_tenant,'列配置验收高优先级','COLUMN_CONFIG_ACCEPTANCE_HIGH','acceptance');
 update public.sys_user set user_roles=coalesce(user_roles,array[]::text[])||array['COLUMN_CONFIG_ACCEPTANCE_LOW','COLUMN_CONFIG_ACCEPTANCE_HIGH'] where id=v_user;

 for v_catalog in select * from public.sys_table_column_catalog where route_path in ('/data-center/dict','/system/user','/fms/accounts-receivable/estimated-receivable') loop
  v_tested:=v_tested+1;
  delete from public.sys_table_column_profile where menu_id=v_catalog.menu_id;
  insert into public.sys_role_menu(role_id,menu_id,tenant_id,create_by) values (v_low,v_catalog.menu_id,v_tenant,'acceptance'),(v_high,v_catalog.menu_id,v_tenant,'acceptance');
  select (position-1)::integer into v_index from jsonb_array_elements(v_catalog.columns) with ordinality x(value,position) where not coalesce((value->>'locked')::boolean,false) limit 1;
  if v_index is null then raise exception 'Acceptance table has no business column'; end if;
  v_columns:=jsonb_set(v_catalog.columns,array[v_index::text,'label'],'"平台方案"');
  v_config:=jsonb_build_object('menuId',v_catalog.menu_id,'scope','platform','tenantId',null,'subjectId',null,'source','configured','columns',v_columns,'priority',0,'expectedRevision',0);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_super,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  perform public.save_table_column_profile(v_config);
  v_runtime:=public.get_table_column_runtime(v_catalog.route_path);
  if v_runtime->'profiles'->-1->'columns'->v_index->>'label'<>'平台方案' then raise exception 'Platform scope failed: %',v_catalog.route_path; end if;
  perform public.save_table_column_profile(v_config||jsonb_build_object('scope','tenant','tenantId',v_tenant,'columns',jsonb_set(v_columns,array[v_index::text,'label'],'"租户方案"')));
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',v_tenant)::text,true);
  v_runtime:=public.get_table_column_runtime(v_catalog.route_path);
  if v_runtime->'profiles'->-1->'columns'->v_index->>'label'<>'租户方案' then raise exception 'Tenant scope failed: %',v_catalog.route_path; end if;
  perform public.save_table_column_profile(v_config||jsonb_build_object('scope','role','tenantId',v_tenant,'subjectId',v_low,'priority',10,'columns',jsonb_set(v_columns,array[v_index::text,'label'],'"低优先级角色"')));
  perform public.save_table_column_profile(v_config||jsonb_build_object('scope','role','tenantId',v_tenant,'subjectId',v_high,'priority',20,'columns',jsonb_set(v_columns,array[v_index::text,'label'],'"高优先级角色"')));
  if not exists(select 1 from jsonb_array_elements(public.get_table_column_subjects(v_tenant,'user')) subject where subject->>'value'=v_user::text and subject->'roleIds' @> jsonb_build_array(v_low::text,v_high::text)) then raise exception 'Administrator user-role inheritance metadata missing'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_uid,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  v_runtime:=public.get_table_column_runtime(v_catalog.route_path);
  if v_runtime->'profiles'->-1->'columns'->v_index->>'label'<>'高优先级角色' then raise exception 'Multiple-role priority failed: %',v_catalog.route_path; end if;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_super,'role','authenticated')::text,true);
  v_columns:=jsonb_set(v_columns,array[v_index::text],(v_columns->v_index)||jsonb_build_object('label','用户方案','filterType','datetime-range','sortable',true,'showOverflowTooltip',false,'source','frontend'));
  perform public.save_table_column_profile(v_config||jsonb_build_object('scope','user','tenantId',v_tenant,'subjectId',v_user,'columns',v_columns));
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_uid,'role','authenticated')::text,true);
  v_runtime:=public.get_table_column_runtime(v_catalog.route_path);
  if v_runtime->'profiles'->-1->'columns'->v_index->>'label'<>'用户方案' then raise exception 'User scope failed: %',v_catalog.route_path; end if;
  if v_runtime->'profiles'->-1->'columns'->v_index ? 'source' then raise exception 'Per-column source was persisted'; end if;
  if v_runtime->'profiles'->-1->'columns'->v_index->>'filterType'<>'datetime-range' then raise exception 'Advanced filter type lost'; end if;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_super,'role','authenticated')::text,true);
  perform public.save_table_column_profile(v_config||jsonb_build_object('scope','role','tenantId',v_tenant,'subjectId',v_high,'priority',20,'source','frontend','expectedRevision',1));
  perform public.save_table_column_profile(v_config||jsonb_build_object('scope','user','tenantId',v_tenant,'subjectId',v_user,'source','inherit','columns','[]'::jsonb,'expectedRevision',1));
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_uid,'role','authenticated')::text,true);
  v_runtime:=public.get_table_column_runtime(v_catalog.route_path);
  if (v_runtime->>'enabled')::boolean or v_runtime->'catalog'<>'null'::jsonb or jsonb_array_length(v_runtime->'profiles')<>0 then raise exception 'Role frontend fallback failed: %',v_catalog.route_path; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_super,'role','authenticated')::text,true);
  perform public.save_table_column_profile(v_config||jsonb_build_object('scope','user','tenantId',v_tenant,'subjectId',v_user,'source','configured','expectedRevision',2));
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_uid,'role','authenticated')::text,true);
  if not (public.get_table_column_runtime(v_catalog.route_path)->>'enabled')::boolean then raise exception 'User source did not override role frontend'; end if;
 end loop;
 if v_tested<>3 then raise exception 'Expected all three representative tables'; end if;
 -- Verify that a group header alone, or a leaf beneath a hidden group, cannot pass the visible-column guard.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_super,'role','authenticated')::text,true);
 v_columns:=jsonb_build_array(jsonb_build_object('key','__group__验收','label','验收分组','visible',true),jsonb_build_object('key','acceptanceValue','label','验收值','visible',true,'parentKey','__group__验收'));
 update public.sys_table_column_catalog set columns=v_columns where menu_id=v_catalog.menu_id;
 v_config:=v_config||jsonb_build_object('scope','platform','source','configured','expectedRevision',1,'columns',jsonb_set(v_columns,'{1,visible}','false'));
 begin perform public.save_table_column_profile(v_config); raise exception 'Structural-only grouped layout accepted'; exception when invalid_parameter_value then null; end;
 v_config:=v_config||jsonb_build_object('columns',jsonb_set(v_columns,'{0,visible}','false'));
 begin perform public.save_table_column_profile(v_config); raise exception 'Hidden ancestor left a visible business leaf'; exception when invalid_parameter_value then null; end;
 perform public.save_table_column_profile(v_config||jsonb_build_object('columns',v_columns));
end $$;
select 'Three real table catalogs: platform, tenant, two roles, priority, user, inheritance, frontend fallback and advanced filters passed' as result;
rollback;
