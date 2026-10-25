-- Exercise the real payment RPC against a cloned demo loan. The transaction rolls back.
begin;

do $test$
declare
  v_loan_id uuid := gen_random_uuid();
  v_payee_id uuid := gen_random_uuid();
begin
  insert into public.fms_travel_loan
  select (jsonb_populate_record(null::public.fms_travel_loan, to_jsonb(l) ||
    jsonb_build_object(
      'id', v_loan_id,
      'loan_no', 'JK-QA-PAYMENT-' || substr(v_loan_id::text, 1, 8),
      'status', 'approved',
      'paid_amount', 0,
      'repaid_amount', 0,
      'remaining_balance', 0,
      'payment_date', null,
      'is_demo', true,
      'current_handler', null
    ))).*
  from public.fms_travel_loan l
  where l.loan_no = 'JK202610-001';

  insert into public.fms_travel_loan_payee
  select (jsonb_populate_record(null::public.fms_travel_loan_payee, to_jsonb(p) ||
    jsonb_build_object('id', v_payee_id, 'loan_id', v_loan_id))).*
  from public.fms_travel_loan_payee p
  where p.loan_id = '644ccf52-45e7-46ea-b6a3-945773c7b5e8';

  if not exists (select 1 from public.fms_travel_loan where id = v_loan_id)
    or not exists (select 1 from public.fms_travel_loan_payee where id = v_payee_id) then
    raise exception 'Demo loan fixture could not be cloned';
  end if;
  perform set_config('app.qa_loan_id', v_loan_id::text, true);
  perform set_config('app.qa_payee_id', v_payee_id::text, true);
end $test$;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}', true);
select set_config('request.headers',
  '{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}', true);

do $test$
declare
  v_loan_id uuid := current_setting('app.qa_loan_id')::uuid;
  v_payee_id uuid := current_setting('app.qa_payee_id')::uuid;
  v_fund_id uuid := '19a869a3-a386-49fc-8182-73043e871dea';
  v_first_key uuid := gen_random_uuid();
  v_first jsonb;
  v_retry jsonb;
  v_second jsonb;
begin
  v_first := public.record_fms_travel_loan_payment_secure(
    v_loan_id, v_payee_id, v_fund_id, 200, current_date,
    'DEMO-QA-LOAN-PARTIAL', '[]'::jsonb, '回滚验证', true, v_first_key
  );
  if v_first->>'status' <> 'awaiting_payment'
    or (v_first->>'paidAmount')::numeric <> 200 then
    raise exception 'Partial demo payment state mismatch';
  end if;

  v_retry := public.record_fms_travel_loan_payment_secure(
    v_loan_id, v_payee_id, v_fund_id, 200, current_date,
    'DEMO-QA-LOAN-PARTIAL', '[]'::jsonb, '回滚验证', true, v_first_key
  );
  if v_retry->>'id' <> v_first->>'id' then
    raise exception 'Idempotent retry created another payment';
  end if;

  begin
    perform public.record_fms_travel_loan_payment_secure(
      v_loan_id, v_payee_id, v_fund_id, 201, current_date,
      'DEMO-QA-KEY-REUSE', '[]'::jsonb, null, true, v_first_key
    );
    raise exception 'Changed amount reused an idempotency key';
  exception when sqlstate '22023' then null;
  end;

  begin
    perform public.record_fms_travel_loan_payment_secure(
      v_loan_id, v_payee_id, v_fund_id, 401, current_date,
      'DEMO-QA-OVERPAY', '[]'::jsonb, null, true, gen_random_uuid()
    );
    raise exception 'Overpayment accepted';
  exception when sqlstate '22023' then null;
  end;

  begin
    perform public.record_fms_travel_loan_payment_secure(
      v_loan_id, v_payee_id, v_fund_id, 100, current_date,
      'REAL-QA-ON-TEST-ACCOUNT', '[]'::jsonb, null, false, gen_random_uuid()
    );
    raise exception 'Demo loan accepted a real payment';
  exception when insufficient_privilege then null;
  end;

  v_second := public.record_fms_travel_loan_payment_secure(
    v_loan_id, v_payee_id, v_fund_id, 400, current_date,
    'DEMO-QA-LOAN-FINAL', '[]'::jsonb, '回滚验证', true, gen_random_uuid()
  );
  if v_second->>'status' <> 'paid'
    or (select paid_amount from public.fms_travel_loan where id = v_loan_id) <> 600
    or (select remaining_balance from public.fms_travel_loan where id = v_loan_id) <> 600
    or (select count(*) from public.fms_travel_loan_payment where loan_id = v_loan_id) <> 2 then
    raise exception 'Final demo payment mismatch';
  end if;
end $test$;

reset role;
do $test$
begin
  if exists (
    select 1 from public.fms_fund_ledger_entry e
    join public.fms_travel_loan_payment p on p.id = e.source_id
    where p.loan_id = current_setting('app.qa_loan_id')::uuid
      and e.source_type = 'travel_loan_payment'
  ) then
    raise exception 'Demo loan payment wrote a real fund ledger entry';
  end if;
end $test$;

select 'demo loan payment, idempotency, overpayment, and ledger isolation passed' result;
rollback;
