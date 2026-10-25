BEGIN;
DO $setup$
DECLARE condition_id uuid;
BEGIN
 SELECT id INTO condition_id FROM public.mdm_receipt_condition
 WHERE tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9' ORDER BY id LIMIT 1;
 IF condition_id IS NULL THEN RAISE EXCEPTION 'Receipt condition fixture missing'; END IF;
 UPDATE public.mdm_receipt_condition SET due_days=45 WHERE id=condition_id;
 UPDATE public.fms_receivable_document SET payment_term_id=condition_id WHERE id='7d95528d-7a9b-4cd5-96b7-115a22f0a371';
 UPDATE public.fms_receivable_document SET payment_term_id=null WHERE id='83678a56-0c0c-4934-915e-cc70b5c72dd2';
END $setup$;
SELECT set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
SELECT set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE rows jsonb;
BEGIN
 rows:=public.tms_management_report('receivables','2026-10-01','2026-10-31',null,0,200)->'records';
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(rows) r WHERE r->>'statement_id'='7d95528d-7a9b-4cd5-96b7-115a22f0a371' AND (r->>'payment_term_days')::integer=45)
 THEN RAISE EXCEPTION 'Agreed days not read from linked receipt condition'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(rows) r WHERE r->>'statement_id'='83678a56-0c0c-4934-915e-cc70b5c72dd2' AND r->>'payment_term_days' IS NULL)
 THEN RAISE EXCEPTION 'Missing agreement invented as days'; END IF;
END $test$;
ROLLBACK;
