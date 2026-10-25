BEGIN;
DO $test$
DECLARE j jsonb; baseline jsonb; expected numeric; extra_driver uuid; employee uuid; actor uuid;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
  PERFORM set_config('request.headers','{}',true);
  baseline:=app_private.tms_monthly_people_metrics('2026-09-01','2026-09-30');
  IF baseline->>'payroll' IS NOT NULL OR (baseline->>'payroll_covered')::int<>2
    OR (baseline->>'payroll_expected')::int<>7 THEN RAISE EXCEPTION 'Partial payroll reported as total'; END IF;
  SELECT round(sum(o.total_fee)/nullif((baseline->>'driver_count')::numeric,0),2) INTO expected
  FROM public.tms_order o WHERE o.tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9'
    AND o.order_status<>'cancelled'
    AND o.create_time>='2026-09-01'::timestamp AT TIME ZONE 'Asia/Shanghai'
    AND o.create_time<'2026-10-01'::timestamp AT TIME ZONE 'Asia/Shanghai'
    AND EXISTS(SELECT 1 FROM public.tms_waybill w WHERE w.order_id=o.id AND w.tenant_id=o.tenant_id AND w.status<>'cancelled');
  IF (baseline->>'driver_revenue')::numeric IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Assigned revenue mismatch'; END IF;
  PERFORM set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
  IF app_private.tms_monthly_people_metrics('2026-09-01','2026-09-30') IS DISTINCT FROM baseline THEN
    RAISE EXCEPTION 'Forged header affected human metrics'; END IF;
  UPDATE public.mdm_driver SET enabled=false
  WHERE tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9'
    AND id NOT IN ('a9fc0003-1023-4620-9220-000000000001','a9fc0003-1023-4620-9220-000000000002');
  j:=app_private.tms_monthly_people_metrics('2026-09-01','2026-09-30');
  IF (j->>'payroll')::numeric<>17000 THEN RAISE EXCEPTION 'Complete payroll amount mismatch'; END IF;
  SELECT employee_id INTO employee FROM public.mdm_driver WHERE id='a9fc0003-1023-4620-9220-000000000001';
  SELECT id INTO STRICT extra_driver FROM public.mdm_driver
  WHERE tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9' AND NOT enabled LIMIT 1;
  BEGIN
    UPDATE public.mdm_driver SET employee_id=employee,enabled=true WHERE id=extra_driver;
    RAISE EXCEPTION 'Duplicate employee link accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  j:=app_private.tms_monthly_people_metrics('2026-09-01','2026-09-30');
  IF (j->>'payroll')::numeric<>17000 OR (j->>'payroll_expected')::int<>2 THEN
    RAISE EXCEPTION 'Duplicate employee counted twice'; END IF;
  j:=app_private.tms_monthly_people_metrics('2026-09-01','2026-10-24');
  IF (j->>'payroll')::numeric IS DISTINCT FROM 34000::numeric THEN RAISE EXCEPTION 'Two-month payroll amount mismatch'; END IF;
  -- Isolate the missing-month case from the persistent October workflow fixture.
  -- The outer transaction rolls this status change back.
  UPDATE public.fms_payroll_run SET status='draft'
  WHERE tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9' AND payroll_month='2026-10-01';
  j:=app_private.tms_monthly_people_metrics('2026-09-01','2026-10-24');
  IF j->>'payroll' IS NOT NULL THEN RAISE EXCEPTION 'Missing payroll month treated as complete'; END IF;
  SELECT auth_user_id INTO STRICT actor FROM public.sys_user WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  PERFORM set_config('request.headers','{}',true);
  j:=app_private.tms_monthly_people_metrics('2026-09-01','2026-09-30');
  IF (j->>'payroll_expected')::int<>3 OR j->>'payroll' IS NOT NULL THEN RAISE EXCEPTION 'Platform-all coverage mismatch'; END IF;
  PERFORM set_config('request.headers','{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}',true);
  j:=app_private.tms_monthly_people_metrics('2026-09-01','2026-09-30');
  IF (j->>'payroll')::numeric<>17000 THEN RAISE EXCEPTION 'Platform-selected payroll mismatch'; END IF;
  PERFORM set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
  j:=app_private.tms_monthly_people_metrics('2026-09-01','2026-09-30');
  IF (j->>'payroll_expected')::int<>1 OR j->>'payroll' IS NOT NULL THEN RAISE EXCEPTION 'Selected foreign coverage mismatch'; END IF;
  IF has_function_privilege('authenticated','app_private.tms_monthly_people_metrics(date,date)','EXECUTE') THEN
    RAISE EXCEPTION 'Internal aggregation directly callable'; END IF;
END $test$;
ROLLBACK;
