-- Run against the scoped project inside a caller-owned transaction.
-- Uses real users and customer rows; all writes roll back.
begin;
do $customer_children$
declare
  super_actor uuid;
  ordinary_actor uuid;
  own_tenant uuid;
  own_customer uuid;
  other_customer uuid;
  other_tenant uuid;
  contact_id uuid;
  finance_id uuid;
begin
  select u.auth_user_id into super_actor
  from public.sys_user u join public.sys_tenant t on t.id=u.tenant_id
  where t.builtin_type='platform' and u.system_protected and u.status='1'
  order by u.id limit 1;
  select u.auth_user_id,u.tenant_id,c.id into ordinary_actor,own_tenant,own_customer
  from public.sys_user u
  join public.sys_role r on r.tenant_id=u.tenant_id and r.role_code=any(u.user_roles) and r.enabled
  join public.sys_role_menu rm on rm.role_id=r.id and rm.tenant_id=u.tenant_id
  join public.sys_menu m on m.id=rm.menu_id and m.name='TmsCustomer:ContactAdd'
  join public.mdm_customer c on c.tenant_id=u.tenant_id
  where u.status='1' and u.deleted_at is null and u.auth_user_id is not null
  order by u.id,c.id limit 1;
  select id,tenant_id into other_customer,other_tenant from public.mdm_customer
  where tenant_id<>own_tenant order by id limit 1;
  if super_actor is null or ordinary_actor is null or other_customer is null then
    raise exception 'Customer child scope fixtures are missing';
  end if;

  perform set_config('request.jwt.claim.sub',super_actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',super_actor,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  execute 'set local role authenticated';
  perform public.tms_list_customer_contacts_secure(own_customer);
  perform public.tms_list_customer_contacts_secure(other_customer);
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',own_tenant)::text,true);
  perform public.tms_list_customer_finances_secure(own_customer);
  begin
    perform public.tms_list_customer_finances_secure(other_customer);
    raise exception 'Platform selected tenant read crossed scope';
  exception when sqlstate '42501' then null;
  end;

  perform set_config('request.jwt.claim.sub',ordinary_actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',ordinary_actor,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  perform public.tms_list_customer_contacts_secure(own_customer);
  contact_id:=public.tms_create_customer_contact_secure(jsonb_build_object(
    'customer_id',own_customer,'name','集成验证联系人','is_default',true));
  if (public.tms_update_customer_contact_secure(contact_id,jsonb_build_object('name','集成验证默认联系人'))->>'name')
      <> '集成验证默认联系人' then raise exception 'Default contact update failed'; end if;
  perform public.tms_copy_customer_contact_secure(contact_id);
  perform public.tms_delete_customer_contact_secure(contact_id);
  finance_id:=public.tms_create_customer_finance_secure(jsonb_build_object(
    'customer_id',own_customer,'invoice_title','集成验证开票主体','is_default_invoice',true));
  if (public.tms_get_customer_default_finance_secure(own_customer)->>'id')<>finance_id::text then
    raise exception 'Default finance selection failed';
  end if;
  perform public.tms_copy_customer_finance_secure(finance_id);
  perform public.tms_delete_customer_finance_secure(finance_id);

  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
  perform public.tms_list_customer_contacts_secure(own_customer);
  begin
    perform public.tms_list_customer_contacts_secure(other_customer);
    raise exception 'Ordinary forged tenant read crossed scope';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.tms_create_customer_contact_secure(jsonb_build_object(
      'customer_id',other_customer,'name','越权联系人'));
    raise exception 'Ordinary forged tenant write crossed scope';
  exception when sqlstate '42501' then null;
  end;
end $customer_children$;
rollback;
