BEGIN;
UPDATE public.fms_receivable_document SET business_date='2026-10-01'
WHERE id='7d95528d-7a9b-4cd5-96b7-115a22f0a371';
SELECT set_config('request.jwt.claims','{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
SELECT set_config('request.headers','{}',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE rows jsonb; summary text;
BEGIN
 PERFORM public.tms_add_receivable_collection_secure('7d95528d-7a9b-4cd5-96b7-115a22f0a371',
 jsonb_build_object('contacted_at','2026-10-10T09:00:00+08:00','method','电话','note','[摘要回滚验收] 首次联系'));
 PERFORM public.tms_add_receivable_collection_secure('7d95528d-7a9b-4cd5-96b7-115a22f0a371',
 jsonb_build_object('contacted_at','2026-10-20T09:00:00+08:00','method','现场沟通','note','[摘要回滚验收] 确认付款安排'));
 rows:=public.tms_management_report('receivables','2026-10-01','2026-10-15',null,0,200)->'records';
 SELECT r->>'collection_record' INTO summary FROM jsonb_array_elements(rows) r WHERE r->>'statement_id'='7d95528d-7a9b-4cd5-96b7-115a22f0a371';
 IF summary IS DISTINCT FROM '2026-10-10 09:00 · 电话 · [摘要回滚验收] 首次联系' THEN RAISE EXCEPTION 'As-of summary mismatch: %',summary; END IF;
 rows:=public.tms_management_report('receivables','2026-10-01','2026-10-21',null,0,200)->'records';
 SELECT r->>'collection_record' INTO summary FROM jsonb_array_elements(rows) r WHERE r->>'statement_id'='7d95528d-7a9b-4cd5-96b7-115a22f0a371';
 IF summary IS DISTINCT FROM '2026-10-20 09:00 · 现场沟通 · [摘要回滚验收] 确认付款安排' THEN RAISE EXCEPTION 'Latest summary mismatch: %',summary; END IF;
END $test$;
RESET ROLE;
DELETE FROM public.sys_role_menu rm USING public.sys_menu m,public.sys_role r
WHERE rm.menu_id=m.id AND rm.role_id=r.id AND r.role_code='yq_2026_001'
AND r.tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9'
AND m.name='TmsReportReceivables:ViewCollection';
SELECT set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE rows jsonb;
BEGIN
 rows:=public.tms_management_report('receivables','2026-10-01','2026-10-21',null,0,200)->'records';
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(rows) r WHERE r->>'statement_id'='7d95528d-7a9b-4cd5-96b7-115a22f0a371') THEN RAISE EXCEPTION 'Expected report row missing'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(rows) r WHERE r->>'collection_record' IS NOT NULL) THEN RAISE EXCEPTION 'Collection summary leaked without history permission'; END IF;
END $test$;
ROLLBACK;
