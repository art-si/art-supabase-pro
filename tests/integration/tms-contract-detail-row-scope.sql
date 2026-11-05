-- Review-only regression. Run only after the candidate RPC is transactionally previewed/applied.
-- All fixture permission/contract mutations roll back.
BEGIN;

DO $setup$
DECLARE
  v_tenant_id uuid := '7529f951-938e-4e2c-ac0d-316c136ae1f9';
  v_contract_id uuid;
  v_detail_count integer;
BEGIN
  IF to_regprocedure('public.tms_list_contract_detail_rows_secure(integer,integer,text,text,text,uuid,uuid,text,text,timestamptz,timestamptz,uuid,uuid[],text)') IS NULL
     OR has_function_privilege('anon','public.tms_list_contract_detail_rows_secure(integer,integer,text,text,text,uuid,uuid,text,text,timestamptz,timestamptz,uuid,uuid[],text)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.tms_list_contract_detail_rows_secure(integer,integer,text,text,text,uuid,uuid,text,text,timestamptz,timestamptz,uuid,uuid[],text)','EXECUTE')
  THEN RAISE EXCEPTION 'Contract detail RPC/grants are invalid'; END IF;

  SELECT id, jsonb_array_length(transport_details)
    INTO v_contract_id, v_detail_count
  FROM public.tms_contract
  WHERE tenant_id = v_tenant_id AND jsonb_typeof(transport_details) = 'array'
    AND jsonb_array_length(transport_details) >= 2
    AND created_by_user_id IS DISTINCT FROM (
      SELECT id FROM public.sys_user
      WHERE auth_user_id='ab881b32-87d4-4dce-9014-ce488b8069df'
    )
  ORDER BY create_time DESC, id
  LIMIT 1;
  IF v_contract_id IS NULL THEN RAISE EXCEPTION 'Two-detail yq contract fixture is missing'; END IF;
  PERFORM set_config('qa.detail_contract_id', v_contract_id::text, true);
  PERFORM set_config('qa.detail_count', v_detail_count::text, true);
END $setup$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','ab881b32-87d4-4dce-9014-ce488b8069df',true);
SELECT set_config('request.headers','{}',true);
DO $ordinary$
DECLARE
  v_contract_id uuid := current_setting('qa.detail_contract_id')::uuid;
  v_first jsonb;
  v_second jsonb;
  v_all jsonb;
BEGIN
  v_first := public.tms_list_contract_detail_rows_secure(p_from=>0,p_to=>0,p_record_id=>v_contract_id);
  v_second := public.tms_list_contract_detail_rows_secure(p_from=>1,p_to=>1,p_record_id=>v_contract_id);
  v_all := public.tms_list_contract_detail_rows_secure(p_from=>0,p_to=>99,p_record_id=>v_contract_id);
  IF (v_first->>'total')::integer <> current_setting('qa.detail_count')::integer
     OR (v_second->>'total')::integer <> current_setting('qa.detail_count')::integer
     OR jsonb_array_length(v_first->'records') <> 1
     OR jsonb_array_length(v_second->'records') <> 1
     OR jsonb_array_length(v_all->'records') <> current_setting('qa.detail_count')::integer
     OR v_first->'records'->0->>'detail_row_key' = v_second->'records'->0->>'detail_row_key'
     OR v_first->'records'->0->>'id' <> v_contract_id::text
     OR v_second->'records'->0->>'id' <> v_contract_id::text
  THEN RAISE EXCEPTION 'Ordinary detail pagination/count/identity failed'; END IF;
END $ordinary$;
SELECT set_config('request.headers','{"x-art-tenant-scope":"028e6a68-a9db-4055-974c-1e05bfe94b0f"}',true);
DO $forged$
BEGIN
  IF (public.tms_list_contract_detail_rows_secure(p_record_id=>current_setting('qa.detail_contract_id')::uuid)->>'total')::integer
     <> current_setting('qa.detail_count')::integer
  THEN RAISE EXCEPTION 'Forged ordinary header changed detail scope'; END IF;
END $forged$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','0a872664-874c-447d-a256-d0dbdca6ed45',true);
SELECT set_config('request.headers','{}',true);
DO $platform_all$
BEGIN
  IF (public.tms_list_contract_detail_rows_secure(p_record_id=>current_setting('qa.detail_contract_id')::uuid)->>'total')::integer
     <> current_setting('qa.detail_count')::integer
  THEN RAISE EXCEPTION 'Platform-all detail lookup failed'; END IF;
END $platform_all$;
SELECT set_config('request.headers','{"x-art-tenant-scope":"028e6a68-a9db-4055-974c-1e05bfe94b0f"}',true);
DO $platform_selected_other$
BEGIN
  IF (public.tms_list_contract_detail_rows_secure(p_record_id=>current_setting('qa.detail_contract_id')::uuid)->>'total')::integer <> 0
  THEN RAISE EXCEPTION 'Platform-selected detail lookup crossed tenant'; END IF;
END $platform_selected_other$;
SELECT set_config('request.headers','{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}',true);
DO $platform_selected_own$
BEGIN
  IF (public.tms_list_contract_detail_rows_secure(p_record_id=>current_setting('qa.detail_contract_id')::uuid)->>'total')::integer
     <> current_setting('qa.detail_count')::integer
  THEN RAISE EXCEPTION 'Platform-selected own detail lookup failed'; END IF;
END $platform_selected_own$;
RESET ROLE;

SAVEPOINT no_export;
DELETE FROM public.sys_role_menu rm USING public.sys_role r, public.sys_menu m
WHERE rm.role_id=r.id AND rm.menu_id=m.id
  AND r.tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9'
  AND r.role_code='yq_2026_001' AND m.name='TmsContract:Export';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','ab881b32-87d4-4dce-9014-ce488b8069df',true);
SELECT set_config('request.headers','{}',true);
DO $no_export$
BEGIN
  IF app_private.has_permission('TmsContract:Export') THEN RAISE EXCEPTION 'No-export setup failed'; END IF;
  IF (public.tms_list_contract_detail_rows_secure(p_record_id=>current_setting('qa.detail_contract_id')::uuid)->>'total')::integer < 2
  THEN RAISE EXCEPTION 'No-export role lost View unexpectedly'; END IF;
  BEGIN
    PERFORM public.tms_list_contract_detail_rows_secure(p_purpose=>'export');
    RAISE EXCEPTION 'No-export role exported contract details';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END $no_export$;
RESET ROLE;
ROLLBACK TO SAVEPOINT no_export;

SAVEPOINT no_view;
DELETE FROM public.sys_role_menu rm USING public.sys_role r, public.sys_menu m
WHERE rm.role_id=r.id AND rm.menu_id=m.id
  AND r.tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9'
  AND r.role_code='yq_2026_001' AND m.name='TmsContract:View';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','ab881b32-87d4-4dce-9014-ce488b8069df',true);
SELECT set_config('request.headers','{}',true);
DO $no_view$
BEGIN
  IF app_private.has_permission('TmsContract:View') THEN RAISE EXCEPTION 'No-View setup failed'; END IF;
  BEGIN
    PERFORM public.tms_list_contract_detail_rows_secure();
    RAISE EXCEPTION 'No-View role read contract details';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END $no_view$;
RESET ROLE;
ROLLBACK TO SAVEPOINT no_view;

SET LOCAL ROLE anon;
DO $anon$
BEGIN
  BEGIN
    PERFORM public.tms_list_contract_detail_rows_secure();
    RAISE EXCEPTION 'Anon read contract details';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END $anon$;
RESET ROLE;

-- Compare the exact existing secure formatter with the new flattened output under each field level.
DO $field_fixture$
DECLARE
  v_actor_id uuid;
  v_resource_id uuid;
  v_field_id uuid;
BEGIN
  SELECT id INTO v_actor_id FROM public.sys_user
  WHERE auth_user_id='ab881b32-87d4-4dce-9014-ce488b8069df' LIMIT 1;
  SELECT r.id, f.id INTO v_resource_id, v_field_id
  FROM public.sys_permission_resource r
  JOIN public.sys_permission_field f ON f.resource_id=r.id AND f.tenant_id=r.tenant_id
  WHERE r.tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9'
    AND r.resource_key='tms.contract' AND f.field_key='transportDetailsPricing';
  IF v_actor_id IS NULL OR v_resource_id IS NULL OR v_field_id IS NULL
  THEN RAISE EXCEPTION 'Contract field-access fixture missing'; END IF;
  PERFORM set_config('qa.actor_id',v_actor_id::text,true);
  PERFORM set_config('qa.resource_id',v_resource_id::text,true);
  PERFORM set_config('qa.field_id',v_field_id::text,true);
  DELETE FROM public.sys_user_field_permission
  WHERE tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9'
    AND user_id=v_actor_id AND field_id=v_field_id;
  INSERT INTO public.sys_user_field_permission(tenant_id,user_id,resource_id,field_id,access_level,create_by)
  VALUES ('7529f951-938e-4e2c-ac0d-316c136ae1f9',v_actor_id,v_resource_id,v_field_id,'hidden','tms-detail-test');
END $field_fixture$;

DO $field_levels$
DECLARE
  v_level text;
  v_old jsonb;
  v_new jsonb;
  v_old_item jsonb;
  v_new_item jsonb;
  v_index integer;
BEGIN
  FOREACH v_level IN ARRAY ARRAY['hidden','masked','read'] LOOP
    UPDATE public.sys_user_field_permission SET access_level=v_level
    WHERE tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9'
      AND user_id=current_setting('qa.actor_id')::uuid
      AND field_id=current_setting('qa.field_id')::uuid;
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claim.sub','ab881b32-87d4-4dce-9014-ce488b8069df',true);
    PERFORM set_config('request.headers','{}',true);
    v_old := public.tms_get_contract_secure(current_setting('qa.detail_contract_id')::uuid);
    v_new := public.tms_list_contract_detail_rows_secure(
      p_from=>0,p_to=>99,p_record_id=>current_setting('qa.detail_contract_id')::uuid
    );
    EXECUTE 'RESET ROLE';
    IF v_old->'field_access'->>'transportDetailsPricing' <> v_level
       OR jsonb_array_length(v_new->'records') <> jsonb_array_length(v_old->'transport_details')
    THEN RAISE EXCEPTION 'Field-access fixture or count failed for %',v_level; END IF;
    FOR v_index IN 0..jsonb_array_length(v_new->'records')-1 LOOP
      v_old_item := v_old->'transport_details'->v_index;
      v_new_item := v_new->'records'->v_index;
      IF (v_old_item ? 'transport_unit_price') <> (v_new_item ? 'detail_transport_unit_price')
         OR (v_old_item ? 'freight') <> (v_new_item ? 'detail_freight')
         OR (v_old_item->'transport_unit_price') IS DISTINCT FROM (v_new_item->'detail_transport_unit_price')
         OR (v_old_item->'freight') IS DISTINCT FROM (v_new_item->'detail_freight')
      THEN RAISE EXCEPTION 'Detail price masking differed from existing formatter for %',v_level; END IF;
    END LOOP;
  END LOOP;
END $field_levels$;

ROLLBACK;
