-- Read-only RPC regression against existing active users and waybills in two tenants.
-- Request claims are simulated under the real authenticated database role.
-- This does not replace HTTP/Auth session acceptance. No business rows are changed.
begin;

do $test$
declare
  v_super uuid;
  v_ordinary uuid;
  v_tenant_a uuid;
  v_tenant_b uuid;
  v_waybill_a uuid;
  v_waybill_b uuid;
  v_headers jsonb;
  v_result jsonb;
begin
  select u.auth_user_id into v_super
  from public.sys_user u
  join public.sys_tenant t on t.id = u.tenant_id
  join auth.users a on a.id = u.auth_user_id
  where t.builtin_type = 'platform' and u.system_protected is true
    and u.status = '1' and u.deleted_at is null
    and exists (
      select 1 from public.sys_role r
      where r.tenant_id = u.tenant_id and r.builtin_type = 'platform_super'
        and r.role_code = any(coalesce(u.user_roles, array[]::text[])) and r.enabled is true
    )
  order by u.id limit 1;

  select u.auth_user_id, u.tenant_id into v_ordinary, v_tenant_a
  from public.sys_user u
  join public.sys_tenant t on t.id = u.tenant_id
  join auth.users a on a.id = u.auth_user_id
  where t.builtin_type is distinct from 'platform' and t.status = '1'
    and u.status = '1' and u.deleted_at is null
    and (t.service_start_date is null or t.service_start_date <= (now() at time zone 'Asia/Shanghai')::date)
    and (t.service_end_date is null or t.service_end_date >= (now() at time zone 'Asia/Shanghai')::date)
    and exists (select 1 from public.tms_waybill w where w.tenant_id = u.tenant_id)
  order by u.tenant_id, u.id limit 1;

  select w.id into v_waybill_a from public.tms_waybill w
  where w.tenant_id = v_tenant_a order by w.id limit 1;

  select w.id, w.tenant_id into v_waybill_b, v_tenant_b
  from public.tms_waybill w join public.sys_tenant t on t.id = w.tenant_id
  where w.tenant_id <> v_tenant_a and t.builtin_type is distinct from 'platform'
    and t.status = '1'
    and (t.service_start_date is null or t.service_start_date <= (now() at time zone 'Asia/Shanghai')::date)
    and (t.service_end_date is null or t.service_end_date >= (now() at time zone 'Asia/Shanghai')::date)
  order by w.tenant_id, w.id limit 1;

  if v_super is null or v_ordinary is null or v_waybill_a is null or v_waybill_b is null then
    raise exception '[cargo-scope] Requires a platform user and two active tenants with waybills';
  end if;

  execute 'set local role authenticated';
  if current_user <> 'authenticated' then raise exception '[cargo-scope] Role was not applied'; end if;
  perform set_config('request.jwt.claim.sub', v_super::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_super, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{}', true);

  -- Platform-all must retain reads from both tenants.
  v_result := public.tms_get_waybill_cargo_operation_context(v_waybill_a, 'loading');
  if v_result->>'waybillId' is distinct from v_waybill_a::text then
    raise exception '[cargo-scope] Platform-all failed tenant A';
  end if;
  v_result := public.tms_get_waybill_cargo_operation_context(v_waybill_b, 'loading');
  if v_result->>'waybillId' is distinct from v_waybill_b::text then
    raise exception '[cargo-scope] Platform-all failed tenant B';
  end if;

  -- A concrete selection must constrain even the platform super user.
  perform set_config('request.headers', jsonb_build_object('x-art-tenant-scope', v_tenant_a)::text, true);
  v_result := public.tms_get_waybill_cargo_operation_context(v_waybill_a, 'loading');
  if v_result->>'waybillId' is distinct from v_waybill_a::text then
    raise exception '[cargo-scope] Platform-selected failed its own target';
  end if;
  begin
    perform public.tms_get_waybill_cargo_operation_context(v_waybill_b, 'loading');
    raise exception '[cargo-scope] Platform-selected leaked tenant B';
  exception when raise_exception then
    if sqlerrm <> 'Waybill not found or access denied' then raise; end if;
  end;

  -- Ordinary-own remains readable, including after a forged scope header.
  perform set_config('request.jwt.claim.sub', v_ordinary::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_ordinary, 'role', 'authenticated')::text, true);
  for v_headers in select value from jsonb_array_elements(jsonb_build_array(
    '{}'::jsonb, jsonb_build_object('x-art-tenant-scope', v_tenant_b)
  )) loop
    perform set_config('request.headers', v_headers::text, true);
    v_result := public.tms_get_waybill_cargo_operation_context(v_waybill_a, 'loading');
    if v_result->>'waybillId' is distinct from v_waybill_a::text then
      raise exception '[cargo-scope] Ordinary-own failed or followed a forged header';
    end if;
    begin
      perform public.tms_get_waybill_cargo_operation_context(v_waybill_b, 'loading');
      raise exception '[cargo-scope] Ordinary user leaked tenant B';
    exception when raise_exception then
      if sqlerrm <> 'Waybill not found or access denied' then raise; end if;
    end;
  end loop;
end;
$test$;

rollback;
