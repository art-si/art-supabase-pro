begin;
set local jit=off;
set local statement_timeout='8s';

create function pg_temp.check_ar_book_snapshot(p_currency text) returns jsonb
language plpgsql as $test$
declare tenant uuid;actor uuid;profile uuid;original_roles text[];fixture_role uuid;fixture_code text:='QA_AR_BOOK_'||upper(left(gen_random_uuid()::text,8));
 book uuid;other_book uuid;currency_ident uuid;customer uuid;organization uuid;estimate_type uuid;financial_type uuid;resource_ident uuid;field_ident uuid;
 estimate_ident uuid;financial_ident uuid;reversal_ident uuid;manual_ident uuid;context_value jsonb;payload jsonb;rate_value numeric:=case when p_currency='CNY' then 1 else 7 end;blocked boolean;
begin
 if p_currency not in('CNY','USD') then raise exception 'Unsupported snapshot fixture currency';end if;
 select id into tenant from public.sys_tenant where tenant_code='qa-payable-20261022';
 select id,auth_user_id,user_roles into profile,actor,original_roles from public.sys_user where tenant_id=tenant and auth_user_id is not null and status='1' order by id limit 1;
 select id into book from public.fms_account_set where tenant_id=tenant and is_default and status='active' and base_currency_code='CNY';
 select id into customer from public.mdm_customer where tenant_id=tenant and enabled order by id limit 1;
 select id into organization from public.mdm_organization where tenant_id=tenant and organization_type='company' and status='1' order by id limit 1;
 select id into estimate_type from public.mdm_document_type where tenant_id=tenant and document_type_code='AR_EST_STANDARD';
 select id into financial_type from public.mdm_document_type where tenant_id=tenant and document_type_code='AR_FIN_STANDARD';
 if actor is null or book is null or customer is null or organization is null then raise exception 'Missing isolated ordinary AR snapshot fixtures';end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers','{}',true);
 if app_private.is_platform_super() then raise exception 'Approval snapshot fixture must use an ordinary actor';end if;
 insert into public.sys_role(tenant_id,role_code,role_name,enabled) values(tenant,fixture_code,'应收原账套快照回滚角色',true) returning id into fixture_role;
 insert into public.sys_role_menu(role_id,menu_id,tenant_id) select fixture_role,id,tenant from public.sys_menu where name in(
  'FinanceEstimatedReceivable','FinanceEstimatedReceivable:View','FinanceEstimatedReceivable:Add','FinanceEstimatedReceivable:Edit','FinanceEstimatedReceivable:Submit','FinanceEstimatedReceivable:Approve','FinanceEstimatedReceivable:Push',
  'FinanceFinancialReceivable','FinanceFinancialReceivable:View','FinanceFinancialReceivable:Add','FinanceFinancialReceivable:Edit','FinanceFinancialReceivable:Submit','FinanceFinancialReceivable:Approve');
 update public.sys_user set user_roles=array[fixture_code] where id=profile;
 select resource.id,field.id into resource_ident,field_ident from public.sys_permission_resource resource join public.sys_permission_field field on field.resource_id=resource.id and field.tenant_id=resource.tenant_id
  where resource.tenant_id=tenant and resource.resource_key='fms.receivable' and field.field_key='amounts';
 insert into public.sys_role_field_permission(tenant_id,role_id,resource_id,field_id,access_level,create_by)
 values(tenant,fixture_role,resource_ident,field_ident,'edit',actor::text);
 if p_currency='USD' then
  insert into public.fms_currency(tenant_id,account_set_id,currency_code,currency_name,is_enabled)
  values(tenant,book,'USD','美元',true) on conflict(account_set_id,currency_code) do update set is_enabled=true returning id into currency_ident;
  insert into public.fms_exchange_rate(tenant_id,account_set_id,currency_id,rate_date,rate_type,direct_rate)
  values(tenant,book,currency_ident,app_private.payable_business_date(),'spot',rate_value)
  on conflict(account_set_id,currency_id,rate_date,rate_type) do update set direct_rate=excluded.direct_rate;
 end if;
 payload:=jsonb_build_object('kind','estimate','tenantId',tenant,'documentTypeId',estimate_type,'customerId',customer,'settlementOrganizationId',organization,
  'businessDate',app_private.payable_business_date(),'currencyCode',p_currency,'exchangeRate',rate_value,'settlementMethod','cash',
  'lines',jsonb_build_array(jsonb_build_object('lineNo',10,'basis','amount','materialDescription','原账套快照回滚金额行','enteredGrossAmount',100,
   'quantity',0,'unitPrice',0,'priceBasis','taxed','taxRate',0,'discountMethod','none')));
 estimate_ident:=public.fms_save_receivable_document_secure(payload);
 perform public.fms_act_receivable_document_secure(estimate_ident,'submit');
 perform public.fms_act_receivable_document_secure(estimate_ident,'approve');
 context_value:=app_private.ar_financial_book_context(estimate_ident);
 if(context_value->>'configured')::boolean is distinct from true or(context_value->>'account_set_id')::uuid<>book
  or context_value->>'base_currency_code'<>'CNY' or(context_value->>'exchange_rate')::numeric<>rate_value
  or not exists(select 1 from public.fms_receivable_document where id=estimate_ident and account_set_id=book and book_snapshot_version=1
   and book_binding_source='approval' and book_bound_by=actor and book_bound_at is not null) then
  raise exception 'Approval did not preserve the original tenant/book/currency/rate snapshot';
 end if;
 insert into public.fms_account_set(tenant_id,account_set_code,account_set_name,legal_entity_name,base_currency_code,enabled_on,status)
 values(tenant,fixture_code,'切换默认后的第二账套','虚构回滚验收主体','CNY',app_private.payable_business_date(),'active') returning id into other_book;
 insert into public.fms_currency(tenant_id,account_set_id,currency_code,currency_name,is_enabled,is_base)
 values(tenant,other_book,'CNY','人民币',true,true);
 if p_currency='USD' then
  insert into public.fms_currency(tenant_id,account_set_id,currency_code,currency_name,is_enabled) values(tenant,other_book,'USD','美元',true);
  insert into public.fms_exchange_rate(tenant_id,account_set_id,currency_id,rate_date,rate_type,direct_rate)
  select tenant,other_book,id,app_private.payable_business_date(),'spot',9 from public.fms_currency where account_set_id=other_book and currency_code='USD';
 end if;
 update public.fms_account_set set is_default=false where id=book;
 update public.fms_account_set set is_default=true where id=other_book;
 if(app_private.ar_financial_book_context(estimate_ident)->>'account_set_id')::uuid<>book then raise exception 'Default book change moved the original approval';end if;
 blocked:=false;
 begin perform app_private.ar_assert_financial_book(estimate_ident);exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Native AR processing ignored the recorded original book';end if;
 blocked:=false;
 begin update public.fms_receivable_document set account_set_id=other_book where id=estimate_ident;exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Approved book snapshot could be overwritten';end if;
 blocked:=false;
 begin update public.fms_receivable_document set exchange_rate=rate_value+1 where id=estimate_ident;exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Approved historical exchange rate could be overwritten';end if;
 financial_ident:=public.fms_push_financial_receivable_secure(estimate_ident);
 perform public.fms_act_receivable_document_secure(financial_ident,'submit');
 perform public.fms_act_receivable_document_secure(financial_ident,'approve');
 select id into strict reversal_ident from public.fms_receivable_document where financial_id=financial_ident and kind='reversal';
 if(app_private.ar_financial_book_context(financial_ident)->>'account_set_id')::uuid<>book
  or(app_private.ar_financial_book_context(reversal_ident)->>'account_set_id')::uuid<>book
  or(app_private.ar_financial_book_context(financial_ident)->>'exchange_rate')::numeric<>rate_value then
  raise exception 'Financial receivable or system reversal failed to inherit the original estimate book';
 end if;
 manual_ident:=public.fms_save_receivable_document_secure(payload||jsonb_build_object('kind','financial','documentTypeId',financial_type));
 perform public.fms_act_receivable_document_secure(manual_ident,'submit');
 perform public.fms_act_receivable_document_secure(manual_ident,'approve');
 if(app_private.ar_financial_book_context(manual_ident)->>'account_set_id')::uuid<>other_book then raise exception 'New root approval did not record its actual approval-time book';end if;
 if p_currency='USD' and(app_private.ar_financial_book_context(manual_ident)->>'exchange_rate')::numeric<>9 then raise exception 'New root approval did not use its own book date rate';end if;
 if p_currency='USD' then
  blocked:=false;
  begin update public.fms_currency set currency_code='XQA' where id=currency_ident;exception when foreign_key_violation then blocked:=true;end;
  if not blocked then raise exception 'Referenced AR currency code could be renamed';end if;
 end if;
 if has_function_privilege('authenticated','app_private.ar_financial_book_context(uuid,uuid[])','EXECUTE') or has_function_privilege('anon','app_private.capture_ar_financial_book()','EXECUTE') then
  raise exception 'Private historical book controls became client executable';
 end if;
 update public.fms_account_set set is_default=false where id=other_book;
 update public.fms_account_set set is_default=true where id=book;
 update public.sys_user set user_roles=original_roles where id=profile;
 return jsonb_build_object('currency',p_currency,'status','passed','original_book',book,'new_root_book',other_book);
end $test$;

select pg_temp.check_ar_book_snapshot('CNY');
select pg_temp.check_ar_book_snapshot('USD');

do $legacy$
declare actor uuid;document record;context_value jsonb;unverified integer:=0;verified integer:=0;blocked boolean;
begin
 select auth_user_id into actor from public.sys_user where auth_user_id is not null and user_roles @>array['R_SUPER'] order by id limit 1;
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers','{}',true);
 for document in select * from public.fms_receivable_document where status='approved' and book_snapshot_version is null order by id loop
  context_value:=app_private.ar_financial_book_context(document.id);
  if(context_value->>'configured')::boolean then verified:=verified+1;
  else
   unverified:=unverified+1;blocked:=false;
   begin
    update public.fms_receivable_document set account_set_id=app_private.resolve_fms_posting_account_set(document.tenant_id),base_currency_code='CNY',book_snapshot_version=1,
     book_binding_source='evidence',book_bound_at=clock_timestamp(),book_bound_by=actor where id=document.id;
   exception when check_violation then blocked:=true;end;
   if not blocked then raise exception 'Unverified legacy receivable was guessed from the current default book';end if;
  end if;
 end loop;
 if verified=0 or unverified=0 then raise exception 'Legacy evidence audit did not cover both known and unknown original books';end if;
 if exists(select 1 from public.fms_receivable_document where book_binding_source='evidence') then raise exception 'Read-only evidence audit unexpectedly backfilled legacy books';end if;
end $legacy$;
rollback;
