-- MDM-only customer users share the child tables without gaining TMS menu access.
begin;
do $mdm_customer_children$
declare
  super_actor uuid;
  mdm_actor uuid;
  own_tenant uuid;
  own_customer uuid;
  other_customer uuid;
  other_tenant uuid;
  contact_id uuid;
  finance_id uuid;
  result jsonb;
begin
  select u.auth_user_id into super_actor from public.sys_user u
  join public.sys_tenant t on t.id=u.tenant_id
  where t.builtin_type='platform' and u.system_protected and u.status='1'
  order by u.id limit 1;
  select u.auth_user_id,u.tenant_id,c.id into mdm_actor,own_tenant,own_customer
  from public.sys_user u
  join public.sys_tenant t on t.id=u.tenant_id and t.builtin_type is distinct from 'platform'
  join public.sys_role r on r.tenant_id=u.tenant_id and r.role_code=any(u.user_roles) and r.enabled
  join public.mdm_customer c on c.tenant_id=u.tenant_id
  where u.status='1' and u.deleted_at is null and u.auth_user_id is not null
    and exists(select 1 from public.sys_role_menu rm join public.sys_menu m on m.id=rm.menu_id
      where rm.role_id=r.id and m.name='MdmSalesCustomer:View')
    and exists(select 1 from public.sys_role_menu rm join public.sys_menu m on m.id=rm.menu_id
      where rm.role_id=r.id and m.name='MdmSalesCustomer:ContactAdd')
    and exists(select 1 from public.sys_role_menu rm join public.sys_menu m on m.id=rm.menu_id
      where rm.role_id=r.id and m.name='MdmSalesCustomer:FinanceAdd')
    and (select count(distinct m.name) from public.sys_role_menu rm
      join public.sys_menu m on m.id=rm.menu_id where rm.role_id=r.id
      and m.name in ('MdmSalesCustomer:ContactEdit','MdmSalesCustomer:ContactCopy',
        'MdmSalesCustomer:ContactDelete','MdmSalesCustomer:FinanceCopy',
        'MdmSalesCustomer:FinanceDelete'))=5
    and not exists(select 1 from public.sys_role_menu rm join public.sys_menu m on m.id=rm.menu_id
      where rm.role_id=r.id and m.name='TmsCustomer:View')
  order by u.id,c.id limit 1;
  select id,tenant_id into other_customer,other_tenant from public.mdm_customer
  where tenant_id<>own_tenant order by id limit 1;
  if super_actor is null or mdm_actor is null or other_customer is null then
    raise exception 'MDM customer scope fixtures are missing';
  end if;

  perform set_config('request.jwt.claim.sub',super_actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',super_actor,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  execute 'set local role authenticated';
  perform public.tms_list_customer_contacts_secure(own_customer);
  perform public.tms_list_customer_finances_secure(other_customer);
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',own_tenant)::text,true);
  begin
    perform public.tms_list_customer_contacts_secure(other_customer);
    raise exception 'Platform selected MDM customer read crossed tenant';
  exception when sqlstate '42501' then null;
  end;

  perform set_config('request.jwt.claim.sub',mdm_actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',mdm_actor,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  result:=public.tms_list_customers_secure(p_customer_id=>own_customer);
  if (result->>'total')::int<>1 then raise exception 'MDM-only customer list failed'; end if;
  contact_id:=public.tms_create_customer_contact_secure(jsonb_build_object(
    'customer_id',own_customer,'name','MDM 验证联系人'));
  finance_id:=public.tms_create_customer_finance_secure(jsonb_build_object(
    'customer_id',own_customer,'invoice_title','MDM 验证开票主体','is_default_invoice',true));
  if (public.tms_get_customer_default_finance_secure(own_customer)->>'id')<>finance_id::text then
    raise exception 'MDM default finance failed';
  end if;
  perform public.tms_update_customer_contact_secure(contact_id,jsonb_build_object('name','MDM 更新联系人'));
  perform public.tms_copy_customer_contact_secure(contact_id);
  perform public.tms_copy_customer_finance_secure(finance_id);
  perform public.get_mdm_customer_contact_delete_dependencies_secure(array[contact_id::text],null);
  perform public.get_mdm_customer_finance_delete_dependencies_secure(array[finance_id::text],null);
  perform public.tms_delete_customer_contact_secure(contact_id);
  perform public.tms_delete_customer_finance_secure(finance_id);
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
  begin
    perform public.tms_list_customer_finances_secure(other_customer);
    raise exception 'MDM ordinary forged tenant read succeeded';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.tms_create_customer_contact_secure(jsonb_build_object(
      'customer_id',other_customer,'name','MDM 越权联系人'));
    raise exception 'MDM ordinary forged tenant write succeeded';
  exception when sqlstate '42501' then null;
  end;
end $mdm_customer_children$;
rollback;
