-- Review-only integration fixture. Run only after the four RPC definitions receive separate approval.
-- Every safety-inspection row below is created by this transaction and removed by ROLLBACK.
-- Existing type, organization, employee, tenant and actor fixture rows are read only.
-- The caller must pre-set these session GUCs on the same connection to real,
-- isolated test identities/references before BEGIN:
-- test.smis.ordinary_actor, test.smis.no_permission_actor, test.smis.platform_actor
-- test.smis.ordinary_tenant, test.smis.platform_home_tenant, test.smis.target_tenant
-- test.smis.ordinary_type, test.smis.ordinary_org, test.smis.ordinary_employee
-- test.smis.platform_type, test.smis.platform_org, test.smis.platform_employee
-- test.smis.target_type, test.smis.target_org, test.smis.target_employee
-- The ordinary and platform actors need View/Add/Edit/Copy/Delete; the no-permission actor
-- belongs to ordinary_tenant and lacks Add/Edit/Copy/Delete. Each reference must be active,
-- belong to its named tenant, and remain valid throughout this short transaction.

BEGIN;
SET LOCAL ROLE authenticated;

DO $safety_inspection_tenant_write$
DECLARE
  v_ordinary_actor uuid := current_setting('test.smis.ordinary_actor')::uuid;
  v_no_permission_actor uuid := current_setting('test.smis.no_permission_actor')::uuid;
  v_platform_actor uuid := current_setting('test.smis.platform_actor')::uuid;
  v_ordinary_tenant uuid := current_setting('test.smis.ordinary_tenant')::uuid;
  v_platform_home_tenant uuid := current_setting('test.smis.platform_home_tenant')::uuid;
  v_target_tenant uuid := current_setting('test.smis.target_tenant')::uuid;
  v_ordinary_type uuid := current_setting('test.smis.ordinary_type')::uuid;
  v_ordinary_org uuid := current_setting('test.smis.ordinary_org')::uuid;
  v_ordinary_employee uuid := current_setting('test.smis.ordinary_employee')::uuid;
  v_platform_type uuid := current_setting('test.smis.platform_type')::uuid;
  v_platform_org uuid := current_setting('test.smis.platform_org')::uuid;
  v_platform_employee uuid := current_setting('test.smis.platform_employee')::uuid;
  v_target_type uuid := current_setting('test.smis.target_type')::uuid;
  v_target_org uuid := current_setting('test.smis.target_org')::uuid;
  v_target_employee uuid := current_setting('test.smis.target_employee')::uuid;
  v_missing_id uuid := gen_random_uuid();
  v_ordinary_payload jsonb;
  v_platform_payload jsonb;
  v_target_payload jsonb;
  v_options jsonb;
  v_platform_id uuid;
  v_target_id uuid;
  v_target_copy_id uuid;
  v_ordinary_id uuid;
  v_ordinary_copy_id uuid;
  v_ordinary_own_id uuid;
  v_ordinary_own_copy_id uuid;
  v_deleted integer;
  v_rejected boolean;
BEGIN
  IF v_ordinary_tenant = v_target_tenant
     OR v_platform_home_tenant = v_target_tenant THEN
    RAISE EXCEPTION 'Target tenant must differ from ordinary and platform-home tenants';
  END IF;

  v_ordinary_payload := jsonb_build_object(
    'inspection_type_id', v_ordinary_type,
    'inspection_name', '__smis_tenant_scope_probe_ordinary__',
    'inspection_organization_id', v_ordinary_org,
    'inspected_organization_id', v_ordinary_org,
    'inspection_time', now(),
    'plan_attachment_urls', '[]'::jsonb
  );
  v_platform_payload := jsonb_build_object(
    'inspection_type_id', v_platform_type,
    'inspection_name', '__smis_tenant_scope_probe_platform__',
    'inspection_organization_id', v_platform_org,
    'inspected_organization_id', v_platform_org,
    'inspection_time', now(),
    'plan_attachment_urls', '[]'::jsonb
  );
  v_target_payload := jsonb_build_object(
    'tenant_id', v_target_tenant,
    'inspection_type_id', v_target_type,
    'inspection_name', '__smis_tenant_scope_probe_target__',
    'inspection_organization_id', v_target_org,
    'inspected_organization_id', v_target_org,
    'inspection_time', now(),
    'plan_attachment_urls', '[]'::jsonb
  );

  -- Platform all: omitted target uses the authenticated platform tenant; explicit target uses B.
  PERFORM set_config('request.jwt.claim.sub', v_platform_actor::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_platform_actor, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', '{}', true);
  v_options := public.smis_list_safety_inspection_options_secure();
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_options->'inspectionTypes') AS item WHERE item->>'tenantId' = v_target_tenant::text)
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_options->'organizations') AS item WHERE item->>'tenantId' = v_target_tenant::text) THEN
    RAISE EXCEPTION 'Platform-all options lack target tenant metadata';
  END IF;
  v_platform_id := public.smis_save_safety_inspection_secure(NULL, v_platform_payload, jsonb_build_array(v_platform_employee));
  v_target_id := public.smis_save_safety_inspection_secure(NULL, v_target_payload, jsonb_build_array(v_target_employee));
  IF NOT EXISTS (SELECT 1 FROM public.smis_safety_inspection WHERE id = v_platform_id AND tenant_id = v_platform_home_tenant)
     OR NOT EXISTS (SELECT 1 FROM public.smis_safety_inspection WHERE id = v_target_id AND tenant_id = v_target_tenant) THEN
    RAISE EXCEPTION 'Platform-all create chose the wrong tenant';
  END IF;

  -- A cross-tenant employee and a cross-tenant type must fail within the same target.
  v_rejected := false;
  BEGIN
    PERFORM public.smis_save_safety_inspection_secure(NULL, v_target_payload, jsonb_build_array(v_ordinary_employee));
  EXCEPTION WHEN SQLSTATE '22023' THEN
    v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Cross-tenant employee was accepted'; END IF;
  v_rejected := false;
  BEGIN
    PERFORM public.smis_save_safety_inspection_secure(
      NULL,
      jsonb_set(v_target_payload, '{inspection_type_id}', to_jsonb(v_ordinary_type)),
      jsonb_build_array(v_target_employee)
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN
    v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Cross-tenant inspection type was accepted'; END IF;
  v_rejected := false;
  BEGIN
    PERFORM public.smis_save_safety_inspection_secure(
      NULL,
      jsonb_set(v_target_payload, '{inspection_organization_id}', to_jsonb(v_ordinary_org)),
      jsonb_build_array(v_target_employee)
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN
    v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Cross-tenant organization was accepted'; END IF;
  v_rejected := false;
  BEGIN
    PERFORM public.smis_save_safety_inspection_secure(
      v_target_id,
      v_target_payload || jsonb_build_object('tenant_id', v_platform_home_tenant),
      jsonb_build_array(v_target_employee)
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Platform-all edit changed an existing B row tenant'; END IF;

  -- Platform selected B: the source row and all mutations remain in B.
  PERFORM set_config('request.headers', jsonb_build_object('x-art-tenant-scope', v_target_tenant)::text, true);
  v_options := public.smis_list_safety_inspection_options_secure();
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_options->'organizations') AS item WHERE item->>'tenantId' IS DISTINCT FROM v_target_tenant::text) THEN
    RAISE EXCEPTION 'Selected-tenant options escaped B';
  END IF;
  PERFORM public.smis_save_safety_inspection_secure(v_target_id, v_target_payload, jsonb_build_array(v_target_employee));
  v_target_copy_id := public.smis_copy_safety_inspection_secure(v_target_id);
  IF NOT EXISTS (SELECT 1 FROM public.smis_safety_inspection WHERE id = v_target_copy_id AND tenant_id = v_target_tenant)
     OR (SELECT count(*) FROM public.smis_safety_inspection_inspector WHERE inspection_id = v_target_copy_id AND tenant_id = v_target_tenant) <> 1 THEN
    RAISE EXCEPTION 'Selected-tenant copy lost its tenant or inspector';
  END IF;
  v_rejected := false;
  BEGIN
    PERFORM public.smis_copy_safety_inspection_secure(v_platform_id);
  EXCEPTION WHEN SQLSTATE 'P0002' THEN
    v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Selected B copied a platform-home row'; END IF;
  v_rejected := false;
  BEGIN
    PERFORM public.smis_save_safety_inspection_secure(v_platform_id, v_platform_payload, jsonb_build_array(v_platform_employee));
  EXCEPTION WHEN SQLSTATE 'P0002' THEN
    v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Selected B edited a platform-home row'; END IF;
  v_rejected := false;
  BEGIN
    PERFORM public.smis_save_safety_inspection_secure(NULL, v_platform_payload || jsonb_build_object('tenant_id', v_platform_home_tenant), jsonb_build_array(v_platform_employee));
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Selected B accepted an explicit foreign create'; END IF;
  v_deleted := public.smis_delete_safety_inspections_secure(ARRAY[v_target_copy_id]);
  IF v_deleted <> 1 THEN RAISE EXCEPTION 'Selected B delete count was wrong'; END IF;

  -- Ordinary user: a forged B header cannot move reads or writes away from A.
  PERFORM set_config('request.jwt.claim.sub', v_ordinary_actor::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_ordinary_actor, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', jsonb_build_object('x-art-tenant-scope', v_target_tenant)::text, true);
  v_options := public.smis_list_safety_inspection_options_secure();
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_options->'inspectionTypes') AS item WHERE item->>'tenantId' IS DISTINCT FROM v_ordinary_tenant::text)
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_options->'organizations') AS item WHERE item->>'tenantId' IS DISTINCT FROM v_ordinary_tenant::text) THEN
    RAISE EXCEPTION 'Forged header changed ordinary options';
  END IF;
  v_ordinary_id := public.smis_save_safety_inspection_secure(NULL, v_ordinary_payload, jsonb_build_array(v_ordinary_employee));
  IF NOT EXISTS (SELECT 1 FROM public.smis_safety_inspection WHERE id = v_ordinary_id AND tenant_id = v_ordinary_tenant) THEN
    RAISE EXCEPTION 'Forged header changed ordinary create tenant';
  END IF;
  PERFORM public.smis_save_safety_inspection_secure(v_ordinary_id, v_ordinary_payload, jsonb_build_array(v_ordinary_employee));
  v_ordinary_copy_id := public.smis_copy_safety_inspection_secure(v_ordinary_id);
  v_rejected := false;
  BEGIN
    PERFORM public.smis_save_safety_inspection_secure(NULL, v_ordinary_payload || jsonb_build_object('tenant_id', v_target_tenant), jsonb_build_array(v_ordinary_employee));
  EXCEPTION WHEN SQLSTATE '42501' THEN
    v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Ordinary user created an explicit foreign target'; END IF;
  v_rejected := false;
  BEGIN
    PERFORM public.smis_copy_safety_inspection_secure(v_target_id);
  EXCEPTION WHEN SQLSTATE 'P0002' THEN
    v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Ordinary user copied B'; END IF;
  v_rejected := false;
  BEGIN
    PERFORM public.smis_save_safety_inspection_secure(v_target_id, v_target_payload, jsonb_build_array(v_target_employee));
  EXCEPTION WHEN SQLSTATE 'P0002' THEN
    v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Ordinary forged B header edited a B row'; END IF;
  v_rejected := false;
  BEGIN
    PERFORM public.smis_delete_safety_inspections_secure(ARRAY[v_ordinary_id, v_target_id]);
  EXCEPTION WHEN SQLSTATE 'P0002' THEN
    v_rejected := true;
  END;
  IF NOT v_rejected OR NOT EXISTS (SELECT 1 FROM public.smis_safety_inspection WHERE id = v_ordinary_id) THEN
    RAISE EXCEPTION 'Ordinary mixed-tenant delete was partially applied';
  END IF;
  v_deleted := public.smis_delete_safety_inspections_secure(ARRAY[v_ordinary_copy_id]);
  IF v_deleted <> 1 THEN RAISE EXCEPTION 'Ordinary own delete failed'; END IF;

  -- Ordinary own scope without any header also completes the full mutation lifecycle.
  PERFORM set_config('request.headers', '{}', true);
  v_ordinary_own_id := public.smis_save_safety_inspection_secure(NULL, v_ordinary_payload, jsonb_build_array(v_ordinary_employee));
  IF NOT EXISTS (SELECT 1 FROM public.smis_safety_inspection WHERE id = v_ordinary_own_id AND tenant_id = v_ordinary_tenant) THEN
    RAISE EXCEPTION 'Ordinary no-header create chose the wrong tenant';
  END IF;
  PERFORM public.smis_save_safety_inspection_secure(v_ordinary_own_id, v_ordinary_payload, jsonb_build_array(v_ordinary_employee));
  v_ordinary_own_copy_id := public.smis_copy_safety_inspection_secure(v_ordinary_own_id);
  IF NOT EXISTS (SELECT 1 FROM public.smis_safety_inspection WHERE id = v_ordinary_own_copy_id AND tenant_id = v_ordinary_tenant) THEN
    RAISE EXCEPTION 'Ordinary no-header copy chose the wrong tenant';
  END IF;
  v_deleted := public.smis_delete_safety_inspections_secure(ARRAY[v_ordinary_own_id, v_ordinary_own_copy_id]);
  IF v_deleted <> 2 THEN RAISE EXCEPTION 'Ordinary no-header delete count was wrong'; END IF;

  -- A real authenticated actor without mutation permissions is denied by every RPC.
  PERFORM set_config('request.jwt.claim.sub', v_no_permission_actor::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_no_permission_actor, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', '{}', true);
  v_rejected := false;
  BEGIN
    PERFORM public.smis_save_safety_inspection_secure(NULL, v_ordinary_payload, jsonb_build_array(v_ordinary_employee));
  EXCEPTION WHEN SQLSTATE '42501' THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Add permission was not required'; END IF;
  v_rejected := false;
  BEGIN
    PERFORM public.smis_save_safety_inspection_secure(v_ordinary_id, v_ordinary_payload, jsonb_build_array(v_ordinary_employee));
  EXCEPTION WHEN SQLSTATE '42501' THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Edit permission was not required'; END IF;
  v_rejected := false;
  BEGIN
    PERFORM public.smis_copy_safety_inspection_secure(v_ordinary_id);
  EXCEPTION WHEN SQLSTATE '42501' THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Copy permission was not required'; END IF;
  v_rejected := false;
  BEGIN
    PERFORM public.smis_delete_safety_inspections_secure(ARRAY[v_ordinary_id]);
  EXCEPTION WHEN SQLSTATE '42501' THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Delete permission was not required'; END IF;

  -- Platform all can edit/copy B and delete an A/B/platform batch atomically.
  PERFORM set_config('request.jwt.claim.sub', v_platform_actor::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_platform_actor, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', '{}', true);
  PERFORM public.smis_save_safety_inspection_secure(v_target_id, v_target_payload, jsonb_build_array(v_target_employee));
  v_target_copy_id := public.smis_copy_safety_inspection_secure(v_target_id);
  IF EXISTS (SELECT 1 FROM public.smis_safety_inspection WHERE id = v_missing_id) THEN
    RAISE EXCEPTION 'missing_id fixture is present';
  END IF;
  v_rejected := false;
  BEGIN
    PERFORM public.smis_delete_safety_inspections_secure(ARRAY[v_platform_id, v_missing_id]);
  EXCEPTION WHEN SQLSTATE 'P0002' THEN v_rejected := true;
  END;
  IF NOT v_rejected OR NOT EXISTS (SELECT 1 FROM public.smis_safety_inspection WHERE id = v_platform_id) THEN
    RAISE EXCEPTION 'Missing ID caused a partial delete';
  END IF;
  v_deleted := public.smis_delete_safety_inspections_secure(ARRAY[v_platform_id, v_ordinary_id, v_target_id, v_target_copy_id, v_target_id]);
  IF v_deleted <> 4 THEN RAISE EXCEPTION 'Platform-all mixed delete count was wrong'; END IF;
END $safety_inspection_tenant_write$;

SELECT 'smis-safety-inspection-write-tenant:passed' AS result;
ROLLBACK;
