-- MDM customer deletion lists finance-linked orders through a scoped secure reader.
begin;
do $mdm_customer_delete$
declare
  actor uuid;
  customer_id uuid;
  finance_id uuid;
  order_id uuid;
  foreign_customer_id uuid;
  found_orders integer;
begin
  select u.auth_user_id,f.customer_id,f.id,o.id
  into actor,customer_id,finance_id,order_id
  from public.sys_user u
  join public.sys_tenant t on t.id=u.tenant_id and t.builtin_type is distinct from 'platform'
  join public.sys_role r on r.tenant_id=u.tenant_id and r.role_code=any(u.user_roles) and r.enabled
  join public.sys_role_menu rm on rm.role_id=r.id
  join public.sys_menu m on m.id=rm.menu_id and m.name='MdmSalesCustomer:Delete'
  join public.mdm_customer_finance f on f.tenant_id=u.tenant_id
  join public.tms_order o on o.shipping_customer_id=f.customer_id and o.tenant_id=f.tenant_id
  where u.status='1' and u.deleted_at is null and u.auth_user_id is not null
  order by u.id,o.id limit 1;
  select id into foreign_customer_id from public.mdm_customer
  where tenant_id<>(select tenant_id from public.mdm_customer where id=customer_id)
  order by id limit 1;
  if actor is null or foreign_customer_id is null then
    raise exception 'MDM customer delete fixtures are missing';
  end if;
  update public.tms_order set invoice_account_id=finance_id where id=order_id;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  execute 'set local role authenticated';
  select count(*) into found_orders
  from public.get_mdm_customer_delete_dependency_details_secure(array[customer_id::text],null)
  where source_table='tms_order' and nullif(record_no,'') is not null and target_id=order_id::text;
  if found_orders<>1 then raise exception 'MDM delete guard missed a linked order'; end if;
  begin
    perform public.get_mdm_customer_delete_dependency_details_secure(array[foreign_customer_id::text],null);
    raise exception 'MDM delete guard accepted a foreign tenant customer';
  exception when sqlstate '42501' then null;
  end;
end $mdm_customer_delete$;
rollback;
