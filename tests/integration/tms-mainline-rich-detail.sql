BEGIN;

DO $test$
DECLARE
  platform_user uuid;
  ordinary_user uuid;
  own_tenant uuid;
  target_order uuid;
  target_waybill uuid;
  target_tenant uuid;
  other_tenant uuid;
  expected_quantity numeric;
  expected_freight numeric;
  result jsonb;
  row_data jsonb;
  selected_result jsonb;
  own_result jsonb;
  forged_result jsonb;
  access_level text;
BEGIN
  IF has_function_privilege(
    'anon',
    'public.tms_list_transport_mainline_relations_secure(uuid[],uuid,uuid,integer,integer)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Anonymous user can read rich transport details';
  END IF;

  SELECT auth_user_id INTO platform_user
  FROM public.sys_user
  WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL
  LIMIT 1;

  SELECT auth_user_id, tenant_id INTO ordinary_user, own_tenant
  FROM public.sys_user
  WHERE auth_user_id = 'ab881b32-87d4-4dce-9014-ce488b8069df';

  SELECT a.order_id, a.waybill_id, a.tenant_id, a.quantity, a.freight_amount
  INTO target_order, target_waybill, target_tenant, expected_quantity, expected_freight
  FROM public.tms_waybill_order_allocation a
  JOIN public.tms_order o ON o.id = a.order_id AND o.tenant_id = a.tenant_id
  JOIN public.tms_waybill w ON w.id = a.waybill_id AND w.tenant_id = a.tenant_id
  ORDER BY a.create_time DESC
  LIMIT 1;

  SELECT id INTO other_tenant
  FROM public.sys_tenant
  WHERE id <> target_tenant AND status = '1'
  LIMIT 1;

  IF platform_user IS NULL OR ordinary_user IS NULL OR target_order IS NULL
     OR other_tenant IS NULL THEN
    RAISE EXCEPTION 'Rich mainline test actors unavailable';
  END IF;

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', platform_user, 'role', 'authenticated')::text,
    true
  );
  PERFORM set_config('request.headers', '{}', true);
  result := public.tms_list_transport_mainline_relations_secure(
    ARRAY[target_order], NULL, NULL, 0, 99
  );
  SELECT value INTO row_data
  FROM jsonb_array_elements(result->'records') value
  WHERE value->>'waybillId' = target_waybill::text
  LIMIT 1;
  IF row_data IS NULL OR row_data->>'orderId' <> target_order::text
     OR NOT (row_data ? 'shippingAddress')
     OR NOT (row_data ? 'receivingAddress')
     OR NOT (row_data ? 'orderCreatedAt')
     OR NOT (row_data ? 'arrivedAt')
     OR NOT (row_data ? 'signedAt')
     OR NOT (row_data ? 'receiptAt') THEN
    RAISE EXCEPTION 'Rich execution fields are missing';
  END IF;
  IF (row_data->>'cargoQuantity')::numeric IS DISTINCT FROM expected_quantity THEN
    RAISE EXCEPTION 'Cargo quantity must come from this order allocation';
  END IF;

  SELECT app_private.field_access_map('tms.waybill', o.created_by_user_id)
    ->>'freightAmounts' INTO access_level
  FROM public.tms_order o
  WHERE o.id = target_order;
  IF access_level IN ('read', 'edit')
     AND (row_data->>'relationFreightAmount')::numeric
         IS DISTINCT FROM expected_freight THEN
    RAISE EXCEPTION 'Freight amount must come from this order allocation';
  END IF;
  IF access_level = 'hidden' AND row_data ? 'relationFreightAmount' THEN
    RAISE EXCEPTION 'Hidden freight amount leaked';
  END IF;

  PERFORM set_config(
    'request.headers',
    jsonb_build_object('x-art-tenant-scope', target_tenant)::text,
    true
  );
  selected_result := public.tms_list_transport_mainline_relations_secure(
    ARRAY[target_order], NULL, NULL, 0, 99
  );
  IF selected_result IS DISTINCT FROM result THEN
    RAISE EXCEPTION 'Selected tenant changed its own rich relation';
  END IF;
  PERFORM set_config(
    'request.headers',
    jsonb_build_object('x-art-tenant-scope', other_tenant)::text,
    true
  );
  IF (public.tms_list_transport_mainline_relations_secure(
    ARRAY[target_order], NULL, NULL, 0, 99
  )->>'total')::integer <> 0 THEN
    RAISE EXCEPTION 'Selected tenant leaked another tenant rich relation';
  END IF;

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', ordinary_user, 'role', 'authenticated')::text,
    true
  );
  PERFORM set_config('request.headers', '{}', true);
  own_result := public.tms_list_transport_mainline_relations_secure(
    NULL, NULL, NULL, 0, 99
  );
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(own_result->'records') value
    WHERE value->>'tenantId' <> own_tenant::text
  ) THEN
    RAISE EXCEPTION 'Ordinary user saw foreign rich details';
  END IF;
  PERFORM set_config(
    'request.headers',
    jsonb_build_object('x-art-tenant-scope', other_tenant)::text,
    true
  );
  forged_result := public.tms_list_transport_mainline_relations_secure(
    NULL, NULL, NULL, 0, 99
  );
  IF forged_result IS DISTINCT FROM own_result THEN
    RAISE EXCEPTION 'Forged tenant scope changed ordinary rich details';
  END IF;
END;
$test$;

DO $restricted$
DECLARE
  platform_auth uuid;
  vehicle_only_auth uuid;
  vehicle_only_user uuid;
  vehicle_only_tenant uuid;
  probe_order uuid;
  probe_record jsonb;
BEGIN
  SELECT auth_user_id, id, tenant_id
  INTO vehicle_only_auth, vehicle_only_user, vehicle_only_tenant
  FROM public.sys_user
  WHERE auth_user_id = '8e111e7a-6636-4ecd-a2db-40a988f63167';
  IF vehicle_only_auth IS NULL THEN
    RAISE EXCEPTION 'Vehicle-only rich-field test actor unavailable';
  END IF;

  SELECT auth_user_id INTO platform_auth
  FROM public.sys_user
  WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL
  LIMIT 1;
  IF platform_auth IS NULL THEN
    RAISE EXCEPTION 'Platform rich-field test actor unavailable';
  END IF;

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', platform_auth, 'role', 'authenticated')::text,
    true
  );
  PERFORM set_config(
    'request.headers',
    jsonb_build_object('x-art-tenant-scope', vehicle_only_tenant)::text,
    true
  );

  INSERT INTO public.tms_order (
    tenant_id, order_no, origin_station, destination_station, delivery_method,
    shipping_contact_name, shipping_contact_phone, shipping_address_detail,
    receiving_contact_name, receiving_contact_phone, receiving_address_detail,
    payment_method, created_by_user_id
  ) VALUES (
    vehicle_only_tenant, 'QA-RICH-SCOPE-' || substr(gen_random_uuid()::text, 1, 8),
    '测试始发站', '测试到达站', 'door',
    '测试发货人', '13000000000', '测试发货地址',
    '测试收货人', '13000000001', '测试收货地址',
    'cash', vehicle_only_user
  ) RETURNING id INTO probe_order;

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', vehicle_only_auth, 'role', 'authenticated')::text,
    true
  );
  PERFORM set_config('request.headers', '{}', true);
  probe_record := public.tms_list_transport_mainline_relations_secure(
    ARRAY[probe_order], NULL, NULL, 0, 9
  )->'records'->0;
  IF probe_record IS NULL
     OR probe_record->>'detailsAvailable' IS DISTINCT FROM 'false'
     OR probe_record ? 'shippingAddress'
     OR probe_record ? 'orderCreatedAt'
     OR probe_record ? 'orderTotalFee' THEN
    RAISE EXCEPTION 'Vehicle-only role saw rich order fields';
  END IF;
END;
$restricted$;

ROLLBACK;
