-- Run only after the separately approved parent-options RPC exists, or inside its
-- caller-owned BEGIN/ROLLBACK definition preview. Real identities and rows only.
-- This DO block performs no business writes and does not stub authorization helpers.
DO $carrier_parent_options$
DECLARE
  super_actor uuid;
  super_home_tenant uuid;
  super_home_count integer;
  ordinary_actor uuid;
  denied_actor uuid;
  tenant_a uuid;
  tenant_b uuid;
  carrier_a1 uuid;
  carrier_a2 uuid;
  carrier_b uuid;
  count_a integer;
  count_b integer;
  users_json jsonb;
  candidates jsonb;
  candidate jsonb;
  actor_json jsonb;
  scope_case text;
  expected_total integer;
  response jsonb;
  first_page jsonb;
  second_page jsonb;
  row_value jsonb;
  missing_message text;
  foreign_message text;
  can_view boolean;
BEGIN
  SELECT u.auth_user_id, u.tenant_id INTO super_actor, super_home_tenant
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
  IF super_actor IS NULL THEN
    RAISE EXCEPTION '[tms-carrier-parent] Real platform super actor required';
  END IF;
  IF EXISTS (SELECT 1 FROM public.mdm_carrier
    WHERE id = '00000000-0000-4000-8000-000000000000'::uuid) THEN
    RAISE EXCEPTION '[tms-carrier-parent] Reserved missing-record fixture ID is in use';
  END IF;
  SELECT count(*) INTO super_home_count FROM public.mdm_carrier
  WHERE tenant_id = super_home_tenant;

  SELECT jsonb_agg(jsonb_build_object('actor', u.auth_user_id)) INTO users_json
  FROM public.sys_user u
  JOIN auth.users a ON a.id = u.auth_user_id
  JOIN public.sys_tenant t ON t.id = u.tenant_id
  WHERE u.auth_user_id IS NOT NULL AND u.status = '1' AND u.deleted_at IS NULL
    AND t.status = '1'
    AND (t.service_start_date IS NULL OR t.service_start_date <= current_date)
    AND (t.service_end_date IS NULL OR t.service_end_date >= current_date);
  SELECT jsonb_agg(jsonb_build_object(
    'actor', u.auth_user_id, 'tenant', u.tenant_id,
    'first', own_rows.ids[1], 'second', own_rows.ids[2],
    'count', own_rows.total,
    'other', other_row.id, 'other_tenant', other_row.tenant_id,
    'other_count', other_row.total
  )) INTO candidates
  FROM public.sys_user u
  JOIN public.sys_tenant t ON t.id = u.tenant_id
  JOIN auth.users a ON a.id = u.auth_user_id
  JOIN LATERAL (
    SELECT array_agg(sample.id ORDER BY sample.create_time DESC, sample.id) ids,
      (SELECT count(*) FROM public.mdm_carrier c WHERE c.tenant_id = u.tenant_id) total
    FROM (SELECT c.id, c.create_time FROM public.mdm_carrier c
      WHERE c.tenant_id = u.tenant_id ORDER BY c.create_time DESC, c.id LIMIT 2) sample
    HAVING count(*) = 2
  ) own_rows ON TRUE
  JOIN LATERAL (
    SELECT c.id, c.tenant_id,
      (SELECT count(*) FROM public.mdm_carrier peer WHERE peer.tenant_id = c.tenant_id) total
    FROM public.mdm_carrier c WHERE c.tenant_id <> u.tenant_id
    ORDER BY c.create_time DESC, c.id LIMIT 1
  ) other_row ON TRUE
  WHERE t.builtin_type IS DISTINCT FROM 'platform'
    AND t.status = '1' AND u.status = '1' AND u.deleted_at IS NULL
    AND (t.service_start_date IS NULL OR t.service_start_date <= current_date)
    AND (t.service_end_date IS NULL OR t.service_end_date >= current_date);
  IF candidates IS NULL THEN
    RAISE EXCEPTION '[tms-carrier-parent] Real ordinary actor with two same-tenant carriers and a foreign carrier required';
  END IF;

  EXECUTE 'SET LOCAL ROLE authenticated';
  FOR candidate IN SELECT value FROM jsonb_array_elements(candidates) LOOP
    PERFORM set_config('request.jwt.claim.sub', candidate->>'actor', TRUE);
    PERFORM set_config('request.jwt.claims',
      jsonb_build_object('sub', candidate->>'actor', 'role', 'authenticated')::text, TRUE);
    PERFORM set_config('request.headers', '{}', TRUE);
    IF app_private.is_platform_super() THEN CONTINUE; END IF;
    BEGIN
      response := public.tms_list_carriers_secure(
        p_ids => ARRAY[(candidate->>'first')::uuid, (candidate->>'second')::uuid],
        p_from => 0, p_to => 1);
      can_view := (response->>'total')::integer = 2;
    EXCEPTION WHEN SQLSTATE '42501' THEN can_view := FALSE;
    END;
    IF can_view AND ordinary_actor IS NULL THEN
      ordinary_actor := (candidate->>'actor')::uuid;
      tenant_a := (candidate->>'tenant')::uuid;
      carrier_a1 := (candidate->>'first')::uuid;
      carrier_a2 := (candidate->>'second')::uuid;
      count_a := (candidate->>'count')::integer;
      tenant_b := (candidate->>'other_tenant')::uuid;
      carrier_b := (candidate->>'other')::uuid;
      count_b := (candidate->>'other_count')::integer;
      EXIT;
    END IF;
  END LOOP;
  IF ordinary_actor IS NULL THEN
    RAISE EXCEPTION '[tms-carrier-parent] Real ordinary actor with carrier View permission required';
  END IF;
  FOR actor_json IN SELECT value FROM jsonb_array_elements(users_json) LOOP
    PERFORM set_config('request.jwt.claim.sub', actor_json->>'actor', TRUE);
    PERFORM set_config('request.jwt.claims',
      jsonb_build_object('sub', actor_json->>'actor', 'role', 'authenticated')::text, TRUE);
    PERFORM set_config('request.headers', '{}', TRUE);
    BEGIN
      PERFORM public.tms_list_carriers_secure(p_from => 0, p_to => 0);
    EXCEPTION WHEN SQLSTATE '42501' THEN
      denied_actor := (actor_json->>'actor')::uuid;
      EXIT;
    END;
  END LOOP;
  IF denied_actor IS NULL THEN
    RAISE EXCEPTION '[tms-carrier-parent] Real actor without carrier View permission required';
  END IF;

  FOR scope_case IN SELECT unnest(ARRAY[
    'platform_all', 'platform_selected', 'ordinary_own', 'ordinary_forged'
  ]) LOOP
    PERFORM set_config('request.jwt.claim.sub',
      CASE WHEN scope_case LIKE 'platform_%' THEN super_actor ELSE ordinary_actor END::text, TRUE);
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',
      CASE WHEN scope_case LIKE 'platform_%' THEN super_actor ELSE ordinary_actor END,
      'role', 'authenticated')::text, TRUE);
    PERFORM set_config('request.headers', CASE scope_case
      WHEN 'platform_selected' THEN jsonb_build_object('x-art-tenant-scope', tenant_a)::text
      WHEN 'ordinary_forged' THEN jsonb_build_object('x-art-tenant-scope', tenant_b)::text
      ELSE '{}' END, TRUE);

    expected_total := CASE WHEN scope_case = 'platform_all'
      THEN super_home_count ELSE count_a END;
    response := public.tms_list_carrier_parent_options_secure(p_from => 0, p_to => 1);
    IF (response->>'total')::integer IS DISTINCT FROM expected_total
      OR jsonb_array_length(response->'records') IS DISTINCT FROM least(expected_total, 2) THEN
      RAISE EXCEPTION '[tms-carrier-parent] Default target or count changed for %', scope_case;
    END IF;

    IF scope_case <> 'platform_all' THEN
      first_page := public.tms_list_carrier_parent_options_secure(p_from => 0, p_to => 0);
      second_page := public.tms_list_carrier_parent_options_secure(p_from => 1, p_to => 1);
      IF (first_page->>'total')::integer IS DISTINCT FROM count_a
        OR (second_page->>'total')::integer IS DISTINCT FROM count_a
        OR (first_page->'records'->0->>'id')::uuid IS DISTINCT FROM carrier_a1
        OR (second_page->'records'->0->>'id')::uuid IS DISTINCT FROM carrier_a2 THEN
        RAISE EXCEPTION '[tms-carrier-parent] Real two-page order/completeness changed for %', scope_case;
      END IF;
      response := public.tms_list_carrier_parent_options_secure(p_record_id => carrier_a1,
        p_from => 0, p_to => 1);
      IF (response->>'total')::integer IS DISTINCT FROM count_a THEN
        RAISE EXCEPTION '[tms-carrier-parent] Existing row tenant was not used for %', scope_case;
      END IF;
      BEGIN
        PERFORM public.tms_list_carrier_parent_options_secure(p_record_id => carrier_b);
        RAISE EXCEPTION '[tms-carrier-parent] Foreign row ID accepted for %', scope_case;
      EXCEPTION WHEN SQLSTATE '42501' THEN
        GET STACKED DIAGNOSTICS foreign_message = MESSAGE_TEXT;
      END;
      BEGIN
        PERFORM public.tms_list_carrier_parent_options_secure(
          p_record_id => '00000000-0000-4000-8000-000000000000'::uuid);
        RAISE EXCEPTION '[tms-carrier-parent] Missing row ID accepted for %', scope_case;
      EXCEPTION WHEN SQLSTATE '42501' THEN
        GET STACKED DIAGNOSTICS missing_message = MESSAGE_TEXT;
      END;
      IF foreign_message IS DISTINCT FROM missing_message THEN
        RAISE EXCEPTION '[tms-carrier-parent] Missing and foreign rows disclose distinct outcomes';
      END IF;
      BEGIN
        PERFORM public.tms_list_carrier_parent_options_secure(p_target_tenant_id => tenant_b);
        RAISE EXCEPTION '[tms-carrier-parent] Conflicting create tenant accepted for %', scope_case;
      EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
      END;
    ELSE
      response := public.tms_list_carrier_parent_options_secure(
        p_target_tenant_id => tenant_a, p_from => 0, p_to => 1);
      IF (response->>'total')::integer IS DISTINCT FROM count_a
        OR (response->'records'->0->>'id')::uuid IS DISTINCT FROM carrier_a1
        OR (response->'records'->1->>'id')::uuid IS DISTINCT FROM carrier_a2 THEN
        RAISE EXCEPTION '[tms-carrier-parent] Platform-all explicit target lost tenant hierarchy';
      END IF;
      first_page := public.tms_list_carrier_parent_options_secure(
        p_target_tenant_id => tenant_a, p_from => 0, p_to => 0);
      second_page := public.tms_list_carrier_parent_options_secure(
        p_target_tenant_id => tenant_a, p_from => 1, p_to => 1);
      IF (first_page->'records'->0->>'id')::uuid IS DISTINCT FROM carrier_a1
        OR (second_page->'records'->0->>'id')::uuid IS DISTINCT FROM carrier_a2
        OR (first_page->>'total')::integer IS DISTINCT FROM count_a
        OR (second_page->>'total')::integer IS DISTINCT FROM count_a THEN
        RAISE EXCEPTION '[tms-carrier-parent] Platform-all explicit target paging changed';
      END IF;
      response := public.tms_list_carrier_parent_options_secure(p_record_id => carrier_b,
        p_from => 0, p_to => 0);
      IF (response->>'total')::integer IS DISTINCT FROM count_b THEN
        RAISE EXCEPTION '[tms-carrier-parent] Platform-all edit lost row tenant';
      END IF;
      BEGIN
        PERFORM public.tms_list_carrier_parent_options_secure(p_record_id => carrier_b,
          p_target_tenant_id => tenant_a);
        RAISE EXCEPTION '[tms-carrier-parent] Conflicting edit tenant accepted';
      EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
      END;
    END IF;

    FOR row_value IN SELECT value FROM jsonb_array_elements(response->'records') LOOP
      IF EXISTS (SELECT 1 FROM jsonb_object_keys(row_value) AS fields(field_key)
        WHERE field_key NOT IN ('id', 'parent_unit_id', 'carrier_code', 'company_name', 'enabled'))
        OR NOT row_value ? 'id' OR NOT row_value ? 'parent_unit_id'
        OR NOT row_value ? 'carrier_code' OR NOT row_value ? 'company_name'
        OR NOT row_value ? 'enabled' THEN
        RAISE EXCEPTION '[tms-carrier-parent] Non-minimal or incomplete option payload';
      END IF;
    END LOOP;
  END LOOP;

  PERFORM set_config('request.jwt.claim.sub', denied_actor::text, TRUE);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', denied_actor, 'role', 'authenticated')::text, TRUE);
  PERFORM set_config('request.headers', '{}', TRUE);
  BEGIN
    PERFORM public.tms_list_carrier_parent_options_secure(p_from => 0, p_to => 0);
    RAISE EXCEPTION '[tms-carrier-parent] Denied actor read parent options';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  EXECUTE 'RESET ROLE';
END;
$carrier_parent_options$;
