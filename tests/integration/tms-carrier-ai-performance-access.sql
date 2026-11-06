-- Run inside BEGIN/ROLLBACK against the linked project. Read-only assertions
-- for the three evidence RPCs used by ai-carrier-performance-advisor.
DO $carrier_ai_access$
DECLARE
  v_super uuid;
  v_ordinary uuid;
  v_own_tenant uuid;
  v_other_tenant uuid;
  v_own_carrier uuid;
  v_other_carrier uuid;
  v_context jsonb;
  v_waybills jsonb;
  v_costs jsonb;
  v_case text;
  v_actor uuid;
  v_expected_tenant uuid;
  v_expected_visible boolean;
  v_carrier uuid;
  v_function_name text;
  v_definition text;
BEGIN
  FOR v_function_name IN SELECT unnest(ARRAY[
    'tms_get_carrier_performance_context_secure',
    'tms_list_carrier_waybills_secure',
    'tms_list_carrier_cost_ai_evidence_secure'
  ]) LOOP
    SELECT pg_get_functiondef(p.oid) INTO v_definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = v_function_name;
    IF v_definition IS NULL
      OR v_definition NOT LIKE '%TmsCarrier:AiAnalyze%'
      OR v_definition LIKE '%TmsCarrierDetail%'
    THEN
      RAISE EXCEPTION '[carrier-ai] Stale permission in %', v_function_name;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM public.sys_menu
    WHERE name = 'TmsCarrier:AiAnalyze' AND type = 'button'
      AND (meta->>'is_enable') IS DISTINCT FROM 'false'
  ) THEN
    RAISE EXCEPTION '[carrier-ai] Current AI permission button is missing';
  END IF;

  SELECT u.auth_user_id INTO v_super
  FROM public.sys_user u
  JOIN public.sys_tenant t ON t.id = u.tenant_id
  JOIN public.sys_role r ON r.tenant_id = u.tenant_id
    AND r.role_code = ANY(coalesce(u.user_roles, ARRAY[]::text[]))
  JOIN auth.users a ON a.id = u.auth_user_id
  WHERE t.builtin_type = 'platform' AND r.builtin_type = 'platform_super'
    AND u.system_protected IS TRUE AND u.status = '1'
    AND u.deleted_at IS NULL AND r.enabled IS TRUE
  ORDER BY u.id LIMIT 1;

  SELECT u.auth_user_id, u.tenant_id, c.id
  INTO v_ordinary, v_own_tenant, v_own_carrier
  FROM public.sys_user u
  JOIN auth.users a ON a.id = u.auth_user_id
  JOIN public.mdm_carrier c ON c.tenant_id = u.tenant_id
  JOIN public.sys_tenant t ON t.id = u.tenant_id
  WHERE t.builtin_type IS DISTINCT FROM 'platform'
    AND t.status = '1' AND u.status = '1' AND u.deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.sys_role r
      JOIN public.sys_role_menu rm ON rm.role_id = r.id AND rm.tenant_id = r.tenant_id
      JOIN public.sys_menu m ON m.id = rm.menu_id
      WHERE r.tenant_id = u.tenant_id AND r.enabled IS TRUE
        AND r.role_code = ANY(coalesce(u.user_roles, ARRAY[]::text[]))
        AND m.name = 'TmsCarrier' AND m.type IS DISTINCT FROM 'button'
    )
    AND EXISTS (
      SELECT 1 FROM public.sys_role r
      JOIN public.sys_role_menu rm ON rm.role_id = r.id AND rm.tenant_id = r.tenant_id
      JOIN public.sys_menu m ON m.id = rm.menu_id
      WHERE r.tenant_id = u.tenant_id AND r.enabled IS TRUE
        AND r.role_code = ANY(coalesce(u.user_roles, ARRAY[]::text[]))
        AND m.name = 'TmsCarrier:AiAnalyze' AND m.type = 'button'
    )
  ORDER BY u.id, c.id LIMIT 1;

  SELECT c.id, c.tenant_id INTO v_other_carrier, v_other_tenant
  FROM public.mdm_carrier c
  JOIN public.sys_tenant t ON t.id = c.tenant_id
  WHERE c.tenant_id <> v_own_tenant AND t.status = '1'
    AND (t.service_start_date IS NULL OR t.service_start_date <= current_date)
    AND (t.service_end_date IS NULL OR t.service_end_date >= current_date)
  ORDER BY c.id LIMIT 1;

  IF v_super IS NULL OR v_ordinary IS NULL OR v_own_carrier IS NULL
    OR v_other_carrier IS NULL THEN
    RAISE EXCEPTION '[carrier-ai] Requires real authorized actors and carriers in two tenants';
  END IF;

  EXECUTE 'SET LOCAL ROLE authenticated';
  FOR v_case IN SELECT unnest(ARRAY[
    'platform_all', 'platform_selected', 'ordinary_own', 'ordinary_forged'
  ]) LOOP
    v_actor := CASE WHEN v_case LIKE 'platform_%' THEN v_super ELSE v_ordinary END;
    v_expected_tenant := CASE WHEN v_case = 'platform_all' THEN NULL ELSE v_own_tenant END;
    PERFORM set_config('request.jwt.claim.sub', v_actor::text, true);
    PERFORM set_config('request.jwt.claims',
      jsonb_build_object('sub', v_actor, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.headers', CASE v_case
      WHEN 'platform_selected' THEN jsonb_build_object('x-art-tenant-scope', v_own_tenant)::text
      WHEN 'ordinary_forged' THEN jsonb_build_object('x-art-tenant-scope', v_other_tenant)::text
      ELSE '{}' END, true);

    IF app_private.current_read_tenant_id() IS DISTINCT FROM v_expected_tenant THEN
      RAISE EXCEPTION '[carrier-ai] Wrong scope for %', v_case;
    END IF;

    FOR v_carrier IN SELECT unnest(ARRAY[v_own_carrier, v_other_carrier]) LOOP
      v_expected_visible := v_case = 'platform_all' OR v_carrier = v_own_carrier;
      v_context := public.tms_get_carrier_performance_context_secure(v_carrier);
      v_waybills := public.tms_list_carrier_waybills_secure(v_carrier, 1);
      IF (v_context IS NOT NULL) IS DISTINCT FROM v_expected_visible
        OR (v_waybills->>'total')::integer IS NULL
        OR (NOT v_expected_visible AND (v_waybills->>'total')::integer <> 0)
      THEN
        RAISE EXCEPTION '[carrier-ai] Context/waybill scope escaped for %', v_case;
      END IF;

      IF v_expected_visible THEN
        v_costs := public.tms_list_carrier_cost_ai_evidence_secure(v_carrier, 1);
        IF jsonb_typeof(v_costs) IS DISTINCT FROM 'array' THEN
          RAISE EXCEPTION '[carrier-ai] Cost evidence shape invalid for %', v_case;
        END IF;
      ELSE
        BEGIN
          PERFORM public.tms_list_carrier_cost_ai_evidence_secure(v_carrier, 1);
          RAISE EXCEPTION '[carrier-ai] Cross-tenant cost evidence exposed for %', v_case;
        EXCEPTION WHEN SQLSTATE 'P0001' THEN
          IF SQLERRM LIKE '[carrier-ai] Cross-tenant cost evidence exposed%' THEN RAISE; END IF;
        END;
      END IF;
    END LOOP;
  END LOOP;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '{}', true);
  PERFORM set_config('request.headers', '{}', true);
  BEGIN
    PERFORM public.tms_get_carrier_performance_context_secure(v_own_carrier);
    RAISE EXCEPTION '[carrier-ai] Anonymous actor reached AI evidence';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  EXECUTE 'RESET ROLE';
  RAISE NOTICE '[carrier-ai] Permission and four tenant-scope cases passed';
END $carrier_ai_access$;
