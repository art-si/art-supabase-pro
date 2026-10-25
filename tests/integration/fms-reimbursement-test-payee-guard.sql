-- Finance may see reimbursement records, but TEST-FMS payees cannot enter real payment.
begin;
update public.tms_expense_reimbursement
set is_demo = false
where id = 'b59d39b6-4d43-4d64-a995-4309488b3bb9'
  and is_demo;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"543f8dea-2e27-4fe0-b009-f80d86155be6","role":"authenticated"}', true);

do $test$
begin
  begin
    perform public.execute_fms_expense_reimbursement_secure(
      'b59d39b6-4d43-4d64-a995-4309488b3bb9',
      '19a869a3-a386-49fc-8182-73043e871dea',
      500, current_date, 'DEMO-QA-REJECT-REAL', '[]'::jsonb, null, null
    );
    raise exception 'Test account was accepted for a real reimbursement payment';
  exception when insufficient_privilege then
    if sqlerrm not like '%测试收款账户%' then raise; end if;
  end;
end $test$;

select set_config('request.jwt.claims',
  '{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}', true);
select set_config('request.headers',
  '{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}', true);

do $test$
begin
  begin
    perform public.execute_fms_expense_reimbursement_secure(
      'b59d39b6-4d43-4d64-a995-4309488b3bb9',
      '19a869a3-a386-49fc-8182-73043e871dea',
      500, current_date, 'DEMO-QA-CROSS-SCOPE', '[]'::jsonb, null, null
    );
    raise exception 'Platform selected foreign tenant accepted payment';
  exception when others then
    if sqlerrm not like '%不存在或无权付款%' then raise; end if;
  end;
end $test$;

select 'test payee and selected-tenant payment guards passed' result;
rollback;
