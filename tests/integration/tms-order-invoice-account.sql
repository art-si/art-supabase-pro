-- Default customer invoice account is selected on order creation and validated on edit.
begin;
do $order_invoice$
declare
  actor uuid;
  v_customer_id uuid;
  default_finance_id uuid;
  project_finance_id uuid;
  other_finance_id uuid;
  created jsonb;
  order_id uuid;
begin
  select u.auth_user_id,f.customer_id,f.id
  into actor,v_customer_id,default_finance_id
  from public.sys_user u
  join public.sys_role r on r.tenant_id=u.tenant_id and r.role_code=any(u.user_roles) and r.enabled
  join public.sys_role_menu rm on rm.role_id=r.id and rm.tenant_id=u.tenant_id
  join public.sys_menu m on m.id=rm.menu_id and m.name='TmsOrderOpen:Create'
  join public.mdm_customer_finance f on f.tenant_id=u.tenant_id and f.is_default_invoice
  where u.status='1' and u.deleted_at is null and u.auth_user_id is not null
  order by u.id,f.id limit 1;
  select f.id into other_finance_id from public.mdm_customer_finance f
  where f.customer_id<>v_customer_id
    and f.tenant_id=(select tenant_id from public.mdm_customer_finance where id=default_finance_id)
  order by f.id limit 1;
  if actor is null or default_finance_id is null or other_finance_id is null then
    raise exception 'Order invoice account fixtures are missing';
  end if;

  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  insert into public.mdm_customer_finance(customer_id,tenant_id,invoice_title,is_default_invoice)
  select v_customer_id,tenant_id,'集成验证项目开票主体',false
  from public.mdm_customer_finance where id=default_finance_id
  returning id into project_finance_id;
  execute 'set local role authenticated';
  created:=public.tms_create_order_with_contract_secure(jsonb_build_object(
    'order_no','QA_INVOICE_'||replace(gen_random_uuid()::text,'-',''),
    'order_status','pending_load','origin_station','上海站','destination_station','苏州站',
    'delivery_method','door','shipping_customer_id',v_customer_id,
    'shipping_contact_name','验收发货人','shipping_contact_phone','13800000000',
    'shipping_address_detail','上海','receiving_contact_name','验收收货人',
    'receiving_contact_phone','13900000000','receiving_address_detail','苏州',
    'payment_method','monthly','cargo_items','[]'::jsonb,
    'order_config',jsonb_build_object(
      'load_type','ltl','billing_mode','quantity','billing_unit','piece',
      'cargo_category','general','packaging','bulk',
      'transport_requirements','[]'::jsonb,'attachment_urls','[]'::jsonb)
  ),null);
  order_id:=(created->>'id')::uuid;
  if created->>'invoice_account_id'<>default_finance_id::text then
    raise exception 'Default invoice account was not selected';
  end if;
  if (public.tms_get_order_detail_secure(order_id)->>'invoice_account_id')<>default_finance_id::text then
    raise exception 'Invoice account was not persisted on the order';
  end if;
  if (public.tms_update_order_with_contract_secure(order_id,
      jsonb_build_object('invoice_account_id',project_finance_id),null)->>'invoice_account_id')
      <>project_finance_id::text then
    raise exception 'Project-specific invoice account was not selected';
  end if;
  begin
    perform public.tms_update_order_with_contract_secure(order_id,
      jsonb_build_object('invoice_account_id',other_finance_id),null);
    raise exception 'An account from another customer was accepted';
  exception when sqlstate '23503' then null;
  end;
end $order_invoice$;
rollback;
