BEGIN;

DO $test$
DECLARE
  qa_tenant uuid := '7529f951-938e-4e2c-ac0d-316c136ae1f9';
  qa_rule_ids uuid[] := ARRAY[
    '27f645d6-5c4b-4263-9607-5857eb0e9c9c'::uuid,
    '63352b5c-519b-486d-bcaa-9dc11a41e8c5'::uuid
  ];
  actor record;
  other_actor record;
  test_driver uuid;
  test_rule uuid;
  test_revision uuid;
  result jsonb;
  denied boolean := false;
BEGIN
  IF has_function_privilege('anon',
      'public.tms_confirm_driver_commission_revision_secure(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous role can confirm driver commission';
  END IF;
  IF (SELECT count(*) FROM public.tms_driver_commission_rule
      WHERE id = ANY(qa_rule_ids)) <> 2 THEN
    RAISE EXCEPTION 'Two commission QA rules are required';
  END IF;

  -- Existing QA rules have no linked login account: no delivery may be claimed.
  INSERT INTO public.tms_driver_commission_revision(
    tenant_id, rule_id, version_no, event_type, snapshot, actor_user_id)
  SELECT tenant_id, id, version_no + 1000, 'revised',
    to_jsonb(r) - 'tenant_id', updated_by
  FROM public.tms_driver_commission_rule r
  WHERE id = ANY(qa_rule_ids);
  IF (SELECT count(*) FROM public.tms_driver_commission_revision
      WHERE rule_id = ANY(qa_rule_ids) AND version_no >= 1000
        AND recipient_user_id IS NULL AND notified_at IS NULL) <> 2 THEN
    RAISE EXCEPTION 'Unlinked driver revisions falsely claim delivery';
  END IF;

  -- Select an existing employee account with Driver View and Confirm grants.
  FOR actor IN
    SELECT id, auth_user_id, hr_employee_id FROM public.sys_user
    WHERE tenant_id = qa_tenant AND auth_user_id IS NOT NULL
      AND hr_employee_id IS NOT NULL
  LOOP
    PERFORM set_config('request.jwt.claim.sub', actor.auth_user_id::text, true);
    PERFORM set_config('request.jwt.claims',
      jsonb_build_object('sub', actor.auth_user_id,
        'role', 'authenticated')::text, true);
    PERFORM set_config('request.headers', '{}', true);
    EXIT WHEN app_private.has_permission('TmsDriver:View')
      AND app_private.has_permission('TmsDriver:ConfirmCommission');
  END LOOP;
  IF NOT app_private.has_permission('TmsDriver:ConfirmCommission') THEN
    RAISE EXCEPTION 'Driver confirmation test account is unavailable';
  END IF;

  SELECT id INTO test_driver FROM public.mdm_driver
  WHERE tenant_id = qa_tenant ORDER BY id LIMIT 1;
  UPDATE public.mdm_driver SET employee_id = actor.hr_employee_id
  WHERE id = test_driver;
  INSERT INTO public.tms_driver_commission_rule(
    tenant_id, driver_id, rule_name, vehicle_type_profile_id,
    origin, destination, direction, effective_from, method, rate,
    enabled, created_by, updated_by)
  SELECT qa_tenant, test_driver, 'QA 提成确认回滚测试',
    vehicle_type_profile_id, 'A', 'B', 'forward', current_date,
    'fixed_per_trip', 100, true, actor.id, actor.id
  FROM public.tms_driver_commission_rule LIMIT 1
  RETURNING id INTO test_rule;
  INSERT INTO public.tms_driver_commission_revision(
    tenant_id, rule_id, version_no, event_type, snapshot, actor_user_id)
  VALUES (qa_tenant, test_rule, 1, 'created', '{}'::jsonb, actor.id)
  RETURNING id INTO test_revision;

  IF NOT EXISTS (SELECT 1 FROM public.tms_driver_commission_revision
      WHERE id = test_revision AND recipient_user_id = actor.id
        AND notified_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Linked driver was not marked notified';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sys_notification
      WHERE source_type = 'tms_driver_commission_revision'
        AND source_id = test_revision AND recipient_user_id = actor.id
        AND tenant_id = qa_tenant) THEN
    RAISE EXCEPTION 'Linked driver did not receive a site notification';
  END IF;
  result := public.tms_list_driver_commission_revisions_secure(test_rule);
  IF result #>> '{records,0,notificationStatus}' <> 'notified'
      OR result #>> '{records,0,canConfirm}' <> 'true' THEN
    RAISE EXCEPTION 'Recipient cannot see a confirmable revision';
  END IF;
  PERFORM public.tms_confirm_driver_commission_revision_secure(test_revision);
  result := public.tms_list_driver_commission_revisions_secure(test_rule);
  IF result #>> '{records,0,notificationStatus}' <> 'confirmed' THEN
    RAISE EXCEPTION 'Confirmation state was not persisted';
  END IF;

  SELECT id, auth_user_id INTO other_actor FROM public.sys_user
  WHERE tenant_id = qa_tenant AND auth_user_id IS NOT NULL
    AND id <> actor.id LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub',
    other_actor.auth_user_id::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', other_actor.auth_user_id,
      'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.tms_confirm_driver_commission_revision_secure(test_revision);
  EXCEPTION WHEN SQLSTATE '42501' THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Another account confirmed this rule'; END IF;

  PERFORM set_config('request.jwt.claim.sub', actor.auth_user_id::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', actor.auth_user_id,
      'role', 'authenticated')::text, true);
  UPDATE public.tms_driver_commission_rule SET version_no = 2
  WHERE id = test_rule;
  denied := false;
  BEGIN
    PERFORM public.tms_confirm_driver_commission_revision_secure(test_revision);
  EXCEPTION WHEN SQLSTATE '22023' THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Stale revision was confirmed'; END IF;
END $test$;

DO $save_test$
DECLARE
  platform_user uuid;
  old_version integer;
  current_version integer;
  rules jsonb;
  revisions jsonb;
BEGIN
  SELECT auth_user_id INTO platform_user FROM public.sys_user
  WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL
  LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub',
    platform_user::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', platform_user,
      'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', '{}', true);
  SELECT version_no INTO old_version
  FROM public.tms_driver_commission_rule
  WHERE id = '27f645d6-5c4b-4263-9607-5857eb0e9c9c';
  PERFORM public.tms_save_driver_commission_rule_secure(
    '27f645d6-5c4b-4263-9607-5857eb0e9c9c',
    '{"remark":"QA 事务测试提成变更"}'::jsonb);
  SELECT version_no INTO current_version
  FROM public.tms_driver_commission_rule
  WHERE id = '27f645d6-5c4b-4263-9607-5857eb0e9c9c';
  IF current_version <> old_version + 1 THEN
    RAISE EXCEPTION 'Rule save did not create the next version';
  END IF;
  rules := public.tms_list_driver_commission_rules_secure(
    '2fcd4c03-5dbc-4c6d-8d7b-94963635b1b7');
  revisions := public.tms_list_driver_commission_revisions_secure(
    '27f645d6-5c4b-4263-9607-5857eb0e9c9c');
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(rules->'records') item
      WHERE item->>'id' = '27f645d6-5c4b-4263-9607-5857eb0e9c9c'
        AND item->>'notificationStatus' = 'unlinked')
      OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(revisions->'records') item
        WHERE (item->>'versionNo')::integer = current_version
          AND item->>'notificationStatus' = 'unlinked') THEN
    RAISE EXCEPTION 'Saved rule notification state is inconsistent';
  END IF;
END $save_test$;

DO $batch_test$
DECLARE
  qa_tenant uuid := '7529f951-938e-4e2c-ac0d-316c136ae1f9';
  platform_user uuid;
  recipient record;
  test_driver uuid;
  test_rule uuid;
  test_revision uuid;
  first_revision uuid;
  outcome jsonb;
  item integer;
  denied boolean := false;
BEGIN
  SELECT auth_user_id INTO platform_user FROM public.sys_user
  WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub', platform_user::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', platform_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', '{}', true);
  outcome := public.tms_notify_driver_commission_rules_secure(
    '2fcd4c03-5dbc-4c6d-8d7b-94963635b1b7');
  IF outcome->>'total' <> '2' OR outcome->>'notified' <> '0'
      OR outcome->>'unlinked' <> '2' THEN
    RAISE EXCEPTION 'Unlinked drivers were counted as notified: %', outcome;
  END IF;

  FOR recipient IN
    SELECT id, auth_user_id, hr_employee_id FROM public.sys_user
    WHERE tenant_id = qa_tenant AND auth_user_id IS NOT NULL
      AND hr_employee_id IS NOT NULL
  LOOP
    PERFORM set_config('request.jwt.claim.sub',
      recipient.auth_user_id::text, true);
    PERFORM set_config('request.jwt.claims',
      jsonb_build_object('sub', recipient.auth_user_id,
        'role', 'authenticated')::text, true);
    EXIT WHEN app_private.has_permission('TmsDriver:ConfirmCommission')
      AND app_private.has_permission('TmsDriver:NotifyCommission');
  END LOOP;
  IF NOT app_private.has_permission('TmsDriver:NotifyCommission') THEN
    RAISE EXCEPTION 'Commission notify test account is unavailable';
  END IF;
  PERFORM set_config('request.headers',
    '{"x-art-tenant-scope":"2824c2b5-2774-4781-b995-f55e8bcee920"}', true);
  BEGIN
    PERFORM public.tms_notify_driver_commission_rules_secure(
      '2fcd4c03-5dbc-4c6d-8d7b-94963635b1b7');
  EXCEPTION WHEN SQLSTATE '42501' THEN denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'Forged tenant header enabled cross-tenant notify';
  END IF;
  PERFORM set_config('request.headers', '{}', true);

  -- The preceding confirmation case used the first QA driver in this transaction.
  UPDATE public.mdm_driver SET employee_id = NULL
  WHERE id = (SELECT id FROM public.mdm_driver
    WHERE tenant_id = qa_tenant ORDER BY id LIMIT 1);
  SELECT id INTO test_driver FROM public.mdm_driver
  WHERE tenant_id = qa_tenant ORDER BY id OFFSET 1 LIMIT 1;
  UPDATE public.mdm_driver SET employee_id = recipient.hr_employee_id
  WHERE id = test_driver;
  FOR item IN 1..2 LOOP
    INSERT INTO public.tms_driver_commission_rule(
      tenant_id, driver_id, rule_name, vehicle_type_profile_id,
      origin, destination, direction, effective_from, method, rate,
      enabled, created_by, updated_by)
    SELECT qa_tenant, test_driver, 'QA 批量通知回滚' || item,
      vehicle_type_profile_id, 'A', 'B', 'forward', current_date,
      'fixed_per_trip', 100, true, recipient.id, recipient.id
    FROM public.tms_driver_commission_rule LIMIT 1
    RETURNING id INTO test_rule;
    INSERT INTO public.tms_driver_commission_revision(
      tenant_id, rule_id, version_no, event_type, snapshot, actor_user_id)
    VALUES (qa_tenant, test_rule, 1, 'created', '{}'::jsonb, recipient.id)
    RETURNING id INTO test_revision;
    IF item = 1 THEN first_revision := test_revision; END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claim.sub', platform_user::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', platform_user, 'role', 'authenticated')::text, true);
  outcome := public.tms_notify_driver_commission_rules_secure(test_driver);
  IF outcome->>'total' <> '2' OR outcome->>'notified' <> '2' THEN
    RAISE EXCEPTION 'Two linked rules were not notified: %', outcome;
  END IF;
  outcome := public.tms_notify_driver_commission_rules_secure(test_driver);
  IF outcome->>'notified' <> '2'
      OR (SELECT count(*) FROM public.sys_notification n
          JOIN public.tms_driver_commission_revision revision
            ON revision.id = n.source_id
          JOIN public.tms_driver_commission_rule rule
            ON rule.id = revision.rule_id
          WHERE rule.driver_id = test_driver
            AND rule.rule_name LIKE 'QA 批量通知回滚%') <> 2 THEN
    RAISE EXCEPTION 'Resend produced missing or duplicate notifications';
  END IF;
  PERFORM set_config('request.jwt.claim.sub',
    recipient.auth_user_id::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', recipient.auth_user_id,
      'role', 'authenticated')::text, true);
  PERFORM public.tms_confirm_driver_commission_revision_secure(first_revision);
  PERFORM set_config('request.jwt.claim.sub', platform_user::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', platform_user, 'role', 'authenticated')::text, true);
  outcome := public.tms_notify_driver_commission_rules_secure(test_driver);
  IF outcome->>'notified' <> '1' OR outcome->>'confirmed' <> '1' THEN
    RAISE EXCEPTION 'Confirmed rule was resent: %', outcome;
  END IF;
END $batch_test$;

ROLLBACK;
