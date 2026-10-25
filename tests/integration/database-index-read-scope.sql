-- Index cleanup read contract: real authenticated role, simulated request claims.
-- No business rows are changed; denied table grants remain denied.
begin;
do $test$
declare
  v_super uuid;
  v_ordinary uuid;
  v_tenant_a uuid;
  v_tenant_b uuid;
  v_case jsonb;
  v_table text;
  v_uid uuid;
  v_scope uuid;
  v_rows bigint;
  v_outside bigint;
  v_fingerprint text;
  v_tables jsonb;
  v_observed jsonb := '{}'::jsonb;
  v_expected jsonb;
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
  order by u.tenant_id, u.id limit 1;

  select t.id into v_tenant_b
  from public.sys_tenant t
  where t.id <> v_tenant_a and t.builtin_type is distinct from 'platform'
    and t.status = '1'
    and (t.service_start_date is null or t.service_start_date <= (now() at time zone 'Asia/Shanghai')::date)
    and (t.service_end_date is null or t.service_end_date >= (now() at time zone 'Asia/Shanghai')::date)
  order by t.id limit 1;

  if v_super is null or v_ordinary is null or v_tenant_b is null then
    raise exception '[index-scope] Requires a platform user, an ordinary user and two active tenants';
  end if;

  execute 'set local role authenticated';
  if current_user <> 'authenticated' then raise exception '[index-scope] Role was not applied'; end if;
  for v_case in select value from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('name','platform-all','uid',v_super,'header',null,'scope',null),
    jsonb_build_object('name','platform-selected','uid',v_super,'header',v_tenant_a,'scope',v_tenant_a),
    jsonb_build_object('name','ordinary-own','uid',v_ordinary,'header',null,'scope',v_tenant_a),
    jsonb_build_object('name','ordinary-forged','uid',v_ordinary,'header',v_tenant_b,'scope',v_tenant_a)
  )) loop
    v_uid := (v_case->>'uid')::uuid;
    v_scope := (v_case->>'scope')::uuid;
    perform set_config('request.jwt.claim.sub',v_uid::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_uid,'role','authenticated')::text,true);
    perform set_config('request.headers',case when v_case->>'header' is null then '{}' else jsonb_build_object('x-art-tenant-scope',v_case->>'header')::text end,true);
    v_tables := '{}'::jsonb;
    foreach v_table in array array['mdm_process_route_sequence','sys_role_field_permission','sys_user','sys_user_field_permission','tms_expense_reimbursement_item','wms_count_adjustment_line','wms_purchase_document_line','wms_transfer_business_line','wms_transfer_request_line'] loop
      if not has_table_privilege(current_user,'public.'||v_table,'SELECT') then
        v_tables := v_tables || jsonb_build_object(v_table,jsonb_build_object('select_granted',false));
        continue;
      end if;
      execute format('select count(*),md5(coalesce(string_agg(id::text,'','' order by id),'''')) from public.%I',v_table) into v_rows,v_fingerprint;
      if v_scope is not null then
        if v_table = 'sys_user' then
          execute format('select count(*) from public.%I where tenant_id is distinct from $1 and auth_user_id is distinct from $2',v_table) into v_outside using v_scope,v_uid;
        else
          execute format('select count(*) from public.%I where tenant_id is distinct from $1',v_table) into v_outside using v_scope;
        end if;
        if v_outside <> 0 then raise exception '[index-scope] % leaks outside scope for %',v_table,v_case->>'name'; end if;
      end if;
      v_tables := v_tables || jsonb_build_object(v_table,jsonb_build_object('select_granted',true,'rows',v_rows,'fingerprint',v_fingerprint));
    end loop;
    if not exists(select 1 from public.sys_user where auth_user_id=v_uid) then raise exception '[index-scope] Bootstrap profile hidden'; end if;
    v_observed := v_observed || jsonb_build_object(v_case->>'name',v_tables);
  end loop;
  if v_observed->'ordinary-own' is distinct from v_observed->'ordinary-forged' then raise exception '[index-scope] Forged header changed ordinary results'; end if;
  perform set_config('request.jwt.claim.sub',v_super::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_super,'role','authenticated')::text,true);
  perform set_config('request.headers','{"x-art-tenant-scope":"00000000-0000-4000-8000-000000000000"}',true);
  if not exists(select 1 from public.sys_user where auth_user_id=v_super) then raise exception '[index-scope] Stale scope hides bootstrap profile'; end if;
  v_observed := v_observed || jsonb_build_object('stale-scope-bootstrap',true);
  execute 'reset role';
  v_expected := nullif(current_setting('art.index_expected',true),'')::jsonb;
  if v_expected is not null and v_expected is distinct from v_observed then raise exception '[index-scope] Index cleanup changed visible records or table privileges'; end if;
  perform set_config('art.index_observed',v_observed::text,true);
end;
$test$;

rollback;
