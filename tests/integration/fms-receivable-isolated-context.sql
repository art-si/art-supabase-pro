-- Append after acceptance fixtures, before advance-match/line-balances tests.
-- All identifiers and grants below belong to the acceptance transaction's synthetic tenant.
do $isolated_context$
declare tenant uuid; ordinary uuid; financial uuid; estimate uuid; role_id uuid; resource uuid; field uuid;
 code text:='AR_ISOLATED_'||upper(left(gen_random_uuid()::text,8));
begin
 select id into strict tenant from public.sys_tenant
 where tenant_code=current_setting('test.ar_tenant_code');
 select auth_user_id into strict ordinary from public.sys_user where tenant_id=tenant;
 select id into financial from public.fms_receivable_document
 where tenant_id=tenant and kind='financial' and not is_credit order by id limit 1;
 select id into estimate from public.fms_receivable_document
 where tenant_id=tenant and kind='estimate' order by id limit 1;
 if ordinary is null or financial is null or estimate is null then raise exception 'Isolated acceptance context incomplete';end if;
 insert into public.sys_role(role_code,role_name,tenant_id,enabled)
 values(code,'隔离应收完整流程验证角色',tenant,true) returning id into role_id;
 insert into public.sys_role_menu(role_id,menu_id,tenant_id)
 select role_id,id,tenant from public.sys_menu where name in('FinanceEstimatedReceivable','FinanceFinancialReceivable')
 or starts_with(name,'FinanceEstimatedReceivable:') or starts_with(name,'FinanceFinancialReceivable:');
 insert into public.sys_permission_resource(tenant_id,resource_key,resource_label,menu_name,create_by)
 values(tenant,'fms.receivable','隔离应收字段权限','FinanceFinancialReceivable','isolated-regression') on conflict do nothing;
 select id into strict resource from public.sys_permission_resource where tenant_id=tenant and resource_key='fms.receivable';
 insert into public.sys_permission_field(tenant_id,resource_id,field_key,field_label,default_access,owner_override_enabled,create_by)
 values(tenant,resource,'amounts','应收金额','hidden',false,'isolated-regression') on conflict do nothing;
 select id into strict field from public.sys_permission_field where tenant_id=tenant and resource_id=resource and field_key='amounts';
 insert into public.sys_role_field_permission(tenant_id,role_id,resource_id,field_id,access_level)
 values(tenant,role_id,resource,field,'read');
 update public.sys_user set user_roles=array[code] where tenant_id=tenant and auth_user_id=ordinary;
 perform set_config('test.ar_lifecycle_actor',ordinary::text,true);
 perform set_config('test.ar_lifecycle_financial_first',financial::text,true);
 perform set_config('test.ar_lifecycle_estimate',estimate::text,true);
end $isolated_context$;
