-- Real actor, tenant and lifecycle assertions. No permanent business rows change.
begin;
do $driver_blacklist$
declare
  super_actor uuid;
  ordinary_actor uuid;
  own_tenant uuid;
  own_driver uuid;
  other_driver uuid;
  other_tenant uuid;
  previous_enabled boolean;
  blacklist_id uuid;
begin
  select u.auth_user_id into super_actor
  from public.sys_user u join public.sys_tenant t on t.id=u.tenant_id
  where t.builtin_type='platform' and u.system_protected and u.status='1'
  order by u.id limit 1;
  select u.auth_user_id,u.tenant_id,d.id,d.enabled
  into ordinary_actor,own_tenant,own_driver,previous_enabled
  from public.sys_user u
  join public.sys_tenant t on t.id=u.tenant_id and t.builtin_type is distinct from 'platform'
  join public.sys_role r on r.tenant_id=u.tenant_id and r.role_code=any(u.user_roles) and r.enabled
  join public.sys_role_menu rm on rm.role_id=r.id and rm.tenant_id=u.tenant_id
  join public.sys_menu m on m.id=rm.menu_id and m.name='TmsDriverBlacklist:Add'
  join public.mdm_driver d on d.tenant_id=u.tenant_id and not d.is_blacklisted
  where u.status='1' and u.deleted_at is null and u.auth_user_id is not null
    and exists(select 1 from public.sys_role_menu grant_row
      join public.sys_menu action on action.id=grant_row.menu_id
      where grant_row.role_id=r.id and action.name='TmsDriverBlacklist:Release')
  order by u.id,d.id limit 1;
  select id,tenant_id into other_driver,other_tenant
  from public.mdm_driver where tenant_id<>own_tenant order by id limit 1;
  if super_actor is null or ordinary_actor is null or other_driver is null then
    raise exception 'Blacklist scope fixtures are missing';
  end if;

  perform set_config('request.jwt.claim.sub',super_actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',super_actor,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  execute 'set local role authenticated';
  if (public.tms_list_blacklist_driver_candidates_secure(0,100,null)->>'total')::int < 2 then
    raise exception 'Platform all-tenant candidate scope is incomplete';
  end if;
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',own_tenant)::text,true);
  if (public.tms_list_blacklist_driver_candidates_secure(0,100,null)->>'total')::int < 1 then
    raise exception 'Platform selected candidate scope is incomplete';
  end if;

  perform set_config('request.jwt.claim.sub',ordinary_actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',ordinary_actor,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  blacklist_id:=(public.tms_add_driver_blacklist_secure(own_driver,now(),'集成验证拉黑',null)->>'id')::uuid;
  execute 'reset role';
  if not exists (
    select 1 from public.mdm_driver
    where id=own_driver and not enabled and is_blacklisted
  ) then
    raise exception 'Blacklisting did not disable and mark the driver';
  end if;
  begin
    update public.mdm_driver set enabled=true where id=own_driver;
    raise exception 'An active blacklisted driver was enabled';
  exception when sqlstate '23514' then null;
  end;
  execute 'set local role authenticated';
  if (public.tms_list_driver_blacklist_secure(0,100,null,null,null)->>'total')::int < 1 then
    raise exception 'Active blacklist is absent from the list';
  end if;
  if (public.tms_release_driver_blacklist_secure(blacklist_id)->>'restored_enabled')::boolean
      is distinct from previous_enabled then
    raise exception 'Driver previous enabled state was not restored';
  end if;
  if (public.tms_list_driver_blacklist_secure(0,100,null,null,null)->'records'->0->>'status')
      is distinct from 'released' then
    raise exception 'Released blacklist history was not retained';
  end if;

  execute 'reset role';
  if not exists (
    select 1 from public.mdm_driver
    where id=own_driver and enabled is not distinct from previous_enabled and not is_blacklisted
  ) then
    raise exception 'Releasing did not restore the driver and clear the blacklist mark';
  end if;
  update public.mdm_driver set enabled=false where id=own_driver;
  execute 'set local role authenticated';
  blacklist_id:=(public.tms_add_driver_blacklist_secure(own_driver,now(),'集成验证停用状态',null)->>'id')::uuid;
  if (public.tms_release_driver_blacklist_secure(blacklist_id)->>'restored_enabled')::boolean
      is distinct from false then
    raise exception 'A previously disabled driver was incorrectly enabled';
  end if;

  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
  begin
    perform public.tms_add_driver_blacklist_secure(other_driver,now(),'越权拉黑',null);
    raise exception 'Ordinary forged cross-tenant blacklist write succeeded';
  exception when sqlstate '42501' then null;
  end;
end $driver_blacklist$;
rollback;
