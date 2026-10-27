BEGIN;

DO $test$
DECLARE
  platform_uid uuid := '0a872664-874c-447d-a256-d0dbdca6ed45';
  ordinary_uid uuid := 'ab881b32-87d4-4dce-9014-ce488b8069df';
  own_tenant uuid := '7529f951-938e-4e2c-ac0d-316c136ae1f9';
  other_tenant uuid := '2824c2b5-2774-4781-b995-f55e8bcee920';
  qa_vehicle_id uuid := 'a9fc0004-1023-4620-9220-000000000001';
  context_name text;
  scoped_uid uuid;
  selected_tenant uuid;
  rows jsonb;
  sample jsonb;
  winner record;
  legacy_id uuid;
  fallback_insurance_id uuid;
  certificate_id uuid;
  original_valid_from date;
  responsible_id uuid;
  other_subject_id uuid;
  new_id uuid;
  renewed_id uuid;
  generated_event_count integer;
BEGIN
  IF to_regprocedure('app_private.vms_effective_vehicle_document(uuid,uuid,text)') IS NULL
    OR to_regprocedure('app_private.vms_reconcile_certificate_notification_subjects()') IS NULL
    OR to_regprocedure('app_private.vms_vehicle_certificate_risk_json(uuid,uuid)') IS NULL
  THEN RAISE EXCEPTION 'Unified VMS reminder functions unavailable'; END IF;

  SELECT id,responsible_user_id,valid_from
    INTO certificate_id,responsible_id,original_valid_from
  FROM public.vehicle_certificate
  WHERE tenant_id=own_tenant AND subject_type='vehicle' AND subject_id=qa_vehicle_id
    AND certificate_type='compulsory_insurance' LIMIT 1;
  SELECT id INTO legacy_id FROM public.vehicle_insurance
  WHERE tenant_id=own_tenant AND vehicle_id=qa_vehicle_id LIMIT 1;
  IF certificate_id IS NULL OR legacy_id IS NULL OR responsible_id IS NULL
  THEN RAISE EXCEPTION 'Unified reminder fixtures unavailable'; END IF;

  SELECT * INTO winner FROM app_private.vms_effective_vehicle_document(
    own_tenant,qa_vehicle_id,'compulsory_insurance');
  IF winner.source_type<>'vehicle_certificate' OR winner.source_id<>certificate_id
    OR winner.expires_on<>'2026-11-07'::date
  THEN RAISE EXCEPTION 'Current certificate did not outrank contradictory legacy insurance'; END IF;
  IF EXISTS(
    SELECT 1 FROM public.sys_notification_subject s
    WHERE s.business_type='vehicle_insurance' AND s.business_id=legacy_id
      AND s.subject_key='compulsory' AND s.status='active'
  ) THEN RAISE EXCEPTION 'Contradictory legacy alert remained active'; END IF;
  IF EXISTS(
    SELECT 1 FROM public.sys_notification_subject s
    WHERE s.business_type IN ('vehicle_certificate','vehicle_insurance','vehicle_inspection')
      AND s.status='active' AND NOT app_private.vms_notification_subject_is_current(s)
  ) THEN RAISE EXCEPTION 'Non-canonical VMS alert remained active'; END IF;
  SELECT id INTO other_subject_id FROM public.sys_notification_subject s
  WHERE s.tenant_id='028e6a68-a9db-4055-974c-1e05bfe94b0f'::uuid
    AND s.business_type IN ('vehicle_certificate','vehicle_insurance','vehicle_inspection')
    AND s.status='active' AND app_private.vms_notification_subject_is_current(s)
  LIMIT 1;
  IF other_subject_id IS NULL THEN RAISE EXCEPTION 'Other-tenant alert fixture unavailable'; END IF;
  UPDATE public.sys_notification_subject SET status='resolved' WHERE id=other_subject_id;
  PERFORM set_config('request.jwt.claim.sub',ordinary_uid::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'sub',ordinary_uid,'role','authenticated')::text,true);
  PERFORM set_config('request.headers','{}',true);
  PERFORM app_private.vms_reconcile_certificate_notification_subjects();
  IF (SELECT status FROM public.sys_notification_subject WHERE id=other_subject_id)<>'resolved'
  THEN RAISE EXCEPTION 'Ordinary reconciliation wrote another tenant'; END IF;
  PERFORM set_config('request.jwt.claim.sub',platform_uid::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'sub',platform_uid,'role','authenticated')::text,true);
  PERFORM app_private.vms_reconcile_certificate_notification_subjects();
  IF (SELECT status FROM public.sys_notification_subject WHERE id=other_subject_id)<>'active'
  THEN RAISE EXCEPTION 'Platform-all reconciliation failed to restore current alert'; END IF;

  -- A future-starting certificate must not suppress the current legacy fallback.
  UPDATE public.vehicle_certificate
    SET valid_from=(now() at time zone 'Asia/Shanghai')::date+1
  WHERE id=certificate_id;
  PERFORM app_private.vms_reconcile_certificate_notification_subjects();
  SELECT * INTO winner FROM app_private.vms_effective_vehicle_document(
    own_tenant,qa_vehicle_id,'compulsory_insurance');
  IF winner.source_type<>'vehicle_insurance' OR winner.source_id<>legacy_id
    OR NOT EXISTS(
      SELECT 1 FROM public.sys_notification_subject
      WHERE business_type='vehicle_insurance' AND business_id=legacy_id
        AND subject_key='compulsory' AND status='active'
    )
  THEN RAISE EXCEPTION 'Future certificate blocked valid legacy fallback'; END IF;
  UPDATE public.vehicle_certificate SET valid_from=original_valid_from
  WHERE id=certificate_id;
  PERFORM app_private.vms_reconcile_certificate_notification_subjects();
  IF EXISTS(
    SELECT 1 FROM public.sys_notification_subject
    WHERE business_type='vehicle_insurance' AND business_id=legacy_id
      AND subject_key='compulsory' AND status='active'
  ) THEN RAISE EXCEPTION 'Current certificate did not reclaim alert ownership'; END IF;

  FOREACH context_name IN ARRAY ARRAY[
    'platform_all','platform_selected','ordinary_own','ordinary_forged'
  ] LOOP
    scoped_uid:=CASE WHEN context_name LIKE 'platform%' THEN platform_uid ELSE ordinary_uid END;
    selected_tenant:=CASE
      WHEN context_name='platform_selected' THEN own_tenant
      WHEN context_name='ordinary_forged' THEN other_tenant
      ELSE NULL END;
    PERFORM set_config('request.jwt.claim.sub',scoped_uid::text,true);
    PERFORM set_config('request.jwt.claims',jsonb_build_object(
      'sub',scoped_uid,'role','authenticated')::text,true);
    PERFORM set_config('request.headers',CASE WHEN selected_tenant IS NULL THEN '{}'
      ELSE jsonb_build_object('x-art-tenant-scope',selected_tenant)::text END,true);
    rows:=public.vms_list_vehicle_archives_secure(p_from:=0,p_to:=99);
    IF jsonb_array_length(rows->'records')=0
      OR EXISTS(
        SELECT 1 FROM jsonb_array_elements(rows->'records') j
        JOIN public.mdm_vehicle v ON v.id=(j->>'id')::uuid
        WHERE context_name<>'platform_all' AND v.tenant_id<>own_tenant
      )
    THEN RAISE EXCEPTION 'Vehicle risk list crossed tenant scope: %',context_name; END IF;
    SELECT j INTO sample FROM jsonb_array_elements(rows->'records') j
    WHERE j->>'id'=qa_vehicle_id::text;
    IF sample IS NULL
      OR sample->>'certificateRisk'<>'renewal_due'
      OR sample->>'certificateRiskType'<>'compulsory_insurance'
      OR sample->>'certificateRiskExpiresOn'<>'2026-11-07'
    THEN RAISE EXCEPTION 'Vehicle risk summary missing in %',context_name; END IF;
    IF context_name='platform_all' AND (
      SELECT count(DISTINCT v.tenant_id) FROM jsonb_array_elements(rows->'records') j
      JOIN public.mdm_vehicle v ON v.id=(j->>'id')::uuid
    )<2 THEN RAISE EXCEPTION 'Platform-all lost cross-tenant read'; END IF;
  END LOOP;

  PERFORM set_config('request.jwt.claim.sub',platform_uid::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object(
    'sub',platform_uid,'role','authenticated')::text,true);
  PERFORM set_config('request.headers','{}',true);
  SELECT id INTO fallback_insurance_id FROM public.vehicle_insurance
  WHERE tenant_id=own_tenant
    AND vehicle_id='a9fc0004-1023-4620-9220-000000000002'::uuid LIMIT 1;
  IF fallback_insurance_id IS NULL THEN
    RAISE EXCEPTION 'Legacy fallback fixture unavailable';
  END IF;
  UPDATE public.vehicle_insurance
    SET compulsory_expire_date=(now() at time zone 'Asia/Shanghai')::date+12
  WHERE id=fallback_insurance_id;
  IF NOT EXISTS(
    SELECT 1 FROM public.sys_notification_subject s
    WHERE s.business_type='vehicle_insurance'
      AND s.business_id=fallback_insurance_id AND s.subject_key='compulsory'
      AND s.status='active'
      AND (s.due_at at time zone 'Asia/Shanghai')::date
        =(now() at time zone 'Asia/Shanghai')::date+12
  ) THEN RAISE EXCEPTION 'Legacy fallback change did not reach unified engine'; END IF;

  new_id:=(public.vms_save_certificate_secure(NULL,jsonb_build_object(
    'subject_type','vehicle','subject_id',qa_vehicle_id,
    'certificate_type','vehicle_tax','certificate_no','QA-ROLLBACK-TAX-EXPIRED',
    'issue_date',current_date-120,'valid_from',current_date-120,
    'expires_on',current_date-1,'responsible_user_id',responsible_id,
    'attachments','[]'::jsonb
  ))->>'id')::uuid;
  IF new_id IS NULL THEN RAISE EXCEPTION 'Synthetic certificate not saved'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.sys_notification_subject
    WHERE business_type='vehicle_certificate' AND business_id=new_id
      AND status='active' AND owner_user_id=responsible_id
  ) THEN RAISE EXCEPTION 'Responsible person missing from active warning'; END IF;
  PERFORM app_private.process_notification_reminders(1000);
  SELECT count(*) INTO generated_event_count FROM public.sys_notification_event e
  JOIN public.sys_notification_subject s ON s.id=e.subject_id
  WHERE s.business_type='vehicle_certificate' AND s.business_id=new_id;
  IF generated_event_count=0 THEN
    RAISE EXCEPTION 'Synthetic certificate warning event missing';
  END IF;
  -- The hourly engine schedules today's notice for 09:00 Asia/Shanghai.
  -- Bring only this rollback fixture forward so delivery can be checked at any test hour.
  UPDATE public.sys_notification_event e
  SET scheduled_at=now()-interval '1 minute'
  FROM public.sys_notification_subject s
  WHERE s.id=e.subject_id AND s.business_type='vehicle_certificate'
    AND s.business_id=new_id;
  PERFORM app_private.process_notification_reminders(1000);
  IF NOT EXISTS(
    SELECT 1 FROM public.sys_notification_delivery d
    JOIN public.sys_notification_event e ON e.id=d.event_id
    JOIN public.sys_notification_subject s ON s.id=e.subject_id
    WHERE s.business_type='vehicle_certificate' AND s.business_id=new_id
      AND d.recipient_user_id=responsible_id
  ) THEN RAISE EXCEPTION 'Warning was not delivered to named responsible user'; END IF;
  renewed_id:=(public.vms_save_certificate_secure(NULL,jsonb_build_object(
    'subject_type','vehicle','subject_id',qa_vehicle_id,
    'certificate_type','vehicle_tax','certificate_no','QA-ROLLBACK-TAX-RENEWED',
    'issue_date',current_date,'valid_from',current_date,
    'expires_on',current_date+365,'responsible_user_id',responsible_id,
    'renewal_of_id',new_id,'attachments','[]'::jsonb
  ))->>'id')::uuid;
  PERFORM public.vms_mark_certificate_handled_secure(new_id);
  IF renewed_id IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.vehicle_certificate
    WHERE id=new_id AND handled_at IS NOT NULL
  ) OR NOT EXISTS(
    SELECT 1 FROM public.vehicle_certificate
    WHERE id=renewed_id AND renewal_of_id=new_id
  ) THEN RAISE EXCEPTION 'Renewal did not close old warning with history intact'; END IF;
  IF EXISTS(
    SELECT 1 FROM public.sys_notification_subject
    WHERE business_type='vehicle_certificate' AND business_id=new_id AND status='active'
  ) THEN RAISE EXCEPTION 'Handled warning remained active'; END IF;
  PERFORM app_private.process_notification_reminders(1000);
  IF (SELECT count(*) FROM public.sys_notification_event e
      JOIN public.sys_notification_subject s ON s.id=e.subject_id
      WHERE s.business_type='vehicle_certificate' AND s.business_id=new_id)
     <>generated_event_count
  THEN RAISE EXCEPTION 'Handled warning generated another event'; END IF;
END;
$test$;

ROLLBACK;
