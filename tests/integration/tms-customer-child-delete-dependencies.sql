-- New customer relations must block deletion with concrete navigable records.
begin;
do $customer_delete_refs$
declare
  actor uuid;
  customer_id uuid;
  finance_id uuid;
  order_id uuid;
  electronic public.tms_electronic_contract%rowtype;
  agreement public.tms_transport_agreement%rowtype;
  dependency_kinds integer;
begin
  select u.auth_user_id into actor
  from public.sys_user u join public.sys_tenant t on t.id=u.tenant_id
  where t.builtin_type='platform' and u.system_protected and u.status='1'
  order by u.id limit 1;
  select f.customer_id,f.id,o.id into customer_id,finance_id,order_id
  from public.mdm_customer_finance f
  join public.tms_order o on o.shipping_customer_id=f.customer_id and o.tenant_id=f.tenant_id
  where exists(select 1 from public.tms_electronic_contract e where e.tenant_id=f.tenant_id)
    and exists(select 1 from public.tms_transport_agreement t where t.tenant_id=f.tenant_id)
  order by f.id,o.id limit 1;
  if actor is null or customer_id is null then raise exception 'Customer dependency fixtures are missing'; end if;
  select * into electronic from public.tms_electronic_contract where tenant_id=(
    select tenant_id from public.mdm_customer_finance where id=finance_id) limit 1;
  select * into agreement from public.tms_transport_agreement where tenant_id=electronic.tenant_id limit 1;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);

  electronic.id:=gen_random_uuid();
  electronic.contract_no:='QA_DELETE_'||left(electronic.id::text,8);
  electronic.customer_id:=customer_id;
  electronic.status:='pending_signed';
  electronic.create_time:=now();
  insert into public.tms_electronic_contract select (electronic).*;
  agreement.id:=gen_random_uuid();
  agreement.agreement_no:='QA_DELETE_'||left(agreement.id::text,8);
  agreement.customer_id:=customer_id;
  agreement.status:='pending_signed';
  agreement.create_time:=now();
  insert into public.tms_transport_agreement select (agreement).*;
  update public.tms_order set invoice_account_id=finance_id where id=order_id;

  execute 'set local role authenticated';
  select count(*) into dependency_kinds
  from public.get_tms_customer_delete_dependencies_secure(array[customer_id])
  where dependency_code in ('electronic_contract','transport_agreement','order_invoice_account');
  if dependency_kinds<>3 then raise exception 'Customer delete counts missed a new relation'; end if;
  select count(*) into dependency_kinds
  from public.get_tms_customer_delete_dependency_details_secure(array[customer_id])
  where dependency_code in ('electronic_contract','transport_agreement','order_invoice_account')
    and nullif(record_no,'') is not null and target_id is not null;
  if dependency_kinds<>3 then raise exception 'Customer delete details lack concrete navigation targets'; end if;
end $customer_delete_refs$;
rollback;
