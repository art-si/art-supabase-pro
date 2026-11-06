-- Execute against the scoped project as one transaction. All synthetic rows roll back.
begin;
do $customer_child_crud$
declare
  actor uuid;
  target_customer_id uuid;
  contact_id uuid;
  contact_copy_id uuid;
  finance_id uuid;
  finance_copy_id uuid;
  copied jsonb;
  reference_count integer;
begin
  select u.auth_user_id, c.id into actor, target_customer_id
  from public.sys_user u
  join public.mdm_customer c on c.tenant_id = u.tenant_id
  where u.status = '1' and u.deleted_at is null and u.auth_user_id is not null
    and (
      select count(distinct m.name)
      from public.sys_role r
      join public.sys_role_menu rm on rm.role_id = r.id and rm.tenant_id = r.tenant_id
      join public.sys_menu m on m.id = rm.menu_id
      where r.tenant_id = u.tenant_id and r.role_code = any(u.user_roles) and r.enabled
        and m.name in (
          'TmsCustomer:ContactAdd', 'TmsCustomer:ContactEdit',
          'TmsCustomer:ContactCopy', 'TmsCustomer:ContactDelete',
          'TmsCustomer:FinanceAdd', 'TmsCustomer:FinanceEdit',
          'TmsCustomer:FinanceCopy', 'TmsCustomer:FinanceDelete'
        )
    ) = 8
  order by u.id, c.id limit 1;
  if actor is null then raise exception 'Customer child CRUD actor is missing'; end if;

  perform set_config('request.jwt.claim.sub', actor::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', actor, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{}', true);
  execute 'set local role authenticated';

  contact_id := public.tms_create_customer_contact_secure(jsonb_build_object(
    'customer_id', target_customer_id, 'name', '事务验收联系人', 'is_default', true));
  if (select count(*) from public.tms_list_customer_contacts_secure(target_customer_id) f
      where (f->>'is_default')::boolean) <> 1 then
    raise exception 'Default contact invariant failed after creation';
  end if;
  copied := public.tms_copy_customer_contact_secure(contact_id);
  contact_copy_id := (copied->>'id')::uuid;
  if contact_copy_id = contact_id or copied->>'name' <> '事务验收联系人' or (copied->>'is_default')::boolean is distinct from false then
    raise exception 'Contact copy did not preserve fields and clear default';
  end if;
  select count(*) into reference_count from public.get_mdm_customer_contact_delete_dependencies_secure(array[contact_copy_id::text], null);
  if reference_count <> 0 then raise exception 'Unreferenced contact copy reports dependencies'; end if;
  if public.tms_delete_customer_contacts_secure(array[contact_copy_id]) <> 1 then
    raise exception 'Unreferenced contact copy delete failed';
  end if;
  if exists(select 1 from public.tms_list_customer_contacts_secure(target_customer_id) f
      where f->>'id' = contact_copy_id::text) then
    raise exception 'Deleted contact copy remains';
  end if;

  finance_id := public.tms_create_customer_finance_secure(jsonb_build_object(
    'customer_id', target_customer_id, 'invoice_title', '事务验收开票主体', 'is_default_invoice', true));
  if (public.tms_get_customer_default_finance_secure(target_customer_id)->>'id')::uuid <> finance_id then
    raise exception 'Default finance was not selected';
  end if;
  copied := public.tms_copy_customer_finance_secure(finance_id);
  finance_copy_id := (copied->>'id')::uuid;
  if finance_copy_id = finance_id or copied->>'invoice_title' <> '事务验收开票主体' or (copied->>'is_default_invoice')::boolean is distinct from false then
    raise exception 'Finance copy did not preserve fields and clear default';
  end if;
  select count(*) into reference_count from public.get_mdm_customer_finance_delete_dependencies_secure(array[finance_copy_id::text], null);
  if reference_count <> 0 then raise exception 'Unreferenced finance copy reports dependencies'; end if;
  if public.tms_delete_customer_finances_secure(array[finance_copy_id]) <> 1 then
    raise exception 'Unreferenced finance copy delete failed';
  end if;
  if exists(select 1 from public.tms_list_customer_finances_secure(target_customer_id) f
      where f->>'id' = finance_copy_id::text) then
    raise exception 'Deleted finance copy remains';
  end if;
end $customer_child_crud$;
rollback;
