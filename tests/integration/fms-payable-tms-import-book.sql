begin;

do $import_book$
declare
 source record;
 super_actor uuid;
 ordinary_actor uuid;
 other_book uuid;
 other_currency uuid;
 other_fund uuid;
 original_fund uuid;
 cash_id uuid;
 allocation_id uuid;
 imported jsonb;
 blocked boolean;
 checked integer:=0;
begin
 select auth_user_id into super_actor from public.sys_user where user_roles @>array['R_SUPER'] and auth_user_id is not null limit 1;
 for source in select statement.* from public.tms_carrier_statement statement
 where statement.status='confirmed'
 and exists(select 1 from public.sys_user actor where actor.tenant_id=statement.tenant_id and actor.auth_user_id is not null and actor.status='1' and not actor.system_protected and not actor.user_roles @>array['R_SUPER'])
 and exists(select 1 from public.fms_fund_account account join public.fms_currency currency on currency.id=account.currency_id where account.tenant_id=statement.tenant_id and account.status='active' and account.account_type='bank' and currency.currency_code='CNY' and account.account_set_id=app_private.resolve_fms_posting_account_set(statement.tenant_id))
 and (select bool_and(item.line_amount>0) and sum(item.line_amount)>1 from public.tms_carrier_statement_item item where item.statement_id=statement.id and item.is_active)
 and not exists(select 1 from public.fms_purchase_payable_document payable where payable.tms_statement_id=statement.id and payable.kind='financial')
 order by statement.id limit 2 loop
  select auth_user_id into ordinary_actor from public.sys_user where tenant_id=source.tenant_id and auth_user_id is not null and status='1' and not system_protected and not user_roles @>array['R_SUPER'] order by id limit 1;
  perform set_config('request.jwt.claim.sub',ordinary_actor::text,true);
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',source.tenant_id)::text,true);
  insert into public.fms_account_set(tenant_id,account_set_code,account_set_name,legal_entity_name,base_currency_code,enabled_on,status)
  values(source.tenant_id,'QA_IMPORT_'||upper(left(gen_random_uuid()::text,8)),'导入账套回滚验收','虚构导入验收主体','CNY',app_private.payable_business_date(),'active') returning id into other_book;
  insert into public.fms_currency(tenant_id,account_set_id,currency_code,currency_name,symbol,is_enabled,is_base)
  values(source.tenant_id,other_book,'CNY','人民币','¥',true,true) returning id into other_currency;
  insert into public.fms_fund_account(tenant_id,account_set_id,currency_id,account_code,account_name,account_type,bank_name,account_no_masked,account_no_fingerprint,opening_balance)
  values(source.tenant_id,other_book,other_currency,'QA_IMPORT_'||upper(left(gen_random_uuid()::text,8)),'虚构异账套资金账户','bank','虚构验收银行','**** QA',md5(gen_random_uuid()::text),10) returning id into other_fund;
  perform set_config('request.jwt.claim.sub',super_actor::text,true);
  cash_id:=public.create_fms_carrier_payment_secure(source.carrier_id,other_fund,app_private.payable_business_date(),0.01,'bank_transfer',null,'[]','跨账套历史导入回滚验收',jsonb_build_array(jsonb_build_object('statement_id',source.id,'amount',0.01)),null);
  blocked:=false;
  begin
   perform public.fms_import_carrier_payable_secure('financial',source.id);
  exception when check_violation then
   if sqlerrm like '%账套%' then blocked:=true;else raise;end if;
  end;
  if not blocked then raise exception 'Transport import counted a historical payment from another account book';end if;
  if exists(select 1 from public.fms_purchase_payable_document where tms_statement_id=source.id and kind='financial') then raise exception 'Rejected transport import left a partial financial payable';end if;
  select id into allocation_id from public.tms_carrier_cash_allocation where transaction_id=cash_id and is_active;
  perform public.reverse_tms_carrier_cash_allocation_secure(allocation_id,'清理回滚验收跨账套分配');
  perform public.void_tms_cash_transaction_secure(cash_id,'清理回滚验收跨账套流水');
  cash_id:=public.create_tms_carrier_payment(source.carrier_id,app_private.payable_business_date(),0.01,'bank_transfer',null,'[]','未关联资金账户的历史回滚验收',jsonb_build_array(jsonb_build_object('statement_id',source.id,'amount',0.01)));
  blocked:=false;
  begin
   perform public.fms_import_carrier_payable_secure('financial',source.id);
  exception when check_violation then
   if sqlerrm like '%账套%' then blocked:=true;else raise;end if;
  end;
  if not blocked then raise exception 'Transport import guessed an account book for an unbound historical payment';end if;
  select id into allocation_id from public.tms_carrier_cash_allocation where transaction_id=cash_id and is_active;
  perform public.reverse_tms_carrier_cash_allocation_secure(allocation_id,'清理回滚验收未关联账户分配');
  perform public.void_tms_cash_transaction_secure(cash_id,'清理回滚验收未关联账户流水');
  select account.id into original_fund from public.fms_fund_account account join public.fms_currency currency on currency.id=account.currency_id where account.tenant_id=source.tenant_id and account.status='active' and account.account_type='bank' and currency.currency_code='CNY' and account.account_set_id=app_private.resolve_fms_posting_account_set(source.tenant_id) order by account.id limit 1;
  cash_id:=public.create_fms_carrier_payment_secure(source.carrier_id,original_fund,app_private.payable_business_date(),0.01,'bank_transfer',null,'[]','同账套历史导入回滚验收',jsonb_build_array(jsonb_build_object('statement_id',source.id,'amount',0.01)),null);
  imported:=public.fms_import_carrier_payable_secure('financial',source.id);
  if imported->>'account_set_id' is distinct from (select account_set_id::text from public.fms_fund_account where id=original_fund) then raise exception 'Same-book transport import changed the payment account book';end if;
  if (imported->>'written_off_amount')::numeric is distinct from source.settled_amount+0.01 then raise exception 'Same-book transport import lost historical payment';end if;
  checked:=checked+1;
 end loop;
 if checked<>2 then raise exception 'Need two historical transport import scenarios';end if;
end $import_book$;

rollback;
