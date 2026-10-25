-- Real QA draft identity; no business mutation.
begin;
do $test$ declare a public.sys_user%rowtype; u public.sys_user%rowtype; r uuid; payload jsonb;
begin
select * into strict a from public.sys_user where id='51760251-629d-4561-aeb8-0fbe62352494';
select * into strict u from public.sys_user where id='93f2f1e8-a3dc-4f5a-999b-6c8c02d0c7e9';
select id into strict r from public.tms_expense_reimbursement where reimbursement_no='FYBX202610-0003' and tenant_id=u.tenant_id;
perform set_config('request.jwt.claims',jsonb_build_object('sub',a.auth_user_id,'role','authenticated')::text,true);
perform set_config('request.headers','{}',true);
payload:=public.tms_list_expense_reimbursements_secure(0,9,null,null,null,null,null,array[r]);
if payload->'records'->0->>'reimbursement_no' is distinct from 'FYBX202610-0003' then raise exception 'All-tenant list record empty'; end if;
if payload->'records'->0->>'total_amount' is distinct from '12.00' then raise exception 'List amount mismatch'; end if;
perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',u.tenant_id)::text,true);
if app_private.tms_expense_reimbursement_raw_json(r,false)->>'id' is distinct from r::text then raise exception 'Selected own record missing'; end if;
perform set_config('request.jwt.claims',jsonb_build_object('sub',u.auth_user_id,'role','authenticated')::text,true);
perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',a.tenant_id)::text,true);
if app_private.tms_expense_reimbursement_raw_json(r,false)->>'id' is distinct from r::text then raise exception 'Forged header affected own record'; end if;
if exists(select 1 from public.tms_expense_reimbursement f where f.tenant_id<>u.tenant_id and app_private.tms_expense_reimbursement_raw_json(f.id,false) is not null) then raise exception 'Foreign records leaked'; end if;
end $test$;
select 'all-tenant list and canonical raw scope passed' result;
rollback;
