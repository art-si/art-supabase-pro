-- Existing two approved transport receivables; every fixture change rolls back.
BEGIN;
DO $test$
DECLARE actor uuid; baseline jsonb; actual jsonb; header jsonb;
BEGIN
  SELECT auth_user_id INTO actor FROM public.sys_user
  WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1;
  IF actor IS NULL THEN RAISE EXCEPTION 'Missing platform test actor'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  PERFORM set_config('request.headers','{}',true);
  actual:=app_private.tms_monthly_receivable_balances('2026-10-23');
  IF (actual->>'receivable')::numeric IS DISTINCT FROM 1350::numeric
    OR (actual->>'overdue')::numeric IS DISTINCT FROM 1350::numeric THEN
    RAISE EXCEPTION 'Expected two approved balances 450 + 900 after receipts';
  END IF;
  -- A prior-month receivable remains in the closing balance.
  UPDATE public.fms_receivable_document SET business_date='2026-09-30'
  WHERE id='8de4c074-5d72-4fef-ae49-6635c1992a40';
  IF app_private.tms_monthly_receivable_balances('2026-10-23') IS DISTINCT FROM actual THEN
    RAISE EXCEPTION 'Prior-month balance was dropped'; END IF;
  baseline:=public.tms_management_report('monthly-overview','2026-10-01','2026-10-23',null,0,1)->'summary';
  IF baseline->'receivable' IS DISTINCT FROM actual->'receivable'
    OR baseline->'overdue' IS DISTINCT FROM actual->'overdue' THEN
    RAISE EXCEPTION 'Monthly report did not expose closing balances'; END IF;
  baseline:=public.tms_management_report('monthly-overview','2026-01-01','2026-10-23',null,0,1)->'summary';
  IF baseline->'receivable' IS DISTINCT FROM actual->'receivable' THEN
    RAISE EXCEPTION 'Year-to-date closing balance was accumulated'; END IF;
  baseline:=public.tms_management_report('monthly-overview','2026-10-01','2026-10-23','报表验收',0,1)->'summary';
  IF baseline ? 'receivable' THEN RAISE EXCEPTION 'Unfiltered balance leaked into keyword report'; END IF;
  PERFORM set_config('request.headers','{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}',true);
  actual:=app_private.tms_monthly_receivable_balances('2026-10-23');
  IF (actual->>'receivable')::numeric IS DISTINCT FROM 0::numeric THEN
    RAISE EXCEPTION 'Selected tenant leaked foreign receivables'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub','ab881b32-87d4-4dce-9014-ce488b8069df','role','authenticated')::text,true);
  PERFORM set_config('request.headers','{}',true);
  baseline:=app_private.tms_monthly_receivable_balances('2026-10-23');
  PERFORM set_config('request.headers','{"x-art-tenant-scope":"2824c2b5-2774-4781-b995-f55e8bcee920"}',true);
  IF app_private.tms_monthly_receivable_balances('2026-10-23') IS DISTINCT FROM baseline THEN
    RAISE EXCEPTION 'Ordinary forged header changed balances'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub','9850d41a-77e9-40a7-b2cb-0ad02ac01440','role','authenticated')::text,true);
  actual:=app_private.tms_monthly_receivable_balances('2026-10-23');
  IF actual->>'receivable' IS NOT NULL OR actual->>'overdue' IS NOT NULL THEN
    RAISE EXCEPTION 'Finance permission missing but balances exposed'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  PERFORM set_config('request.headers','{}',true);
  UPDATE public.fms_receivable_document SET due_date=NULL
  WHERE id='593b7708-b744-44cf-bcb0-5b0521d95ae2';
  actual:=app_private.tms_monthly_receivable_balances('2026-10-23');
  IF actual->>'overdue' IS NOT NULL OR (actual->>'receivable')::numeric IS DISTINCT FROM 1350::numeric THEN
    RAISE EXCEPTION 'Missing due date must hide overdue only'; END IF;
  UPDATE public.fms_receivable_document SET currency_code='USD'
  WHERE id='593b7708-b744-44cf-bcb0-5b0521d95ae2';
  actual:=app_private.tms_monthly_receivable_balances('2026-10-23');
  IF actual->>'receivable' IS NOT NULL OR actual->>'overdue' IS NOT NULL THEN
    RAISE EXCEPTION 'Mixed currencies aggregated as CNY'; END IF;
  IF has_function_privilege('authenticated','app_private.tms_monthly_receivable_balances(date)','EXECUTE') THEN
    RAISE EXCEPTION 'Private balance helper directly exposed'; END IF;
END $test$;
ROLLBACK;
