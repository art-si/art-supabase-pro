-- Price cargo JSON accepts canonical keys and protects every amount at the RPC boundary.
begin;
do $test$
declare
  ordinary_actor uuid := '5774aa51-3bbb-4da5-abd4-7ea44b44ea6a';
  actor_user_id uuid := '51080ef5-46a4-4d0c-a229-c97c6fccda93';
  own_tenant uuid := '7529f951-938e-4e2c-ac0d-316c136ae1f9';
  v_level text;
  amount_key text;
  customer_record jsonb;
  carrier_record jsonb;
  customer_item jsonb;
  carrier_item jsonb;
begin
  update public.tms_customer_price set cargo_items = '[{
    "cargo_name":"测试货物","remark":"保持普通备注",
    "unit_price":123,"freight":456,"transport_unit_price":789
  }]'::jsonb where id='00a87239-685d-45f2-9e80-aabe6c4ff43a';
  update public.tms_carrier_price set cargo_items = '[{
    "cargo_name":"测试货物","order_no":"DD-001","remark":"保持普通备注",
    "split_transport_fee":11,"loading_fee":12,"package_fee":13,
    "unit_price":14,"freight":15,"transport_unit_price":16
  }]'::jsonb where id='2d0e645d-4443-479a-879b-4020baa81611';

  begin
    update public.tms_customer_price
    set cargo_items='[{"cargo_name":"测试货物","unitPrice":999}]'::jsonb
    where id='00a87239-685d-45f2-9e80-aabe6c4ff43a';
    raise exception 'Customer camelCase amount accepted';
  exception when others then
    if sqlerrm not like '货物明细包含不支持字段%' then raise; end if;
  end;
  begin
    update public.tms_carrier_price
    set cargo_items='[{"cargo_name":"测试货物","splitTransportFee":999}]'::jsonb
    where id='2d0e645d-4443-479a-879b-4020baa81611';
    raise exception 'Carrier camelCase amount accepted';
  exception when others then
    if sqlerrm not like '货物明细包含不支持字段%' then raise; end if;
  end;

  insert into public.sys_user_field_permission(
    tenant_id,user_id,resource_id,field_id,access_level,create_by
  ) values
  (own_tenant,actor_user_id,'6434182f-7aa0-4afa-bf53-1f8f2ed32395',
    '0418f74b-1b0e-493e-9ded-ab2ad443941f','hidden','624944977@qq.com'),
  (own_tenant,actor_user_id,'64abefe4-dceb-4164-a7cf-066b264eef64',
    '6ff019de-5863-4b72-89a6-42607a399a7c','hidden','624944977@qq.com');

  foreach v_level in array array['hidden','masked','read','edit'] loop
    update public.sys_user_field_permission set access_level=v_level
    where tenant_id=own_tenant and user_id=actor_user_id
      and field_id in (
        '0418f74b-1b0e-493e-9ded-ab2ad443941f'::uuid,
        '6ff019de-5863-4b72-89a6-42607a399a7c'::uuid
      );
    execute 'set local role authenticated';
    perform set_config('request.jwt.claim.sub',ordinary_actor::text,true);
    customer_record := public.tms_get_customer_price_secure(
      '00a87239-685d-45f2-9e80-aabe6c4ff43a'
    );
    carrier_record := public.tms_get_carrier_price_secure(
      '2d0e645d-4443-479a-879b-4020baa81611'
    );
    execute 'reset role';
    customer_item := customer_record->'cargo_items'->0;
    carrier_item := carrier_record->'cargo_items'->0;
    if customer_item->>'remark' <> '保持普通备注'
      or carrier_item->>'remark' <> '保持普通备注'
      or carrier_item->>'order_no' <> 'DD-001'
    then raise exception 'Ordinary cargo fields were over-redacted at %',v_level; end if;
    foreach amount_key in array array['unit_price','freight','transport_unit_price'] loop
      if v_level='hidden' and customer_item ? amount_key
        or v_level='masked' and customer_item->>amount_key is distinct from '***'
        or v_level in ('read','edit')
          and jsonb_typeof(customer_item->amount_key) is distinct from 'number'
      then raise exception 'Customer cargo amount access failed: % %',v_level,amount_key; end if;
    end loop;
    foreach amount_key in array array[
      'split_transport_fee','loading_fee','package_fee',
      'unit_price','freight','transport_unit_price'
    ] loop
      if v_level='hidden' and carrier_item ? amount_key
        or v_level='masked' and carrier_item->>amount_key is distinct from '***'
        or v_level in ('read','edit')
          and jsonb_typeof(carrier_item->amount_key) is distinct from 'number'
      then raise exception 'Carrier cargo amount access failed: % %',v_level,amount_key; end if;
    end loop;
  end loop;

  if app_private.apply_customer_price_cargo_amount_access(
    '[{"unitPrice":123,"transportUnitPrice":456}]'::jsonb,'hidden'
  ) <> '[{}]'::jsonb
    or app_private.apply_carrier_price_cargo_cost_access(
      '[{"splitTransportFee":11,"loadingFee":12,"packageFee":13,"unitPrice":14}]'::jsonb,
      'hidden'
    ) <> '[{}]'::jsonb
  then raise exception 'Legacy camelCase amount fallback leaked'; end if;
end $test$;
rollback;
