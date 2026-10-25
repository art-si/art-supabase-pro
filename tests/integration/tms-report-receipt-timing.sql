BEGIN;
DO $test$
DECLARE actor uuid; rows jsonb; kpis jsonb;
BEGIN
 SELECT auth_user_id INTO actor FROM public.sys_user WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 PERFORM set_config('request.headers','{}',true);
 rows:=public.tms_management_report('receipt-tracking','2026-09-01','2026-09-30','报表验收',0,200)->'records';
 IF jsonb_array_length(rows)<>2 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(rows) j WHERE j->>'receipt_timeliness'='及时回收') OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(rows) j WHERE j->>'receipt_timeliness'='逾期回收') THEN RAISE EXCEPTION 'Receipt acceptance scenarios missing'; END IF;
 kpis:=public.tms_management_report('operations-kpi','2026-09-01','2026-10-23','报表验收',0,200)->'records';
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(kpis) j WHERE j->>'code'='receipt' AND (j->>'actual')::numeric=50) THEN RAISE EXCEPTION 'Receipt SLA ratio incorrect'; END IF;
 UPDATE public.tms_order SET receipt_collected_at=null,receipt_image_urls='["https://example.invalid/test-receipt"]'::jsonb WHERE id='a9fc0005-1023-4620-9220-000000000001';
 IF NOT EXISTS(SELECT 1 FROM public.tms_order WHERE id='a9fc0005-1023-4620-9220-000000000001' AND receipt_collected_at=now()) THEN RAISE EXCEPTION 'Upload failed to capture receipt time'; END IF;
 IF has_function_privilege('authenticated','app_private.capture_tms_receipt_time()','EXECUTE') THEN RAISE EXCEPTION 'Receipt trigger function exposed'; END IF;
END $test$;
ROLLBACK;
