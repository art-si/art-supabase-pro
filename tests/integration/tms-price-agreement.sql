-- Agreement fields, applicable pricing, contract scope, and tenant reads.
begin;
do $test$
declare
  super_actor uuid;
  ordinary_actor uuid := '5774aa51-3bbb-4da5-abd4-7ea44b44ea6a';
  price_row public.tms_customer_price%rowtype;
  carrier_row public.tms_carrier_price%rowtype;
  wrong_contract uuid;
  platform_customer uuid;
  created_price uuid;
  created_tenant uuid;
  create_payload jsonb;
  own_tenant uuid := '7529f951-938e-4e2c-ac0d-316c136ae1f9';
  other_tenant uuid := '67c9741f-c98a-4cd1-a7ec-0ebd5ed5b61d';
  result jsonb;
begin
  select u.auth_user_id into super_actor
  from public.sys_user u
  join public.sys_tenant t on t.id=u.tenant_id and t.builtin_type='platform'
  join public.sys_role r on r.tenant_id=u.tenant_id and r.builtin_type='platform_super'
    and r.role_code=any(coalesce(u.user_roles,array[]::text[]))
  where u.auth_user_id is not null and u.system_protected and u.status='1'
  limit 1;
  select * into price_row from public.tms_customer_price where tenant_id=own_tenant limit 1;
  select * into carrier_row from public.tms_carrier_price where tenant_id=own_tenant limit 1;
  select id into wrong_contract from public.tms_contract
  where tenant_id=own_tenant and customer_id is distinct from price_row.customer_id limit 1;
  if super_actor is null or price_row.id is null or carrier_row.id is null or wrong_contract is null
  then raise exception 'Price agreement fixtures unavailable'; end if;
  if (select label from public.sys_dictionary
      where code='tmsPriceAgreementStatus' and value='pending' limit 1) <> '待审批'
    or (select label from public.sys_dictionary
      where code='tmsPriceAgreementStatus' and value='effective' limit 1) <> '已生效'
  then raise exception 'Agreement status dictionary labels changed'; end if;
  insert into public.mdm_customer(customer_code,customer_name,tenant_id,created_by_user_id)
  select 'CODEX-PRICE-TEST','协议价测试客户',u.tenant_id,u.id
  from public.sys_user u where u.auth_user_id=super_actor
  returning id into platform_customer;
  create_payload := to_jsonb(price_row) - array[
    'id','tenant_id','created_by_user_id','create_by','create_time','update_by','update_time'
  ];

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',super_actor::text,true);
  perform set_config('request.headers','{}',true);
  if (public.tms_list_customer_prices_secure()->>'total')::integer < 1
    or (public.tms_list_carrier_prices_secure()->>'total')::integer < 1
  then raise exception 'Platform all-tenant prices disappeared'; end if;
  if public.tms_list_price_contract_options_secure(
    'customer','6bdbb893-00da-4727-b50b-84378066620e'
  )->'records'->0->>'contract_status' <> 'draft'
    or (select count(*) from public.tms_list_price_contract_details_secure(
      'customer','55ce394c-17ff-4006-a306-1dfb73799e5b'
    )) <> 0
    or (select count(*) from public.tms_list_price_contract_details_secure(
      'customer','4c5c88e7-649d-4140-8a17-a16fda63e9cd'
    )) < 1
  then raise exception 'Contract candidate status or detail lifecycle failed'; end if;
  created_price := public.tms_create_customer_price_secure(
    create_payload || jsonb_build_object(
      'customer_id',platform_customer,'contract_id',null,
      'shipping_address_id',null,'receiving_address_id',null
    )
  );
  execute 'reset role';
  select tenant_id into created_tenant from public.tms_customer_price where id=created_price;
  if created_tenant <> '028e6a68-a9db-4055-974c-1e05bfe94b0f'::uuid
  then raise exception 'Platform all-tenant root create used wrong tenant'; end if;
  execute 'set local role authenticated';
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
  if (public.tms_list_customer_prices_secure()->>'total')::integer <> 0
    or (public.tms_list_carrier_prices_secure()->>'total')::integer <> 0
  then raise exception 'Selected tenant leaked prices'; end if;
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',own_tenant)::text,true);
  created_price := public.tms_create_customer_price_secure(create_payload);
  execute 'reset role';
  select tenant_id into created_tenant from public.tms_customer_price where id=created_price;
  if created_tenant <> own_tenant then raise exception 'Platform selected create used wrong tenant'; end if;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',ordinary_actor::text,true);
  perform set_config('request.headers','{}',true);
  if (public.tms_list_customer_prices_secure()->>'total')::integer < 1
  then raise exception 'Ordinary tenant prices disappeared'; end if;
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
  if (public.tms_list_customer_prices_secure()->>'total')::integer < 1
    or (public.tms_list_carrier_prices_secure()->>'total')::integer < 1
  then raise exception 'Forged header changed ordinary scope'; end if;
  created_price := public.tms_create_customer_price_secure(create_payload);
  execute 'reset role';
  select tenant_id into created_tenant from public.tms_customer_price where id=created_price;
  if created_tenant <> own_tenant then raise exception 'Forged header changed ordinary write tenant'; end if;
  execute 'set local role authenticated';

  perform set_config('request.jwt.claim.sub',super_actor::text,true);
  perform set_config('request.headers','{}',true);
  result := public.tms_update_customer_price_secure(price_row.id,jsonb_build_object(
    'agreement_status','effective','effective_from','2026-11-01',
    'effective_to','2026-11-30','distance_km',12.5,
    'order_config',jsonb_build_object('load_type','ftl','billing_mode','weight'),
    'cargo_items',jsonb_build_array(jsonb_build_object(
      'cargo_name','钢材','cargo_code','G-001','spec_model','Q235',
      'unit_price',120,'freight',240,'source_contract_detail_key','contract:1'
    ))
  ));
  if result->>'agreement_status' <> 'effective' or result->>'distance_km' <> '12.5'
    or result->'order_config'->>'load_type' <> 'ftl'
    or result->'cargo_items'->0->>'cargo_code' <> 'G-001'
    or result->'cargo_items'->0->>'source_contract_detail_key' <> 'contract:1'
  then raise exception 'Customer agreement fields were not saved'; end if;
  if public.tms_find_applicable_customer_price_secure(
    price_row.customer_id,price_row.origin_region,price_row.destination_region,
    price_row.transport_type,price_row.vehicle_type,price_row.billing_method,'2026-11-02'
  )->>'id' is distinct from price_row.id::text
  then raise exception 'Applicable price was not found'; end if;
  if public.tms_find_applicable_customer_price_secure(
    price_row.customer_id,price_row.origin_region,price_row.destination_region,
    price_row.transport_type,price_row.vehicle_type,price_row.billing_method,'2026-12-01'
  ) is not null then raise exception 'Expired price was applied'; end if;
  perform public.tms_update_customer_price_secure(
    price_row.id,'{"agreement_status":"pending"}'::jsonb
  );
  if public.tms_find_applicable_customer_price_secure(
    price_row.customer_id,price_row.origin_region,price_row.destination_region,
    price_row.transport_type,price_row.vehicle_type,price_row.billing_method,'2026-11-02'
  ) is not null then raise exception 'Pending price was applied'; end if;
  begin
    perform public.tms_update_customer_price_secure(
      price_row.id,jsonb_build_object('contract_id',wrong_contract)
    );
    raise exception 'Unrelated contract accepted';
  exception when others then
    if sqlerrm <> '所选合同与当前客户或租户不一致' then raise; end if;
  end;
  result := public.tms_update_carrier_price_secure(carrier_row.id,jsonb_build_object(
    'vehicle_id',null,'agreement_status','pending','distance_km',25.5,
    'order_config',jsonb_build_object('load_type','ltl')
  ));
  if result->>'agreement_status' <> 'pending' or result->>'distance_km' <> '25.5'
  then raise exception 'Carrier agreement fields were not saved'; end if;
  execute 'reset role';
  if app_private.apply_customer_price_cargo_amount_access(
    '[{"cargo_name":"测试","unit_price":123,"freight":456}]'::jsonb,'hidden'
  ) @> '[{"unit_price":123}]'::jsonb
  then raise exception 'Customer cargo quote amount leaked'; end if;
  if app_private.apply_carrier_price_cargo_cost_access(
    '[{"cargo_name":"测试","unit_price":123,"freight":456}]'::jsonb,'hidden'
  ) @> '[{"freight":456}]'::jsonb
  then raise exception 'Carrier cargo cost amount leaked'; end if;
  update public.tms_contract set is_completed=true
  where id='4c5c88e7-649d-4140-8a17-a16fda63e9cd';
  execute 'set local role authenticated';
  if (select count(*) from public.tms_list_price_contract_details_secure(
    'customer','4c5c88e7-649d-4140-8a17-a16fda63e9cd'
  )) <> 0 then raise exception 'Completed contract detail was selectable'; end if;
  execute 'reset role';
  update public.tms_contract set is_completed=false,expiry_date=current_date-1
  where id='4c5c88e7-649d-4140-8a17-a16fda63e9cd';
  execute 'set local role authenticated';
  if (select count(*) from public.tms_list_price_contract_details_secure(
    'customer','4c5c88e7-649d-4140-8a17-a16fda63e9cd'
  )) <> 0 then raise exception 'Expired contract detail was selectable'; end if;
  execute 'reset role';
end $test$;
rollback;
