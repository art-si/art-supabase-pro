-- Account-set RPC tenant contract; every write is rolled back.
begin;
do $test$
declare
  admin_user public.sys_user%rowtype;
  ordinary_user public.sys_user%rowtype;
  own_set uuid;
  foreign_set uuid;
  scope_tenant uuid;
  result jsonb;
  row_json jsonb;
  expected bigint;
  test_case text;
begin
  select * into strict admin_user from public.sys_user where id='51760251-629d-4561-aeb8-0fbe62352494';
  select * into strict ordinary_user from public.sys_user where id='93f2f1e8-a3dc-4f5a-999b-6c8c02d0c7e9';
  select id into strict own_set from public.fms_account_set where id='2282ea13-3c7d-48b6-aab8-1fc7d67e7b1b' and tenant_id=ordinary_user.tenant_id;
  select id into strict foreign_set from public.fms_account_set where tenant_id<>ordinary_user.tenant_id order by id limit 1;
  foreach test_case in array array['platform_all','platform_selected','ordinary_own','ordinary_forged'] loop
    if test_case like 'platform_%' then
      perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_user.auth_user_id,'role','authenticated','email',admin_user.user_email)::text,true);
    else
      perform set_config('request.jwt.claims',jsonb_build_object('sub',ordinary_user.auth_user_id,'role','authenticated','email',ordinary_user.user_email)::text,true);
    end if;
    perform set_config('request.headers',
      case when test_case='platform_all' then '{}'
        when test_case='ordinary_forged' then jsonb_build_object('x-art-tenant-scope',admin_user.tenant_id)::text
        else jsonb_build_object('x-art-tenant-scope',ordinary_user.tenant_id)::text end,true);
    scope_tenant:=app_private.current_read_tenant_id();
    select count(*) into expected from public.fms_account_set where scope_tenant is null or tenant_id=scope_tenant;
    result:=public.fms_list_account_sets_secure(0,999,null,null,null);
    if (result->>'total')::bigint<>expected or jsonb_array_length(result->'records')<>expected then raise exception 'List count mismatch: %',test_case; end if;
    for row_json in select value from jsonb_array_elements(result->'records') loop
      if scope_tenant is not null and (row_json->>'tenant_id')::uuid<>scope_tenant then raise exception 'List leak: %',test_case; end if;
      if not (row_json ? 'field_access') then raise exception 'Field permissions missing'; end if;
    end loop;
    result:=public.fms_list_account_set_options_secure(0,999,null,null,null);
    if (result->>'total')::bigint<>expected or jsonb_array_length(result->'records')<>expected then raise exception 'Option count mismatch: %',test_case; end if;
    for row_json in select value from jsonb_array_elements(result->'records') loop
      if scope_tenant is not null and (row_json->>'tenant_id')::uuid<>scope_tenant then raise exception 'Option leak: %',test_case; end if;
    end loop;
    result:=public.fms_get_account_set_overview_secure(null);
    if (result->>'total_count')::bigint<>expected then raise exception 'Overview count mismatch: %',test_case; end if;
    result:=public.fms_get_account_set_secure(own_set);
    if result is null or (result->>'id')::uuid<>own_set then raise exception 'Own detail missing'; end if;
    if test_case='platform_all' then
      result:=public.fms_get_account_set_secure(foreign_set);
      if result is null then raise exception 'All-tenant detail missing'; end if;
      result:=public.save_fms_account_set_secure(jsonb_build_object('id',own_set,'remark','transactional scope verification'));
      if result is null then raise exception 'All-tenant existing-row edit missing'; end if;
    else
      if app_private.fms_account_set_to_secure_json(foreign_set,null) is not null then raise exception 'Secure JSON scope leak'; end if;
      begin
        perform public.fms_get_account_set_secure(foreign_set);
        raise exception 'Foreign detail accepted';
      exception when no_data_found then null; end;
      begin
        perform public.save_fms_account_set_secure(jsonb_build_object('id',foreign_set,'remark','must not persist'));
        raise exception 'Foreign edit accepted';
      exception when no_data_found then null; end;
      begin
        perform public.set_fms_account_set_status_secure(foreign_set,'suspended','must not persist');
        raise exception 'Foreign status edit accepted';
      exception when no_data_found then null; end;
    end if;
    if test_case='platform_selected' then
      result:=public.fms_list_account_set_options_secure(0,999,null,admin_user.tenant_id,null);
      if (result->>'total')::bigint<>0 then raise exception 'Explicit option filter widened selected scope'; end if;
      result:=public.fms_list_account_sets_secure(0,999,null,null,admin_user.tenant_id);
      if (result->>'total')::bigint<>0 then raise exception 'Explicit list filter widened selected scope'; end if;
    end if;
  end loop;
end
$test$;
select 'account-set list/options/overview/detail/edit/status: four tenant cases passed' as result;
rollback;
