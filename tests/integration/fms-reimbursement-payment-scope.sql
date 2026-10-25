-- Cloned fixtures and all payment/ledger/posting changes are rolled back.
begin;
select set_config('request.jwt.claims',
  '{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}', true);
do $fixture$
declare
  v_id uuid := gen_random_uuid();
  v_payee_id uuid := gen_random_uuid();
  v_fund_id uuid := gen_random_uuid();
begin
  insert into public.tms_expense_reimbursement
  select (jsonb_populate_record(null::public.tms_expense_reimbursement, to_jsonb(r) ||
    jsonb_build_object(
      'id', v_id, 'reimbursement_no', 'QA-RB-' || substr(v_id::text, 1, 8),
      'status', 'approved', 'is_demo', false,
      'payee_name', '回滚验证收款方', 'payee_bank', '回滚验证银行',
      'payee_account', '9990000000000000',
      'paid_at', null, 'paid_by', null, 'payment_reference', null,
      'payment_voucher_urls', '[]'::jsonb
    ))).*
  from public.tms_expense_reimbursement r
  where id = 'b59d39b6-4d43-4d64-a995-4309488b3bb9';

  insert into public.fms_expense_reimbursement_payee
  select (jsonb_populate_record(null::public.fms_expense_reimbursement_payee, to_jsonb(p) ||
    jsonb_build_object(
      'id', v_payee_id, 'reimbursement_id', v_id,
      'payee_name_snapshot', '回滚验证收款方',
      'bank_name_snapshot', '回滚验证银行',
      'bank_account_snapshot', '9990000000000000'
    ))).*
  from public.fms_expense_reimbursement_payee p
  where reimbursement_id = 'b59d39b6-4d43-4d64-a995-4309488b3bb9';

  insert into public.fms_fund_account
  select (jsonb_populate_record(null::public.fms_fund_account, to_jsonb(a) ||
    jsonb_build_object(
      'id', v_fund_id, 'account_code', 'QA-RB-' || upper(substr(v_fund_id::text, 1, 8)),
      'account_name', '回滚验证资金账户', 'is_default', false,
      'account_no_fingerprint', v_fund_id::text,
      'online_banking_enabled', false
    ))).*
  from public.fms_fund_account a
  where id = '19a869a3-a386-49fc-8182-73043e871dea';

  if not exists(select 1 from public.tms_expense_reimbursement where id=v_id)
    or not exists(select 1 from public.fms_fund_account where id=v_fund_id) then
    raise exception 'Rollback payment fixtures missing';
  end if;
  perform set_config('app.qa_reimbursement_id', v_id::text, true);
  perform set_config('app.qa_fund_id', v_fund_id::text, true);
end $fixture$;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}', true);
select set_config('request.headers', '{}', true);
select public.execute_fms_expense_reimbursement_secure(
  current_setting('app.qa_reimbursement_id')::uuid,
  current_setting('app.qa_fund_id')::uuid,
  100, current_date, 'QA-ROLLBACK-PLATFORM-ALL', '[]'::jsonb, '回滚验证', null
);

select set_config('request.headers',
  '{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}', true);
do $test$
begin
  begin
    perform public.execute_fms_expense_reimbursement_secure(
      current_setting('app.qa_reimbursement_id')::uuid,
      '19a869a3-a386-49fc-8182-73043e871dea',
      100, current_date, 'QA-ROLLBACK-TEST-FUND', '[]'::jsonb, null, null
    );
    raise exception 'Test fund accepted a real payment';
  exception when insufficient_privilege then
    if sqlerrm not like '%验收资金账户%' then raise; end if;
  end;
end $test$;
select public.execute_fms_expense_reimbursement_secure(
  current_setting('app.qa_reimbursement_id')::uuid,
  current_setting('app.qa_fund_id')::uuid,
  100, current_date, 'QA-ROLLBACK-PLATFORM-SELECTED', '[]'::jsonb, '回滚验证', null
);

select set_config('request.headers',
  '{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}', true);
do $test$
begin
  begin
    perform public.execute_fms_expense_reimbursement_secure(
      current_setting('app.qa_reimbursement_id')::uuid,
      current_setting('app.qa_fund_id')::uuid,
      100, current_date, 'QA-ROLLBACK-FOREIGN', '[]'::jsonb, null, null
    );
    raise exception 'Platform selected foreign tenant accepted payment';
  exception when others then
    if sqlerrm not like '%不存在或无权付款%' then raise; end if;
  end;
end $test$;

select set_config('request.jwt.claims',
  '{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}', true);
select set_config('request.headers', '{}', true);
do $test$
begin
  begin
    perform public.execute_fms_expense_reimbursement_secure(
      current_setting('app.qa_reimbursement_id')::uuid,
      current_setting('app.qa_fund_id')::uuid,
      100, current_date, 'QA-ROLLBACK-NO-PAY-PERMISSION', '[]'::jsonb, null, null
    );
    raise exception 'An account without Pay permission accepted payment';
  exception when insufficient_privilege then
    if sqlerrm not like '%无权登记差旅报销付款%' then raise; end if;
  end;
  if has_function_privilege(current_user,
    'public.execute_tms_expense_reimbursement(uuid,numeric,date,text,jsonb,text)', 'execute') then
    raise exception 'Internal payment function is exposed to authenticated';
  end if;
end $test$;

select set_config('request.jwt.claims',
  '{"sub":"543f8dea-2e27-4fe0-b009-f80d86155be6","role":"authenticated"}', true);
select set_config('request.headers', '{}', true);
select public.execute_fms_expense_reimbursement_secure(
  current_setting('app.qa_reimbursement_id')::uuid,
  current_setting('app.qa_fund_id')::uuid,
  100, current_date, 'QA-ROLLBACK-ORDINARY', '[]'::jsonb, '回滚验证', null
);

select set_config('request.headers',
  '{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}', true);
select public.execute_fms_expense_reimbursement_secure(
  current_setting('app.qa_reimbursement_id')::uuid,
  current_setting('app.qa_fund_id')::uuid,
  200, current_date, 'QA-ROLLBACK-FORGED-HEADER', '[]'::jsonb, '回滚验证', null
);

reset role;
do $test$
declare
  v_id uuid := current_setting('app.qa_reimbursement_id')::uuid;
begin
  if (select status from public.tms_expense_reimbursement where id=v_id) <> 'paid'
    or (select sum(amount) from public.tms_expense_payment where reimbursement_id=v_id) <> 500
    or (select count(*) from public.tms_expense_payment where reimbursement_id=v_id) <> 4 then
    raise exception 'Payment total/state or tenant scope mismatch';
  end if;
  if (select count(*) from public.fms_fund_ledger_entry e
      join public.tms_expense_payment p on p.id=e.source_id
      where p.reimbursement_id=v_id and e.source_type='expense_payment') <> 4 then
    raise exception 'Real payment ledger entries missing';
  end if;
  if exists(
    select 1 from public.tms_expense_payment p
    join public.tms_expense_reimbursement r on r.id=p.reimbursement_id
    where r.id=v_id and (p.tenant_id<>r.tenant_id or p.is_demo)
  ) then raise exception 'Real payment tenant or demo flag mismatch'; end if;
end $test$;
select 'reimbursement payment all/selected/own/forged scopes and ledger passed' result;
rollback;
