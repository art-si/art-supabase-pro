-- Exercise demo reimbursement payment, idempotency, bounds, and accounting isolation.
begin;
select set_config('app.workflow_engine', 'on', true);
delete from public.tms_expense_payment
where reimbursement_id = 'b59d39b6-4d43-4d64-a995-4309488b3bb9'
  and is_demo;
update public.tms_expense_reimbursement
set status = 'approved', paid_at = null, paid_by = null,
    payment_reference = null, payment_voucher_urls = '[]'::jsonb
where id = 'b59d39b6-4d43-4d64-a995-4309488b3bb9'
  and source_type = 'travel' and is_demo and status = 'paid';

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"543f8dea-2e27-4fe0-b009-f80d86155be6","role":"authenticated"}', true);
select set_config('request.headers', '{}', true);

do $test$
declare
  v_id uuid := 'b59d39b6-4d43-4d64-a995-4309488b3bb9';
  v_fund uuid := '19a869a3-a386-49fc-8182-73043e871dea';
  v_key uuid := gen_random_uuid();
  v_first jsonb;
  v_retry jsonb;
  v_second jsonb;
begin
  v_first := public.record_fms_travel_reimbursement_demo_payment_secure(
    v_id, v_fund, 200, current_date, 'DEMO-QA-PARTIAL',
    v_key, '回滚验证'
  );
  if v_first->>'status' <> 'partially_paid' then
    raise exception 'Partial demo reimbursement payment failed';
  end if;
  v_retry := public.record_fms_travel_reimbursement_demo_payment_secure(
    v_id, v_fund, 200, current_date, 'DEMO-QA-PARTIAL',
    v_key, '回滚验证'
  );
  if v_retry->>'id' <> v_first->>'id' then
    raise exception 'Idempotent retry created another payment';
  end if;

  begin
    perform public.record_fms_travel_reimbursement_demo_payment_secure(
      v_id, v_fund, 301, current_date, 'DEMO-QA-OVERPAY',
      gen_random_uuid(), null
    );
    raise exception 'Overpayment was accepted';
  exception when sqlstate '22023' then null;
  end;

  begin
    perform public.execute_fms_expense_reimbursement_secure(
      v_id, v_fund, 100, current_date, 'REAL-QA-ON-DEMO',
      '[]'::jsonb, null, null
    );
    raise exception 'Demo reimbursement entered the real payment path';
  exception when insufficient_privilege then
    if sqlerrm not like '%演示报销单%' then raise; end if;
  end;

  v_second := public.record_fms_travel_reimbursement_demo_payment_secure(
    v_id, v_fund, 300, current_date, 'DEMO-QA-FINAL',
    gen_random_uuid(), '回滚验证'
  );
  if v_second->>'status' <> 'paid' then
    raise exception 'Final demo reimbursement payment failed';
  end if;
end $test$;

reset role;
do $test$
declare
  v_id uuid := 'b59d39b6-4d43-4d64-a995-4309488b3bb9';
begin
  if (select status from public.tms_expense_reimbursement where id = v_id) <> 'paid'
    or (select count(*) from public.tms_expense_payment
        where reimbursement_id = v_id and is_demo) <> 2 then
    raise exception 'Final demo reimbursement state or audit rows missing';
  end if;
  if exists (
    select 1 from public.fms_fund_ledger_entry e
    join public.tms_expense_payment p on p.id = e.source_id
    where p.reimbursement_id = v_id and e.source_type = 'expense_payment'
  ) or exists (
    select 1 from public.fms_posting_event e
    where e.source_type = 'expense_reimbursement' and e.source_id = v_id
  ) then
    raise exception 'Demo payment wrote a real fund ledger or posting event';
  end if;
end $test$;

select 'demo reimbursement payment and accounting isolation passed' result;
rollback;
