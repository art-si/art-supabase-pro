BEGIN;

DO $test$
<<fuel_test>>
DECLARE
  platform_user uuid;
  ordinary_user uuid;
  no_role_user uuid;
  own_tenant uuid := '7529f951-938e-4e2c-ac0d-316c136ae1f9';
  qa_tenant uuid := '2824c2b5-2774-4781-b995-f55e8bcee920';
  approved_vehicle uuid;
  pending_vehicle uuid;
  card_id uuid;
  recharge_id uuid;
  record_id uuid;
  result jsonb;
  rejected boolean;
BEGIN
  IF to_regclass('public.vms_fuel_card') IS NULL
     OR to_regclass('public.vms_fuel_card_entry') IS NULL
     OR to_regprocedure('public.vms_create_fuel_card(text,uuid,text,text,numeric)') IS NULL
     OR to_regprocedure('public.vms_record_fuel_card_transaction(uuid,text,numeric,date,text,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Fuel-card schema or RPC is missing';
  END IF;
  IF has_table_privilege('anon', 'public.vms_fuel_card', 'SELECT')
     OR has_table_privilege('authenticated', 'public.vms_fuel_card_entry', 'INSERT')
     OR has_table_privilege('authenticated', 'public.vms_fuel_card_entry', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.vms_fuel_card_entry', 'DELETE')
     OR has_function_privilege('anon', 'public.vms_create_fuel_card(text,uuid,text,text,numeric)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Fuel-card table or RPC privilege is too broad';
  END IF;

  SELECT auth_user_id INTO platform_user
  FROM public.sys_user WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1;
  SELECT auth_user_id INTO ordinary_user
  FROM public.sys_user WHERE auth_user_id = 'ab881b32-87d4-4dce-9014-ce488b8069df';
  SELECT auth_user_id INTO no_role_user FROM public.sys_user
  WHERE tenant_id = own_tenant AND auth_user_id IS NOT NULL
    AND coalesce(array_length(user_roles, 1), 0) = 0 LIMIT 1;
  SELECT id INTO approved_vehicle FROM public.mdm_vehicle
  WHERE tenant_id = own_tenant AND audit_status = 'approved' LIMIT 1;
  SELECT id INTO pending_vehicle FROM public.mdm_vehicle
  WHERE tenant_id = qa_tenant AND audit_status <> 'approved' LIMIT 1;
  IF platform_user IS NULL OR ordinary_user IS NULL OR no_role_user IS NULL
     OR approved_vehicle IS NULL OR pending_vehicle IS NULL THEN
    RAISE EXCEPTION 'Fuel-card actors or vehicles are unavailable';
  END IF;

  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', platform_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', '{}', true);
  rejected := false;
  BEGIN
    PERFORM public.vms_create_fuel_card('QA-FUEL-PENDING', pending_vehicle);
  EXCEPTION WHEN check_violation THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Pending vehicle was accepted'; END IF;

  card_id := public.vms_create_fuel_card('QA-FUEL-ROLLBACK', approved_vehicle, 'QA', 'Rollback only', 100);
  IF NOT EXISTS (
    SELECT 1 FROM public.get_governed_delete_dependency_details('vehicle', ARRAY[approved_vehicle]) dependency
    WHERE dependency.dependency_code = 'vehicle_fuel_card'
      AND dependency.record_id = card_id
      AND dependency.record_no = 'QA-FUEL-ROLLBACK'
      AND dependency.cleanup_allowed IS FALSE
  ) THEN
    RAISE EXCEPTION 'Vehicle delete guard omitted the linked fuel card';
  END IF;
  rejected := false;
  BEGIN
    PERFORM public.vms_create_fuel_card('qa-fuel-rollback', approved_vehicle);
  EXCEPTION WHEN unique_violation THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Case-variant duplicate card number was accepted'; END IF;
  IF (SELECT count(*) FROM public.vms_fuel_card_entry e WHERE e.card_id = fuel_test.card_id AND e.entry_type = 'opening') <> 1 THEN
    RAISE EXCEPTION 'Opening balance entry is missing';
  END IF;
  recharge_id := public.vms_record_fuel_card_transaction(card_id, 'recharge', 50, CURRENT_DATE, 'QA-R1');
  record_id := public.vms_record_fuel_card_transaction(card_id, 'consume', 25, CURRENT_DATE, 'QA-C1');
  result := public.vms_list_fuel_cards_secure(p_ids := ARRAY[card_id]);
  IF (result->'records'->0->>'balance')::numeric <> 125 THEN
    RAISE EXCEPTION 'Card balance differs from signed entries';
  END IF;
  rejected := false;
  BEGIN
    PERFORM public.vms_record_fuel_card_transaction(card_id, 'consume', 126, CURRENT_DATE);
  EXCEPTION WHEN check_violation THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Negative balance was accepted'; END IF;
  PERFORM public.vms_record_fuel_card_transaction(card_id, 'reversal', 25, CURRENT_DATE, 'QA-V1', '', record_id);
  IF (public.vms_list_fuel_card_entries_secure(p_ids := ARRAY[record_id])->'records'->0->>'isReversed')::boolean IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Reversed original entry did not expose isReversed';
  END IF;
  rejected := false;
  BEGIN
    PERFORM public.vms_record_fuel_card_transaction(card_id, 'reversal', 25, CURRENT_DATE, 'QA-V2', '', record_id);
  EXCEPTION WHEN unique_violation THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Duplicate reversal was accepted'; END IF;
  PERFORM public.vms_set_fuel_card_status(card_id, 'disabled');
  rejected := false;
  BEGIN
    PERFORM public.vms_record_fuel_card_transaction(card_id, 'recharge', 1, CURRENT_DATE);
  EXCEPTION WHEN check_violation THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Disabled card accepted a transaction'; END IF;
  PERFORM public.vms_set_fuel_card_status(card_id, 'active');

  PERFORM set_config('request.headers', jsonb_build_object('x-art-tenant-scope', qa_tenant)::text, true);
  IF (public.vms_list_fuel_cards_secure(p_ids := ARRAY[card_id])->>'total')::int <> 0
     OR (public.vms_list_fuel_card_entries_secure(p_card_id := card_id)->>'total')::int <> 0 THEN
    RAISE EXCEPTION 'Platform selected-tenant read leaked';
  END IF;
  rejected := false;
  BEGIN
    PERFORM public.vms_record_fuel_card_transaction(card_id, 'consume', 1, CURRENT_DATE);
  EXCEPTION WHEN insufficient_privilege THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Platform selected-tenant write escaped'; END IF;

  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', ordinary_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', '{}', true);
  IF (public.vms_list_fuel_cards_secure(p_ids := ARRAY[card_id])->>'total')::int <> 1 THEN
    RAISE EXCEPTION 'Ordinary user cannot read own-tenant card';
  END IF;
  PERFORM set_config('request.headers', jsonb_build_object('x-art-tenant-scope', qa_tenant)::text, true);
  IF (public.vms_list_fuel_cards_secure(p_ids := ARRAY[card_id])->>'total')::int <> 1 THEN
    RAISE EXCEPTION 'Forged header changed ordinary read scope';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.get_governed_delete_dependency_details('vehicle', ARRAY[approved_vehicle]) dependency
    WHERE dependency.dependency_code = 'vehicle_fuel_card' AND dependency.record_id = card_id
  ) THEN
    RAISE EXCEPTION 'Forged header hid the vehicle fuel-card deletion blocker';
  END IF;
  PERFORM public.vms_record_fuel_card_transaction(card_id, 'consume', 1, CURRENT_DATE, 'QA-C2');
  IF (public.vms_list_fuel_card_entries_secure(p_card_id := card_id)->>'total')::int <> 5 THEN
    RAISE EXCEPTION 'Ordinary own-tenant ledger entries are missing';
  END IF;

  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', no_role_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', '{}', true);
  rejected := false;
  BEGIN
    PERFORM public.vms_list_fuel_cards_secure();
  EXCEPTION WHEN insufficient_privilege THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'User without button permission read fuel cards'; END IF;
  rejected := false;
  BEGIN
    PERFORM public.vms_list_fuel_card_entries_secure();
  EXCEPTION WHEN insufficient_privilege THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'User without button permission read fuel-card entries'; END IF;
END;
$test$;

ROLLBACK;

BEGIN;

DO $scope$
DECLARE
  platform_auth uuid := '0a872664-874c-447d-a256-d0dbdca6ed45';
  ordinary_auth uuid := 'ab881b32-87d4-4dce-9014-ce488b8069df';
  own_tenant uuid := '7529f951-938e-4e2c-ac0d-316c136ae1f9';
  qa_tenant uuid := '2824c2b5-2774-4781-b995-f55e8bcee920';
  qa_creator uuid;
  own_creator uuid;
  qa_vehicle uuid;
  selected_vehicle uuid;
  ordinary_vehicle uuid;
  rejected boolean;
BEGIN
  SELECT id INTO qa_creator FROM public.sys_user WHERE tenant_id = qa_tenant LIMIT 1;
  SELECT id INTO own_creator FROM public.sys_user WHERE auth_user_id = ordinary_auth;
  IF qa_creator IS NULL OR own_creator IS NULL THEN RAISE EXCEPTION 'Vehicle creator test actors unavailable'; END IF;

  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', platform_auth, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', '{}', true);
  INSERT INTO public.mdm_vehicle(tenant_id, plate_no, vehicle_type, created_by_user_id, create_by)
  VALUES (qa_tenant, 'QA-DELETION-TEMP-1', '厢式货车', qa_creator, 'fuel-card-test') RETURNING id INTO qa_vehicle;
  INSERT INTO public.mdm_vehicle(tenant_id, plate_no, vehicle_type, created_by_user_id, create_by)
  VALUES (own_tenant, 'QA-DELETION-TEMP-2', '10', own_creator, 'fuel-card-test') RETURNING id INTO selected_vehicle;
  INSERT INTO public.mdm_vehicle(tenant_id, plate_no, vehicle_type, created_by_user_id, create_by)
  VALUES (own_tenant, 'QA-DELETION-TEMP-3', '10', own_creator, 'fuel-card-test') RETURNING id INTO ordinary_vehicle;

  PERFORM set_config('request.headers', jsonb_build_object('x-art-tenant-scope', own_tenant)::text, true);
  rejected := false;
  BEGIN
    PERFORM public.vms_delete_vehicle_archives_secure(ARRAY[qa_vehicle]);
  EXCEPTION WHEN raise_exception THEN rejected := true;
  END;
  IF NOT rejected OR NOT EXISTS (SELECT 1 FROM public.mdm_vehicle WHERE id = qa_vehicle) THEN
    RAISE EXCEPTION 'Platform selected tenant deleted an outside vehicle';
  END IF;
  IF public.vms_delete_vehicle_archives_secure(ARRAY[selected_vehicle]) <> 1 THEN
    RAISE EXCEPTION 'Platform selected tenant could not delete its in-scope vehicle';
  END IF;

  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', ordinary_auth, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', jsonb_build_object('x-art-tenant-scope', qa_tenant)::text, true);
  rejected := false;
  BEGIN
    PERFORM public.vms_delete_vehicle_archives_secure(ARRAY[qa_vehicle]);
  EXCEPTION WHEN raise_exception THEN rejected := true;
  END;
  IF NOT rejected OR NOT EXISTS (SELECT 1 FROM public.mdm_vehicle WHERE id = qa_vehicle) THEN
    RAISE EXCEPTION 'Ordinary forged tenant scope deleted an outside vehicle';
  END IF;
  IF public.vms_delete_vehicle_archives_secure(ARRAY[ordinary_vehicle]) <> 1 THEN
    RAISE EXCEPTION 'Ordinary own-tenant delete failed under forged header';
  END IF;

  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', platform_auth, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', '{}', true);
  IF public.vms_delete_vehicle_archives_secure(ARRAY[qa_vehicle]) <> 1 THEN
    RAISE EXCEPTION 'Platform all-tenant existing-row delete failed';
  END IF;
END;
$scope$;

ROLLBACK;
