begin;

create temporary table qa_carrier_context(tenant_id uuid,statement_id uuid,finance_id uuid,payment_id uuid,payment_line_id uuid,cash_id uuid,amount numeric,super_actor uuid,ordinary_actor uuid,role_id uuid,foreign_tenant uuid,other_cash uuid) on commit drop;
grant select on qa_carrier_context to authenticated;

do $fixtures$
declare
 source record;super_actor uuid;ordinary_actor uuid;fixture_role uuid;role_code text:='QA_TMS_SYNC_'||upper(left(gen_random_uuid()::text,8));
 fund uuid;finance jsonb;payment jsonb;cash_ident uuid;principal numeric;other_book uuid;other_currency uuid;other_fund uuid;other_cash uuid;foreign_tenant uuid;blocked boolean;usd_currency uuid;usd_fund uuid;
begin
 select auth_user_id into super_actor from public.sys_user where user_roles @>array['R_SUPER'] and auth_user_id is not null limit 1;
 select statement.* into source from public.tms_carrier_statement statement where statement.status='confirmed'
 and exists(select 1 from public.fms_fund_account account join public.fms_currency currency on currency.id=account.currency_id where account.tenant_id=statement.tenant_id and account.status='active' and account.account_type='bank' and currency.currency_code='CNY' and account.account_set_id=app_private.resolve_fms_posting_account_set(statement.tenant_id))
 and (select bool_and(item.line_amount>0) and sum(item.line_amount)>2 from public.tms_carrier_statement_item item where item.statement_id=statement.id and item.is_active)
 and exists(select 1 from public.sys_user actor where actor.tenant_id=statement.tenant_id and actor.auth_user_id is not null and actor.status='1' and not actor.system_protected and not actor.user_roles @>array['R_SUPER'])
 and not exists(select 1 from public.fms_purchase_payable_document payable where payable.tms_statement_id=statement.id and payable.kind='financial') order by statement.id limit 1;
 if source.id is null then raise exception 'Transport security fixtures missing';end if;
 select auth_user_id into ordinary_actor from public.sys_user where tenant_id=source.tenant_id and auth_user_id is not null and status='1' and not system_protected and not user_roles @>array['R_SUPER'] order by id limit 1;
 select id into foreign_tenant from public.sys_tenant where id<>source.tenant_id limit 1;
 perform set_config('request.jwt.claim.sub',super_actor::text,true);perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',source.tenant_id)::text,true);
 select account.id into fund from public.fms_fund_account account join public.fms_currency currency on currency.id=account.currency_id where account.tenant_id=source.tenant_id and account.status='active' and account.account_type='bank' and currency.currency_code='CNY' and account.account_set_id=app_private.resolve_fms_posting_account_set(source.tenant_id) order by account.id limit 1;
 finance:=public.fms_import_carrier_payable_secure('financial',source.id);perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'submit');perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'approve');
 payment:=public.fms_push_payable_settlement_secure((finance->>'id')::uuid,'payment');principal:=round((payment->>'amount')::numeric/2,2);
 payment:=public.fms_save_payable_settlement_secure(payment||jsonb_build_object('lines',(select jsonb_agg(line||jsonb_build_object('fund_account_id',fund,'amount',principal,'approved_amount',principal,'planned_amount',principal)) from jsonb_array_elements(payment->'lines') line)));
 perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'submit');perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'approve');perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'confirm');
 select cash_transaction_id into cash_ident from public.fms_payable_payment_execution where document_id=(payment->>'id')::uuid and status='posted';
 insert into public.sys_role(tenant_id,role_code,role_name,enabled) values(source.tenant_id,role_code,'承运核销安全回归角色',true) returning id into fixture_role;
 insert into public.sys_role_menu(tenant_id,role_id,menu_id) select source.tenant_id,fixture_role,id from public.sys_menu where name in('FinanceCashTransaction:View','FinanceCashTransaction:Export','FinanceCashTransaction:Allocate','FinanceCashTransaction:Void','FinancePayablePayment:View','FinancePurchasePayable:View','FinancePayableWriteoff:View');
 with recursive accessible as(select id,parent_id from public.sys_menu where name in('FinanceCashTransaction','FinancePayablePayment','FinancePurchasePayable','FinancePayableWriteoff') union select parent.id,parent.parent_id from public.sys_menu parent join accessible child on child.parent_id=parent.id)
 insert into public.sys_role_menu(tenant_id,role_id,menu_id) select source.tenant_id,fixture_role,id from accessible on conflict do nothing;
 insert into public.sys_role_field_permission(tenant_id,role_id,resource_id,field_id,access_level)
 select source.tenant_id,fixture_role,resource.id,field.id,'edit' from public.sys_permission_resource resource join public.sys_permission_field field on field.resource_id=resource.id and field.tenant_id=resource.tenant_id where resource.tenant_id=source.tenant_id and ((resource.resource_key='tms.cash_transaction' and field.field_key='transactionAmounts') or (resource.resource_key='tms.carrier_statement' and field.field_key in('statementAmounts','settlementAmounts')));
 if (select count(*) from public.sys_role_field_permission where role_id=fixture_role)<>3 then raise exception 'Field permission fixtures missing';end if;
 delete from public.sys_user_field_permission permission using public.sys_permission_resource resource,public.sys_permission_field field where permission.user_id=(select id from public.sys_user where auth_user_id=ordinary_actor) and permission.tenant_id=source.tenant_id and resource.id=permission.resource_id and field.id=permission.field_id and ((resource.resource_key='tms.cash_transaction' and field.field_key='transactionAmounts') or (resource.resource_key='tms.carrier_statement' and field.field_key in('statementAmounts','settlementAmounts')));
 update public.sys_user set user_roles=array[role_code] where auth_user_id=ordinary_actor;
 perform set_config('request.jwt.claim.sub',ordinary_actor::text,true);
 insert into public.fms_account_set(tenant_id,account_set_code,account_set_name,legal_entity_name,base_currency_code,enabled_on,status) values(source.tenant_id,'QA_SYNC_'||upper(left(gen_random_uuid()::text,8)),'承运核销第二账套回滚测试','虚构验收主体','CNY',app_private.payable_business_date(),'active') returning id into other_book;
 insert into public.fms_currency(tenant_id,account_set_id,currency_code,currency_name,symbol,is_enabled,is_base) values(source.tenant_id,other_book,'CNY','人民币','¥',true,true) returning id into other_currency;
 perform set_config('request.jwt.claim.sub',ordinary_actor::text,true);
 insert into public.fms_fund_account(tenant_id,account_set_id,currency_id,account_code,account_name,account_type,bank_name,account_no_masked,account_no_fingerprint,opening_balance) values(source.tenant_id,other_book,other_currency,'QA_SYNC_FUND_'||upper(left(gen_random_uuid()::text,8)),'虚构承运第二账套账户','bank','虚构验收银行','**** QA',md5(gen_random_uuid()::text),10000) returning id into other_fund;
 perform set_config('request.jwt.claim.sub',super_actor::text,true);
 blocked:=false;begin perform public.create_fms_carrier_payment_secure(source.carrier_id,other_fund,app_private.payable_business_date(),0.01,'bank_transfer',null,'[]','禁止跨账套创建',jsonb_build_array(jsonb_build_object('statement_id',source.id,'amount',0.01)),null);exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Legacy carrier creation bypassed payable account book';end if;
 other_cash:=public.create_fms_carrier_payment_secure(source.carrier_id,other_fund,app_private.payable_business_date(),1,'bank_transfer',null,'[]','无分配第二账套回滚数据','[]',null);
 blocked:=false;begin perform public.allocate_tms_carrier_payment_secure(other_cash,jsonb_build_array(jsonb_build_object('statement_id',source.id,'amount',0.01)));exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Legacy reallocation bypassed payable account book';end if;
 select id into usd_currency from public.fms_currency where account_set_id=(finance->>'account_set_id')::uuid and currency_code='USD';
 if usd_currency is null then insert into public.fms_currency(tenant_id,account_set_id,currency_code,currency_name,symbol,is_enabled,is_base) values(source.tenant_id,(finance->>'account_set_id')::uuid,'USD','美元','$',true,false) returning id into usd_currency;else update public.fms_currency set is_enabled=true where id=usd_currency;end if;
 perform set_config('request.jwt.claim.sub',ordinary_actor::text,true);
 insert into public.fms_fund_account(tenant_id,account_set_id,currency_id,account_code,account_name,account_type,bank_name,account_no_masked,account_no_fingerprint,opening_balance) values(source.tenant_id,(finance->>'account_set_id')::uuid,usd_currency,'QA_SYNC_USD_'||upper(left(gen_random_uuid()::text,8)),'虚构美元回滚账户','bank','虚构验收银行','**** QA',md5(gen_random_uuid()::text),10000) returning id into usd_fund;
 perform set_config('request.jwt.claim.sub',super_actor::text,true);
 blocked:=false;begin perform public.create_fms_carrier_payment_secure(source.carrier_id,usd_fund,app_private.payable_business_date(),0.01,'bank_transfer',null,'[]','禁止错币付款',jsonb_build_array(jsonb_build_object('statement_id',source.id,'amount',0.01)),null);exception when foreign_key_violation then if sqlerrm like '%币种%' then blocked:=true;else raise;end if;when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Legacy carrier creation bypassed payable currency';end if;
 insert into qa_carrier_context values(source.tenant_id,source.id,(finance->>'id')::uuid,(payment->>'id')::uuid,(payment->'lines'->0->>'id')::uuid,cash_ident,principal,super_actor,ordinary_actor,fixture_role,foreign_tenant,other_cash);
end $fixtures$;

set local role authenticated;

do $matrix$
declare context qa_carrier_context;allocation_ident uuid;blocked boolean;index_value integer;cash_before numeric;
begin
 select * into context from qa_carrier_context;
 cash_before:=(public.tms_get_cash_transaction_secure(context.cash_id)->>'allocated_amount')::numeric;
 select (item->>'id')::uuid into allocation_ident from jsonb_array_elements(public.tms_get_cash_transaction_secure(context.cash_id)->'allocations') item where (item->>'is_active')::boolean;
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',context.foreign_tenant)::text,true);
 if public.tms_get_cash_transaction_secure(context.cash_id) is not null then raise exception 'Platform-selected cash detail crossed tenant scope';end if;
 if (public.tms_list_cash_transactions_secure(p_record_id=>context.cash_id)->>'total')::integer<>0 then raise exception 'Platform-selected cash list crossed tenant scope';end if;
 if (public.tms_list_cash_transactions_secure(p_record_id=>context.cash_id,p_purpose=>'export')->>'total')::integer<>0 then raise exception 'Platform-selected cash export crossed tenant scope';end if;
 blocked:=false;begin perform public.reverse_tms_carrier_cash_allocation_secure(allocation_ident,'选定其他租户拒绝');exception when others then if sqlerrm='有效付款核销记录不存在或已撤销' then blocked:=true;else raise;end if;end;
 if not blocked then raise exception 'Platform-selected carrier reversal crossed tenant scope';end if;
 blocked:=false;begin perform public.allocate_tms_carrier_payment_secure(context.cash_id,jsonb_build_array(jsonb_build_object('statement_id',context.statement_id,'amount',0.01)));exception when others then if sqlerrm='承运商付款记录不存在' then blocked:=true;else raise;end if;end;
 if not blocked then raise exception 'Platform-selected carrier allocation crossed tenant scope';end if;
 blocked:=false;begin perform public.void_tms_cash_transaction_secure(context.cash_id,'选定其他租户不能作废');exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Platform-selected cash void crossed tenant scope';end if;
 perform set_config('request.headers','{}',true);
 if (public.tms_list_cash_transactions_secure(p_record_id=>context.cash_id)->>'total')::integer<>1 then raise exception 'Platform-all cash list lost a managed payment';end if;
 blocked:=false;begin perform public.void_tms_cash_transaction_secure(context.cash_id,'存在有效核销不得自动作废');exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Managed void silently reversed active allocations';end if;
 perform public.reverse_tms_carrier_cash_allocation_secure(allocation_ident,'平台全部租户反核销');
 if exists(select 1 from public.fms_payable_writeoff_record where payment_line_id=context.payment_line_id and status='active') then raise exception 'Platform-all reversal did not synchronize unified record';end if;
 blocked:=false;begin perform public.allocate_tms_carrier_payment_secure(context.cash_id,jsonb_build_array(jsonb_build_object('statement_id',context.statement_id,'amount',2),jsonb_build_object('statement_id',context.statement_id,'amount',-1)));exception when invalid_parameter_value then blocked:=true;end;
 if not blocked then raise exception 'Negative component was silently netted into a valid allocation';end if;
 blocked:=false;begin perform public.allocate_tms_carrier_payment_secure(context.cash_id,jsonb_build_array(jsonb_build_object('statement_id',context.statement_id,'amount','NaN')));exception when invalid_parameter_value then blocked:=true;end;
 if not blocked then raise exception 'Nonfinite carrier allocation accepted';end if;
 perform public.allocate_tms_carrier_payment_secure(context.cash_id,jsonb_build_array(jsonb_build_object('statementId',context.statement_id,'amount',context.amount)));
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',context.tenant_id)::text,true);
 select (item->>'id')::uuid into allocation_ident from jsonb_array_elements(public.tms_get_cash_transaction_secure(context.cash_id)->'allocations') item where (item->>'is_active')::boolean;
 perform public.reverse_tms_carrier_cash_allocation_secure(allocation_ident,'平台指定租户反核销');
 perform public.allocate_tms_carrier_payment_secure(context.cash_id,jsonb_build_array(jsonb_build_object('statement_id',context.statement_id,'amount',context.amount)));
 perform set_config('request.jwt.claim.sub',context.ordinary_actor::text,true);
 if app_private.is_platform_super() then raise exception 'Ordinary actor gained administrator capability';end if;
 for index_value in 1..2 loop
  perform set_config('request.headers',case when index_value=1 then '{}' else jsonb_build_object('x-art-tenant-scope',context.foreign_tenant)::text end,true);
  if (public.tms_list_cash_transactions_secure(p_record_id=>context.cash_id)->>'total')::integer<>1 or (public.tms_list_cash_transactions_secure(p_record_id=>context.cash_id,p_purpose=>'export')->>'total')::integer<>1 then raise exception 'Ordinary cash list or export followed a forged tenant header';end if;
  select (item->>'id')::uuid into allocation_ident from jsonb_array_elements(public.tms_get_cash_transaction_secure(context.cash_id)->'allocations') item where (item->>'is_active')::boolean;
  perform public.reverse_tms_carrier_cash_allocation_secure(allocation_ident,'普通用户自身或伪造租户头反核销');
  perform public.allocate_tms_carrier_payment_secure(context.cash_id,jsonb_build_array(jsonb_build_object('statement_id',context.statement_id,'amount',context.amount)));
  if (select coalesce(sum(amount),0) from public.fms_payable_writeoff_record where payment_line_id=context.payment_line_id and status='active')<>context.amount then raise exception 'Ordinary actor lost managed writeoff synchronization';end if;
 end loop;
 select (item->>'id')::uuid into allocation_ident from jsonb_array_elements(public.tms_get_cash_transaction_secure(context.cash_id)->'allocations') item where (item->>'is_active')::boolean;
 perform public.reverse_tms_carrier_cash_allocation_secure(allocation_ident,'缺少来源付款取消权限前先反核销');
 if public.tms_get_cash_transaction_secure(context.cash_id)->'managed_payment'->>'id' is distinct from context.payment_id::text then raise exception 'Cash detail lost recognizable managed payment source';end if;
 blocked:=false;begin perform public.void_tms_cash_transaction_secure(context.cash_id,'不得绕过统一付款取消权限');exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Legacy void bypassed managed payment Confirm permission';end if;
 perform public.allocate_tms_carrier_payment_secure(context.cash_id,jsonb_build_array(jsonb_build_object('statement_id',context.statement_id,'amount',context.amount)));
 if has_table_privilege('authenticated','public.tms_carrier_cash_allocation','INSERT') or has_table_privilege('authenticated','public.tms_carrier_cash_allocation','UPDATE') then raise exception 'Carrier allocation raw writes were broadened';end if;
 if has_function_privilege('authenticated','app_private.lock_managed_carrier_allocation(uuid,uuid[],boolean)','EXECUTE') or has_function_privilege('anon','public.allocate_tms_carrier_payment_secure(uuid,jsonb)','EXECUTE') or has_function_privilege('anon','public.reverse_tms_carrier_cash_allocation_secure(uuid,text)','EXECUTE') then raise exception 'Carrier synchronization private or anonymous execution exposed';end if;
 if (public.tms_get_cash_transaction_secure(context.cash_id)->>'allocated_amount')::numeric<>cash_before then raise exception 'Tenant matrix changed final allocated balance';end if;
 perform set_config('request.jwt.claim.sub',context.super_actor::text,true);perform set_config('request.headers','{}',true);
end $matrix$;

reset role;

do $hide_parent$
declare context qa_carrier_context;
begin
 select * into context from qa_carrier_context;
 delete from public.sys_role_menu where role_id=context.role_id and menu_id in(select id from public.sys_menu where name='FinancePayablePayment:View');
 perform set_config('request.jwt.claim.sub',context.ordinary_actor::text,true);
end $hide_parent$;

set local role authenticated;

do $parent_privacy$
declare context qa_carrier_context;metadata jsonb;
begin
 select * into context from qa_carrier_context;
 metadata:=public.tms_get_cash_transaction_secure(context.cash_id)->'managed_payment';
 if metadata is distinct from jsonb_build_object('linked',true) then raise exception 'Cash-only viewer received managed payment identity or status';end if;
 perform set_config('request.jwt.claim.sub',context.super_actor::text,true);
end $parent_privacy$;

reset role;

do $remove_permission$
declare context qa_carrier_context;
begin
 select * into context from qa_carrier_context;
 insert into public.sys_role_menu(tenant_id,role_id,menu_id) select context.tenant_id,context.role_id,id from public.sys_menu where name='FinancePayablePayment:View' on conflict do nothing;
 delete from public.sys_role_menu where role_id=context.role_id and menu_id in(select id from public.sys_menu where name='FinanceCashTransaction:Allocate');
 perform set_config('request.jwt.claim.sub',context.ordinary_actor::text,true);
end $remove_permission$;

set local role authenticated;

do $denied$
declare context qa_carrier_context;blocked boolean;allocation_ident uuid;
begin
 select * into context from qa_carrier_context;
 select (item->>'id')::uuid into allocation_ident from jsonb_array_elements(public.tms_get_cash_transaction_secure(context.cash_id)->'allocations') item where (item->>'is_active')::boolean;
 blocked:=false;begin perform public.reverse_tms_carrier_cash_allocation_secure(allocation_ident,'缺少按钮权限');exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Reversal ignored exact Allocate permission';end if;
 blocked:=false;begin perform public.allocate_tms_carrier_payment_secure(context.cash_id,jsonb_build_array(jsonb_build_object('statement_id',context.statement_id,'amount',0.01)));exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Allocation ignored exact Allocate permission';end if;
 perform set_config('request.jwt.claim.sub',context.super_actor::text,true);
end $denied$;

reset role;

do $read_only$
declare context qa_carrier_context;
begin
 select * into context from qa_carrier_context;
 insert into public.sys_role_menu(tenant_id,role_id,menu_id) select context.tenant_id,context.role_id,id from public.sys_menu where name='FinanceCashTransaction:Allocate';
 update public.sys_role_field_permission permission set access_level='read' from public.sys_permission_resource resource,public.sys_permission_field field where permission.role_id=context.role_id and resource.id=permission.resource_id and field.id=permission.field_id and resource.resource_key='tms.cash_transaction' and field.field_key='transactionAmounts';
 perform set_config('request.jwt.claim.sub',context.ordinary_actor::text,true);
end $read_only$;

set local role authenticated;

do $field_denied$
declare context qa_carrier_context;blocked boolean;allocation_ident uuid;
begin
 select * into context from qa_carrier_context;
 select (item->>'id')::uuid into allocation_ident from jsonb_array_elements(public.tms_get_cash_transaction_secure(context.cash_id)->'allocations') item where (item->>'is_active')::boolean;
 blocked:=false;begin perform public.reverse_tms_carrier_cash_allocation_secure(allocation_ident,'字段只读');exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Read-only amount field allowed reversal';end if;
 blocked:=false;begin perform public.allocate_tms_carrier_payment_secure(context.cash_id,jsonb_build_array(jsonb_build_object('statement_id',context.statement_id,'amount',0.01)));exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Read-only amount field allowed allocation';end if;
 blocked:=false;begin perform public.void_tms_cash_transaction_secure(context.cash_id,'只读字段不得作废');exception when insufficient_privilege then if sqlerrm like '%字段权限%' then blocked:=true;else raise;end if;end;
 if not blocked then raise exception 'Read-only amount field allowed cash void';end if;
 perform set_config('request.jwt.claim.sub',context.super_actor::text,true);
end $field_denied$;

reset role;

do $mask_amounts$
declare context qa_carrier_context;
begin
 select * into context from qa_carrier_context;
 update public.sys_role_field_permission permission set access_level='masked' from public.sys_permission_resource resource,public.sys_permission_field field where permission.role_id=context.role_id and resource.id=permission.resource_id and field.id=permission.field_id and resource.resource_key='tms.cash_transaction' and field.field_key='transactionAmounts';
 perform set_config('request.jwt.claim.sub',context.ordinary_actor::text,true);
end $mask_amounts$;

set local role authenticated;

do $masked_read$
declare context qa_carrier_context;payload jsonb;field_name text;
begin
 select * into context from qa_carrier_context;
 for payload in select public.tms_get_cash_transaction_secure(context.cash_id) union all select public.tms_list_cash_transactions_secure(p_record_id=>context.cash_id)->'records'->0 union all select public.tms_list_cash_transactions_secure(p_record_id=>context.cash_id,p_purpose=>'export')->'records'->0 loop
  foreach field_name in array array['amount','allocated_amount','unallocated_amount','principal_amount','fee_amount','allocatable_amount'] loop
   if payload->>field_name is distinct from '***' then raise exception 'Masked cash read exposes %',field_name;end if;
  end loop;
 end loop;
 if has_function_privilege('authenticated','app_private.tms_cash_transaction_to_secure_json(jsonb,uuid,jsonb,jsonb)','EXECUTE') or has_function_privilege('anon','app_private.tms_cash_transaction_to_secure_json(jsonb,uuid,jsonb,jsonb)','EXECUTE') then raise exception 'Private cash formatter allows caller-supplied field access';end if;
 perform set_config('request.jwt.claim.sub',context.super_actor::text,true);
end $masked_read$;

reset role;

do $hide_amounts$
declare context qa_carrier_context;
begin
 select * into context from qa_carrier_context;
 update public.sys_role_field_permission permission set access_level='hidden' from public.sys_permission_resource resource,public.sys_permission_field field where permission.role_id=context.role_id and resource.id=permission.resource_id and field.id=permission.field_id and resource.resource_key='tms.cash_transaction' and field.field_key='transactionAmounts';
 perform set_config('request.jwt.claim.sub',context.ordinary_actor::text,true);
end $hide_amounts$;

set local role authenticated;

do $hidden_read$
declare context qa_carrier_context;payload jsonb;field_name text;
begin
 select * into context from qa_carrier_context;
 for payload in select public.tms_get_cash_transaction_secure(context.cash_id) union all select public.tms_list_cash_transactions_secure(p_record_id=>context.cash_id)->'records'->0 union all select public.tms_list_cash_transactions_secure(p_record_id=>context.cash_id,p_purpose=>'export')->'records'->0 loop
  foreach field_name in array array['amount','allocated_amount','unallocated_amount','principal_amount','fee_amount','allocatable_amount'] loop
   if payload ? field_name then raise exception 'Hidden cash read exposes %',field_name;end if;
  end loop;
 end loop;
 perform set_config('request.jwt.claim.sub',context.super_actor::text,true);
end $hidden_read$;

reset role;

do $managed_permission$
declare context qa_carrier_context;
begin
 select * into context from qa_carrier_context;
 update public.sys_role_field_permission permission set access_level='edit' from public.sys_permission_resource resource,public.sys_permission_field field where permission.role_id=context.role_id and resource.id=permission.resource_id and field.id=permission.field_id and resource.resource_key='tms.cash_transaction' and field.field_key='transactionAmounts';
 insert into public.sys_role_menu(tenant_id,role_id,menu_id) select context.tenant_id,context.role_id,id from public.sys_menu where name='FinancePayablePayment:Confirm';
 perform set_config('request.jwt.claim.sub',context.ordinary_actor::text,true);
end $managed_permission$;

set local role authenticated;

do $managed_void$
declare context qa_carrier_context;allocation_ident uuid;cash_detail jsonb;parent_detail jsonb;
begin
 select * into context from qa_carrier_context;
 select (item->>'id')::uuid into allocation_ident from jsonb_array_elements(public.tms_get_cash_transaction_secure(context.cash_id)->'allocations') item where (item->>'is_active')::boolean;
 perform public.reverse_tms_carrier_cash_allocation_secure(allocation_ident,'作废前撤销所有核销');
 perform public.void_tms_cash_transaction_secure(context.cash_id,'运输端作废同步取消统一付款确认');
 cash_detail:=public.tms_get_cash_transaction_secure(context.cash_id);
 parent_detail:=public.fms_payable_settlement_list_secure('payment',jsonb_build_object('id',context.payment_id))->'data'->0;
 if cash_detail->>'status'<>'voided' or parent_detail->>'status'<>'approved' then raise exception 'Cash void left a ghost confirmed managed payment';end if;
 if cash_detail->'managed_payment'->>'id' is distinct from context.payment_id::text then raise exception 'Voided cash lost historical payment lineage';end if;
 perform set_config('request.jwt.claim.sub',context.super_actor::text,true);
end $managed_void$;

reset role;

do $ledger$
declare context qa_carrier_context;original_entry uuid;cash_total numeric;
begin
 select * into context from qa_carrier_context;
 select id into original_entry from public.fms_fund_ledger_entry where source_type='carrier_payment' and source_id=context.cash_id and direction='outflow';
 select sum(case direction when 'inflow' then amount else -amount end) into cash_total from public.fms_fund_ledger_entry where id=original_entry or reversal_of_id=original_entry;
 if cash_total<>0 or not exists(select 1 from public.fms_payable_payment_execution where cash_transaction_id=context.cash_id and status='reversed') then raise exception 'Managed cash void did not restore funds exactly once';end if;
end $ledger$;

rollback;
