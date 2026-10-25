BEGIN;
SET LOCAL ROLE authenticated;
DO $test$
DECLARE actor text; scope text; result jsonb; page_two jsonb; own_trend jsonb;
BEGIN
 FOREACH actor IN ARRAY ARRAY['ab881b32-87d4-4dce-9014-ce488b8069df','0a872664-874c-447d-a256-d0dbdca6ed45'] LOOP
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  FOREACH scope IN ARRAY ARRAY['','7529f951-938e-4e2c-ac0d-316c136ae1f9','6675a0d6-3ff6-4ab7-bb09-232d85ae96ad'] LOOP
   PERFORM set_config('request.headers',CASE WHEN scope='' THEN '{}' ELSE jsonb_build_object('x-art-tenant-scope',scope)::text END,true);
   result:=public.tms_management_report('order-profit','2026-09-01','2026-10-31',NULL,0,2);
   IF jsonb_array_length(result->'trend')<>(result->>'total')::integer THEN RAISE EXCEPTION 'Trend truncates filtered population'; END IF;
   IF jsonb_array_length(result->'records')>2 THEN RAISE EXCEPTION 'Table page limit lost'; END IF;
   page_two:=public.tms_management_report('order-profit','2026-09-01','2026-10-31',NULL,2,2);
   IF result->'trend' IS DISTINCT FROM page_two->'trend' THEN RAISE EXCEPTION 'Trend depends on table page'; END IF;
   IF actor='ab881b32-87d4-4dce-9014-ce488b8069df' THEN
    IF (result->>'total')::integer<=12 THEN RAISE EXCEPTION 'Fixture needs more than twelve orders'; END IF;
    IF own_trend IS NULL THEN own_trend:=result->'trend';
    ELSIF own_trend IS DISTINCT FROM result->'trend' THEN RAISE EXCEPTION 'Ordinary forged header changes trend'; END IF;
   ELSIF scope='7529f951-938e-4e2c-ac0d-316c136ae1f9' AND result->'trend' IS DISTINCT FROM own_trend THEN
    RAISE EXCEPTION 'Selected tenant differs from own tenant';
   END IF;
  END LOOP;
 END LOOP;
END $test$;
RESET ROLE;
ROLLBACK;
