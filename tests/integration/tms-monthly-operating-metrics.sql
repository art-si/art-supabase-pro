BEGIN;
DO $test$
DECLARE actor uuid; headers jsonb; monthly jsonb; operational jsonb;
BEGIN
  FOREACH actor IN ARRAY ARRAY[
    'ab881b32-87d4-4dce-9014-ce488b8069df'::uuid,
    (SELECT auth_user_id FROM public.sys_user WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1)
  ] LOOP
    IF actor IS NULL THEN RAISE EXCEPTION 'Missing test actor'; END IF;
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
    FOR headers IN SELECT value FROM jsonb_array_elements('[{}, {"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}, {"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}]'::jsonb) LOOP
      PERFORM set_config('request.headers',headers::text,true);
      monthly:=public.tms_management_report('monthly-operations','2026-09-01','2026-09-30',null,0,20);
      operational:=public.tms_management_report('operations-kpi','2026-09-01','2026-09-30',null,0,20);
      IF monthly IS DISTINCT FROM operational OR jsonb_array_length(monthly->'records')<>6 THEN
        RAISE EXCEPTION 'Monthly operating metrics diverged from canonical KPI'; END IF;
    END LOOP;
  END LOOP;
  PERFORM set_config('request.jwt.claims','{"sub":"9850d41a-77e9-40a7-b2cb-0ad02ac01440","role":"authenticated"}',true);
  BEGIN
    PERFORM public.tms_management_report('monthly-operations','2026-09-01','2026-09-30',null,0,20);
    RAISE EXCEPTION 'Unauthorized monthly metrics accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
ROLLBACK;
