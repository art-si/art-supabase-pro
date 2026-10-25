BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
SELECT set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE result jsonb;
BEGIN
 result:=public.tms_management_report('driver-productivity','2026-10-01','2026-10-31','报表验收',0,200);
 IF (SELECT count(*) FROM jsonb_array_elements(result->'records') j WHERE (j->>'payroll_commission')::numeric IN (1800,2800))<>2 THEN RAISE EXCEPTION 'Forged tenant header changed ordinary payroll scope'; END IF;
 PERFORM set_config('request.jwt.claims','{"sub":"9850d41a-77e9-40a7-b2cb-0ad02ac01440","role":"authenticated"}',true);
 BEGIN
  PERFORM public.tms_management_report('driver-productivity','2026-10-01','2026-10-31','报表验收',0,200);
  RAISE EXCEPTION 'Unauthorized payroll report was readable';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $test$;
ROLLBACK;
