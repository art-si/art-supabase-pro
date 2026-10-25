-- Standing vehicle costs must remain available even without period orders.
BEGIN;
DO $test$
DECLARE insurance_before jsonb; depreciation_before jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
  PERFORM set_config('request.headers','{}',true);
  insurance_before:=app_private.tms_vehicle_insurance_costs('2026-09-01','2026-09-30');
  depreciation_before:=app_private.tms_vehicle_depreciation_rows('2026-09-01','2026-09-30');
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(insurance_before) j
    WHERE j->>'vehicle_id'='a9fc0004-1023-4620-9220-000000000001' AND (j->>'insurance_period_cost')::numeric=330)
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(depreciation_before) j
    WHERE j->>'vehicle_id'='a9fc0004-1023-4620-9220-000000000002' AND (j->>'depreciation_posted')::numeric=9000)
  THEN RAISE EXCEPTION 'Missing standing cost fixtures'; END IF;
  UPDATE public.tms_order o SET create_time='2026-08-01 00:00:00+08'
  WHERE o.tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9'
    AND o.create_time>='2026-09-01'::timestamp AT TIME ZONE 'Asia/Shanghai'
    AND o.create_time<'2026-10-01'::timestamp AT TIME ZONE 'Asia/Shanghai';
  IF app_private.tms_vehicle_insurance_costs('2026-09-01','2026-09-30') IS DISTINCT FROM insurance_before
    OR app_private.tms_vehicle_depreciation_rows('2026-09-01','2026-09-30') IS DISTINCT FROM depreciation_before
  THEN RAISE EXCEPTION 'Vehicle standing costs depend on period order activity'; END IF;
END $test$;
ROLLBACK;
