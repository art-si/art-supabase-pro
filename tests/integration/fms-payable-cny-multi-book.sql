begin;
set local jit=off;
set local statement_timeout='8s';

create function pg_temp.check_payable_cny_multi_book(p_case integer) returns jsonb
language plpgsql as $test$
declare
 tenant uuid;
 actor uuid;
 platform_actor uuid;
 platform_tenant uuid;
 source_document public.fms_payable_settlement_document;
 source_line public.fms_payable_settlement_line;
 original_book uuid;
 other_book uuid;
 original_fund uuid;
 other_fund uuid;
 currency_ident uuid;
 method_ident uuid;
 purpose_ident uuid;
 request_document jsonb;
 input_line jsonb;
 saved jsonb;
 original_documents bigint;
 original_lines bigint;
 blocked boolean;
begin
 if p_case not between 1 and 4 then raise exception 'Unsupported CNY book-boundary case';end if;
 select id into tenant from public.sys_tenant where tenant_code='qa-payable-20261022';
 select auth_user_id into actor from public.sys_user where tenant_id=tenant and status='1' and auth_user_id is not null order by id limit 1;
 select auth_user_id,tenant_id into platform_actor,platform_tenant from public.sys_user
 where auth_user_id is not null and user_roles @>array['R_SUPER'] order by id limit 1;
 select * into source_document from public.fms_payable_settlement_document
 where tenant_id=tenant and kind='payment' and status='confirmed' and currency_code='CNY'
 order by created_at desc,id limit 1;
 select * into source_line from public.fms_payable_settlement_line
 where document_id=source_document.id and supplier_id is not null order by line_no,id limit 1;
 select account_set_id into original_book from public.fms_payable_payment_execution
 where document_id=source_document.id and status='posted' order by id limit 1;
 select account.id into original_fund from public.fms_fund_account account
 join public.fms_currency currency on currency.id=account.currency_id and currency.account_set_id=account.account_set_id
 where account.tenant_id=tenant and account.account_set_id=original_book and account.account_type='cash'
  and account.status='active' and currency.currency_code='CNY' order by account.id limit 1;
 if actor is null or platform_actor is null or source_line.id is null or original_fund is null then
  raise exception 'Missing ordinary QA book-boundary fixtures';
 end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.headers','{}',true);
 if app_private.is_platform_super() then raise exception 'Expected ordinary QA actor';end if;
 insert into public.fms_account_set(tenant_id,account_set_code,account_set_name,legal_entity_name,base_currency_code,enabled_on,status)
 values(tenant,'QA_CNY_BOOK_'||upper(left(gen_random_uuid()::text,8)),'人民币跨账套回滚验收',
  '虚构回滚主体','CNY',source_document.business_date,'active') returning id into other_book;
 insert into public.fms_currency(tenant_id,account_set_id,currency_code,currency_name,is_enabled,is_base)
 values(tenant,other_book,'CNY','人民币',true,true)
 on conflict(account_set_id,currency_code) do update set is_enabled=true returning id into currency_ident;
 insert into public.fms_fund_account(tenant_id,account_set_id,currency_id,account_code,account_name,account_type,account_no_masked,account_no_fingerprint,opening_balance,online_banking_enabled)
 values(tenant,other_book,currency_ident,'QA_CNY_FUND_'||upper(left(gen_random_uuid()::text,8)),
  '跨账套回滚虚构现金账户','cash','**** QA',md5(gen_random_uuid()::text),100,false) returning id into other_fund;
 select id into method_ident from public.mdm_settlement_method where tenant_id=tenant and category='cash' and enabled order by id limit 1;
 select id into purpose_ident from public.mdm_payment_purpose where tenant_id=tenant and code='201' and enabled;
 if p_case in(3,4) then
  perform set_config('request.jwt.claim.sub',platform_actor::text,true);
  if app_private.is_platform_super() is distinct from true then raise exception 'Expected platform actor';end if;
 end if;
 if p_case=2 then perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',platform_tenant)::text,true);end if;
 if p_case=4 then perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',tenant)::text,true);end if;
 input_line:=jsonb_build_object('purpose_id',purpose_ident,'supplier_id',source_line.supplier_id,
  'payee_supplier_id',source_line.supplier_id,'settlement_method_id',method_ident,'amount',1,'approved_amount',1,'planned_amount',1,'cash_discount',0);
 request_document:=jsonb_build_object('kind','payment','tenant_id',tenant,'document_type_id',source_document.document_type_id,
  'business_date',source_document.business_date,'currency_code','CNY','exchange_rate',1,
  'details',jsonb_build_object('fee',0,'payment_type','active'),
  'lines',jsonb_build_array(input_line||jsonb_build_object('fund_account_id',original_fund),input_line||jsonb_build_object('fund_account_id',other_fund)));
 select count(*) into original_documents from public.fms_payable_settlement_document where tenant_id=tenant;
 select count(*) into original_lines from public.fms_payable_settlement_line where tenant_id=tenant;
 blocked:=false;
 begin
  perform public.fms_save_payable_settlement_secure(request_document);
 exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'CNY multi-book payment bypassed the source book boundary';end if;
 if (select count(*) from public.fms_payable_settlement_document where tenant_id=tenant)<>original_documents
  or(select count(*) from public.fms_payable_settlement_line where tenant_id=tenant)<>original_lines then
  raise exception 'Rejected cross-book save left a partial document or line';
 end if;
 blocked:=false;
 begin
  perform public.fms_save_payable_settlement_secure(request_document||jsonb_build_object('account_set_id',original_book));
 exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Explicit book accepted a fund account from another book';end if;
 saved:=public.fms_save_payable_settlement_secure(request_document||jsonb_build_object('lines',
  jsonb_build_array(input_line||jsonb_build_object('fund_account_id',original_fund),input_line||jsonb_build_object('fund_account_id',original_fund))));
 if (saved->>'account_set_id')::uuid<>original_book or saved->>'currency_code'<>'CNY'
  or(saved->>'amount')::numeric<>2 or jsonb_array_length(saved->'lines')<>2
  or(saved->>'tenant_id')::uuid<>tenant then raise exception 'Same-book multi-line payment was not retained';end if;
 return jsonb_build_object('case',p_case,'status','passed','cross_book_rejected',true,'same_book_two_lines',true);
end $test$;

select pg_temp.check_payable_cny_multi_book(1);
select pg_temp.check_payable_cny_multi_book(2);
select pg_temp.check_payable_cny_multi_book(3);
select pg_temp.check_payable_cny_multi_book(4);
rollback;
