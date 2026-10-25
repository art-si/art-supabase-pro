-- Uses approved disposable QA cost; every conversion is rolled back.
begin;
do $test$
declare a public.sys_user%rowtype; u public.sys_user%rowtype; other_tenant uuid; case_name text; new_id uuid; r public.tms_expense_reimbursement%rowtype;
begin
select * into strict a from public.sys_user where id='51760251-629d-4561-aeb8-0fbe62352494';
select * into strict u from public.sys_user where id='93f2f1e8-a3dc-4f5a-999b-6c8c02d0c7e9';
select id into strict other_tenant from public.sys_tenant where id<>u.tenant_id and status='1' and builtin_type is distinct from 'platform' and (service_start_date is null or service_start_date<=current_date) and (service_end_date is null or service_end_date>=current_date) order by id limit 1;
foreach case_name in array array['platform_all','platform_selected','ordinary_own','ordinary_forged'] loop
perform set_config('request.jwt.claims',jsonb_build_object('sub',case when case_name like 'platform_%' then a.auth_user_id else u.auth_user_id end,'role','authenticated','email',case when case_name like 'platform_%' then a.user_email else u.user_email end)::text,true);
perform set_config('request.headers',case when case_name='platform_all' then '{}' when case_name='ordinary_forged' then jsonb_build_object('x-art-tenant-scope',a.tenant_id)::text else jsonb_build_object('x-art-tenant-scope',u.tenant_id)::text end,true);
begin
new_id:=public.create_tms_expense_reimbursement(array['f2b7abfe-20c8-4697-9097-c82f0aa1d4d8'::uuid],'QA rollback payee',null,null,current_date,'bank_transfer','[]'::jsonb,'QA rollback verification',null);
select * into strict r from public.tms_expense_reimbursement where id=new_id;
if r.tenant_id<>u.tenant_id or r.total_amount<>12 then raise exception 'Wrong parent or amount: %',case_name; end if;
if case_name like 'platform_%' then
if r.created_by_user_id is not null or r.applicant_user_id<>a.id then raise exception 'Cross-tenant actor mismatch'; end if;
elsif r.created_by_user_id is distinct from u.id then raise exception 'Own creator missing'; end if;
if not exists(select 1 from public.tms_expense_reimbursement_item where reimbursement_id=new_id and tenant_id=u.tenant_id and amount_snapshot=12) then raise exception 'Child parent mismatch'; end if;
if not exists(select 1 from public.tms_waybill_cost where id='f2b7abfe-20c8-4697-9097-c82f0aa1d4d8' and reimbursement_id=new_id and settlement_status='pending_payment') then raise exception 'Cost link missing'; end if;
raise sqlstate 'Z0001' using message='rollback verified case';
exception when sqlstate 'Z0001' then null;
end;
end loop;
perform set_config('request.jwt.claims',jsonb_build_object('sub',a.auth_user_id,'role','authenticated')::text,true);
perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
begin
perform public.create_tms_expense_reimbursement(array['f2b7abfe-20c8-4697-9097-c82f0aa1d4d8'::uuid],'QA denial',null,null,current_date,'bank_transfer','[]'::jsonb,null,null);
raise exception 'Selected foreign tenant accepted';
exception when insufficient_privilege then null;
end;
end $test$;
select 'parent tenant, child amount, actor identity and foreign scope denial passed' result;
rollback;
