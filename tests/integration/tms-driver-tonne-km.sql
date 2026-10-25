BEGIN;
DO $test$
DECLARE rows jsonb; actor uuid; header jsonb;
BEGIN
  FOREACH actor IN ARRAY ARRAY['ab881b32-87d4-4dce-9014-ce488b8069df'::uuid,
    (SELECT auth_user_id FROM public.sys_user WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1)] LOOP
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
    FOR header IN SELECT value FROM jsonb_array_elements('[{}, {"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}]'::jsonb) LOOP
      PERFORM set_config('request.headers',header::text,true);
      rows:=public.tms_management_report('driver-productivity','2026-09-01','2026-09-30','报表验收',0,200)->'records';
      IF jsonb_array_length(rows)<>2 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(rows) j WHERE (j->>'tonne_km')::numeric=950)
        OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(rows) j WHERE (j->>'tonne_km')::numeric=1600) THEN RAISE EXCEPTION 'Driver tonne kilometres mismatch'; END IF;
    END LOOP;
    PERFORM set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
    rows:=public.tms_management_report('driver-productivity','2026-09-01','2026-09-30','报表验收',0,200)->'records';
    IF app_private.is_platform_super() THEN
      IF jsonb_array_length(rows)<>0 THEN RAISE EXCEPTION 'Selected tenant leaked drivers'; END IF;
    ELSIF jsonb_array_length(rows)<>2 THEN RAISE EXCEPTION 'Forged ordinary header changed scope'; END IF;
  END LOOP;
  PERFORM set_config('request.headers','{}',true);
  UPDATE public.tms_waybill_execution_record SET empty_mileage_km=NULL WHERE waybill_id='a9fc0006-1023-4620-9220-000000000001';
  rows:=public.tms_management_report('driver-productivity','2026-09-01','2026-09-30','报表验收司机1',0,200)->'records';
  IF jsonb_array_length(rows)<>1 OR rows->0->>'tonne_km' IS NOT NULL THEN RAISE EXCEPTION 'Missing empty mileage treated as zero'; END IF;
END $test$;
ROLLBACK;
