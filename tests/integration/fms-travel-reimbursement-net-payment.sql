-- A 500 reimbursement offsets a 350 loan, then pays 100 + 50 to two payees.
-- Both real-ledger and demo-isolation cases are contained in this rollback.
begin;
select set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
select set_config('request.headers','{}',true);
select set_config('app.workflow_engine','on',true);
do $fixture$
declare v_demo boolean;v_loan uuid;v_id uuid;v_payee uuid;v_fund uuid:=gen_random_uuid();v_line integer;
begin
  insert into public.fms_fund_account
  select (jsonb_populate_record(null::public.fms_fund_account,to_jsonb(a)||jsonb_build_object(
    'id',v_fund,'account_code','QA-NET-'||upper(substr(v_fund::text,1,8)),
    'account_name','回滚验证现金差额资金账户','account_no_fingerprint',v_fund::text,
    'is_default',false,'online_banking_enabled',false))).*
  from public.fms_fund_account a where id='19a869a3-a386-49fc-8182-73043e871dea';
  perform set_config('app.qa_net_real_fund',v_fund::text,true);
  foreach v_demo in array array[true,false] loop
    v_loan:=gen_random_uuid();v_id:=gen_random_uuid();
    insert into public.fms_travel_loan
    select (jsonb_populate_record(null::public.fms_travel_loan,to_jsonb(l)||jsonb_build_object(
      'id',v_loan,'loan_no','QA-NET-'||substr(v_loan::text,1,8),'loan_amount',350,
      'payment_amount',350,'approved_amount',350,'paid_amount',350,'repaid_amount',0,
      'reimbursed_amount',0,'used_amount',0,'remaining_balance',350,'is_demo',v_demo))).*
    from public.fms_travel_loan l where id='644ccf52-45e7-46ea-b6a3-945773c7b5e8';
    insert into public.tms_expense_reimbursement
    select (jsonb_populate_record(null::public.tms_expense_reimbursement,to_jsonb(r)||jsonb_build_object(
      'id',v_id,'reimbursement_no','QA-NET-'||substr(v_id::text,1,8),'status','approved',
      'total_amount',500,'approved_amount',500,'travel_loan_id',v_loan,'loan_offset_amount',350,
      'is_demo',v_demo,'paid_at',null,'paid_by',null,'payment_reference',null,'payment_voucher_urls','[]'::jsonb))).*
    from public.tms_expense_reimbursement r where id='b59d39b6-4d43-4d64-a995-4309488b3bb9';
    for v_line in 1..2 loop
      v_payee:=gen_random_uuid();
      insert into public.fms_expense_reimbursement_payee
      select (jsonb_populate_record(null::public.fms_expense_reimbursement_payee,to_jsonb(p)||jsonb_build_object(
        'id',v_payee,'reimbursement_id',v_id,'line_no',v_line,'amount',case when v_line=1 then 100 else 50 end,
        'bank_account_snapshot',case when v_demo then 'TEST-QA-NET-'||v_line else '999000000000000'||v_line end,
        'bank_name_snapshot',case when v_demo then '演示银行（不可用于实际付款）' else '回滚验证银行' end))).*
      from public.fms_expense_reimbursement_payee p where reimbursement_id='b59d39b6-4d43-4d64-a995-4309488b3bb9';
      perform set_config('app.qa_net_'||v_demo::text||'_payee_'||v_line,v_payee::text,true);
    end loop;
    perform app_private.refresh_fms_travel_loan_settlement(v_loan);
    perform set_config('app.qa_net_'||v_demo::text||'_id',v_id::text,true);
  end loop;
end $fixture$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"543f8dea-2e27-4fe0-b009-f80d86155be6","role":"authenticated"}',true);
do $test$
declare v_demo boolean;v_id uuid;v_first uuid;v_second uuid;v_fund uuid;v_key uuid;v_result jsonb;v_retry jsonb;v_detail jsonb;v_ref text;
begin
  foreach v_demo in array array[true,false] loop
    v_id:=current_setting('app.qa_net_'||v_demo::text||'_id')::uuid;
    v_first:=current_setting('app.qa_net_'||v_demo::text||'_payee_1')::uuid;
    v_second:=current_setting('app.qa_net_'||v_demo::text||'_payee_2')::uuid;
    v_fund:=case when v_demo then '19a869a3-a386-49fc-8182-73043e871dea'::uuid else current_setting('app.qa_net_real_fund')::uuid end;
    v_key:=gen_random_uuid();v_ref:=case when v_demo then 'DEMO-QA-NET-1' else 'QA-NET-1' end;
    v_result:=public.record_fms_travel_reimbursement_payment_secure(v_id,v_first,v_fund,100,current_date,v_ref,'[]',null,v_demo,v_key);
    v_retry:=public.record_fms_travel_reimbursement_payment_secure(v_id,v_first,v_fund,100,current_date,v_ref,'[]',null,v_demo,v_key);
    if v_retry->>'id'<>v_result->>'id' or v_result->>'status'<>'partially_paid' or (v_result->>'paidAmount')::numeric<>100 then
      raise exception 'First net payment or idempotent retry mismatch'; end if;
    begin
      perform public.record_fms_travel_reimbursement_payment_secure(v_id,v_first,v_fund,1,current_date,v_ref,'[]',null,v_demo,gen_random_uuid());
      raise exception 'A fully paid payee was paid twice';
    exception when invalid_parameter_value then
      if sqlerrm not like '%超过单据或所选收款人的剩余待付金额%' then raise; end if;
    end;
    begin
      perform public.record_fms_travel_reimbursement_payment_secure(v_id,v_second,v_fund,50,current_date,v_ref,'[]',null,v_demo,v_key);
      raise exception 'Reused idempotency key changed its payee';
    exception when invalid_parameter_value then
      if sqlerrm not like '%请求标识已用于其他内容%' then raise; end if;
    end;
    v_ref:=case when v_demo then 'DEMO-QA-NET-2' else 'QA-NET-2' end;
    v_result:=public.record_fms_travel_reimbursement_payment_secure(v_id,v_second,v_fund,50,current_date,v_ref,'[]',null,v_demo,gen_random_uuid());
    if v_result->>'status'<>'paid' or (v_result->>'paidAmount')::numeric<>150 then
      raise exception 'Cash payment incorrectly included the loan offset'; end if;
    v_detail:=public.tms_get_expense_reimbursement_secure(v_id);
    if (v_detail->>'cash_payable_amount')::numeric<>150 or (v_detail->>'remaining_amount')::numeric<>0
      or exists(select 1 from jsonb_array_elements(v_detail->'payees') p where (p->>'remaining_amount')::numeric<>0) then
      raise exception 'Bill or per-payee remaining amount mismatch'; end if;
  end loop;
end $test$;
reset role;
do $test$
declare v_demo boolean;v_id uuid;v_count integer;v_total numeric;
begin
  foreach v_demo in array array[true,false] loop
    v_id:=current_setting('app.qa_net_'||v_demo::text||'_id')::uuid;
    if (select count(*) from public.tms_expense_payment where reimbursement_id=v_id)<>2
      or exists(select 1 from public.tms_expense_payment where reimbursement_id=v_id and (reimbursement_payee_id is null or is_demo<>v_demo)) then
      raise exception 'Net payment records lost payee/demo ownership'; end if;
    select count(*),coalesce(sum(e.amount),0) into v_count,v_total from public.fms_fund_ledger_entry e
    join public.tms_expense_payment p on p.id=e.source_id where p.reimbursement_id=v_id and e.source_type='expense_payment';
    if v_demo and (v_count<>0 or v_total<>0) then raise exception 'Demo net payments created real fund entries'; end if;
    if not v_demo and (v_count<>2 or v_total<>150) then raise exception 'Real cash ledger included the 350 loan offset'; end if;
  end loop;
end $test$;
select 'net cash 100+50, per-payee caps, retries, field-safe balances and demo ledger isolation passed' result;
rollback;
