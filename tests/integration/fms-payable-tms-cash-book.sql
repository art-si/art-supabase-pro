begin;
set local jit=off;
set local statement_timeout='8s';

create function pg_temp.check_tms_cash_original_payable_book(p_case integer) returns jsonb
language plpgsql as $book$
declare context_value jsonb:=current_setting('qa.tms_ar_'||p_case)::jsonb;tenant uuid:=(context_value->>'tenant')::uuid;
 other_book uuid:=(context_value->>'other_book')::uuid;currency_ident uuid;fund_ident uuid;blocked boolean:=false;error_message text;
begin
 perform pg_temp.use_tms_receivable_actor(p_case,true);
 insert into public.fms_currency(tenant_id,account_set_id,currency_code,currency_name,is_enabled,is_base)
 values(tenant,other_book,'CNY','人民币',true,true) on conflict(account_set_id,currency_code) do update set is_enabled=true returning id into currency_ident;
 insert into public.fms_opening_balance_control(tenant_id,account_set_id,fiscal_year,status,confirmed_at,confirmed_by)
 values(tenant,other_book,extract(year from app_private.payable_business_date())::integer,'confirmed',clock_timestamp(),auth.uid()::text)
 on conflict(account_set_id,fiscal_year) do update set status='confirmed';
 insert into public.fms_fund_account(tenant_id,account_set_id,currency_id,account_code,account_name,account_type,
  bank_name,account_no_masked,account_no_fingerprint,opening_balance,online_banking_enabled)
 values(tenant,other_book,currency_ident,'QA_OTHER_BOOK_'||upper(left(gen_random_uuid()::text,8)),
  '原运输应付跨账套拒绝回滚专用虚构账户','bank','虚构回滚银行','**** QA',md5(gen_random_uuid()::text),100,false) returning id into fund_ident;
 begin
  perform public.execute_fms_carrier_payment_application_secure((context_value->>'native_application')::uuid,
   fund_ident,app_private.payable_business_date(),'QA_CROSS_BOOK_'||(context_value->>'marker'),'[]',null);
 exception when check_violation then
  get stacked diagnostics error_message=message_text;
  if position('账套' in error_message)=0 then raise exception 'Cross-book fixture failed for an unrelated reason: %',error_message;end if;
  blocked:=true;
 end;
 if not blocked then raise exception 'Native carrier payment crossed the approved original financial payable account set';end if;
 if(select status from public.tms_carrier_payment_application where id=(context_value->>'native_application')::uuid) is distinct from 'approved'
  or(select settled_amount from public.tms_carrier_statement where id=(context_value->>'statement')::uuid)<>0 then
  raise exception 'Rejected cross-book native payment left a paid application or settlement movement';end if;
 perform pg_temp.use_tms_receivable_actor(p_case,false);
 return jsonb_build_object('case',p_case,'status','native_cross_book_payment_rejected');
end $book$;

select pg_temp.prepare_ar_application_base('USD');
select pg_temp.prepare_tms_receivable_case(1);
select pg_temp.create_tms_receivable_cost(1);
select pg_temp.create_tms_receivable_statement(1);
select pg_temp.create_tms_receivable_documents(1);
select pg_temp.create_tms_receivable_native_application(1);
select pg_temp.check_tms_cash_original_payable_book(1);
select pg_temp.create_tms_receivable_native_cash(1);
select pg_temp.check_tms_receivable_case(1,'before');
rollback;
