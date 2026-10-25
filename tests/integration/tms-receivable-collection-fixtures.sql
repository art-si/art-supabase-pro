BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
SELECT set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE doc uuid; history jsonb; rows jsonb;
BEGIN
 FOREACH doc IN ARRAY ARRAY['7d95528d-7a9b-4cd5-96b7-115a22f0a371'::uuid,'83678a56-0c0c-4934-915e-cc70b5c72dd2'::uuid] LOOP
  history:=public.tms_list_receivable_collections_secure(doc);
  IF (SELECT count(*) FROM jsonb_array_elements(history) h WHERE h->>'note' LIKE '[催收流程验收20261025]%')<>1 THEN RAISE EXCEPTION 'Expected one persisted collection fixture per document'; END IF;
  rows:=public.tms_management_report('receivables','2026-10-01','2026-10-31',null,0,200)->'records';
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(rows) r WHERE r->>'statement_id'=doc::text
   AND position('[催收流程验收20261025]' in r->>'collection_record')>0)
  THEN RAISE EXCEPTION 'Persisted collection missing from report'; END IF;
 END LOOP;
END $test$;
ROLLBACK;
