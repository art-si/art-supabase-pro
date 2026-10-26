begin;
set local jit=off;
set local statement_timeout='8s';

create function pg_temp.check_payable_fx_writer(p_case integer) returns jsonb
language plpgsql as $test$
declare
 source_document public.fms_payable_settlement_document;
 source_line public.fms_payable_settlement_line;
 original_book public.fms_account_set;
 actor uuid;
 platform_actor uuid;
 platform_tenant uuid;
 caller_actor uuid;
 currency_ident uuid;
 fund_ident uuid;
 wrong_book uuid;
 document_ident uuid;
 execution_ident uuid;
 source_ledger uuid;
 method_ident uuid;
 purpose_ident uuid;
 original_count bigint;
 active_count bigint;
 saved jsonb;
 payment_line jsonb;
 request_document jsonb;
 request_lines jsonb;
 result jsonb;
 refund_option jsonb;
 rate_value numeric:=case when p_case=2 then 1.5 else 7.2 end;
 fee_value numeric:=case when p_case=2 then 0.01 else 1 end;
 principal_value numeric:=case when p_case=2 then 0.02 else 100 end;
 discount_value numeric:=case when p_case=2 then 0.02 else 2 end;
 cash_base numeric;
 discount_base numeric;
 fee_base numeric;
 ledger_value numeric;
 blocked boolean;
begin
 if p_case not between 1 and 5 then raise exception 'Unsupported writer test case';end if;
 select document.* into source_document
 from public.fms_payable_settlement_document document join public.sys_tenant tenant on tenant.id=document.tenant_id
 where tenant.tenant_code='qa-payable-20261022' and document.kind='payment' and document.status='confirmed'
  and document.fx_snapshot_version is null
 order by document.created_at desc,document.id limit 1;
 select * into source_line from public.fms_payable_settlement_line where document_id=source_document.id order by line_no,id limit 1;
 select book.* into original_book from public.fms_payable_payment_execution execution
 join public.fms_account_set book on book.id=execution.account_set_id and book.tenant_id=execution.tenant_id
 where execution.document_id=source_document.id and execution.status='posted' limit 1;
 select auth_user_id into actor from public.sys_user where auth_user_id=source_document.created_by_user_id and tenant_id=source_document.tenant_id;
 select auth_user_id,tenant_id into platform_actor,platform_tenant from public.sys_user
 where auth_user_id is not null and user_roles @>array['R_SUPER'] order by id limit 1;
 if actor is null or original_book.id is null or source_line.supplier_id is null then raise exception 'Missing ordinary QA payment actor and book';end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.headers','{}',true);
 if app_private.is_platform_super() then raise exception 'FX writer test must use an ordinary QA actor';end if;
 insert into public.fms_currency(tenant_id,account_set_id,currency_code,currency_name,is_enabled)
 values(source_document.tenant_id,original_book.id,'USD','美元',true)
 on conflict(account_set_id,currency_code) do update set is_enabled=true returning id into currency_ident;
 insert into public.fms_exchange_rate(tenant_id,account_set_id,currency_id,rate_date,rate_type,direct_rate)
 values(source_document.tenant_id,original_book.id,currency_ident,source_document.business_date,'spot',rate_value)
 on conflict(account_set_id,currency_id,rate_date,rate_type) do update set direct_rate=excluded.direct_rate;
 insert into public.fms_fund_account(tenant_id,account_set_id,currency_id,account_code,account_name,account_type,account_no_masked,account_no_fingerprint,opening_balance,online_banking_enabled)
 values(source_document.tenant_id,original_book.id,currency_ident,'FX_WRITER_'||upper(left(gen_random_uuid()::text,8)),
  '付款写入回滚专用虚构现金账户','cash','**** QA',md5(gen_random_uuid()::text),10000,false) returning id into fund_ident;
 select id into method_ident from public.mdm_settlement_method where tenant_id=source_document.tenant_id and category='cash' and enabled order by id limit 1;
 select id into purpose_ident from public.mdm_payment_purpose where tenant_id=source_document.tenant_id and code='201' and enabled;
 if p_case in(3,4) then
  if platform_actor is null then raise exception 'Missing platform-all and selected-scope actor';end if;
  perform set_config('request.jwt.claim.sub',platform_actor::text,true);
  if app_private.is_platform_super() is distinct from true then raise exception 'Platform scope fixture is not platform super';end if;
 end if;
 if p_case=4 then perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',source_document.tenant_id)::text,true);end if;
 if p_case=5 then perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',platform_tenant)::text,true);end if;
 payment_line:=jsonb_build_object('purpose_id',purpose_ident,'supplier_id',source_line.supplier_id,'payee_supplier_id',source_line.supplier_id,
  'settlement_method_id',method_ident,'fund_account_id',fund_ident,'amount',case when p_case=2 then 0.01 else 100 end,
  'cash_discount',case when p_case=2 then 0.01 else 2 end,'cash_base_amount',999,'discount_base_amount',999);
 request_lines:=jsonb_build_array(payment_line);
 if p_case=2 then request_lines:=request_lines||jsonb_build_array(payment_line);end if;
 request_document:=jsonb_build_object('kind','payment','tenant_id',source_document.tenant_id,'document_type_id',source_document.document_type_id,
  'business_date',source_document.business_date,'currency_code','USD','account_set_id',original_book.id,'exchange_rate',rate_value,
  'base_currency_code','EUR','base_amount',999,'details',jsonb_build_object('fee',fee_value,'payment_type','active'),
  'reason','FX_WRITER_ROLLBACK_'||p_case,'lines',request_lines);
 saved:=public.fms_save_payable_settlement_secure(request_document);
 document_ident:=(saved->>'id')::uuid;
 if saved->>'currency_code'<>'USD' or saved->>'base_currency_code'<>'CNY' or (saved->>'exchange_rate')::numeric<>rate_value
  or (saved->>'account_set_id')::uuid<>original_book.id or (saved->>'currency_id')::uuid<>currency_ident
  or (saved->>'fx_snapshot_version')::integer<>1 or (saved->>'amount')::numeric<>principal_value then
  raise exception 'Payment save did not bind the authoritative book and rate: %',saved;
 end if;
 update public.fms_exchange_rate set direct_rate=9 where account_set_id=original_book.id and currency_id=currency_ident
  and rate_date=source_document.business_date and rate_type='spot';
 saved:=public.fms_save_payable_settlement_secure((saved-'exchange_rate')||jsonb_build_object('remark','保留原记账汇率'));
 if (saved->>'exchange_rate')::numeric<>rate_value then raise exception 'Unrelated draft edit repriced its stored rate';end if;
 perform public.fms_act_payable_settlement_secure(array[document_ident],'submit');
 perform public.fms_act_payable_settlement_secure(array[document_ident],'approve');
 perform public.fms_act_payable_settlement_secure(array[document_ident],'confirm');
 select count(*),sum(cash_base_amount),sum(discount_base_amount),sum(fee_base_amount)
 into active_count,cash_base,discount_base,fee_base
 from public.fms_payable_payment_execution where document_id=document_ident and status='posted';
 if active_count<>jsonb_array_length(request_lines) or cash_base<>round(principal_value*rate_value,2)
  or discount_base<>round(discount_value*rate_value,2) or fee_base<>round(fee_value*rate_value,2) then
  raise exception 'Execution lost the cumulative local rounding residual: % / % / %',cash_base,discount_base,fee_base;
 end if;
 for payment_line in select to_jsonb(line) from public.fms_payable_settlement_line line where document_id=document_ident order by line_no loop
  result:=app_private.payable_settlement_execution_values((payment_line->>'id')::uuid);
  if (result->>'exchange_rate')::numeric<>rate_value or result->>'currency_code'<>'USD' or result->>'base_currency_code'<>'CNY'
   or (result->>'account_set_id')::uuid<>original_book.id or app_private.payable_payment_execution_valid((payment_line->>'id')::uuid) is distinct from true then
   raise exception 'Confirmed execution lost its original rate or genuine cash source';
  end if;
 end loop;
 select sum(ledger.amount) into ledger_value from public.fms_fund_ledger_entry ledger
 join public.fms_payable_payment_execution execution on execution.fund_ledger_id=ledger.id
 where execution.document_id=document_ident and execution.status='posted';
 if ledger_value<>principal_value+fee_value then raise exception 'Fund account was charged a local rather than original currency amount';end if;
 select source into refund_option from jsonb_array_elements(public.fms_payable_settlement_options_secure('refund',source_document.tenant_id)->'refund_source') source
 where source->>'refund_payment_line_id'=saved->'lines'->0->>'id';
 if refund_option is null or refund_option->>'currency_code' is distinct from 'USD' or refund_option->>'base_currency_code' is distinct from 'CNY'
  or(refund_option->>'account_set_id')::uuid is distinct from original_book.id or nullif(refund_option->>'account_set_name','') is null then
  raise exception 'Refund selector lost its original execution book or currency';
 end if;
 perform public.fms_act_payable_settlement_secure(array[document_ident],'confirm');
 if (select count(*) from public.fms_payable_payment_execution where document_id=document_ident and status='posted')<>active_count then
  raise exception 'Repeated confirmation duplicated fund execution';
 end if;
 select id,fund_ledger_id into execution_ident,source_ledger from public.fms_payable_payment_execution
 where document_id=document_ident and status='posted' order by id limit 1;
 perform public.fms_act_payable_settlement_secure(array[document_ident],'cancel_payment','外币执行回滚验收');
 if exists(select 1 from public.fms_payable_payment_execution where document_id=document_ident and status='posted')
  or not exists(select 1 from public.fms_payable_payment_execution execution join public.fms_fund_ledger_entry original on original.id=execution.fund_ledger_id
   join public.fms_fund_ledger_entry reversal on reversal.id=execution.reversal_ledger_id and reversal.reversal_of_id=original.id
   where execution.id=execution_ident and execution.status='reversed' and original.status='reversed' and reversal.amount=original.amount
    and reversal.fund_account_id=original.fund_account_id and reversal.direction='inflow' and execution.exchange_rate=rate_value) then
  raise exception 'Cancellation failed to reverse the exact original-currency fund movement';
 end if;
 perform public.fms_act_payable_settlement_secure(array[document_ident],'confirm');
 if (select sum(cash_base_amount) from public.fms_payable_payment_execution where document_id=document_ident and status='posted')<>cash_base
  or (select sum(discount_base_amount) from public.fms_payable_payment_execution where document_id=document_ident and status='posted')<>discount_base then
  raise exception 'Reconfirmation used the current rate instead of the approved historical rate';
 end if;
 caller_actor:=auth.uid();
 perform set_config('request.jwt.claim.sub',actor::text,true);
 insert into public.fms_account_set(tenant_id,account_set_code,account_set_name,legal_entity_name,base_currency_code,enabled_on,status)
 values(source_document.tenant_id,'FX_BAD_'||upper(left(gen_random_uuid()::text,8)),'付款写入跨账套回滚验收',
  '虚构回滚验收主体','CNY',source_document.business_date,'active') returning id into wrong_book;
 perform set_config('request.jwt.claim.sub',caller_actor::text,true);
 select count(*) into original_count from public.fms_payable_settlement_document where tenant_id=source_document.tenant_id;
 blocked:=false;
 begin
  perform public.fms_save_payable_settlement_secure(request_document||jsonb_build_object('account_set_id',wrong_book));
 exception when check_violation then blocked:=true;end;
 if not blocked or (select count(*) from public.fms_payable_settlement_document where tenant_id=source_document.tenant_id)<>original_count then
  raise exception 'Cross-book save kept a partial header or accepted the wrong fund book';
 end if;
 blocked:=false;
 begin
  perform public.fms_save_payable_settlement_secure(request_document||jsonb_build_object('exchange_rate','NaN'));
 exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Payment save accepted a nonfinite foreign rate';end if;
 if p_case=5 then
  blocked:=false;
  begin
   perform public.fms_save_payable_settlement_secure(request_document||jsonb_build_object('tenant_id',platform_tenant));
  exception when insufficient_privilege then blocked:=true;end;
  if not blocked then raise exception 'Forged ordinary scope permitted a foreign-tenant currency write';end if;
 end if;
 return jsonb_build_object('case',p_case,'status','passed','cash_base',cash_base,'discount_base',discount_base,'fee_base',fee_base);
end $test$;

select pg_temp.check_payable_fx_writer(1);
select pg_temp.check_payable_fx_writer(2);
select pg_temp.check_payable_fx_writer(3);
select pg_temp.check_payable_fx_writer(4);
select pg_temp.check_payable_fx_writer(5);
rollback;
