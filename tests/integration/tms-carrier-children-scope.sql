-- Run in BEGIN/ROLLBACK. Checks carrier child readers and account tenant isolation with real users.
do $test$
declare
  v_super uuid;
  v_ordinary uuid;
  v_own public.mdm_carrier%rowtype;
  v_other public.mdm_carrier%rowtype;
  v_result jsonb;
  v_account uuid;
  v_ordinary_found boolean := false;
  v_carrier_id uuid;
begin
  select u.auth_user_id into v_super
  from public.sys_user u join public.sys_tenant t on t.id=u.tenant_id
  where t.builtin_type='platform' and u.system_protected
    and u.status='1' and u.deleted_at is null
  order by u.id limit 1;
  select u.auth_user_id,c.id into v_ordinary,v_carrier_id
  from public.sys_user u
  join public.sys_tenant t on t.id=u.tenant_id
  join public.mdm_carrier c on c.tenant_id=u.tenant_id
  join public.sys_role r on r.tenant_id=u.tenant_id
    and r.role_code=any(u.user_roles) and r.enabled
  join public.sys_role_menu rm on rm.role_id=r.id
  join public.sys_menu m on m.id=rm.menu_id and m.name='TmsCarrier:View'
  where t.builtin_type is distinct from 'platform'
    and u.status='1' and u.deleted_at is null
  order by u.id,c.id limit 1;
  v_ordinary_found := v_ordinary is not null;
  select * into v_own from public.mdm_carrier where id=v_carrier_id;
  select * into v_other from public.mdm_carrier
    where tenant_id<>v_own.tenant_id order by tenant_id,id limit 1;
  if v_super is null or not v_ordinary_found or v_other.id is null then
    raise exception 'Need real platform actor and ordinary carrier-view actor with two tenants';
  end if;
  insert into public.mdm_carrier_billing_account
    (tenant_id,carrier_id,invoice_title,bank_name,bank_account,is_default)
  values (v_own.tenant_id,v_own.id,'测试开票账户','测试银行','6222000000000000',true)
  returning id into v_account;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',v_super::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_super,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  v_result := public.tms_get_carrier_children_secure(v_own.id);
  if jsonb_array_length(v_result->'billing_accounts') <> 1 then
    raise exception 'Platform-all child read failed';
  end if;
  v_result := public.tms_get_carrier_default_billing_account_secure(v_own.id);
  if (v_result->>'id')::uuid is distinct from v_account then
    raise exception 'Default account lookup failed';
  end if;
  v_result := public.tms_list_carrier_options_secure(p_tenant_id=>v_own.tenant_id);
  if exists(select 1 from jsonb_array_elements(v_result) x
            join public.mdm_carrier c on c.id=(x->>'id')::uuid
            where c.tenant_id<>v_own.tenant_id) then
    raise exception 'Explicit carrier option tenant filter escaped';
  end if;
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',v_own.tenant_id)::text,true);
  begin
    perform public.tms_get_carrier_children_secure(v_other.id);
    raise exception 'Platform-selected read escaped tenant';
  exception when sqlstate '42501' then null;
  end;

  execute 'reset role';
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',v_ordinary::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_ordinary,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  v_result := public.tms_get_carrier_children_secure(v_own.id);
  if jsonb_array_length(v_result->'billing_accounts') <> 1 then
    raise exception 'Ordinary own-tenant child read failed';
  end if;
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',v_other.tenant_id)::text,true);
  v_result := public.tms_get_carrier_children_secure(v_own.id);
  if jsonb_array_length(v_result->'billing_accounts') <> 1 then
    raise exception 'Forged header changed ordinary own-tenant read';
  end if;
  begin
    perform public.tms_get_carrier_children_secure(v_other.id);
    raise exception 'Ordinary cross-tenant read escaped';
  exception when sqlstate '42501' then null;
  end;
  execute 'reset role';
  raise notice 'Carrier child platform-all, platform-selected, ordinary-own, forged-header checks passed';
end $test$;
