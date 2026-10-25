BEGIN;
DO $test$
DECLARE days integer; rows jsonb; expected text;
BEGIN
 PERFORM set_config('request.jwt.claims','{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
 PERFORM set_config('request.headers','{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}',true);
 FOREACH days IN ARRAY ARRAY[0,29,30,89,90] LOOP
 UPDATE public.fms_receivable_document SET due_date='2026-10-31'::date-days WHERE document_no IN ('AR-F-202610-007','AR-F-202610-008') AND tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9';
 expected:=case when days>=90 then '高' when days>=30 then '中' else '低' end;
 rows:=public.tms_management_report('receivables','2026-10-01','2026-10-31','报表验收',0,200)->'records';
 IF (SELECT count(*) FROM jsonb_array_elements(rows) j WHERE j->>'risk_level'=expected)<>2 THEN RAISE EXCEPTION 'Age risk boundary mismatch for %: %',days,rows; END IF;
 IF days>0 THEN
 rows:=public.tms_management_report('business-risk','2026-10-01','2026-10-31','报表验收',0,200)->'records';
 IF (SELECT count(*) FROM jsonb_array_elements(rows) j WHERE j->>'risk_type'='应收逾期' AND j->>'risk_level'=expected)<>2 THEN RAISE EXCEPTION 'Risk report classification drift'; END IF;
 END IF;
 END LOOP;
 UPDATE public.fms_receivable_document SET due_date=null WHERE document_no IN ('AR-F-202610-007','AR-F-202610-008') AND tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9';
 rows:=public.tms_management_report('receivables','2026-10-01','2026-10-31','报表验收',0,200)->'records';
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(rows) j WHERE j->>'risk_level' IS NOT NULL) THEN RAISE EXCEPTION 'Unknown due date risk invented'; END IF;
 UPDATE public.fms_receivable_document SET is_credit=true WHERE document_no IN ('AR-F-202610-007','AR-F-202610-008') AND tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9';
 rows:=public.tms_management_report('receivables','2026-10-01','2026-10-31','报表验收',0,200)->'records';
 IF (SELECT count(*) FROM jsonb_array_elements(rows) j WHERE j->>'risk_level'='低' AND (j->>'overdue_amount') IS NULL)<>2 THEN RAISE EXCEPTION 'Credit classification mismatch'; END IF;
END $test$;
ROLLBACK;
