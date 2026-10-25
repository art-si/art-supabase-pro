-- Append to the seed section of fms-travel-loan-rejected-edit.sql (before SET LOCAL ROLE).
-- This test seeds synthetic paid-loan/approved-repayment snapshots; it does not execute bank payments.
do $repayment_seed$
declare fixtures jsonb:=current_setting('test.loan.fixtures')::jsonb;f jsonb;saved jsonb;
 targets jsonb:='[]';loan uuid;line_id uuid;repayment uuid;method text;n int;
begin
 perform set_config('request.jwt.claims','{}',true);
 perform set_config('request.jwt.claim.sub','',true);
 perform set_config('request.headers','{}',true);
 insert into public.sys_role_menu(tenant_id,role_id,menu_id)
 select r.tenant_id,r.id,m.id from public.sys_role r join public.sys_menu m
 on m.name='FinanceRepayment' or m.name like 'FinanceRepayment:%'
 where r.tenant_id in(select (value->>'tenant')::uuid from jsonb_array_elements(fixtures))
 on conflict do nothing;
 insert into public.sys_document_number_rule(tenant_id,rule_key,rule_name,category,target_table,target_column,template,reset_cycle,sequence_start,timezone)
 select (f.value->>'tenant')::uuid,r.rule_key,r.rule_name,r.category,r.target_table,r.target_column,r.template,r.reset_cycle,1,r.timezone
 from jsonb_array_elements(fixtures) f cross join(select * from public.sys_document_number_rule
  where rule_key='fms.travel_repayment' and enabled order by create_time limit 1) r;
 select d.value into strict method from public.sys_dictionary d join public.sys_dict_type t on t.id=d.type_id
 where t.code='fmsSettlementMethod' and d.status='1' order by d.sort,d.id limit 1;
 for n in 1..3 loop
  f:=case when n=3 then fixtures->1 else fixtures->0 end;
  perform pg_temp.loan_test_actor((f->>'actor')::uuid);
  saved:=public.save_fms_travel_loan_draft_secure(jsonb_build_object(
   'applicant_employee_id',f->>'employee','expense_department_id',f->>'department',
   'repayment_date',current_date+30,'reason','隔离收款重试验收'||n),
   jsonb_build_array(jsonb_build_object('expense_item_id',f->>'item','amount',100,'purpose','合成已付款借款快照')),
   jsonb_build_array(jsonb_build_object('payee_information_id',f->>'payee','settlement_method',method,'amount',100)));
  loan:=(saved->>'id')::uuid;
  update public.fms_travel_loan set status='paid',paid_amount=100,approved_amount=100,remaining_balance=100 where id=loan;
  select id into strict line_id from public.fms_travel_loan_item where loan_id=loan;
  saved:=public.save_fms_travel_repayment_draft_entry_secure(jsonb_build_object('loan_id',loan,'reason','隔离还款收款'||n),
   jsonb_build_array(jsonb_build_object('loan_item_id',line_id,'amount',100)));
  repayment:=(saved->>'id')::uuid;
  update public.fms_travel_repayment set status='approved' where id=repayment;
  targets:=targets||jsonb_build_array(jsonb_build_object('loan',loan,'repayment',repayment,'tenant',f->>'tenant'));
 end loop;
 perform set_config('test.repayment.targets',targets::text,true);
end $repayment_seed$;

-- Assertions run with authenticated privileges and only synthetic identities.
set local role authenticated;
do $repayment_test$
declare fixtures jsonb:=current_setting('test.loan.fixtures')::jsonb;
 targets jsonb:=current_setting('test.repayment.targets')::jsonb;
 a jsonb:=fixtures->0;b jsonb:=fixtures->1;t jsonb;key uuid;result jsonb;replay jsonb;n int;
begin
 for n in 0..1 loop
  t:=targets->n;key:=gen_random_uuid();
  perform pg_temp.loan_test_actor((a->>'actor')::uuid);
  result:=public.record_fms_travel_repayment_collection_secure((t->>'repayment')::uuid,40,current_date,'QA-RETRY-'||n,'隔离部分收款',key);
  replay:=public.record_fms_travel_repayment_collection_secure((t->>'repayment')::uuid,40,current_date,'QA-RETRY-'||n,'隔离部分收款',key);
  if result<>replay or (replay->>'receivedAmount')::numeric<>40 then raise exception 'Replay changed result or total';end if;
  if (select count(*) from public.fms_travel_repayment_receipt where repayment_id=(t->>'repayment')::uuid)<>1
   then raise exception 'Replay created a duplicate receipt';end if;
  begin
   perform public.record_fms_travel_repayment_collection_secure((t->>'repayment')::uuid,41,current_date,'QA-RETRY-'||n,'隔离部分收款',key);
   raise exception 'Request key accepted different amount';
  exception when invalid_parameter_value then null;end;
  begin
   perform public.record_fms_travel_repayment_collection_secure((targets->(1-n)->>'repayment')::uuid,40,current_date,'QA-RETRY-'||n,'隔离部分收款',key);
   raise exception 'Request key reused on a different repayment';
  exception when invalid_parameter_value then null;end;
  begin
   perform public.record_fms_travel_repayment_collection_secure((t->>'repayment')::uuid,40,current_date+1,'QA-RETRY-'||n,'隔离部分收款',key);
   raise exception 'Request key accepted a different date';
  exception when invalid_parameter_value then null;end;
  begin
   perform public.record_fms_travel_repayment_collection_secure((targets->2->>'repayment')::uuid,40,current_date,'QA-RETRY-'||n,'隔离部分收款',key);
   raise exception 'Foreign target accepted';
  exception when insufficient_privilege then null;end;
  perform pg_temp.loan_test_actor((a->>'actor')::uuid,(b->>'tenant')::uuid);
  replay:=public.record_fms_travel_repayment_collection_secure((t->>'repayment')::uuid,40,current_date,'QA-RETRY-'||n,'隔离部分收款',key);
  if result<>replay then raise exception 'Forged scope redirected ordinary replay';end if;
  perform pg_temp.loan_test_actor((a->>'approver')::uuid);
  begin
   perform public.record_fms_travel_repayment_collection_secure((t->>'repayment')::uuid,40,current_date,'QA-RETRY-'||n,'隔离部分收款',key);
   raise exception 'Collect permission bypassed';
  exception when insufficient_privilege then null;end;
  perform pg_temp.loan_test_actor(current_setting('test.loan.platform_actor')::uuid);
  replay:=public.record_fms_travel_repayment_collection_secure((t->>'repayment')::uuid,40,current_date,'QA-RETRY-'||n,'隔离部分收款',key);
  if result<>replay then raise exception 'Platform-all replay changed total';end if;
  perform pg_temp.loan_test_actor(current_setting('test.loan.platform_actor')::uuid,(t->>'tenant')::uuid);
  replay:=public.record_fms_travel_repayment_collection_secure((t->>'repayment')::uuid,40,current_date,'QA-RETRY-'||n,'隔离部分收款',key);
  if result<>replay then raise exception 'Platform-selected replay changed total';end if;
  perform pg_temp.loan_test_actor(current_setting('test.loan.platform_actor')::uuid,(b->>'tenant')::uuid);
  begin
   perform public.record_fms_travel_repayment_collection_secure((t->>'repayment')::uuid,40,current_date,'QA-RETRY-'||n,'隔离部分收款',key);
   raise exception 'Selected foreign tenant replay accepted';
  exception when insufficient_privilege then null;end;
  perform pg_temp.loan_test_actor((a->>'actor')::uuid);
  begin
   perform public.record_fms_travel_repayment_collection_secure((t->>'repayment')::uuid,0.001,current_date,null,null,gen_random_uuid());
   raise exception 'Sub-cent collection accepted';
  exception when invalid_parameter_value then null;end;
  result:=public.record_fms_travel_repayment_collection_secure((t->>'repayment')::uuid,60,current_date,'QA-FINAL-'||n,null,gen_random_uuid());
  if result->>'status'<>'collected' or (result->>'receivedAmount')::numeric<>100
   then raise exception 'Final collection mismatch';end if;
  -- Replay remains safe even after the parent is fully collected.
  replay:=public.record_fms_travel_repayment_collection_secure((t->>'repayment')::uuid,40,current_date,'QA-RETRY-'||n,'隔离部分收款',key);
  if (replay->>'receivedAmount')::numeric<>100 or replay->>'status'<>'collected'
   then raise exception 'Completed-parent replay failed';end if;
  if (select count(*) from public.fms_travel_repayment_receipt where repayment_id=(t->>'repayment')::uuid)<>2
   then raise exception 'Unexpected collection count';end if;
 end loop;
 -- Existing deployed callers with five arguments retain their original RPC contract.
 perform pg_temp.loan_test_actor((b->>'actor')::uuid);
 result:=public.record_fms_travel_repayment_collection_secure((targets->2->>'repayment')::uuid,10,current_date,'QA-LEGACY',null);
 if (result->>'receivedAmount')::numeric<>10 then raise exception 'Legacy call contract changed';end if;
 if has_function_privilege('anon','public.record_fms_travel_repayment_collection_secure(uuid,numeric,date,text,text,uuid)','execute')
  then raise exception 'Collection endpoint exposed to anonymous';end if;
end $repayment_test$;
reset role;
select 'two partial/replay/final collection chains, permissions and tenant scopes passed' as result;
rollback;
