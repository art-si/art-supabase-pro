begin;
do $fixtures$
declare
  platform_actor uuid;
  platform_tenant uuid;
  ordinary_actor uuid;
  ordinary_tenant uuid;
  fixture_role uuid;
  fixture_code text:='AP_RLS_'||left(gen_random_uuid()::text,8);
  platform_term uuid;
  ordinary_term uuid;
begin
  select auth_user_id,tenant_id into platform_actor,platform_tenant from public.sys_user where user_roles @>array['R_SUPER'] and auth_user_id is not null limit 1;
  select account.auth_user_id,account.tenant_id into ordinary_actor,ordinary_tenant from public.sys_user account where account.auth_user_id is not null and account.status='1' and not account.user_roles @>array['R_SUPER'] and exists(select 1 from public.fms_purchase_payable_document where tenant_id=account.tenant_id) limit 1;
  if platform_actor is null or ordinary_actor is null then raise exception 'Missing direct-RLS fixtures'; end if;
  insert into public.sys_role(role_name,role_code,enabled,tenant_id) values('应付RLS临时角色',fixture_code,true,ordinary_tenant) returning id into fixture_role;
  insert into public.sys_role_menu(role_id,menu_id,tenant_id) select fixture_role,id,ordinary_tenant from public.sys_menu where name in('MdmPaymentTerm:View','MdmPaymentTerm:Add','FinanceEstimatedPayable:View','FinancePurchasePayable:View');
  update public.sys_user set user_roles=array[fixture_code] where auth_user_id=ordinary_actor;
  perform set_config('request.jwt.claim.sub',platform_actor::text,true);
  perform set_config('request.headers','{}',true);
  platform_term:=public.mdm_save_payment_term_secure(jsonb_build_object('code',fixture_code,'name','平台RLS付款条件','days',30));
  ordinary_term:=public.mdm_save_payment_term_secure(jsonb_build_object('tenant_id',ordinary_tenant,'code',fixture_code,'name','业务RLS付款条件','days',60));
  perform set_config('test.payable_platform_actor',platform_actor::text,true);
  perform set_config('test.payable_platform_tenant',platform_tenant::text,true);
  perform set_config('test.payable_ordinary_actor',ordinary_actor::text,true);
  perform set_config('test.payable_ordinary_tenant',ordinary_tenant::text,true);
  perform set_config('test.payable_terms',jsonb_build_array(platform_term,ordinary_term)::text,true);
  perform set_config('test.payable_code',fixture_code,true);
end $fixtures$;
set local role authenticated;
do $test$
declare
  ordinary_tenant uuid:=current_setting('test.payable_ordinary_tenant')::uuid;
  platform_tenant uuid:=current_setting('test.payable_platform_tenant')::uuid;
  identifiers uuid[];
  created_term uuid;
begin
  select array_agg(value::uuid) into identifiers from jsonb_array_elements_text(current_setting('test.payable_terms')::jsonb);
  if (select count(*) from public.mdm_payment_term where id=any(identifiers))<>2 then raise exception 'Platform-all direct read lost a tenant'; end if;
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',ordinary_tenant)::text,true);
  if (select count(*) from public.mdm_payment_term where id=any(identifiers))<>1 then raise exception 'Platform-selected direct read crossed tenant boundary'; end if;
  if exists(select 1 from public.fms_purchase_payable_document where tenant_id<>ordinary_tenant) or exists(select 1 from public.fms_purchase_payable_line where tenant_id<>ordinary_tenant) then raise exception 'Platform-selected payable table read crossed tenant boundary'; end if;
  perform set_config('request.jwt.claim.sub',current_setting('test.payable_ordinary_actor'),true);
  perform set_config('request.headers','{}',true);
  if not exists(select 1 from public.fms_purchase_payable_document where tenant_id=ordinary_tenant) then raise exception 'Authorized ordinary direct read lost own payables'; end if;
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',platform_tenant)::text,true);
  if (select count(*) from public.mdm_payment_term where id=any(identifiers))<>1 or exists(select 1 from public.mdm_payment_term where tenant_id<>ordinary_tenant) then raise exception 'Forged header changed direct-RLS scope'; end if;
  if exists(select 1 from public.fms_purchase_payable_document where tenant_id<>ordinary_tenant) or exists(select 1 from public.fms_purchase_payable_line where tenant_id<>ordinary_tenant) then raise exception 'Forged header leaked payable table rows'; end if;
  created_term:=public.mdm_save_payment_term_secure(jsonb_build_object('code',current_setting('test.payable_code')||'_NEW','name','普通用户受控创建','days',45));
  if not exists(select 1 from public.mdm_payment_term where id=created_term and tenant_id=ordinary_tenant) then raise exception 'Authenticated controlled create used forged tenant'; end if;
end $test$;
reset role;
rollback;
