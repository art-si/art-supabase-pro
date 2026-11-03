-- Carrier secure readers: real users, real rows, real permission and field policies.
-- Read-only assertions; safe to run inside a caller-owned BEGIN/ROLLBACK preview.
-- This file does not install candidate function definitions or change business rows.
DO $carrier_read_scope$
DECLARE
  super_actor uuid;
  ordinary_actor uuid;
  denied_actor uuid;
  own_tenant uuid;
  other_tenant uuid;
  own_carrier uuid;
  other_carrier uuid;
  candidates jsonb;
  candidate jsonb;
  scope_case text;
  purpose text;
  actor uuid;
  expected_count integer;
  expected_tenant uuid;
  result jsonb;
  list_result jsonb;
  page_result jsonb;
  row_value jsonb;
  own_detail jsonb;
  other_detail jsonb;
  ordinary_own_list jsonb;
  ordinary_forged_list jsonb;
  raw_own jsonb;
  raw_other jsonb;
  raw_row jsonb;
  masked_checks integer := 0;
  field_name text;
  json_key text;
  access_level text;
  expected_ids uuid[];
  sample public.mdm_carrier%rowtype;
  sample_access jsonb;
  sample_result jsonb;
  actor_can_view boolean;
  actor_can_export boolean;
  ordinary_can_export boolean;
BEGIN
  SELECT u.auth_user_id INTO super_actor
  FROM public.sys_user u
  JOIN public.sys_tenant t ON t.id = u.tenant_id
  JOIN auth.users a ON a.id = u.auth_user_id
  WHERE t.builtin_type = 'platform' AND u.system_protected IS TRUE
    AND u.status = '1' AND u.deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.sys_role r
      WHERE r.tenant_id = u.tenant_id AND r.builtin_type = 'platform_super'
        AND r.role_code = ANY(coalesce(u.user_roles, ARRAY[]::text[]))
        AND r.enabled IS TRUE
    )
  ORDER BY u.id LIMIT 1;

  SELECT jsonb_agg(jsonb_build_object(
    'actor', u.auth_user_id,
    'tenant', u.tenant_id,
    'own_carrier', own_row.id,
    'other_carrier', other_row.id,
    'other_tenant', other_row.tenant_id
  )) INTO candidates
  FROM public.sys_user u
  JOIN public.sys_tenant t ON t.id = u.tenant_id
  JOIN auth.users a ON a.id = u.auth_user_id
  JOIN LATERAL (
    SELECT c.id FROM public.mdm_carrier c
    WHERE c.tenant_id = u.tenant_id ORDER BY c.id LIMIT 1
  ) own_row ON TRUE
  JOIN LATERAL (
    SELECT c.id, c.tenant_id FROM public.mdm_carrier c
    JOIN public.sys_tenant other_t ON other_t.id = c.tenant_id
    WHERE c.tenant_id <> u.tenant_id AND other_t.status = '1'
      AND (other_t.service_start_date IS NULL OR other_t.service_start_date <= current_date)
      AND (other_t.service_end_date IS NULL OR other_t.service_end_date >= current_date)
    ORDER BY c.id LIMIT 1
  ) other_row ON TRUE
  WHERE t.builtin_type IS DISTINCT FROM 'platform'
    AND t.status = '1' AND u.status = '1' AND u.deleted_at IS NULL
    AND (t.service_start_date IS NULL OR t.service_start_date <= current_date)
    AND (t.service_end_date IS NULL OR t.service_end_date >= current_date);

  IF super_actor IS NULL OR candidates IS NULL THEN
    RAISE EXCEPTION '[tms-carrier-scope] Real platform/ordinary users and two carrier tenants are required';
  END IF;

  EXECUTE 'SET LOCAL ROLE authenticated';
  FOR candidate IN SELECT value FROM jsonb_array_elements(candidates) LOOP
    actor := (candidate->>'actor')::uuid;
    PERFORM set_config('request.jwt.claim.sub', actor::text, true);
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', actor, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.headers', '{}', true);
    IF app_private.is_platform_super() THEN CONTINUE; END IF;
    BEGIN
      PERFORM public.tms_list_carriers_secure(
        p_from => 0, p_to => 0, p_ids => ARRAY[(candidate->>'own_carrier')::uuid]
      );
      actor_can_view := TRUE;
    EXCEPTION WHEN SQLSTATE '42501' THEN actor_can_view := FALSE;
    END;
    BEGIN
      PERFORM public.tms_list_carriers_secure(
        p_from => 0, p_to => 0, p_ids => ARRAY[(candidate->>'own_carrier')::uuid],
        p_purpose => 'export'
      );
      actor_can_export := TRUE;
    EXCEPTION WHEN SQLSTATE '42501' THEN actor_can_export := FALSE;
    END;
    IF actor_can_view THEN
      IF ordinary_actor IS NULL THEN
        ordinary_actor := actor;
        ordinary_can_export := actor_can_export;
        own_tenant := (candidate->>'tenant')::uuid;
        other_tenant := (candidate->>'other_tenant')::uuid;
        own_carrier := (candidate->>'own_carrier')::uuid;
        other_carrier := (candidate->>'other_carrier')::uuid;
      END IF;
    ELSIF denied_actor IS NULL AND NOT actor_can_export THEN
      denied_actor := actor;
    END IF;
  END LOOP;
  IF ordinary_actor IS NULL OR denied_actor IS NULL THEN
    RAISE EXCEPTION '[tms-carrier-scope] Real allowed and denied ordinary actors are required';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', super_actor::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', super_actor, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', '{}', true);
  IF NOT app_private.is_platform_super() THEN
    RAISE EXCEPTION '[tms-carrier-scope] Real platform super lacks required read actions';
  END IF;
  -- Raw comparison fixtures need the caller's owner privileges; the public
  -- RPC assertions below still run as authenticated with the real actor.
  EXECUTE 'RESET ROLE';
  SELECT to_jsonb(c) INTO raw_own FROM public.mdm_carrier c WHERE c.id = own_carrier;
  SELECT to_jsonb(c) INTO raw_other FROM public.mdm_carrier c WHERE c.id = other_carrier;
  IF raw_own IS NULL OR raw_other IS NULL THEN
    RAISE EXCEPTION '[tms-carrier-scope] Real carrier fixtures are not readable';
  END IF;
  EXECUTE 'SET LOCAL ROLE authenticated';

  FOR scope_case IN SELECT unnest(ARRAY[
    'platform_all', 'platform_selected', 'ordinary_own', 'ordinary_forged'
  ]) LOOP
    actor := CASE WHEN scope_case LIKE 'platform_%' THEN super_actor ELSE ordinary_actor END;
    expected_tenant := CASE WHEN scope_case = 'platform_all' THEN NULL ELSE own_tenant END;
    expected_ids := CASE WHEN scope_case = 'platform_all'
      THEN ARRAY[own_carrier, other_carrier] ELSE ARRAY[own_carrier] END;
    expected_count := cardinality(expected_ids);
    PERFORM set_config('request.jwt.claim.sub', actor::text, true);
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', actor, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.headers', CASE scope_case
      WHEN 'platform_selected' THEN jsonb_build_object('x-art-tenant-scope', own_tenant)::text
      WHEN 'ordinary_forged' THEN jsonb_build_object('x-art-tenant-scope', other_tenant)::text
      ELSE '{}' END, true);
    IF app_private.current_read_tenant_id() IS DISTINCT FROM expected_tenant THEN
      RAISE EXCEPTION '[tms-carrier-scope] Wrong read tenant for %', scope_case;
    END IF;

    FOR purpose IN SELECT unnest(ARRAY['list', 'export']) LOOP
      IF purpose = 'export' AND scope_case LIKE 'ordinary_%' AND NOT ordinary_can_export THEN
        BEGIN
          PERFORM public.tms_list_carriers_secure(
            p_from => 0, p_to => 9, p_ids => ARRAY[own_carrier, other_carrier], p_purpose => purpose
          );
          RAISE EXCEPTION '[tms-carrier-scope] Missing % permission was accepted', purpose;
        EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
        END;
        CONTINUE;
      END IF;

      result := public.tms_list_carriers_secure(
        p_from => 0, p_to => 9, p_ids => ARRAY[own_carrier, other_carrier], p_purpose => purpose
      );
      IF (result->>'total')::integer IS DISTINCT FROM expected_count
        OR jsonb_array_length(result->'records') IS DISTINCT FROM expected_count
        OR jsonb_typeof(result->'fieldAccess') IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION '[tms-carrier-scope] % count or access metadata changed for %', purpose, scope_case;
      END IF;
      IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(result->'records') r
        WHERE (r->>'id')::uuid <> ALL(expected_ids)
      ) OR EXISTS (
        SELECT 1 FROM unnest(expected_ids) id
        WHERE NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(result->'records') r WHERE (r->>'id')::uuid = id
        )
      ) THEN
        RAISE EXCEPTION '[tms-carrier-scope] % row set escaped %', purpose, scope_case;
      END IF;
      IF purpose = 'list' THEN
        list_result := result;
      ELSIF EXISTS (
        SELECT 1 FROM jsonb_array_elements(result->'records') exported
        WHERE exported.value IS DISTINCT FROM (
          SELECT listed.value FROM jsonb_array_elements(list_result->'records') listed
          WHERE listed.value->>'id' = exported.value->>'id'
        )
      ) THEN
        RAISE EXCEPTION '[tms-carrier-scope] Export field protection differs from list for %', scope_case;
      END IF;
      IF scope_case = 'ordinary_own' AND purpose = 'list' THEN ordinary_own_list := result; END IF;
      IF scope_case = 'ordinary_forged' AND purpose = 'list' THEN ordinary_forged_list := result; END IF;

      FOR row_value IN SELECT value FROM jsonb_array_elements(result->'records') LOOP
        IF jsonb_typeof(row_value->'field_access') IS DISTINCT FROM 'object' THEN
          RAISE EXCEPTION '[tms-carrier-scope] Row field access missing';
        END IF;
        raw_row := CASE WHEN (row_value->>'id')::uuid = own_carrier THEN raw_own ELSE raw_other END;
        FOR field_name, json_key IN SELECT * FROM (VALUES
          ('contactPhone', 'contact_phone'),
          ('addressDetail', 'address_detail'),
          ('taxNo', 'tax_no'),
          ('bankAccount', 'bank_account'),
          ('attachments', 'business_license_url')
        ) AS fields(access_key, column_key) LOOP
          access_level := row_value->'field_access'->>field_name;
          IF access_level = 'hidden' OR (field_name = 'attachments' AND access_level = 'masked') THEN
            IF row_value ? json_key THEN
              RAISE EXCEPTION '[tms-carrier-scope] Hidden field exposed: %', field_name;
            END IF;
          ELSIF access_level = 'masked' THEN
            IF length(coalesce(raw_row->>json_key, '')) >= 8 THEN
              IF NOT row_value ? json_key
                OR row_value->>json_key IS NOT DISTINCT FROM raw_row->>json_key THEN
                RAISE EXCEPTION '[tms-carrier-scope] Masked field exposed raw value: %', field_name;
              END IF;
              masked_checks := masked_checks + 1;
            END IF;
          ELSIF access_level IN ('read', 'edit') THEN
            IF row_value->json_key IS DISTINCT FROM raw_row->json_key THEN
              RAISE EXCEPTION '[tms-carrier-scope] Readable field changed: %', field_name;
            END IF;
          ELSE
            RAISE EXCEPTION '[tms-carrier-scope] Invalid field access level: %', field_name;
          END IF;
        END LOOP;
      END LOOP;

      page_result := public.tms_list_carriers_secure(
        p_from => 0, p_to => 0, p_ids => ARRAY[own_carrier, other_carrier], p_purpose => purpose
      );
      IF (page_result->>'total')::integer IS DISTINCT FROM expected_count
        OR jsonb_array_length(page_result->'records') IS DISTINCT FROM 1 THEN
        RAISE EXCEPTION '[tms-carrier-scope] % page bound changed for %', purpose, scope_case;
      END IF;
      page_result := public.tms_list_carriers_secure(
        p_from => 0, p_to => 9, p_record_id => other_carrier, p_purpose => purpose
      );
      IF (page_result->>'total')::integer IS DISTINCT FROM (CASE WHEN scope_case = 'platform_all' THEN 1 ELSE 0 END) THEN
        RAISE EXCEPTION '[tms-carrier-scope] % direct ID escaped %', purpose, scope_case;
      END IF;
    END LOOP;

    own_detail := public.tms_get_carrier_secure(own_carrier);
    other_detail := public.tms_get_carrier_secure(other_carrier);
    IF own_detail IS NULL OR (own_detail->>'id')::uuid <> own_carrier
      OR jsonb_typeof(own_detail->'field_access') IS DISTINCT FROM 'object'
      OR ((other_detail IS NOT NULL) IS DISTINCT FROM (scope_case = 'platform_all')) THEN
      RAISE EXCEPTION '[tms-carrier-scope] Detail scope or access metadata changed for %', scope_case;
    END IF;
    IF own_detail IS DISTINCT FROM (
      SELECT listed.value FROM jsonb_array_elements(list_result->'records') listed
      WHERE (listed.value->>'id')::uuid = own_carrier
    ) OR (scope_case = 'platform_all' AND other_detail IS DISTINCT FROM (
      SELECT listed.value FROM jsonb_array_elements(list_result->'records') listed
      WHERE (listed.value->>'id')::uuid = other_carrier
    )) THEN
      RAISE EXCEPTION '[tms-carrier-scope] Detail field protection differs from list for %', scope_case;
    END IF;
  END LOOP;

  IF ordinary_own_list IS DISTINCT FROM ordinary_forged_list THEN
    RAISE EXCEPTION '[tms-carrier-scope] Forged header changed ordinary list';
  END IF;
  IF masked_checks = 0 THEN
    RAISE NOTICE '[tms-carrier-scope] No real nonempty masked sample; hidden/read/edit and serializer metadata were checked';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', denied_actor::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', denied_actor, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', '{}', true);
  BEGIN
    PERFORM public.tms_get_carrier_secure(own_carrier);
    RAISE EXCEPTION '[tms-carrier-scope] Unprivileged detail was accepted';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  BEGIN
    PERFORM public.tms_list_carriers_secure(p_ids => ARRAY[own_carrier]);
    RAISE EXCEPTION '[tms-carrier-scope] Unprivileged list was accepted';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  BEGIN
    PERFORM public.tms_list_carriers_secure(p_ids => ARRAY[own_carrier], p_purpose => 'export');
    RAISE EXCEPTION '[tms-carrier-scope] Unprivileged export was accepted';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  EXECUTE 'RESET ROLE';

  -- Exercise real serializer branches with an in-memory composite, without
  -- writing business records or replacing authorization/tenant helpers.
  sample := jsonb_populate_record(NULL::public.mdm_carrier, jsonb_build_object(
    'id', own_carrier, 'tenant_id', own_tenant,
    'contact_phone', '13800138000',
    'address_detail', '示例省示例市示例街道100号', 'postal_code', '100000',
    'tax_no', '91310000TEST12345', 'tax_registration_no', '91310000TEST67890',
    'bank_name', '测试银行', 'bank_account_name', '测试户名',
    'bank_account', '6222020000000000000',
    'business_license_url', 'https://example.invalid/license.pdf',
    'contract_attachment_url', 'https://example.invalid/contract.pdf'
  ));
  FOR access_level IN SELECT unnest(ARRAY['hidden', 'masked', 'read', 'edit']) LOOP
    sample_access := jsonb_build_object(
      'contactPhone', access_level, 'addressDetail', access_level,
      'taxNo', access_level, 'bankAccount', access_level, 'attachments', access_level
    );
    sample_result := app_private.tms_carrier_to_secure_json(sample, sample_access);
    IF sample_result->'field_access' IS DISTINCT FROM sample_access THEN
      RAISE EXCEPTION '[tms-carrier-scope] Serializer field metadata changed';
    END IF;
    FOR json_key IN SELECT unnest(ARRAY[
      'contact_phone', 'address_detail', 'postal_code', 'tax_no',
      'tax_registration_no', 'bank_name', 'bank_account_name', 'bank_account',
      'business_license_url', 'contract_attachment_url'
    ]) LOOP
      IF access_level = 'hidden' OR (access_level = 'masked' AND json_key IN (
        'postal_code', 'business_license_url', 'contract_attachment_url'
      )) THEN
        IF sample_result ? json_key THEN
          RAISE EXCEPTION '[tms-carrier-scope] Serializer exposed hidden sample field: %', json_key;
        END IF;
      ELSIF access_level = 'masked' AND json_key <> 'bank_name' THEN
        IF NOT sample_result ? json_key
          OR sample_result->>json_key IS NOT DISTINCT FROM to_jsonb(sample)->>json_key THEN
          RAISE EXCEPTION '[tms-carrier-scope] Serializer did not mask sample field: %', json_key;
        END IF;
      ELSIF sample_result->json_key IS DISTINCT FROM to_jsonb(sample)->json_key THEN
        RAISE EXCEPTION '[tms-carrier-scope] Serializer changed readable sample field: %', json_key;
      END IF;
    END LOOP;
  END LOOP;
  RAISE NOTICE '[tms-carrier-scope] Four real-user scope cases and hidden/masked/read/edit serializer checks passed; real masked comparisons=%', masked_checks;
END;
$carrier_read_scope$;
