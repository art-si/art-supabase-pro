-- Regression against the existing TEST-AR-WAYBILL fixtures. All changes roll back.
BEGIN;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',
  (SELECT auth_user_id FROM public.sys_user WHERE user_roles @> ARRAY['R_SUPER'] LIMIT 1),
  'role','authenticated')::text,true);
SELECT set_config('request.headers','{}',true);

SAVEPOINT currency_case;
DO $customer_ar$
DECLARE customers jsonb; receivables jsonb; matched integer;
BEGIN
 customers:=public.tms_management_report('customer-profit','2026-10-01','2026-10-23',null,0,200);
 receivables:=app_private.tms_receivable_report_rows('2026-10-01','2026-10-23',null);
 SELECT count(*) INTO matched FROM jsonb_array_elements(customers->'records') c WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(receivables) a WHERE a->>'customer_id'=c->>'group_key');
 IF matched=0 THEN RAISE EXCEPTION 'No financial customer coverage'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(customers->'records') c JOIN LATERAL (SELECT sum((a->>'amount')::numeric) balance,sum((a->>'overdue_amount')::numeric) overdue,count(distinct a->>'currency') currencies FROM jsonb_array_elements(receivables) a WHERE a->>'customer_id'=c->>'group_key') totals ON totals.currencies=1 WHERE (c->>'receivable_balance')::numeric IS DISTINCT FROM totals.balance OR (c->>'overdue_amount')::numeric IS DISTINCT FROM totals.overdue) THEN RAISE EXCEPTION 'Customer financial balance differs from receivable ledger'; END IF;
END $customer_ar$;
UPDATE public.fms_receivable_document SET currency_code='USD'
WHERE id='593b7708-b744-44cf-bcb0-5b0521d95ae2';
DO $test$
DECLARE result jsonb;
BEGIN
 result:=public.tms_management_report('receivables','2026-10-01','2026-10-23','TEST-AR-WAYBILL',0,200);
 IF (result#>>'{summary,currency_count}')::integer<>2 OR result#>'{summary,amount}'<>'null'::jsonb OR result#>'{summary,overdue_amount}'<>'null'::jsonb THEN
   RAISE EXCEPTION 'Mixed currencies must not aggregate monetary totals';
 END IF;
END $test$;
ROLLBACK TO currency_case;

SAVEPOINT cutoff_case;
UPDATE public.fms_receivable_application a SET event_date='2026-10-24'
FROM public.fms_receivable_line l
WHERE a.financial_line_id=l.id AND a.tenant_id=l.tenant_id
AND l.document_id='8de4c074-5d72-4fef-ae49-6635c1992a40'
AND a.event_kind='receipt' AND a.status='approved';
DO $test$
DECLARE result jsonb;
BEGIN
 result:=public.tms_management_report('receivables','2026-10-01','2026-10-23','TEST-AR-WAYBILL',0,200);
 IF (result#>>'{summary,received_amount}')::numeric<>1050 OR (result#>>'{summary,amount}')::numeric<>1950 THEN
   RAISE EXCEPTION 'Future receipt must not affect historical balance';
 END IF;
END $test$;
ROLLBACK TO cutoff_case;

SAVEPOINT offset_case;
INSERT INTO public.fms_receivable_application
 (tenant_id,financial_line_id,event_kind,source_type,source_id,event_date,amount,effect,status,created_by_auth_user_id,approved_at)
SELECT l.tenant_id,l.id,'writeoff_bad_debt','report_acceptance',gen_random_uuid(),
 '2026-10-23',100,1,'approved',auth.uid(),now()
FROM public.fms_receivable_line l
WHERE l.document_id='8de4c074-5d72-4fef-ae49-6635c1992a40'
ORDER BY l.line_no LIMIT 1;
SET CONSTRAINTS ALL IMMEDIATE;
DO $test$
DECLARE result jsonb;
BEGIN
 result:=public.tms_management_report('receivables','2026-10-01','2026-10-23','TEST-AR-WAYBILL',0,200);
 IF (result#>>'{summary,received_amount}')::numeric<>1650 OR (result#>>'{summary,amount}')::numeric<>1250 THEN
   RAISE EXCEPTION 'Bad-debt writeoff must reduce balance without increasing cash receipts';
 END IF;
END $test$;
ROLLBACK TO offset_case;
ROLLBACK;
