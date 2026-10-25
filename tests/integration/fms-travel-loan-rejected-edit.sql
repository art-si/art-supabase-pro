-- Synthetic tenants, identities, loan rows and workflow tasks only. No bank or payment operations.
begin;
select set_config('request.jwt.claims','{}',true);
select set_config('request.jwt.claim.sub','',true);
select set_config('request.headers','{}',true);

create function pg_temp.loan_test_actor(actor uuid, scope uuid default null) returns void
language plpgsql as $$
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.headers',case when scope is null then '{}' else jsonb_build_object('x-art-tenant-scope',scope)::text end,true);
end $$;

-- Interactive rejection and resubmission occur in separate transactions. PostgreSQL now()
-- is fixed in this rollback test, so age only the synthetic first instance before resubmission.
create function pg_temp.loan_test_age_history(instance_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.wf_instance i set create_time=transaction_timestamp()-interval '1 minute'
 where i.id=instance_id and i.tenant_id in(
  select (value->>'tenant')::uuid from jsonb_array_elements(current_setting('test.loan.fixtures')::jsonb));
 if not found then raise exception 'Synthetic workflow history required';end if;
end $$;

do $seed$
declare t uuid;o uuid;department uuid;position_id uuid;employee uuid;profile uuid;actor uuid;family uuid;job uuid;
 approver uuid;approver_auth uuid;role_id uuid;payee uuid;item uuid;definition uuid;version_id uuid;
 code text; fixtures jsonb:='[]';n int;platform_actor uuid;
begin
 select u.auth_user_id into strict platform_actor from public.sys_user u
 join public.sys_tenant t on t.id=u.tenant_id
 where u.system_protected and t.builtin_type='platform' and u.auth_user_id is not null limit 1;
 for n in 1..2 loop
  perform set_config('request.jwt.claims','{}',true);
  perform set_config('request.jwt.claim.sub','',true);
  code:='LOAN_REJECT_'||upper(left(gen_random_uuid()::text,8));actor:=gen_random_uuid();approver_auth:=gen_random_uuid();
  insert into public.sys_tenant(tenant_code,tenant_name,remark)
  values(lower(code),'隔离借款整改验收租户'||n,'事务内合成数据，不涉及真实付款') returning id into t;
  insert into public.sys_document_number_rule(tenant_id,rule_key,rule_name,category,target_table,target_column,template,reset_cycle,sequence_start,timezone)
  select t,r.rule_key,r.rule_name,r.category,r.target_table,r.target_column,r.template,r.reset_cycle,1,r.timezone
  from (select distinct on(rule_key) * from public.sys_document_number_rule
   where rule_key in('hr.position','hr.employee','fms.travel_loan') and enabled order by rule_key,create_time) r;
  insert into public.mdm_organization(tenant_id,organization_code,organization_name,organization_type)
  values(t,'COMPANY','隔离借款公司','company') returning id into o;
  insert into public.mdm_organization(tenant_id,parent_id,organization_code,organization_name,organization_type)
  values(t,o,'DEPARTMENT','隔离借款部门','department') returning id into department;
  insert into public.mdm_job_family(tenant_id,family_code,family_name)
  values(t,'TEST','隔离测试职族') returning id into family;
  insert into public.mdm_job_profile(tenant_id,family_id,job_code,job_name)
  values(t,family,'TEST','隔离测试职位') returning id into job;
  insert into public.mdm_position(tenant_id,organization_id,position_code,position_name,job_profile_id)
  values(t,department,'TEST','隔离测试岗位',job) returning id into position_id;
  insert into public.sys_user(tenant_id,auth_user_id,user_name,user_email,status,create_by,account_identity_type)
  values(t,actor,'隔离申请人',code||'@example.invalid','1','isolated-test','pending_review') returning id into profile;
  insert into public.mdm_employee(tenant_id,employee_no,employee_name,phone,email,id_card_no,position_id,organization_id,employment_status,created_by_user_id)
  values(t,'TEST','隔离申请人','1990000000'||n,code||'@example.invalid','11010119900101001'||n,position_id,department,'active',profile) returning id into employee;
  update public.sys_user set hr_employee_id=employee,account_identity_type='employee' where id=profile;
  insert into public.sys_role(tenant_id,role_code,role_name,enabled)
  values(t,code,'隔离借款维护角色',true) returning id into role_id;
  insert into public.sys_role_menu(tenant_id,role_id,menu_id)
  select t,role_id,id from public.sys_menu where name='FinanceLoanApplication' or name like 'FinanceLoanApplication:%';
  update public.sys_user set user_roles=array[code] where id=profile;
  insert into public.sys_user(tenant_id,auth_user_id,user_name,user_email,status,create_by,account_identity_type)
  values(t,approver_auth,'隔离审批人',code||'-approver@example.invalid','1','isolated-test','pending_review') returning id into approver;
  perform pg_temp.loan_test_actor(actor);
  insert into public.fms_payee_information(tenant_id,payee_name,bank_name,bank_account,created_by_user_id,create_by,is_employee,employee_id,organization_id,cost_company_id)
  values(t,'隔离申请人','合成银行（无连接）','TEST-ONLY-'||n,profile,'isolated-test',true,employee,department,o) returning id into payee;
  insert into public.tms_expense_item(tenant_id,item_code,item_name,business_category)
  values(t,'TEST','隔离借款费用','other') returning id into item;
  insert into public.wf_definition(tenant_id,code,name,business_type)
  values(t,'LOAN_TEST','隔离借款审批','fms_travel_loan') returning id into definition;
  insert into public.wf_version(tenant_id,definition_id,version_no,status,config)
  values(t,definition,1,'published',jsonb_build_object('allowAutoApprove',false,'nodes',jsonb_build_array(jsonb_build_object(
   'key','review','name','隔离审批','order',1,'approvalMode','any','approvalThresholdPercent',100,
   'dueHours',24,'reminderBeforeMinutes',60,'escalationEnabled',false,'escalateAfterHours',24,
   'rejectVetoEnabled',true,'allowSelfApproval',false,'condition',jsonb_build_object('operator','always'),
   'assignee',jsonb_build_object('type','users','userIds',jsonb_build_array(approver)))))) returning id into version_id;
  update public.wf_definition set current_version_id=version_id,status='published' where id=definition;
  fixtures:=fixtures||jsonb_build_array(jsonb_build_object('tenant',t,'actor',actor,'profile',profile,'employee',employee,
   'department',department,'payee',payee,'item',item,'approver',approver_auth));
 end loop;
 perform set_config('test.loan.fixtures',fixtures::text,true);
 perform set_config('test.loan.platform_actor',platform_actor::text,true);
end $seed$;

set local role authenticated;
do $test$
declare fixtures jsonb:=current_setting('test.loan.fixtures')::jsonb;a jsonb:=fixtures->0;b jsonb:=fixtures->1;
 payload jsonb;items jsonb;payees jsonb;saved jsonb;loan uuid;foreign_loan uuid;instance uuid;new_instance uuid;task_id uuid;
 n int;state text;old_remark text;method text;platform_actor uuid:=current_setting('test.loan.platform_actor')::uuid;
begin
 select d.value into strict method from public.sys_dictionary d join public.sys_dict_type t on t.id=d.type_id
 where t.code='fmsSettlementMethod' and d.status='1' order by d.sort,d.id limit 1;
 -- A real foreign-tenant target, created through its own authenticated business boundary.
 perform pg_temp.loan_test_actor((b->>'actor')::uuid);
 saved:=public.save_fms_travel_loan_draft_secure(jsonb_build_object('applicant_employee_id',b->>'employee',
  'expense_department_id',b->>'department','repayment_date',current_date+30,'reason','隔离外租户借款'),
  jsonb_build_array(jsonb_build_object('expense_item_id',b->>'item','amount',10,'purpose','隔离借款')),
  jsonb_build_array(jsonb_build_object('payee_information_id',b->>'payee','settlement_method',method,'amount',10)));
 foreign_loan:=(saved->>'id')::uuid;
 for n in 1..2 loop
  perform pg_temp.loan_test_actor((a->>'actor')::uuid);
  payload:=jsonb_build_object('applicant_employee_id',a->>'employee','expense_department_id',a->>'department',
   'repayment_date',current_date+30,'reason','隔离驳回整改'||n,'remark','原始备注');
  items:=jsonb_build_array(jsonb_build_object('expense_item_id',a->>'item','amount',n*100,'purpose','隔离借款'));
  payees:=jsonb_build_array(jsonb_build_object('payee_information_id',a->>'payee','settlement_method',method,'amount',n*100));
  saved:=public.save_fms_travel_loan_draft_secure(payload,items,payees);loan:=(saved->>'id')::uuid;
  instance:=public.start_workflow('fms_travel_loan',loan,'隔离借款整改'||n);
  perform pg_temp.loan_test_actor((a->>'approver')::uuid);
  select id into strict task_id from public.wf_task where instance_id=instance and status='pending';
  perform public.act_workflow_task(task_id,'reject','隔离测试：修改备注后重提');
  perform pg_temp.loan_test_age_history(instance);
  perform pg_temp.loan_test_actor((a->>'actor')::uuid);
  select jsonb_agg(jsonb_build_object('id',id,'expense_item_id',expense_item_id,'amount',amount,'purpose',purpose))
   into items from public.fms_travel_loan_item where loan_id=loan;
  select jsonb_agg(jsonb_build_object('id',id,'payee_information_id',payee_information_id,'settlement_method',settlement_method,'amount',amount))
   into payees from public.fms_travel_loan_payee where loan_id=loan;
  payload:=payload||jsonb_build_object('id',loan,'remark','已整改'||n);
  saved:=public.save_fms_travel_loan_draft_secure(payload,items,payees);
  if saved->>'status'<>'rejected' or not exists(select 1 from public.fms_travel_loan where id=loan and status='rejected' and remark='已整改'||n)
   then raise exception 'Rejected edit changed status or failed to persist';end if;
  if not exists(select 1 from public.wf_instance where id=instance and status='rejected')
   then raise exception 'Rejected edit lost approval history';end if;
  -- Ordinary forged scope cannot redirect the row or change its tenant.
  perform pg_temp.loan_test_actor((a->>'actor')::uuid,(b->>'tenant')::uuid);
  perform public.save_fms_travel_loan_draft_secure(payload,items,payees);
  begin
   perform public.save_fms_travel_loan_draft_secure(payload||jsonb_build_object('id',foreign_loan),items,payees);
   raise exception 'Foreign ordinary write accepted';
  exception when insufficient_privilege then null;end;
  begin
   perform public.save_fms_travel_loan_draft_secure(payload||jsonb_build_object('tenant_id',b->>'tenant'),items,payees);
   raise exception 'Tenant reassignment accepted';
  exception when insufficient_privilege then null;end;
  -- An approver without Edit cannot modify the rejected business document.
  perform pg_temp.loan_test_actor((a->>'approver')::uuid);
  begin
   perform public.save_fms_travel_loan_draft_secure(payload,items,payees);
   raise exception 'Edit permission bypassed';
  exception when insufficient_privilege then null;end;
  -- Platform-all resolves the existing row; a concrete foreign selection still blocks it.
  perform pg_temp.loan_test_actor(platform_actor);
  perform public.save_fms_travel_loan_draft_secure(payload,items,payees);
  perform pg_temp.loan_test_actor(platform_actor,(a->>'tenant')::uuid);
  perform public.save_fms_travel_loan_draft_secure(payload,items,payees);
  perform pg_temp.loan_test_actor(platform_actor,(b->>'tenant')::uuid);
  begin
   perform public.save_fms_travel_loan_draft_secure(payload,items,payees);
   raise exception 'Selected foreign tenant write accepted';
  exception when insufficient_privilege then null;end;
  perform pg_temp.loan_test_actor((a->>'actor')::uuid);
  new_instance:=public.start_workflow('fms_travel_loan',loan,'隔离整改重新提交'||n);
  if new_instance=instance then raise exception 'Resubmission reused rejected instance';end if;
  select status into state from public.fms_travel_loan where id=loan;
  if state<>'pending_review' then raise exception 'Resubmission status %, callbacks %',state,
   (select jsonb_agg(to_jsonb(o)) from public.wf_business_callback_outbox o where business_id=loan);end if;
  begin
   perform public.save_fms_travel_loan_draft_secure(payload,items,payees);
   raise exception 'Pending review edit accepted';
  exception when invalid_parameter_value then null;end;
  perform pg_temp.loan_test_actor((a->>'approver')::uuid);
  select id into strict task_id from public.wf_task where instance_id=new_instance and status='pending';
  perform public.act_workflow_task(task_id,'approve','隔离整改审批通过');
  perform pg_temp.loan_test_actor((a->>'actor')::uuid);
  select status into state from public.fms_travel_loan where id=loan;
  if state not in('approved','awaiting_payment') then raise exception 'Resubmitted loan did not approve: %',state;end if;
  begin
   perform public.save_fms_travel_loan_draft_secure(payload,items,payees);
   raise exception 'Approved edit accepted';
  exception when invalid_parameter_value then null;end;
  if exists(select 1 from public.fms_travel_loan_payment where loan_id=loan)
   then raise exception 'Unexpected loan payment';end if;
 end loop;
end $test$;
reset role;
select 'two rejected-edit-resubmit-approve chains, history, permissions and tenant scopes passed' as result;
rollback;
