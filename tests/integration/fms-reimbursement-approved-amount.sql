-- A full approval defaults the header and travel lines' certified amounts.
begin;
update public.tms_expense_reimbursement
set approved_amount = null
where id = 'b59d39b6-4d43-4d64-a995-4309488b3bb9' and is_demo;
update public.fms_expense_reimbursement_line
set approved_amount = null
where reimbursement_id = 'b59d39b6-4d43-4d64-a995-4309488b3bb9';

select app_private.execute_expense_reimbursement_workflow_callback(
  'b59d39b6-4d43-4d64-a995-4309488b3bb9',
  'approved', 'QA', '回滚验证'
);
do $test$
begin
  if (select approved_amount from public.tms_expense_reimbursement
      where id = 'b59d39b6-4d43-4d64-a995-4309488b3bb9') <> 500
    or (select sum(approved_amount) from public.fms_expense_reimbursement_line
        where reimbursement_id = 'b59d39b6-4d43-4d64-a995-4309488b3bb9') <> 500 then
    raise exception 'Approved reimbursement amount does not match its travel lines';
  end if;
end $test$;

select 'travel reimbursement certified amounts passed' result;
rollback;
