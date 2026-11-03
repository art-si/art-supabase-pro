-- Fund-account options: real authenticated actors and real account rows.
-- Read-only assertions. Caller may wrap this file in its own BEGIN/ROLLBACK preview.
-- No production helper, permission, RLS, or business row is stubbed or changed.
DO $fund_account_option_scope$
DECLARE
  super_actor uuid;
  ordinary_actor uuid;
  own_tenant uuid;
  other_tenant uuid;
  own_account uuid;
  other_account uuid;
  own_account_set uuid;
  other_account_set uuid;
  raw_options jsonb;
  raw_row jsonb;
  result jsonb;
  ordinary_result jsonb;
  row_value jsonb;
  scope_case text;
  actor uuid;
  expected_tenant uuid;
  expected_ids text[];
  actual_ids text[];
  details_level text;
  balances_level text;
  masked_amount_checks integer := 0;
BEGIN
  IF has_function_privilege(
    'anon', 'public.fms_list_fund_account_options_secure(uuid,text,boolean)', 'EXECUTE'
  ) OR NOT has_function_privilege(
    'authenticated', 'public.fms_list_fund_account_options_secure(uuid,text,boolean)', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION '[fms-account-options] Function ACL changed';
  END IF;

  -- Prefetch raw comparison data with the caller's owner privileges. All RPC
  -- behavior below is exercised as real authenticated users.
  SELECT coalesce(jsonb_agg(to_jsonb(account_sample)
    ORDER BY account_sample.is_default DESC, account_sample.account_code, account_sample.id), '[]'::jsonb)
  INTO raw_options
  FROM (
    SELECT a.id, a.tenant_id, a.account_set_id, a.created_by_user_id,
      a.account_code, a.account_no_masked, a.status, a.is_default,
      s.available_balance, c.currency_code, z.base_currency_code
    FROM public.fms_fund_account a
    JOIN public.fms_fund_account_summary s ON s.id = a.id AND s.tenant_id = a.tenant_id
    JOIN public.fms_currency c ON c.id = a.currency_id AND c.account_set_id = a.account_set_id
    JOIN public.fms_account_set z ON z.id = a.account_set_id AND z.tenant_id = a.tenant_id
    WHERE a.status = 'active'
    ORDER BY a.is_default DESC, a.account_code, a.id
  ) account_sample;
  IF jsonb_array_length(raw_options) < 2 OR (
    SELECT count(DISTINCT option_row.value->>'tenant_id')
    FROM jsonb_array_elements(raw_options) WITH ORDINALITY option_row(value, position)
    WHERE option_row.position <= 1000
  ) < 2 THEN
    RAISE EXCEPTION '[fms-account-options] Real active accounts in two tenants are required';
  END IF;

  SELECT u.auth_user_id INTO super_actor
  FROM public.sys_user u
  JOIN public.sys_tenant t ON t.id = u.tenant_id
  JOIN auth.users auth_user ON auth_user.id = u.auth_user_id
  WHERE t.builtin_type = 'platform' AND u.system_protected IS TRUE
    AND u.status = '1' AND u.deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.sys_role role_row
      WHERE role_row.tenant_id = u.tenant_id AND role_row.builtin_type = 'platform_super'
        AND role_row.role_code = ANY(coalesce(u.user_roles, ARRAY[]::text[]))
        AND role_row.enabled IS TRUE
    )
  ORDER BY u.id LIMIT 1;

  SELECT u.auth_user_id, u.tenant_id INTO ordinary_actor, own_tenant
  FROM public.sys_user u
  JOIN public.sys_tenant t ON t.id = u.tenant_id
  JOIN auth.users auth_user ON auth_user.id = u.auth_user_id
  WHERE t.builtin_type IS DISTINCT FROM 'platform'
    AND t.status = '1' AND u.status = '1' AND u.deleted_at IS NULL
    AND (t.service_start_date IS NULL OR t.service_start_date <= current_date)
    AND (t.service_end_date IS NULL OR t.service_end_date >= current_date)
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(raw_options)
        WITH ORDINALITY option_row(value, position)
      WHERE option_row.position <= 1000
        AND (option_row.value->>'tenant_id')::uuid = u.tenant_id
    )
  ORDER BY u.id LIMIT 1;
  IF super_actor IS NULL OR ordinary_actor IS NULL THEN
    RAISE EXCEPTION '[fms-account-options] Real platform and ordinary actors are required';
  END IF;

  SELECT (value->>'id')::uuid, (value->>'account_set_id')::uuid
  INTO own_account, own_account_set
  FROM jsonb_array_elements(raw_options) WITH ORDINALITY option_row(value, position)
  WHERE option_row.position <= 1000
    AND (value->>'tenant_id')::uuid = own_tenant LIMIT 1;
  SELECT (value->>'id')::uuid, (value->>'tenant_id')::uuid,
    (value->>'account_set_id')::uuid
  INTO other_account, other_tenant, other_account_set
  FROM jsonb_array_elements(raw_options) WITH ORDINALITY option_row(value, position)
  WHERE option_row.position <= 1000
    AND (value->>'tenant_id')::uuid <> own_tenant LIMIT 1;
  IF own_account IS NULL OR other_account IS NULL THEN
    RAISE EXCEPTION '[fms-account-options] Real own and foreign account samples are required';
  END IF;

  EXECUTE 'SET LOCAL ROLE authenticated';
  FOR scope_case IN SELECT unnest(ARRAY[
    'platform_all', 'platform_selected', 'ordinary_own', 'ordinary_forged'
  ]) LOOP
    actor := CASE WHEN scope_case LIKE 'platform_%' THEN super_actor ELSE ordinary_actor END;
    expected_tenant := CASE WHEN scope_case = 'platform_all' THEN NULL ELSE own_tenant END;
    PERFORM set_config('request.jwt.claim.sub', actor::text, true);
    PERFORM set_config('request.jwt.claims',
      jsonb_build_object('sub', actor, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.headers', CASE scope_case
      WHEN 'platform_selected' THEN jsonb_build_object('x-art-tenant-scope', own_tenant)::text
      WHEN 'ordinary_forged' THEN jsonb_build_object('x-art-tenant-scope', other_tenant)::text
      ELSE '{}' END, true);

    IF app_private.current_read_tenant_id() IS DISTINCT FROM expected_tenant THEN
      RAISE EXCEPTION '[fms-account-options] Wrong effective read scope for %', scope_case;
    END IF;
    result := public.fms_list_fund_account_options_secure();
    IF jsonb_typeof(result) IS DISTINCT FROM 'array'
      OR jsonb_array_length(result) > 1000 THEN
      RAISE EXCEPTION '[fms-account-options] Invalid option array/limit for %', scope_case;
    END IF;
    expected_ids := ARRAY(
      SELECT option_row.value->>'id'
      FROM jsonb_array_elements(raw_options) WITH ORDINALITY option_row(value, position)
      WHERE expected_tenant IS NULL
        OR (option_row.value->>'tenant_id')::uuid = expected_tenant
      ORDER BY option_row.position
      LIMIT 1000
    );
    actual_ids := ARRAY(SELECT option_row.value->>'id'
      FROM jsonb_array_elements(result) WITH ORDINALITY option_row(value, position)
      ORDER BY option_row.position);
    IF actual_ids IS DISTINCT FROM expected_ids THEN
      RAISE EXCEPTION '[fms-account-options] Scope, default status or sort changed for %', scope_case;
    END IF;
    IF scope_case = 'platform_all' AND NOT (own_account::text = ANY(actual_ids)
      AND other_account::text = ANY(actual_ids)) THEN
      RAISE EXCEPTION '[fms-account-options] Platform all omitted an account tenant';
    END IF;
    IF scope_case = 'ordinary_own' THEN ordinary_result := result; END IF;
    IF scope_case = 'ordinary_forged' AND result IS DISTINCT FROM ordinary_result THEN
      RAISE EXCEPTION '[fms-account-options] Forged header changed ordinary options';
    END IF;

    FOR row_value IN SELECT value FROM jsonb_array_elements(result) LOOP
      SELECT value INTO raw_row FROM jsonb_array_elements(raw_options)
      WHERE value->>'id' = row_value->>'id';
      IF raw_row IS NULL
        OR (row_value->>'tenant_id')::uuid IS DISTINCT FROM (raw_row->>'tenant_id')::uuid
        OR row_value->>'account_set_id' IS DISTINCT FROM raw_row->>'account_set_id'
        OR row_value->>'status' IS DISTINCT FROM raw_row->>'status'
        OR jsonb_typeof(row_value->'field_access') IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION '[fms-account-options] Option identity, tenant or access map changed for %', scope_case;
      END IF;
      details_level := coalesce(row_value->'field_access'->>'accountDetails', 'hidden');
      balances_level := coalesce(row_value->'field_access'->>'accountBalances', 'hidden');
      IF details_level = 'hidden' THEN
        IF row_value ? 'account_no_masked' THEN
          RAISE EXCEPTION '[fms-account-options] Hidden account number exposed';
        END IF;
      ELSIF details_level IN ('masked', 'read', 'edit') THEN
        IF row_value->'account_no_masked' IS DISTINCT FROM raw_row->'account_no_masked' THEN
          RAISE EXCEPTION '[fms-account-options] Account number mask changed';
        END IF;
      ELSE
        RAISE EXCEPTION '[fms-account-options] Unknown account detail access level';
      END IF;
      IF balances_level = 'hidden' THEN
        IF row_value ? 'available_balance' THEN
          RAISE EXCEPTION '[fms-account-options] Hidden balance exposed';
        END IF;
      ELSIF balances_level = 'masked' THEN
        IF row_value->>'available_balance' IS DISTINCT FROM '***' THEN
          RAISE EXCEPTION '[fms-account-options] Balance mask changed';
        END IF;
        masked_amount_checks := masked_amount_checks + 1;
      ELSIF balances_level IN ('read', 'edit') THEN
        IF row_value->'available_balance' IS DISTINCT FROM raw_row->'available_balance' THEN
          RAISE EXCEPTION '[fms-account-options] Readable balance changed';
        END IF;
      ELSE
        RAISE EXCEPTION '[fms-account-options] Unknown balance access level';
      END IF;
    END LOOP;
  END LOOP;

  -- Filter contracts are checked with the ordinary actor. A foreign account
  -- set must not make a foreign account available under a forged/own scope.
  PERFORM set_config('request.jwt.claim.sub', ordinary_actor::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', ordinary_actor, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', '{}', true);
  result := public.fms_list_fund_account_options_secure(own_account_set, 'active', false);
  expected_ids := ARRAY(
    SELECT option_row.value->>'id'
    FROM jsonb_array_elements(raw_options) WITH ORDINALITY option_row(value, position)
    WHERE (option_row.value->>'tenant_id')::uuid = own_tenant
      AND (option_row.value->>'account_set_id')::uuid = own_account_set
    ORDER BY option_row.position
    LIMIT 1000
  );
  actual_ids := ARRAY(SELECT option_row.value->>'id' FROM jsonb_array_elements(result) option_row);
  IF actual_ids IS DISTINCT FROM expected_ids OR NOT own_account::text = ANY(actual_ids) THEN
    RAISE EXCEPTION '[fms-account-options] Account-set filter or order changed';
  END IF;
  IF jsonb_array_length(public.fms_list_fund_account_options_secure(other_account_set, 'active', false)) <> 0
    OR jsonb_array_length(public.fms_list_fund_account_options_secure(NULL, '__missing_status__', false)) <> 0 THEN
    RAISE EXCEPTION '[fms-account-options] Foreign set or status filter escaped';
  END IF;
  result := public.fms_list_fund_account_options_secure(NULL, 'active', true);
  expected_ids := ARRAY(
    SELECT option_row.value->>'id'
    FROM jsonb_array_elements(raw_options) WITH ORDINALITY option_row(value, position)
    WHERE (option_row.value->>'tenant_id')::uuid = own_tenant
      AND option_row.value->>'currency_code' = option_row.value->>'base_currency_code'
    ORDER BY option_row.position
    LIMIT 1000
  );
  actual_ids := ARRAY(SELECT option_row.value->>'id' FROM jsonb_array_elements(result) option_row);
  IF actual_ids IS DISTINCT FROM expected_ids THEN
    RAISE EXCEPTION '[fms-account-options] Base-currency filter or order changed';
  END IF;

  EXECUTE 'RESET ROLE';
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '{}', true);
  PERFORM set_config('request.headers', '{}', true);
  BEGIN
    PERFORM public.fms_list_fund_account_options_secure();
    RAISE EXCEPTION '[fms-account-options] Anon executed protected options';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  EXECUTE 'RESET ROLE';
  IF masked_amount_checks = 0 THEN
    RAISE NOTICE '[fms-account-options] No real masked balance sample; hidden/read/edit and account number policy were checked';
  END IF;
END;
$fund_account_option_scope$;
