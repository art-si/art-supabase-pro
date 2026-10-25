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
select set_config('request.jwt.claims','{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
select set_config('request.headers','{}',true);
do $test$
declare v_actor text; v_header text; v_kind text; v_result jsonb; v_options jsonb;v_draft jsonb;v_lines jsonb;
begin
  select jsonb_build_array(jsonb_build_object('expense_item_id',expense_item_id,'gross_amount',100,
    'occurred_on',current_date,'tax_rate',0,'tax_amount',0)) into v_lines
    from public.fms_travel_loan_item where id='8187c8f3-31ee-4889-988c-2b48fb3cff21';
  foreach v_actor in array array['0a872664-874c-447d-a256-d0dbdca6ed45','ab881b32-87d4-4dce-9014-ce488b8069df'] loop
    foreach v_header in array array['','7529f951-938e-4e2c-ac0d-316c136ae1f9','6675a0d6-3ff6-4ab7-bb09-232d85ae96ad'] loop
      perform set_config('request.jwt.claims',jsonb_build_object('sub',v_actor,'role','authenticated')::text,true);
      perform set_config('request.headers',case when v_header='' then '{}' else jsonb_build_object('x-art-tenant-scope',v_header)::text end,true);
      foreach v_kind in array array['repayment','reimbursement'] loop
        begin
          v_result:=public.prepare_fms_travel_loan_push_secure('d4338525-cb79-47be-8344-c46db47d1192',v_kind);
          if v_actor='0a872664-874c-447d-a256-d0dbdca6ed45' and v_header='6675a0d6-3ff6-4ab7-bb09-232d85ae96ad' then
            raise exception 'Platform selected foreign tenant prepared a loan push'; end if;
          if v_result->>'id'<>'d4338525-cb79-47be-8344-c46db47d1192'
            or (v_result->>'available_amount')::numeric<>350
            or jsonb_array_length(v_result->'items')<>1 or not(v_result->>'is_demo')::boolean then
            raise exception 'Push source snapshots or available balance mismatch'; end if;
          if v_kind='reimbursement' then
            v_draft:=public.fms_save_travel_reimbursement_draft_secure(
              jsonb_build_object('tenant_id',v_result->>'tenant_id','applicant_employee_id',v_result->>'applicant_employee_id',
                'expense_department_id',v_result->>'expense_department_id','travel_loan_id',v_result->>'id',
                'loan_offset_amount',0,'reason','QA 四类租户下推创建'),v_lines,'[]');
            if v_draft->>'status'<>'draft' then raise exception 'Loan push did not create a draft'; end if;
          end if;
        exception when insufficient_privilege then
          if not(v_actor='0a872664-874c-447d-a256-d0dbdca6ed45' and v_header='6675a0d6-3ff6-4ab7-bb09-232d85ae96ad') then raise; end if;
        end;
      end loop;
      begin
        v_options:=public.fms_list_reimbursement_loan_options_secure(
          '7529f951-938e-4e2c-ac0d-316c136ae1f9','5d64a283-ef9b-409f-88fa-4a691e7815ec',null);
        if v_actor='0a872664-874c-447d-a256-d0dbdca6ed45' and v_header='6675a0d6-3ff6-4ab7-bb09-232d85ae96ad' then
          raise exception 'Platform selected foreign tenant read loan options'; end if;
        if not exists(select 1 from jsonb_array_elements(v_options) e where e->>'id'='d4338525-cb79-47be-8344-c46db47d1192') or exists(select 1 from jsonb_array_elements(v_options) e where e->>'tenant_id'<>'7529f951-938e-4e2c-ac0d-316c136ae1f9') then
          raise exception 'Loan options mixed tenants or omitted source loans'; end if;
      exception when insufficient_privilege then
        if not(v_actor='0a872664-874c-447d-a256-d0dbdca6ed45' and v_header='6675a0d6-3ff6-4ab7-bb09-232d85ae96ad') then raise; end if;
      end;
    end loop;
  end loop;
  perform set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
  perform set_config('request.headers','{}',true);
  begin
    perform public.fms_list_reimbursement_loan_options_secure('7529f951-938e-4e2c-ac0d-316c136ae1f9',gen_random_uuid(),null);
    raise exception 'Employee without delegation appeared in options';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims','{"sub":"543f8dea-2e27-4fe0-b009-f80d86155be6","role":"authenticated"}',true);
  begin
    perform public.prepare_fms_travel_loan_push_secure('d4338525-cb79-47be-8344-c46db47d1192','reimbursement');
    raise exception 'Source permission bypassed target Add permission';
  exception when insufficient_privilege then null; end;
  if has_function_privilege('anon','public.prepare_fms_travel_loan_push_secure(uuid,text)','execute')
    or has_function_privilege('anon','public.fms_list_reimbursement_loan_options_secure(uuid,uuid,uuid)','execute') then
    raise exception 'Loan push endpoint exposed to anonymous'; end if;
end $test$;
reset role;
select 'loan push and offset selectors all/selected/own/forged/delegation/target-permission scopes passed' result;
rollback;
