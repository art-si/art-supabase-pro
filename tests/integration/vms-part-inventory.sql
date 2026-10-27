-- 车辆配件库存、领用归还：真实样例与租户/按钮权限回归；所有临时改动回滚。
BEGIN;
SET LOCAL ROLE authenticated;

DO $test$
DECLARE
  qa_tenant uuid := '7529f951-938e-4e2c-ac0d-316c136ae1f9';
  other_tenant uuid := '2824c2b5-2774-4781-b995-f55e8bcee920';
  qa_part uuid := 'bfd5e0a1-2478-46e6-b6d8-100000000001';
  qa_issue uuid := '46fd09ea-4258-48e0-aed5-83695bd3d3a0';
  ordinary_auth uuid := 'ab881b32-87d4-4dce-9014-ce488b8069df';
  platform_auth uuid := '0a872664-874c-447d-a256-d0dbdca6ed45';
  no_role_auth uuid;
  qa_line uuid;
  trial_issue uuid;
  trial_line uuid;
  blocked boolean;
  before_qty numeric;
BEGIN
  IF to_regclass('public.vms_part_stock') IS NULL
     OR to_regclass('public.vms_part_stock_movement') IS NULL
     OR to_regclass('public.vms_part_issue') IS NULL
     OR to_regclass('public.vms_part_issue_line') IS NULL THEN
    RAISE EXCEPTION 'Part inventory tables missing';
  END IF;
  IF has_table_privilege('authenticated','public.vms_part_stock','INSERT')
     OR has_table_privilege('authenticated','public.vms_part_stock_movement','UPDATE')
     OR has_function_privilege('anon','public.vms_create_part_issue_secure(jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'Direct mutation or anonymous RPC grant is too broad';
  END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',platform_auth,'role','authenticated')::text,true);
  PERFORM set_config('request.headers','{}',true);
  SELECT auth_user_id INTO no_role_auth FROM public.sys_user
   WHERE tenant_id=qa_tenant AND auth_user_id IS NOT NULL
   AND coalesce(array_length(user_roles,1),0)=0 LIMIT 1;
  IF no_role_auth IS NULL THEN RAISE EXCEPTION 'No-role actor unavailable'; END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ordinary_auth,'role','authenticated')::text,true);
  PERFORM set_config('request.headers','{}',true);
  IF (public.vms_list_part_stock_secure()->>'total')::int<>2
     OR (public.vms_list_part_issue_secure()->>'total')::int<>2
     OR (public.vms_list_part_stock_movements_secure()->>'total')::int<>8 THEN
    RAISE EXCEPTION 'Two QA stock/issues or eight movements are missing';
  END IF;
  IF (public.vms_list_part_stock_movements_secure()->'records'->0->>'postingSeq')::bigint<>8
     OR (SELECT count(DISTINCT reference_no) FROM public.vms_part_stock_movement
         WHERE tenant_id=qa_tenant AND movement_type='receipt')<>2 THEN
    RAISE EXCEPTION 'Posting order or receipt references are not stable';
  END IF;
  IF (public.vms_list_part_stock_secure(qa_part)->'records'->0->>'stockQty')::numeric<>10 THEN
    RAISE EXCEPTION 'QA tarp stock not 10';
  END IF;
  IF NOT app_private.vms_part_private_upload_allowed(
    qa_tenant::text||'/'||ordinary_auth::text||'/4f0c28aa-dcef-4eee-a422-3ab6563b7cd9.png')
     OR app_private.vms_part_private_upload_allowed(
       other_tenant::text||'/'||ordinary_auth::text||'/4f0c28aa-dcef-4eee-a422-3ab6563b7cd9.png') THEN
    RAISE EXCEPTION 'Private part image upload path escaped tenant scope';
  END IF;
  qa_line := (public.vms_get_part_issue_secure(qa_issue)->'lines'->0->>'id')::uuid;
  IF (public.vms_get_part_issue_secure(qa_issue)->'lines'->0->>'returnedQty')::numeric<>2
     OR public.vms_get_part_issue_secure(qa_issue)->'lines'->0->>'status'<>'in_use' THEN
    RAISE EXCEPTION 'Partial return state incorrect';
  END IF;
  IF (public.vms_get_part_reference_destination_secure('vms_part_issue_line',qa_line)->>'issueId')::uuid<>qa_issue
     OR public.vms_get_part_reference_destination_secure('vms_part_stock','ec305943-7fba-47e4-b18d-4e2c7693785f')->>'tab'<>'inventory' THEN
    RAISE EXCEPTION 'Part deletion reference did not resolve to its authorized destination';
  END IF;
  PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
  IF (public.vms_list_part_stock_secure()->>'total')::int<>2
     OR (public.vms_list_part_issue_secure()->>'total')::int<>2 THEN
    RAISE EXCEPTION 'Forged tenant header changed ordinary scope';
  END IF;

  PERFORM set_config('request.headers','{}',true);
  blocked := false;
  BEGIN
    PERFORM public.vms_create_part_issue_secure(jsonb_build_object(
      'vehicle_id','d7670b37-2283-433e-95d2-7315829b0edc',
      'idempotency_key',gen_random_uuid(),
      'lines',jsonb_build_array(jsonb_build_object('part_id',qa_part,'issued_qty',11))));
  EXCEPTION WHEN invalid_parameter_value THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Over-issue was accepted'; END IF;
  IF (public.vms_list_part_stock_secure(qa_part)->'records'->0->>'stockQty')::numeric<>10 THEN
    RAISE EXCEPTION 'Failed over-issue changed stock';
  END IF;
  blocked := false;
  BEGIN
    PERFORM public.vms_return_part_issue_line_secure(qa_line,jsonb_build_object(
      'returned_qty',3,'status','returned','idempotency_key',gen_random_uuid()));
  EXCEPTION WHEN invalid_parameter_value THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Over-return was accepted'; END IF;

  before_qty := (public.vms_list_part_stock_secure(qa_part)->'records'->0->>'stockQty')::numeric;
  trial_issue := public.vms_create_part_issue_secure(jsonb_build_object(
    'vehicle_id','d7670b37-2283-433e-95d2-7315829b0edc',
    'idempotency_key','d1361001-9bdd-43d8-9cc2-619000000001',
    'lines',jsonb_build_array(jsonb_build_object('part_id',qa_part,'issued_qty',1))));
  IF trial_issue<>public.vms_create_part_issue_secure(jsonb_build_object(
    'vehicle_id','d7670b37-2283-433e-95d2-7315829b0edc',
    'idempotency_key','d1361001-9bdd-43d8-9cc2-619000000001',
    'lines',jsonb_build_array(jsonb_build_object('part_id',qa_part,'issued_qty',1)))) THEN
    RAISE EXCEPTION 'Issue retry not idempotent';
  END IF;
  blocked := false;
  BEGIN
    PERFORM public.vms_create_part_issue_secure(jsonb_build_object(
      'vehicle_id','d7670b37-2283-433e-95d2-7315829b0edc',
      'idempotency_key','d1361001-9bdd-43d8-9cc2-619000000001',
      'lines',jsonb_build_array(jsonb_build_object('part_id',qa_part,'issued_qty',2))));
  EXCEPTION WHEN invalid_parameter_value THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Changed payload reused issue idempotency key'; END IF;
  trial_line := (public.vms_get_part_issue_secure(trial_issue)->'lines'->0->>'id')::uuid;
  PERFORM public.vms_return_part_issue_line_secure(trial_line,jsonb_build_object(
    'returned_qty',1,'status','damaged','idempotency_key','d1361001-9bdd-43d8-9cc2-619000000002'));
  IF (public.vms_list_part_stock_secure(qa_part)->'records'->0->>'stockQty')::numeric<>before_qty-1 THEN
    RAISE EXCEPTION 'Damaged part incorrectly returned to stock';
  END IF;
  trial_issue := public.vms_create_part_issue_secure(jsonb_build_object(
    'vehicle_id','d7670b37-2283-433e-95d2-7315829b0edc',
    'idempotency_key','d1361001-9bdd-43d8-9cc2-619000000003',
    'lines',jsonb_build_array(
      jsonb_build_object('part_id',qa_part,'issued_qty',1),
      jsonb_build_object('part_id','bfd5e0a1-2478-46e6-b6d8-100000000002','issued_qty',2))));
  IF jsonb_array_length(public.vms_get_part_issue_secure(trial_issue)->'lines')<>2
     OR (public.vms_get_part_issue_secure(trial_issue)->'lines'->1->>'lineNo')::int<>2 THEN
    RAISE EXCEPTION 'Multiple issue lines lost their document order';
  END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',platform_auth,'role','authenticated')::text,true);
  PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
  IF (public.vms_list_part_stock_secure()->>'total')::int<>0
     OR (public.vms_list_part_issue_secure()->>'total')::int<>0
     OR public.vms_get_part_issue_secure(qa_issue) IS NOT NULL
     OR public.vms_get_part_reference_destination_secure('vms_part_issue_line',qa_line) IS NOT NULL THEN
    RAISE EXCEPTION 'Platform selected scope leaked QA inventory';
  END IF;
  blocked := false;
  BEGIN
    PERFORM public.vms_post_part_stock_receipt_secure(jsonb_build_object(
      'part_id',qa_part,'quantity',1,'idempotency_key',gen_random_uuid()));
  EXCEPTION WHEN insufficient_privilege THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Platform selected cross-tenant receipt accepted'; END IF;
  PERFORM set_config('request.headers','{}',true);
  IF (public.vms_list_part_stock_secure()->>'total')::int<2 THEN
    RAISE EXCEPTION 'Platform all omitted QA inventory';
  END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',no_role_auth,'role','authenticated')::text,true);
  blocked := false;
  BEGIN PERFORM public.vms_list_part_stock_secure();
  EXCEPTION WHEN insufficient_privilege THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'No-role actor read inventory'; END IF;
END;
$test$;

RESET ROLE;
ROLLBACK;
