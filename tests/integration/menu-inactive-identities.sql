-- Temporary fixture updates are always rolled back, including audit fields.
-- Uses an existing non-protected user with custom, non-default tenant roles.
begin;
set local lock_timeout = '500ms';
set local statement_timeout = '10s';

do $test$
declare
  v_user uuid;
  v_auth uuid;
  v_roles uuid[];
  v_result jsonb;
begin
  select u.id, u.auth_user_id, array_agg(r.id) into v_user, v_auth, v_roles
  from public.sys_user u
  join auth.users a on a.id = u.auth_user_id
  join public.sys_tenant t on t.id = u.tenant_id
  join public.sys_role r on r.role_code = any(coalesce(u.user_roles, array[]::text[]))
    and (r.tenant_id = u.tenant_id or r.tenant_id is null)
  where u.status = '1' and u.deleted_at is null and not u.system_protected
    and t.builtin_type is distinct from 'platform' and t.status = '1'
    and (t.service_start_date is null or t.service_start_date <= (now() at time zone 'Asia/Shanghai')::date)
    and (t.service_end_date is null or t.service_end_date >= (now() at time zone 'Asia/Shanghai')::date)
  group by u.id
  having bool_and(r.builtin_type is null and r.tenant_id = u.tenant_id and not exists (
    select 1 from public.sys_param p where p.param_key = 'registration.default_role_id'
      and p.enabled and p.param_value = r.id::text
  )) and bool_or(r.enabled) and bool_or(exists (
    select 1 from public.sys_role_menu rm where rm.role_id = r.id
  ))
  order by u.id limit 1;

  if v_user is null then
    raise exception '[menu-inactive] Requires an ordinary user with custom, non-default roles';
  end if;
  perform set_config('request.jwt.claim.sub', v_auth::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{}', true);
  execute 'set local role authenticated';
  v_result := public.get_menus_for_current_user();
  execute 'reset role';
  if jsonb_array_length(v_result->'flat') = 0 then
    raise exception '[menu-inactive] Active fixture must have a real menu grant';
  end if;

  update public.sys_user set status = '2' where id = v_user;
  execute 'set local role authenticated';
  v_result := public.get_menus_for_current_user();
  execute 'reset role';
  if v_result <> jsonb_build_object('flat', '[]'::jsonb, 'tree', '[]'::jsonb) then
    raise exception '[menu-inactive] Disabled account still receives menus';
  end if;
  update public.sys_user
  set status = '1', deleted_at = now(), deleted_by = 'quality-rollback-fixture'
  where id = v_user;
  execute 'set local role authenticated';
  v_result := public.get_menus_for_current_user();
  execute 'reset role';
  if v_result <> jsonb_build_object('flat', '[]'::jsonb, 'tree', '[]'::jsonb) then
    raise exception '[menu-inactive] Soft-deleted account still receives menus';
  end if;
  update public.sys_user set deleted_at = null, deleted_by = null where id = v_user;
  update public.sys_role set enabled = false where id = any(v_roles);
  execute 'set local role authenticated';
  v_result := public.get_menus_for_current_user();
  execute 'reset role';
  if v_result <> jsonb_build_object('flat', '[]'::jsonb, 'tree', '[]'::jsonb) then
    raise exception '[menu-inactive] Disabled roles still grant menus';
  end if;
end;
$test$;

rollback;
