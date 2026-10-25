-- Existing waybill-cost reimbursement still uses the same master/payment tables.
-- The moved item, cloned account, payments, and cost-state changes all roll back.
begin;
select set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
select set_config('request.headers','{}',true);
select set_config('app.workflow_engine','on',true);
do $fixture$
declare v_source public.tms_expense_reimbursement%rowtype;v_id uuid:=gen_random_uuid();v_fund uuid:=gen_random_uuid();
begin
  select r.* into strict v_source from public.tms_expense_reimbursement r
  where r.tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9' and r.source_type='waybill' and not r.is_demo
    and r.total_amount>0 and exists(select 1 from public.tms_expense_reimbursement_item i
      join public.tms_waybill_cost c on c.id=i.cost_id where i.reimbursement_id=r.id and c.settlement_status<>'paid')
  order by r.reimbursement_no limit 1;
  insert into public.tms_expense_reimbursement
  select (jsonb_populate_record(null::public.tms_expense_reimbursement,to_jsonb(v_source)||jsonb_build_object(
    'id',v_id,'reimbursement_no','QA-WB-'||substr(v_id::text,1,8),'status','approved',
    'paid_at',null,'paid_by',null,'payment_reference',null,'payment_voucher_urls','[]'::jsonb))).*;
  update public.tms_expense_reimbursement_item set reimbursement_id=v_id where reimbursement_id=v_source.id;
  insert into public.fms_fund_account
  select (jsonb_populate_record(null::public.fms_fund_account,to_jsonb(a)||jsonb_build_object(
    'id',v_fund,'account_code','QA-WB-'||upper(substr(v_fund::text,1,8)),
    'account_name','回滚验证运单报销资金账户','account_no_fingerprint',v_fund::text,
    'is_default',false,'online_banking_enabled',false))).*
  from public.fms_fund_account a where id='19a869a3-a386-49fc-8182-73043e871dea';
  perform set_config('app.qa_waybill_reimbursement',v_id::text,true);
  perform set_config('app.qa_waybill_fund',v_fund::text,true);
  perform set_config('app.qa_waybill_total',v_source.total_amount::text,true);
end $fixture$;
set local role authenticated;
do $test$
declare v_id uuid:=current_setting('app.qa_waybill_reimbursement')::uuid;
  v_fund uuid:=current_setting('app.qa_waybill_fund')::uuid;v_total numeric:=current_setting('app.qa_waybill_total')::numeric;
  v_first numeric;v_payment uuid;v_detail jsonb;
begin
  v_first:=round(v_total/2,2);
  perform public.execute_fms_expense_reimbursement_secure(v_id,v_fund,v_first,current_date,'QA-WB-PARTIAL','[]',null,null);
  v_detail:=public.tms_get_expense_reimbursement_secure(v_id);
  if v_detail->>'status'<>'partially_paid' or (v_detail->>'remaining_amount')::numeric<>v_total-v_first then
    raise exception 'Waybill partial payment changed after travel integration'; end if;
  v_payment:=public.execute_fms_expense_reimbursement_secure(v_id,v_fund,v_total-v_first,current_date,'QA-WB-FINAL','[]',null,null);
  perform set_config('app.qa_waybill_final_payment',v_payment::text,true);
end $test$;
reset role;
do $test$
declare v_id uuid:=current_setting('app.qa_waybill_reimbursement')::uuid;
  v_total numeric:=current_setting('app.qa_waybill_total')::numeric;
begin
  if not exists(select 1 from public.tms_expense_reimbursement where id=v_id and source_type='waybill' and status='paid')
    or (select count(*) from public.tms_expense_payment where reimbursement_id=v_id)<>2
    or exists(select 1 from public.tms_expense_payment where reimbursement_id=v_id and (is_demo or reimbursement_payee_id is not null)) then
    raise exception 'Waybill payment lifecycle or source isolation changed'; end if;
  if exists(select 1 from public.tms_expense_reimbursement_item i join public.tms_waybill_cost c on c.id=i.cost_id
    where i.reimbursement_id=v_id and (c.settlement_status<>'paid' or c.expense_payment_id is distinct from current_setting('app.qa_waybill_final_payment')::uuid)) then
    raise exception 'Waybill cost did not inherit the final payment'; end if;
  if (select coalesce(sum(e.amount),0) from public.fms_fund_ledger_entry e join public.tms_expense_payment p on p.id=e.source_id
    where p.reimbursement_id=v_id and e.source_type='expense_payment')<>v_total then
    raise exception 'Waybill ledger amount changed'; end if;
end $test$;
select 'waybill reimbursement partial/final payments, source cost state and shared fund ledger passed' result;
rollback;
