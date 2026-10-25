BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
SELECT set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE route_name text; result jsonb; expected numeric;
BEGIN
 FOREACH route_name IN ARRAY ARRAY['上海 → 北京','上海 → 广州'] LOOP
  expected:=CASE route_name WHEN '上海 → 北京' THEN 36000 ELSE 24000 END;
  result:=public.tms_management_report('order-profit','2026-10-01','2026-10-25',route_name,0,20);
  IF (result->>'total')::integer<>3 OR jsonb_array_length(result->'records')<>3 OR jsonb_array_length(result->'trend')<>3 THEN RAISE EXCEPTION 'Route rows/trend mismatch: %',route_name; END IF;
  IF (result->'summary'->>'revenue')::numeric<>expected THEN RAISE EXCEPTION 'Route revenue mismatch'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(result->'records') r WHERE r->>'route' IS DISTINCT FROM route_name) THEN RAISE EXCEPTION 'Unrelated route leaked'; END IF;
 END LOOP;
END $test$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
SELECT set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
SET LOCAL ROLE authenticated;
DO $test$ BEGIN
 IF (public.tms_management_report('order-profit','2026-10-01','2026-10-25','上海 → 北京',0,20)->>'total')::integer<>0 THEN RAISE EXCEPTION 'Selected tenant leaked'; END IF;
END $test$;
RESET ROLE;
ROLLBACK;
