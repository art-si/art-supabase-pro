-- Uses draft QA reimbursement FYBX202610-0003. All submissions roll back.
begin;
do $test$
declare
  a public.sys_user%rowtype;
  u public.sys_user%rowtype;
  other_tenant uuid;
  case_name text;
  context jsonb;
  instance_id uuid;
  reimbursement_id uuid := '33058c09-aac2-462f-bd43-3a85ca20ba21';
begin
  select * into strict a from public.sys_user where id='51760251-629d-4561-aeb8-0fbe62352494';
  select * into strict u from public.sys_user where id='93f2f1e8-a3dc-4f5a-999b-6c8c02d0c7e9';
  select id into strict other_tenant from public.sys_tenant
  where id<>u.tenant_id and status='1' and builtin_type is distinct from 'platform'
    and (service_start_date is null or service_start_date<=current_date)
    and (service_end_date is null or service_end_date>=current_date)
  order by id limit 1;
  foreach case_name in array array['platform_all','platform_selected','ordinary_own','ordinary_forged'] loop
    perform set_config('request.jwt.claims', jsonb_build_object(
      'sub',case when case_name like 'platform_%' then a.auth_user_id else u.auth_user_id end,
      'role','authenticated',
      'email',case when case_name like 'platform_%' then a.user_email else u.user_email end)::text,true);
    perform set_config('request.headers',
      case when case_name='platform_all' then '{}'
      when case_name='ordinary_forged' then jsonb_build_object('x-art-tenant-scope',other_tenant)::text
      else jsonb_build_object('x-art-tenant-scope',u.tenant_id)::text end,true);
    context := public.validate_tms_expense_reimbursement_submission_secure(reimbursement_id);
    if (context->>'amount')::numeric <> 12 or context->>'reimbursementNo'<>'FYBX202610-0003' then
      raise exception 'Submission context mismatch: %',case_name;
    end if;
    begin
      instance_id := public.start_workflow('tms_expense_reimbursement',reimbursement_id,'QA rollback submission','{}',gen_random_uuid()::text);
      if not exists(select 1 from public.wf_instance where id=instance_id and tenant_id=u.tenant_id
        and initiator_user_id=case when case_name like 'platform_%' then a.id else u.id end
        and not (context_snapshot ? 'amount') and not (context_snapshot ? 'paymentMethod')) then
        raise exception 'Parent scope or sensitive snapshot mismatch: %',case_name;
      end if;
      raise sqlstate 'Z0001' using message='rollback verified submission';
    exception
      when sqlstate 'Z0001' then null;
      when raise_exception then
        if case_name not like 'platform_%' or sqlerrm not like '节点%没有可用审批人%' then raise; end if;
    end;
  end loop;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',a.auth_user_id,'role','authenticated')::text,true);
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
  begin
    perform public.validate_tms_expense_reimbursement_submission_secure(reimbursement_id);
    raise exception 'Selected foreign scope accepted';
  exception when insufficient_privilege then null; end;
end $test$;
select 'parent tenant submission, actor identity, protected snapshots and selected-scope denial passed' result;
rollback;
