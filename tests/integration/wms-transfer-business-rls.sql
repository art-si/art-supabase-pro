begin;
select set_config('app.test_platform_actor',(
  select u.auth_user_id::text from public.sys_user u
  join public.sys_role r on r.tenant_id=u.tenant_id and r.role_code=any(u.user_roles)
  where r.builtin_type='platform_super' and u.status='1' and u.system_protected limit 1),true);
select set_config('app.test_target_tenant',(
  select tenant_id::text from public.wms_transfer_business_document limit 1),true);
select set_config('app.test_other_tenant',(
  select id::text from public.sys_tenant
  where id<>current_setting('app.test_target_tenant')::uuid limit 1),true);
select set_config('app.test_ordinary_actor',(
  select u.auth_user_id::text from public.sys_user u
  where u.tenant_id=current_setting('app.test_target_tenant')::uuid
    and u.auth_user_id is not null and u.status='1' and u.deleted_at is null
    and not exists(select 1 from public.sys_role r where r.tenant_id=u.tenant_id
      and r.role_code=any(u.user_roles) and r.builtin_type='platform_super')
    and exists(select 1 from public.sys_role r
      join public.sys_role_menu rm on rm.role_id=r.id
      join public.sys_menu m on m.id=rm.menu_id
      where r.tenant_id=u.tenant_id and r.role_code=any(u.user_roles)
        and m.name='WmsStepTransfer:View') limit 1),true);
set local role authenticated;
do $test$
declare target uuid:=current_setting('app.test_target_tenant')::uuid;
  other uuid:=current_setting('app.test_other_tenant')::uuid;
  platform_actor uuid:=current_setting('app.test_platform_actor')::uuid;
  ordinary_actor uuid:=current_setting('app.test_ordinary_actor')::uuid;
  all_count integer;
  own_count integer;
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',platform_actor,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  select count(*) into all_count from public.wms_transfer_business_list where tenant_id=target;
  if all_count<1 then raise exception '平台全部租户未见目标调拨单'; end if;
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other)::text,true);
  if exists(select 1 from public.wms_transfer_business_list where tenant_id=target) then
    raise exception '平台选定租户仍可见其他租户调拨单'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',ordinary_actor,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  select count(*) into own_count from public.wms_transfer_business_list where tenant_id=target;
  if own_count<1 then raise exception '普通用户未见本租户调拨单'; end if;
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other)::text,true);
  if (select count(*) from public.wms_transfer_business_list where tenant_id=target)<>own_count
    or exists(select 1 from public.wms_transfer_business_list where tenant_id=other) then
    raise exception '普通用户伪造范围后读到跨租户数据或丢失本租户数据'; end if;
end $test$;
rollback;
