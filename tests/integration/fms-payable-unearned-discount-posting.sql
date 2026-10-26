begin;
set local jit=off;
set local statement_timeout='8s';

create function pg_temp.configure_unearned_discount_posting(p_case integer) returns jsonb
language plpgsql as $configure$
declare context_value jsonb:=current_setting('test.payable_refund_fx_'||p_case)::jsonb;tenant uuid:=(context_value->>'tenant_id')::uuid;
 book uuid:=(context_value->>'book_id')::uuid;line_ident uuid:=(context_value->>'payment_line_id')::uuid;payload jsonb;
 prepaid_subject uuid;cash_subject uuid;fee_subject uuid;discount_subject uuid;rule_ident uuid;suffix text:=to_char(clock_timestamp(),'YYYYMMDDHH24MISSUS');
begin
 if(context_value->>'stage')::integer<>1 then raise exception 'Verify unearned discount posting before any refund or payable matching';end if;
 payload:=app_private.payable_settlement_posting_payload(line_ident);
 if payload is null or(payload->>'discount_amount')::numeric<>0 or(payload->>'original_discount_amount')::numeric<>0
  or(payload->>'offered_discount_amount')::numeric<=0 or(payload->>'has_realized_cash_discount')::boolean is distinct from false
  or exists(select 1 from public.fms_payable_writeoff_record where payment_line_id=line_ident and status='active') then
  raise exception 'Unallocated advance payment recognized an offered but unrealized cash discount';end if;
 insert into public.fms_subject(tenant_id,account_set_id,subject_code,subject_name,category,balance_direction,allow_foreign_currency)
 values(tenant,book,'961'||suffix,'未核销预付款真实本金回滚科目','asset','debit',true) returning id into prepaid_subject;
 insert into public.fms_subject(tenant_id,account_set_id,subject_code,subject_name,category,balance_direction,allow_foreign_currency)
 values(tenant,book,'962'||suffix,'未核销预付款实际付款回滚科目','asset','debit',true) returning id into cash_subject;
 insert into public.fms_subject(tenant_id,account_set_id,subject_code,subject_name,category,balance_direction,allow_foreign_currency)
 values(tenant,book,'963'||suffix,'未核销预付款真实手续费回滚科目','expense','debit',true) returning id into fee_subject;
 insert into public.fms_subject(tenant_id,account_set_id,subject_code,subject_name,category,balance_direction)
 values(tenant,book,'964'||suffix,'不得提前确认的折扣收益回滚科目','income','credit') returning id into discount_subject;
 insert into public.fms_posting_rule(tenant_id,account_set_id,rule_code,rule_name,source_type,event_code,priority,submission_mode,match_conditions)
 values(tenant,book,'UNEARNED_'||upper(left(gen_random_uuid()::text,8)),'真实预付款未兑现折扣回滚规则','system','ap_payment_confirmed',999999,'draft',
  jsonb_build_object('fund_account_id',payload->>'fund_account_id','fx_snapshot_version',1)) returning id into rule_ident;
 insert into public.fms_posting_rule_line(tenant_id,account_set_id,rule_id,line_no,subject_id,direction,amount_key)
 values(tenant,book,rule_ident,10,prepaid_subject,'debit','paid_amount'),(tenant,book,rule_ident,20,fee_subject,'debit','fee_amount'),
  (tenant,book,rule_ident,30,cash_subject,'credit','gross_amount'),(tenant,book,rule_ident,40,discount_subject,'credit','discount_amount');
 perform set_config('test.unearned_posting_'||p_case,jsonb_build_object('payload',payload,'prepaid_subject',prepaid_subject,
  'cash_subject',cash_subject,'fee_subject',fee_subject,'discount_subject',discount_subject)::text,true);
 return jsonb_build_object('case',p_case,'status','unearned_posting_configured');
end $configure$;

create function pg_temp.check_unearned_discount_posting(p_case integer) returns jsonb
language plpgsql as $posting$
declare context_value jsonb:=current_setting('test.payable_refund_fx_'||p_case)::jsonb;configuration jsonb:=current_setting('test.unearned_posting_'||p_case)::jsonb;
 payload jsonb:=configuration->'payload';result jsonb;voucher_ident uuid;expected_lines integer:=case when(payload->>'fee_amount')::numeric>0 then 3 else 2 end;
begin
 result:=public.fms_payable_settlement_voucher_secure((context_value->'payment'->>'id')::uuid,'payment',true);
 if jsonb_array_length(result->'lines')<>expected_lines
  or(select sum((line->>'debit_amount')::numeric-(line->>'credit_amount')::numeric) from jsonb_array_elements(result->'lines') line)<>0 then
  raise exception 'Advance payment preview included unearned discount in its principal or failed to balance real fees';end if;
 result:=public.fms_payable_settlement_voucher_secure((context_value->'payment'->>'id')::uuid,'payment',false);
 if result->>'status'<>'generated' or jsonb_array_length(result->'voucher_ids')<>1 then raise exception 'Unearned discount payment voucher did not generate: %',result;end if;
 voucher_ident:=(result->'voucher_ids'->>0)::uuid;
 if not exists(select 1 from public.fms_voucher where id=voucher_ident and account_set_id=(context_value->>'book_id')::uuid
   and tenant_id=(context_value->>'tenant_id')::uuid and total_debit=(payload->>'gross_amount')::numeric and total_credit=total_debit)
  or not exists(select 1 from public.fms_voucher_line where voucher_id=voucher_ident and subject_id=(configuration->>'prepaid_subject')::uuid
   and debit_amount=(payload->>'paid_amount')::numeric and original_amount=(payload->>'original_paid_amount')::numeric
   and exchange_rate=(context_value->>'payment_rate')::numeric and currency_id=(context_value->>'currency_id')::uuid)
  or exists(select 1 from public.fms_voucher_line where voucher_id=voucher_ident and subject_id=(configuration->>'discount_subject')::uuid) then
  raise exception 'Actual advance-payment voucher recognized offered discount as prepaid principal or income';end if;
 perform set_config('test.unearned_posting_'||p_case,(configuration||jsonb_build_object('voucher',voucher_ident))::text,true);
 return jsonb_build_object('case',p_case,'status','unearned_payment_posting_passed');
end $posting$;

create function pg_temp.check_expired_discount_after_posting(p_case integer) returns jsonb
language plpgsql as $expired$
declare context_value jsonb:=current_setting('test.payable_refund_fx_'||p_case)::jsonb;configuration jsonb:=current_setting('test.unearned_posting_'||p_case)::jsonb;
 balance_value jsonb;receipt_line jsonb;payload jsonb;voucher_ident uuid:=(configuration->>'voucher')::uuid;
begin
 if(context_value->>'stage')::integer<>7 then raise exception 'Complete the actual refund receipt, cancellation and reconfirmation before expiry verification';end if;
 balance_value:=app_private.payable_payment_line_state((context_value->>'payment_line_id')::uuid);
 if(balance_value->>'expired_discount')::numeric is distinct from(context_value->>'expired_original')::numeric
  or(balance_value->>'available_discount')::numeric is distinct from 0 then raise exception 'Full actual refund retained an unearned discount pool';end if;
 for receipt_line in select value from jsonb_array_elements(context_value->'refund_document'->'lines') loop
  payload:=app_private.payable_settlement_posting_payload((receipt_line->>'id')::uuid);
  if payload is null or(payload->>'discount_amount')::numeric<>0 or(payload->>'original_discount_amount')::numeric<>0
   or(payload->>'original_received_amount')::numeric<>(receipt_line->>'amount')::numeric then
   raise exception 'Expired advance discount was turned into actual refund cash or realized income';end if;
 end loop;
 if exists(select 1 from public.fms_voucher_line where voucher_id=voucher_ident and subject_id=(configuration->>'discount_subject')::uuid)
  or not exists(select 1 from public.fms_voucher where id=voucher_ident and status<>'voided'
   and total_debit=(configuration->'payload'->>'gross_amount')::numeric and total_credit=total_debit) then
  raise exception 'Refund expiry rewrote the original real-cash payment voucher';end if;
 return jsonb_build_object('case',p_case,'status','full_refund_unearned_expiry_passed');
end $expired$;

select pg_temp.check_payable_refund_fx(1,1);
select pg_temp.configure_unearned_discount_posting(1);
select pg_temp.check_unearned_discount_posting(1);
select pg_temp.check_payable_refund_fx(1,2);
select pg_temp.check_payable_refund_fx(1,3);
select pg_temp.check_payable_refund_fx(1,4);
select pg_temp.check_payable_refund_fx(1,5);
select pg_temp.check_payable_refund_fx(1,6);
select pg_temp.check_payable_refund_fx(1,7);
select pg_temp.check_expired_discount_after_posting(1);
select pg_temp.check_payable_refund_fx(3,1);
select pg_temp.configure_unearned_discount_posting(3);
select pg_temp.check_unearned_discount_posting(3);
select pg_temp.check_payable_refund_fx(3,2);
select pg_temp.check_payable_refund_fx(3,3);
select pg_temp.check_payable_refund_fx(3,4);
select pg_temp.check_payable_refund_fx(3,5);
select pg_temp.check_payable_refund_fx(3,6);
select pg_temp.check_payable_refund_fx(3,7);
select pg_temp.check_expired_discount_after_posting(3);
rollback;
