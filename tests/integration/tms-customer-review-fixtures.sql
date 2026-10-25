BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
SELECT set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE customer uuid; review jsonb; rows jsonb;
BEGIN
 rows:=public.tms_management_report('customer-profit','2026-09-01','2026-10-31',null,0,200)->'records';
 FOREACH customer IN ARRAY ARRAY['a9fc0001-1023-4620-9220-000000000001'::uuid,'a9fc0001-1023-4620-9220-000000000002'::uuid] LOOP
  review:=public.tms_get_customer_operating_review_secure(customer,'2026-09-01','2026-10-31');
  IF review IS NULL OR review->>'strategy' NOT LIKE '[经营复盘验收20261025] %'
  THEN RAISE EXCEPTION 'Persisted review fixture missing'; END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(rows) r WHERE r->>'group_key'=customer::text
    AND r->>'customer_strategy'=review->>'strategy' AND r->>'customer_improvement'=review->>'improvement')
  THEN RAISE EXCEPTION 'Persisted review differs from report'; END IF;
 END LOOP;
END $test$;
RESET ROLE;
ROLLBACK;
