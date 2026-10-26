BEGIN;

DO $test$
DECLARE
  first_contract uuid := '4c5c88e7-649d-4140-8a17-a16fda63e9cd';
  second_contract uuid := 'f9feeace-a487-4163-b597-9c25b5e5c645';
  first_order uuid := 'fed5edd1-0cd1-4197-ace2-f8a4cab1e8b1';
  second_order uuid := 'a9fc0005-1023-4620-9220-000000000006';
  first_customer uuid := 'd87b381a-658c-49b4-b5bd-d893c518ef2e';
  second_customer uuid := 'a9fc0001-1023-4620-9220-000000000002';
BEGIN
  IF to_regprocedure('public.tms_create_order_with_contract_secure(jsonb,uuid)') IS NULL
    OR to_regprocedure('public.tms_update_order_with_contract_secure(uuid,jsonb,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Order contract write API is missing';
  END IF;
  IF has_function_privilege('anon', 'public.tms_create_order_with_contract_secure(jsonb,uuid)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.tms_list_order_contract_candidates(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous role can use order contract APIs';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN (
      'tms_create_order_with_contract_secure', 'tms_update_order_with_contract_secure',
      'tms_list_order_contract_candidates', 'tms_list_order_contract_details',
      'tms_get_order_contract_summary', 'get_tms_contract_delete_dependencies_secure'
    ) AND has_function_privilege('anon', p.oid, 'EXECUTE')
  ) THEN RAISE EXCEPTION 'Anonymous role can execute a contract API'; END IF;

  -- Two approved customer-party contracts already exist; no workflow state is fabricated.
  IF NOT EXISTS (SELECT 1 FROM public.tms_order WHERE id = first_order AND shipping_customer_id = first_customer)
    OR NOT EXISTS (SELECT 1 FROM public.tms_order WHERE id = second_order AND shipping_customer_id = second_customer) THEN
    RAISE EXCEPTION 'QA order fixtures have changed';
  END IF;

  UPDATE public.tms_order SET contract_id = first_contract WHERE id = first_order;
  IF (SELECT contract_id FROM public.tms_order WHERE id = first_order) <> first_contract
    OR (SELECT contract_id FROM public.tms_order WHERE id = second_order) IS NOT NULL THEN
    RAISE EXCEPTION 'Linked and unlinked orders were not preserved';
  END IF;
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', 'ab881b32-87d4-4dce-9014-ce488b8069df', 'role', 'authenticated'
  )::text, true);
  PERFORM set_config('request.headers', '{}'::text, true);
  IF NOT EXISTS (
    SELECT 1 FROM public.get_tms_contract_delete_dependencies_secure(ARRAY[first_contract::text], null) d
    WHERE d.target_id = first_order::text AND d.record_no = 'YD202609-001'
      AND d.record_status IS NOT NULL
  ) THEN RAISE EXCEPTION 'Contract delete guard lost order number or status'; END IF;

  BEGIN
    UPDATE public.tms_order SET contract_id = second_contract WHERE id = second_order;
    RAISE EXCEPTION 'Cross-customer link was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.tms_order SET contract_id = '55ce394c-17ff-4006-a306-1dfb73799e5b'
    WHERE id = first_order;
    RAISE EXCEPTION 'Cross-tenant link was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.tms_order SET cargo_items = jsonb_build_array(jsonb_build_object(
      'cargo_name', '混用合同测试货物', 'source_contract_id', second_contract::text
    )) WHERE id = first_order;
    RAISE EXCEPTION 'Mixed-contract cargo was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    DELETE FROM public.tms_contract WHERE id = first_contract;
    RAISE EXCEPTION 'Referenced contract was deleted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  UPDATE public.tms_contract SET expiry_date = current_date - 1 WHERE id = first_contract;
  IF NOT EXISTS (SELECT 1 FROM public.tms_order WHERE id = first_order AND contract_id = first_contract) THEN
    RAISE EXCEPTION 'Historical link disappeared after expiry';
  END IF;
  UPDATE public.tms_contract SET expiry_date = '2027-08-02' WHERE id = first_contract;
END;
$test$;

DO $tenant_scope$
DECLARE
  target_customer uuid := 'd87b381a-658c-49b4-b5bd-d893c518ef2e';
  selected_tenant uuid := '7529f951-938e-4e2c-ac0d-316c136ae1f9';
  other_tenant uuid := '2824c2b5-2774-4781-b995-f55e8bcee920';
  all_count integer;
  own_count integer;
BEGIN
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', '0a872664-874c-447d-a256-d0dbdca6ed45', 'role', 'authenticated'
  )::text, true);
  PERFORM set_config('request.headers', '{}'::text, true);
  SELECT count(*) INTO all_count FROM public.tms_list_order_contract_candidates(target_customer, null);
  IF all_count < 2 THEN RAISE EXCEPTION 'Platform-all candidate list lost valid contracts'; END IF;
  PERFORM set_config('request.headers', jsonb_build_object('x-art-tenant-scope', other_tenant)::text, true);
  IF EXISTS (SELECT 1 FROM public.tms_list_order_contract_candidates(target_customer, null)) THEN
    RAISE EXCEPTION 'Platform selected-tenant candidate scope leaked';
  END IF;
  PERFORM set_config('request.headers', jsonb_build_object('x-art-tenant-scope', selected_tenant)::text, true);
  IF (SELECT count(*) FROM public.tms_list_order_contract_candidates(target_customer, null)) < 2 THEN
    RAISE EXCEPTION 'Platform selected-tenant candidates missing';
  END IF;

  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', 'ab881b32-87d4-4dce-9014-ce488b8069df', 'role', 'authenticated'
  )::text, true);
  PERFORM set_config('request.headers', '{}'::text, true);
  SELECT count(*) INTO own_count FROM public.tms_list_order_contract_candidates(target_customer, null);
  IF own_count < 2 THEN RAISE EXCEPTION 'Ordinary user cannot see own eligible contracts'; END IF;
  PERFORM set_config('request.headers', jsonb_build_object('x-art-tenant-scope', other_tenant)::text, true);
  IF (SELECT count(*) FROM public.tms_list_order_contract_candidates(target_customer, null)) <> own_count THEN
    RAISE EXCEPTION 'Ordinary forged header changed contract scope';
  END IF;
END;
$tenant_scope$;

DO $write_flow$
DECLARE
  created jsonb;
  order_id uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', 'ab881b32-87d4-4dce-9014-ce488b8069df', 'role', 'authenticated'
  )::text, true);
  PERFORM set_config('request.headers', '{}'::text, true);
  created := public.tms_create_order_with_contract_secure(jsonb_build_object(
    'order_no', 'QA_CONTRACT_RPC_ROLLBACK_20261026', 'order_status', 'pending_load',
    'origin_station', '上海站', 'destination_station', '苏州站', 'delivery_method', 'door',
    'shipping_customer_id', 'd87b381a-658c-49b4-b5bd-d893c518ef2e',
    'shipping_contact_name', '验收发货人', 'shipping_contact_phone', '13800000000',
    'shipping_address_detail', '上海', 'receiving_contact_name', '验收收货人',
    'receiving_contact_phone', '13900000000', 'receiving_address_detail', '苏州',
    'payment_method', 'monthly', 'cargo_items', '[]'::jsonb,
    'order_config', jsonb_build_object(
      'load_type', 'ltl', 'billing_mode', 'quantity', 'billing_unit', 'piece',
      'cargo_category', 'general', 'packaging', 'bulk',
      'transport_requirements', '[]'::jsonb, 'attachment_urls', '[]'::jsonb
    )
  ), '4c5c88e7-649d-4140-8a17-a16fda63e9cd');
  order_id := (created->>'id')::uuid;
  IF order_id IS NULL OR (SELECT contract_id FROM public.tms_order WHERE id = order_id)
    <> '4c5c88e7-649d-4140-8a17-a16fda63e9cd'::uuid THEN
    RAISE EXCEPTION 'Create wrapper lost the selected contract';
  END IF;
  PERFORM public.tms_update_order_with_contract_secure(order_id,
    jsonb_build_object('order_remark', '验收修改'), 'f9feeace-a487-4163-b597-9c25b5e5c645');
  IF (SELECT contract_id FROM public.tms_order WHERE id = order_id)
    <> 'f9feeace-a487-4163-b597-9c25b5e5c645'::uuid THEN
    RAISE EXCEPTION 'Update wrapper did not change contracts';
  END IF;
  PERFORM public.tms_update_order_with_contract_secure(order_id,
    jsonb_build_object('order_remark', '验收移除'), NULL);
  IF (SELECT contract_id FROM public.tms_order WHERE id = order_id) IS NOT NULL THEN
    RAISE EXCEPTION 'Update wrapper did not remove the contract';
  END IF;
END;
$write_flow$;

ROLLBACK;
