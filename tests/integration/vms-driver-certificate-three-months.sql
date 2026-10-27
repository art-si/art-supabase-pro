BEGIN;

DO $test$
DECLARE
  platform_uid uuid := '0a872664-874c-447d-a256-d0dbdca6ed45';
  ordinary_uid uuid := 'ab881b32-87d4-4dce-9014-ce488b8069df';
  platform_tenant uuid := '028e6a68-a9db-4055-974c-1e05bfe94b0f';
  ordinary_tenant uuid := '7529f951-938e-4e2c-ac0d-316c136ae1f9';
  other_tenant uuid := '2824c2b5-2774-4781-b995-f55e8bcee920';
  responsible_id uuid := '51760251-629d-4561-aeb8-0fbe62352494';
  certificate_a uuid := 'a5cd2eda-4133-45f0-a47b-7bafed9ce957';
  certificate_b uuid := 'b313b81a-0dc0-4803-868b-c3f4ad5c3265';
  first_event uuid;
  second_event uuid;
  in_flight_event uuid;
  in_flight_delivery uuid;
  non_certificate_event uuid;
  non_certificate_delivery uuid;
  channel_test_delivery uuid;
  result jsonb;
BEGIN
  IF app_private.notification_rule_start_date('2027-05-31', 0, 3) <> '2027-02-28'
    OR app_private.notification_rule_start_date('2028-05-31', 0, 3) <> '2028-02-29'
  THEN RAISE EXCEPTION 'Calendar-month reminder calculation is incorrect'; END IF;

  IF (SELECT count(*) FROM public.sys_notification_rule r
      JOIN public.sys_notification_scenario s ON s.id = r.scenario_id
      WHERE s.scenario_code = 'vms_driver_certificate_expiry' AND r.lead_months = 3) <> 8
    OR EXISTS (SELECT 1 FROM public.sys_notification_rule r
      JOIN public.sys_notification_scenario s ON s.id = r.scenario_id
      WHERE s.scenario_code = 'vms_certificate_expiry' AND r.lead_months IS NOT NULL)
  THEN RAISE EXCEPTION 'Driver and vehicle reminder rules were mixed'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.vehicle_certificate certificate
    JOIN public.sys_notification_subject subject
      ON subject.business_type = 'vehicle_certificate'
      AND subject.business_id = certificate.id
      AND subject.tenant_id = certificate.tenant_id
    JOIN public.sys_notification_scenario scenario ON scenario.id = subject.scenario_id
    WHERE (subject.due_at AT TIME ZONE 'Asia/Shanghai')::date
        IS DISTINCT FROM certificate.expires_on
      OR subject.owner_user_id IS DISTINCT FROM certificate.responsible_user_id
      OR (certificate.subject_type = 'driver'
        AND scenario.scenario_code <> 'vms_driver_certificate_expiry')
  ) THEN RAISE EXCEPTION 'Certificate subject differs from its source record'; END IF;

  PERFORM set_config('request.jwt.claim.sub', platform_uid::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', platform_uid, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', '{}', true);
  IF app_private.notification_target_tenant(platform_tenant) <> platform_tenant
    OR public.get_notification_dispatch_scope() <> platform_tenant
  THEN RAISE EXCEPTION 'Platform-all reminder target changed'; END IF;
  PERFORM set_config('request.headers',
    jsonb_build_object('x-notification-target-tenant', other_tenant)::text, true);
  IF public.get_notification_dispatch_scope() <> other_tenant
  THEN RAISE EXCEPTION 'Platform-all explicit dispatch target changed'; END IF;
  PERFORM set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope', platform_tenant)::text, true);
  IF app_private.current_read_tenant_id() <> platform_tenant
    OR public.get_notification_dispatch_scope() <> platform_tenant
    OR public.get_notification_reminder_workspace(platform_tenant)->'tenant'->>'id'
      <> platform_tenant::text
  THEN RAISE EXCEPTION 'Selected platform home tenant was not readable'; END IF;

  PERFORM set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope', ordinary_tenant)::text, true);
  IF app_private.notification_target_tenant(NULL) <> ordinary_tenant
    OR public.get_notification_dispatch_scope() <> ordinary_tenant
  THEN RAISE EXCEPTION 'Platform-selected reminder scope changed'; END IF;
  BEGIN
    PERFORM app_private.notification_target_tenant(other_tenant);
    RAISE EXCEPTION 'Platform-selected cross-tenant target was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope', ordinary_tenant,
      'x-notification-target-tenant', other_tenant)::text, true);
  BEGIN
    PERFORM public.get_notification_dispatch_scope();
    RAISE EXCEPTION 'Platform-selected cross-tenant dispatch was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM set_config('request.jwt.claim.sub', ordinary_uid::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', ordinary_uid, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope', other_tenant)::text, true);
  IF app_private.notification_target_tenant(ordinary_tenant) <> ordinary_tenant
  THEN RAISE EXCEPTION 'Forged header changed ordinary tenant'; END IF;
  BEGIN
    PERFORM app_private.notification_target_tenant(other_tenant);
    RAISE EXCEPTION 'Ordinary cross-tenant target was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM set_config('request.jwt.claim.sub', platform_uid::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', platform_uid, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', '{}', true);

  UPDATE public.vehicle_certificate
    SET expires_on = ((now() AT TIME ZONE 'Asia/Shanghai')::date + interval '2 months')::date
    WHERE id IN (certificate_a, certificate_b);
  PERFORM app_private.vms_sync_certificate_subject(certificate_a);
  PERFORM app_private.vms_sync_certificate_subject(certificate_b);
  result := public.vms_list_certificates_secure(p_from := 0, p_to := 99,
    p_subject_type := 'driver');
  IF (SELECT count(*) FROM jsonb_array_elements(result->'records') row
      WHERE row->>'id' IN (certificate_a::text, certificate_b::text)
        AND row->>'status' = 'due_3_months') <> 2
  THEN RAISE EXCEPTION 'Two QA driver certificates did not enter 3-month warning'; END IF;

  PERFORM app_private.process_notification_reminders_for_tenant(platform_tenant, 100);
  SELECT e.id INTO first_event FROM public.sys_notification_event e
    JOIN public.sys_notification_subject s ON s.id = e.subject_id
    JOIN public.sys_notification_rule r ON r.id = e.rule_id
    WHERE s.business_id = certificate_a AND r.lead_months = 3
    ORDER BY e.notification_revision DESC LIMIT 1;
  SELECT e.id INTO second_event FROM public.sys_notification_event e
    JOIN public.sys_notification_subject s ON s.id = e.subject_id
    JOIN public.sys_notification_rule r ON r.id = e.rule_id
    WHERE s.business_id = certificate_b AND r.lead_months = 3
    ORDER BY e.notification_revision DESC LIMIT 1;
  IF first_event IS NULL OR second_event IS NULL
  THEN RAISE EXCEPTION 'Driver 3-month events were not generated'; END IF;

  UPDATE public.sys_notification_event SET scheduled_at = now() - interval '1 minute'
    WHERE id IN (first_event, second_event);
  PERFORM app_private.process_notification_reminders_for_tenant(platform_tenant, 100);
  IF (SELECT count(*) FROM public.sys_notification_delivery
      WHERE event_id IN (first_event, second_event) AND recipient_user_id = responsible_id
        AND channel_code = 'in_app' AND status = 'delivered') <> 2
  THEN RAISE EXCEPTION 'Named certificate owner did not receive both reminders'; END IF;

  UPDATE public.sys_notification_subject SET owner_user_id = NULL
    WHERE business_type = 'vehicle_certificate' AND business_id = certificate_b;
  IF (SELECT status FROM public.sys_notification_event WHERE id = second_event) <> 'delivered'
  THEN RAISE EXCEPTION 'Delivered audit history was changed'; END IF;
  PERFORM app_private.process_notification_reminders(1000);
  IF NOT EXISTS (SELECT 1 FROM public.sys_notification_event e
      JOIN public.sys_notification_subject s ON s.id = e.subject_id
      JOIN public.sys_notification_rule r ON r.id = e.rule_id
      WHERE s.business_id = certificate_b AND r.lead_months = 3
        AND e.notification_revision > (SELECT notification_revision
          FROM public.sys_notification_event WHERE id = second_event))
  THEN RAISE EXCEPTION 'Owner-only change did not create a new event version'; END IF;

  UPDATE public.vehicle_certificate SET handled_at = now(), handled_by = responsible_id
    WHERE id = certificate_a;
  PERFORM app_private.vms_sync_certificate_subject(certificate_a);
  UPDATE public.sys_notification_delivery SET status = 'pending'
    WHERE event_id = first_event AND channel_code = 'in_app';
  PERFORM app_private.process_notification_reminders_for_tenant(platform_tenant, 100);
  IF EXISTS (SELECT 1 FROM public.sys_notification_delivery
      WHERE event_id = first_event AND status IN ('pending', 'failed', 'processing'))
  THEN RAISE EXCEPTION 'Handled certificate queued an old in-app notification'; END IF;

  INSERT INTO public.sys_notification_delivery (
    tenant_id, event_id, recipient_user_id, channel_code, title, content,
    route_path, route_query, status, create_by, update_by
  ) VALUES (
    platform_tenant, first_event, responsible_id, 'sms', 'QA stale', 'QA stale',
    '/vms/certificate-center', '{}'::jsonb, 'pending', 'qa', 'qa'
  );
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  result := public.claim_notification_deliveries(100, platform_tenant);
  IF EXISTS (SELECT 1 FROM public.sys_notification_delivery
      WHERE event_id = first_event AND channel_code = 'sms' AND status <> 'skipped')
  THEN RAISE EXCEPTION 'External claim accepted a handled certificate'; END IF;

  SELECT event_row.id INTO in_flight_event
  FROM public.sys_notification_event event_row
  JOIN public.sys_notification_subject subject ON subject.id = event_row.subject_id
  JOIN public.sys_notification_rule rule_row ON rule_row.id = event_row.rule_id
  WHERE subject.business_id = certificate_b AND rule_row.lead_months = 3
    AND event_row.notification_revision = subject.notification_revision
  LIMIT 1;
  IF in_flight_event IS NULL
  THEN RAISE EXCEPTION 'Current certificate event unavailable for send check'; END IF;
  INSERT INTO public.sys_notification_delivery (
    tenant_id, event_id, recipient_user_id, channel_code, title, content,
    route_path, route_query, status, create_by, update_by
  ) VALUES (
    platform_tenant, in_flight_event, responsible_id, 'sms', 'QA in flight',
    'QA in flight', '/vms/certificate-center', '{}'::jsonb, 'processing', 'qa', 'qa'
  ) RETURNING id INTO in_flight_delivery;
  UPDATE public.vehicle_certificate SET handled_at = now(), handled_by = responsible_id
    WHERE id = certificate_b;
  PERFORM app_private.vms_sync_certificate_subject(certificate_b);
  IF public.notification_delivery_eligible_secure(in_flight_delivery)
  THEN RAISE EXCEPTION 'Claimed certificate was sent after being handled'; END IF;
  IF (SELECT status FROM public.sys_notification_delivery WHERE id = in_flight_delivery)
      <> 'skipped'
  THEN RAISE EXCEPTION 'Claimed certificate was not marked skipped'; END IF;

  INSERT INTO public.sys_notification_event (
    tenant_id, occurrence_date, scheduled_at, title, content, status, create_by, update_by
  ) VALUES (
    platform_tenant, current_date, now() - interval '1 minute',
    'QA ordinary notice', 'QA ordinary notice', 'pending', 'qa', 'qa'
  ) RETURNING id INTO non_certificate_event;
  UPDATE public.sys_notification_channel_config SET enabled = true
    WHERE tenant_id = platform_tenant AND channel_code = 'sms';
  INSERT INTO public.sys_notification_delivery (
    tenant_id, event_id, recipient_user_id, channel_code, title, content,
    route_path, route_query, status, create_by, update_by
  ) VALUES (
    platform_tenant, non_certificate_event, responsible_id, 'sms',
    'QA ordinary notice', 'QA ordinary notice', '/system/notification-reminder',
    '{}'::jsonb, 'pending', 'qa', 'qa'
  ) RETURNING id INTO non_certificate_delivery;
  result := public.claim_notification_deliveries(100, platform_tenant);
  IF NOT public.notification_delivery_eligible_secure(non_certificate_delivery)
  THEN RAISE EXCEPTION 'Non-certificate pre-send check changed'; END IF;
  INSERT INTO public.sys_notification_delivery (
    tenant_id, recipient_user_id, channel_code, title, content,
    route_path, route_query, status, create_by, update_by
  ) VALUES (
    platform_tenant, responsible_id, 'sms', 'QA channel test', 'QA channel test',
    '/system/notification-reminder', '{}'::jsonb, 'processing', 'qa', 'qa'
  ) RETURNING id INTO channel_test_delivery;
  IF NOT public.notification_delivery_eligible_secure(channel_test_delivery)
  THEN RAISE EXCEPTION 'Eventless channel test was blocked'; END IF;
  IF (SELECT status FROM public.sys_notification_delivery WHERE id = non_certificate_delivery)
      <> 'processing'
    OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(result) job
      WHERE job->>'id' = non_certificate_delivery::text)
  THEN RAISE EXCEPTION 'Non-certificate external delivery changed'; END IF;
END;
$test$;

ROLLBACK;
