-- Drafts do not reserve funds; submitted documents reserve only unsettled amounts.
-- Every document, callback, receipt, and balance change is rolled back.
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
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
select set_config('request.headers','{}',true);
do $test$
declare v_loan public.fms_travel_loan%rowtype; v_payload jsonb; v_lines jsonb; v_id uuid; v_second uuid;
begin
  if has_function_privilege('authenticated','app_private.fms_travel_loan_settlement(uuid,uuid,uuid)','execute') then
    raise exception 'Internal settlement helper is exposed'; end if;
  select * into strict v_loan from public.fms_travel_loan where id='d4338525-cb79-47be-8344-c46db47d1192';
  v_payload:=jsonb_build_object('tenant_id',v_loan.tenant_id,'applicant_employee_id',v_loan.applicant_employee_id,
    'expense_department_id',v_loan.expense_department_id,'travel_loan_id',v_loan.id,
    'loan_offset_amount',300,'reason','QA 小于借款的报销','is_project_expense',true,'project_id',null);
  select jsonb_build_array(jsonb_build_object('expense_item_id',expense_item_id,'gross_amount',300,
    'occurred_on',current_date,'tax_rate',0,'tax_amount',0)) into v_lines
    from public.fms_travel_loan_item where id='8187c8f3-31ee-4889-988c-2b48fb3cff21';
  v_id:=(public.fms_save_travel_reimbursement_draft_secure(v_payload,v_lines,'[]')->>'id')::uuid;
  v_second:=(public.fms_save_travel_reimbursement_draft_secure(v_payload,v_lines,'[]')->>'id')::uuid;
  perform public.start_workflow('tms_expense_reimbursement',v_id,'QA 借款抵扣报销','{}',gen_random_uuid()::text);
  perform set_config('app.qa_offset_first',v_id::text,true);
  perform set_config('app.qa_offset_second',v_second::text,true);
end $test$;
reset role;
set local role authenticated;
do $test$
begin
  begin
    perform public.start_workflow('tms_expense_reimbursement',current_setting('app.qa_offset_second')::uuid,'QA 重复抵扣','{}',gen_random_uuid()::text);
    raise exception 'Two pending reimbursements over-reserved one loan';
  exception when invalid_parameter_value then
    if sqlerrm not like '%借款可抵扣余额不足%' then raise; end if;
  end;
end $test$;
reset role;
do $test$
begin
  if (select available_amount from app_private.fms_travel_loan_settlement('d4338525-cb79-47be-8344-c46db47d1192'))<>50 then
    raise exception 'Pending reimbursement reservation mismatch'; end if;
end $test$;
select app_private.execute_expense_reimbursement_workflow_callback(current_setting('app.qa_offset_first')::uuid,'approved','QA 财务',null);
do $test$
begin
  if not exists(select 1 from public.fms_travel_loan where id='d4338525-cb79-47be-8344-c46db47d1192'
    and reimbursed_amount=300 and used_amount=300 and remaining_balance=50) then
    raise exception 'Approved offset did not refresh loan balances'; end if;
  if not exists(select 1 from public.tms_expense_reimbursement where id=current_setting('app.qa_offset_first')::uuid and is_demo) then
    raise exception 'Loan-pushed reimbursement lost its demo flag'; end if;
end $test$;
set local role authenticated;
do $test$
declare v_id uuid;
begin
  begin
    perform public.save_fms_travel_repayment_draft_entry_secure(
      '{"loan_id":"d4338525-cb79-47be-8344-c46db47d1192","reason":"QA 超额还款"}',
      '[{"loan_item_id":"8187c8f3-31ee-4889-988c-2b48fb3cff21","amount":51}]');
    raise exception 'Repayment exceeded the remaining loan balance';
  exception when invalid_parameter_value then
    if sqlerrm not like '%超过借款未还余额%' then raise; end if;
  end;
  v_id:=(public.save_fms_travel_repayment_draft_entry_secure(
    '{"loan_id":"d4338525-cb79-47be-8344-c46db47d1192","reason":"QA 归还报销差额"}',
    '[{"loan_item_id":"8187c8f3-31ee-4889-988c-2b48fb3cff21","amount":50}]')->>'id')::uuid;
  perform public.submit_fms_travel_repayment_secure(v_id);
  perform set_config('app.qa_offset_repayment',v_id::text,true);
end $test$;
reset role;
select app_private.execute_fms_travel_repayment_workflow_callback(current_setting('app.qa_offset_repayment')::uuid,'approved','QA 财务',null);
set local role authenticated;
select public.record_fms_travel_repayment_collection_secure(current_setting('app.qa_offset_repayment')::uuid,20,current_date,'DEMO-OFFSET-PARTIAL',null);
reset role;
select app_private.execute_fms_travel_repayment_workflow_callback(current_setting('app.qa_offset_repayment')::uuid,'approved','QA 重试',null);
do $test$
begin
  if not exists(select 1 from public.fms_travel_repayment where id=current_setting('app.qa_offset_repayment')::uuid
    and status='awaiting_collection' and received_amount=20) then raise exception 'Approval replay reset a partial receipt'; end if;
end $test$;
set local role authenticated;
select public.record_fms_travel_repayment_collection_secure(current_setting('app.qa_offset_repayment')::uuid,30,current_date,'DEMO-OFFSET-FINAL',null);
reset role;
do $test$
begin
  if not exists(select 1 from public.fms_travel_loan where id='d4338525-cb79-47be-8344-c46db47d1192'
    and remaining_balance=0 and reimbursed_amount=300 and repaid_amount=50 and pending_collection_amount=0) then
    raise exception 'Offset and partial receipts did not settle the loan exactly'; end if;
end $test$;
select 'submitted offset reservation, optional project, demo inheritance, approval replay and exact settlement passed' result;
rollback;

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
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
select set_config('request.headers','{}',true);
select set_config('app.qa_partial_repayment',
  public.save_fms_travel_repayment_draft_entry_secure(
    '{"loan_id":"d4338525-cb79-47be-8344-c46db47d1192","reason":"QA 分次还款预留"}',
    '[{"loan_item_id":"8187c8f3-31ee-4889-988c-2b48fb3cff21","amount":200}]')->>'id',true);
select public.submit_fms_travel_repayment_secure(current_setting('app.qa_partial_repayment')::uuid);
reset role;
select app_private.execute_fms_travel_repayment_workflow_callback(current_setting('app.qa_partial_repayment')::uuid,'approved','QA 财务',null);
set local role authenticated;
select public.record_fms_travel_repayment_collection_secure(current_setting('app.qa_partial_repayment')::uuid,80,current_date,'DEMO-RESERVATION-PARTIAL',null);
reset role;
do $test$
declare v_balance record;
begin
  select * into strict v_balance from app_private.fms_travel_loan_settlement('d4338525-cb79-47be-8344-c46db47d1192');
  if v_balance.received_amount<>80 or v_balance.repayment_reserved<>120 or v_balance.available_amount<>150 then
    raise exception 'Partial receipts were deducted twice from available funds'; end if;
end $test$;
select 'only the unreceived repayment balance remains reserved' result;
rollback;
