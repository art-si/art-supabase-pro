-- QA paid demo loan JK202610-001. All repayment and receipt changes roll back.
begin;

-- Isolated paid loan: live demonstration balances must not affect rollback tests.
select set_config('app.workflow_engine','on',true);
insert into public.fms_travel_loan
select (jsonb_populate_record(null::public.fms_travel_loan,to_jsonb(l)||jsonb_build_object(
  'id','d4338525-cb79-47be-8344-c46db47d1192','loan_no','QA-ISOLATED-SETTLEMENT',
  'status','paid','loan_amount',350,'payment_amount',350,'approved_amount',350,
  'paid_amount',350,'repaid_amount',0,'reimbursed_amount',0,'used_amount',0,
  'pending_collection_amount',0,'remaining_balance',350,'is_demo',true))).*
from public.fms_travel_loan l where id='644ccf52-45e7-46ea-b6a3-945773c7b5e8';
insert into public.fms_travel_loan_item
select (jsonb_populate_record(null::public.fms_travel_loan_item,to_jsonb(i)||jsonb_build_object(
  'id','8187c8f3-31ee-4889-988c-2b48fb3cff21','loan_id','d4338525-cb79-47be-8344-c46db47d1192',
  'amount',350))).*
from public.fms_travel_loan_item i where id='ad318767-a0ef-40e5-a9ea-a50dbefa8a76';
update public.fms_travel_loan
set status='paid', paid_amount=350, payment_date=current_date
where id='d4338525-cb79-47be-8344-c46db47d1192'
  and status='paid' and loan_amount=350;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
select set_config('request.headers',
  '{"x-art-tenant-scope":"028e6a68-a9db-4055-974c-1e05bfe94b0f"}',true);

do $test$
begin
  if has_function_privilege('authenticated',
      'public.save_fms_travel_repayment_draft_secure(jsonb,jsonb,boolean)','EXECUTE') then
    raise exception 'Internal submit flag is exposed to authenticated';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(public.fms_list_repayable_loans_secure(
      '7529f951-938e-4e2c-ac0d-316c136ae1f9')) loan
    where loan->>'id'='d4338525-cb79-47be-8344-c46db47d1192'
  ) then
    raise exception 'Forged header changed own repayable loan scope';
  end if;
  begin
    perform public.fms_list_repayable_loans_secure(
      '028e6a68-a9db-4055-974c-1e05bfe94b0f');
    raise exception 'Cross-tenant loan selector accepted';
  exception when insufficient_privilege then null;
  end;
end $test$;

select set_config('app.test_repayment_id',
  (public.save_fms_travel_repayment_draft_entry_secure(
    '{"tenant_id":"7529f951-938e-4e2c-ac0d-316c136ae1f9","loan_id":"d4338525-cb79-47be-8344-c46db47d1192","reason":"QA 还款"}'::jsonb,
    '[{"loan_item_id":"8187c8f3-31ee-4889-988c-2b48fb3cff21","amount":200}]'::jsonb
  )->>'id'),true);

do $test$
declare
  v_id uuid := current_setting('app.test_repayment_id')::uuid;
  v_item_id uuid;
begin
  select id into strict v_item_id from public.fms_travel_repayment_item
  where repayment_id=v_id;
  perform public.save_fms_travel_repayment_draft_entry_secure(
    jsonb_build_object('id',v_id,'loan_id','d4338525-cb79-47be-8344-c46db47d1192',
      'reason','QA 编辑'),
    jsonb_build_array(jsonb_build_object('id',v_item_id,
      'loan_item_id','8187c8f3-31ee-4889-988c-2b48fb3cff21','amount',180))
  );
  if not exists (
    select 1 from public.fms_travel_repayment_item
    where id=v_item_id and repayment_id=v_id and amount=180
  ) then raise exception 'Edit did not preserve line identity'; end if;

  begin
    perform public.save_fms_travel_repayment_draft_entry_secure(
      '{"loan_id":"d4338525-cb79-47be-8344-c46db47d1192","reason":"QA overpayment"}'::jsonb,
      '[{"loan_item_id":"8187c8f3-31ee-4889-988c-2b48fb3cff21","amount":601}]'::jsonb
    );
    raise exception 'Overpayment accepted';
  exception when sqlstate '22023' then
    if sqlerrm not like '%超过%' then raise; end if;
  end;

end $test$;

do $test$
declare
  v_id uuid := current_setting('app.test_repayment_id')::uuid;
  v_result jsonb;
  v_instance_id uuid;
begin
  v_result := public.submit_fms_travel_repayment_secure(v_id);
  v_instance_id := (v_result->>'workflowInstanceId')::uuid;
  if not exists (
    select 1 from public.wf_instance
    where id=v_instance_id and business_type='fms_travel_repayment'
      and business_id=v_id and status='running'
  ) then raise exception 'Published workflow did not create a running instance'; end if;
end $test$;

reset role;
select app_private.execute_fms_travel_repayment_workflow_callback(
  current_setting('app.test_repayment_id')::uuid,'approved','QA 审批',null);
set local role authenticated;

do $test$
declare
  v_id uuid := current_setting('app.test_repayment_id')::uuid;
  v_row public.fms_travel_repayment%rowtype;
  v_balance numeric;
begin
  perform public.record_fms_travel_repayment_collection_secure(
    v_id,80,current_date,'DEMO-QA-PARTIAL',null);
  select * into strict v_row from public.fms_travel_repayment where id=v_id;
  if v_row.status <> 'awaiting_collection' or v_row.received_amount <> 80 or v_row.approved_amount is distinct from 180 then
    raise exception 'Partial receipt state mismatch';
  end if;
  perform public.record_fms_travel_repayment_collection_secure(
    v_id,100,current_date,'DEMO-QA-FINAL',null);
  select * into strict v_row from public.fms_travel_repayment where id=v_id;
  select remaining_balance into strict v_balance from public.fms_travel_loan
  where id=v_row.loan_id;
  if v_row.status <> 'collected' or v_row.received_amount <> 180 or v_balance <> 170 then
    raise exception 'Final receipt or loan balance mismatch';
  end if;
  if (select count(*) from public.fms_travel_repayment_receipt
      where repayment_id=v_id) <> 2 then
    raise exception 'Receipt audit rows missing';
  end if;
end $test$;

select 'repayment draft, edit, overpayment, workflow, and collection passed' result;
rollback;

-- Platform all may create against a paid loan's tenant; selected scope cannot cross tenants.
begin;

-- Isolated paid loan: live demonstration balances must not affect rollback tests.
select set_config('app.workflow_engine','on',true);
insert into public.fms_travel_loan
select (jsonb_populate_record(null::public.fms_travel_loan,to_jsonb(l)||jsonb_build_object(
  'id','d4338525-cb79-47be-8344-c46db47d1192','loan_no','QA-ISOLATED-SETTLEMENT',
  'status','paid','loan_amount',350,'payment_amount',350,'approved_amount',350,
  'paid_amount',350,'repaid_amount',0,'reimbursed_amount',0,'used_amount',0,
  'pending_collection_amount',0,'remaining_balance',350,'is_demo',true))).*
from public.fms_travel_loan l where id='644ccf52-45e7-46ea-b6a3-945773c7b5e8';
insert into public.fms_travel_loan_item
select (jsonb_populate_record(null::public.fms_travel_loan_item,to_jsonb(i)||jsonb_build_object(
  'id','8187c8f3-31ee-4889-988c-2b48fb3cff21','loan_id','d4338525-cb79-47be-8344-c46db47d1192',
  'amount',350))).*
from public.fms_travel_loan_item i where id='ad318767-a0ef-40e5-a9ea-a50dbefa8a76';
update public.fms_travel_loan set status='paid',paid_amount=350,payment_date=current_date
where id='d4338525-cb79-47be-8344-c46db47d1192';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
select set_config('request.headers','{}',true);
do $test$
begin
  if jsonb_array_length(public.fms_list_repayable_loans_secure(
      '7529f951-938e-4e2c-ac0d-316c136ae1f9')) < 1 then
    raise exception 'Platform all loan option missing';
  end if;
  perform public.save_fms_travel_repayment_draft_entry_secure(
    '{"tenant_id":"7529f951-938e-4e2c-ac0d-316c136ae1f9","loan_id":"d4338525-cb79-47be-8344-c46db47d1192","reason":"QA 平台全租户"}'::jsonb,
    '[{"loan_item_id":"8187c8f3-31ee-4889-988c-2b48fb3cff21","amount":20}]'::jsonb);
end $test$;
select set_config('request.headers',
  '{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}',true);
select jsonb_array_length(public.fms_list_repayable_loans_secure(
  '7529f951-938e-4e2c-ac0d-316c136ae1f9')) selected_own_options;
select set_config('request.headers',
  '{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
do $test$
begin
  begin
    perform public.fms_list_repayable_loans_secure(
      '7529f951-938e-4e2c-ac0d-316c136ae1f9');
    raise exception 'Platform selected foreign loan accepted';
  exception when insufficient_privilege then null;
  end;
end $test$;
select 'platform all and selected tenant scope passed' result;
rollback;

-- An approved travel reimbursement offset must reduce the repayable amount even
-- before the loan's denormalized reimbursed_amount is refreshed.
begin;

-- Isolated paid loan: live demonstration balances must not affect rollback tests.
select set_config('app.workflow_engine','on',true);
insert into public.fms_travel_loan
select (jsonb_populate_record(null::public.fms_travel_loan,to_jsonb(l)||jsonb_build_object(
  'id','d4338525-cb79-47be-8344-c46db47d1192','loan_no','QA-ISOLATED-SETTLEMENT',
  'status','paid','loan_amount',350,'payment_amount',350,'approved_amount',350,
  'paid_amount',350,'repaid_amount',0,'reimbursed_amount',0,'used_amount',0,
  'pending_collection_amount',0,'remaining_balance',350,'is_demo',true))).*
from public.fms_travel_loan l where id='644ccf52-45e7-46ea-b6a3-945773c7b5e8';
insert into public.fms_travel_loan_item
select (jsonb_populate_record(null::public.fms_travel_loan_item,to_jsonb(i)||jsonb_build_object(
  'id','8187c8f3-31ee-4889-988c-2b48fb3cff21','loan_id','d4338525-cb79-47be-8344-c46db47d1192',
  'amount',350))).*
from public.fms_travel_loan_item i where id='ad318767-a0ef-40e5-a9ea-a50dbefa8a76';
update public.fms_travel_loan set status='paid',paid_amount=350,payment_date=current_date
where id='d4338525-cb79-47be-8344-c46db47d1192';
select set_config('app.workflow_engine','on',true);
update public.tms_expense_reimbursement
set travel_loan_id='d4338525-cb79-47be-8344-c46db47d1192',
    loan_offset_amount=300,status='approved'
where id='b59d39b6-4d43-4d64-a995-4309488b3bb9';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
select set_config('request.headers','{}',true);
do $test$
declare v_id uuid;
begin
  begin
    perform public.save_fms_travel_repayment_draft_entry_secure(
      '{"tenant_id":"7529f951-938e-4e2c-ac0d-316c136ae1f9","loan_id":"d4338525-cb79-47be-8344-c46db47d1192","reason":"QA 报销抵扣"}'::jsonb,
      '[{"loan_item_id":"8187c8f3-31ee-4889-988c-2b48fb3cff21","amount":200}]'::jsonb);
    raise exception 'Approved reimbursement offset was ignored';
  exception when sqlstate '22023' then
    if sqlerrm not like '%超过借款未还余额%' then raise; end if;
  end;
  v_id := (public.save_fms_travel_repayment_draft_entry_secure(
    '{"tenant_id":"7529f951-938e-4e2c-ac0d-316c136ae1f9","loan_id":"d4338525-cb79-47be-8344-c46db47d1192","reason":"QA 报销抵扣"}'::jsonb,
      '[{"loan_item_id":"8187c8f3-31ee-4889-988c-2b48fb3cff21","amount":50}]'::jsonb)->>'id')::uuid;
  perform set_config('app.test_repayment_id',v_id::text,true);
end $test$;
reset role;
select app_private.execute_fms_travel_repayment_workflow_callback(
  current_setting('app.test_repayment_id')::uuid,'approved','QA 审批',null);
set local role authenticated;
select public.record_fms_travel_repayment_collection_secure(
  current_setting('app.test_repayment_id')::uuid,40,current_date,'DEMO-QA-OFFSET',null);
do $test$
begin
  if (select remaining_balance from public.fms_travel_loan
      where id='d4338525-cb79-47be-8344-c46db47d1192') <> 10 then
    raise exception 'Approved reimbursement offset did not reduce the loan balance';
  end if;
end $test$;
select 'approved reimbursement offset reserved before collection' result;
rollback;
