BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
SELECT set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE oid uuid; current_row jsonb; saved jsonb; rows jsonb; i integer;
BEGIN
 FOR i IN 1..2 LOOP
  oid:=('a9fc0005-1023-4620-9220-'||lpad(i::text,12,'0'))::uuid;
  current_row:=public.tms_get_receipt_followup_secure(oid);
  saved:=public.tms_save_receipt_followup_secure(oid,'回单原件待司机交回-'||i,'已联系司机，约定次日交回',(current_row->>'updatedAt')::timestamptz);
  IF saved->>'missingReason' IS DISTINCT FROM '回单原件待司机交回-'||i THEN RAISE EXCEPTION 'Followup save mismatch'; END IF;
  BEGIN
   PERFORM public.tms_save_receipt_followup_secure(oid,'旧版本不能覆盖','并发保护',(current_row->>'updatedAt')::timestamptz);
   RAISE EXCEPTION 'Stale write accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN
   PERFORM public.tms_save_receipt_followup_secure(oid,' ','无效原因',(saved->>'updatedAt')::timestamptz);
   RAISE EXCEPTION 'Blank reason accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  rows:=public.tms_management_report('receipt-tracking','2026-09-01','2026-10-31',NULL,0,200)->'records';
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(rows) r WHERE r->>'order_id'=oid::text AND r->>'missing_reason'=saved->>'missingReason')
  THEN RAISE EXCEPTION 'Followup not reflected in report'; END IF;
 END LOOP;
END $test$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE scope text; current_row jsonb;
BEGIN
 FOREACH scope IN ARRAY ARRAY['{}','{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}'] LOOP
  PERFORM set_config('request.headers',scope,true);
  current_row:=public.tms_get_receipt_followup_secure('a9fc0005-1023-4620-9220-000000000001');
  PERFORM public.tms_save_receipt_followup_secure('a9fc0005-1023-4620-9220-000000000001','平台核对原因','已复核',(current_row->>'updatedAt')::timestamptz);
 END LOOP;
 PERFORM set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
 BEGIN
  PERFORM public.tms_get_receipt_followup_secure('a9fc0005-1023-4620-9220-000000000001');
  RAISE EXCEPTION 'Foreign selected scope read accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.tms_save_receipt_followup_secure('a9fc0005-1023-4620-9220-000000000001','越界原因','越界',NULL);
  RAISE EXCEPTION 'Foreign selected scope write accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
RESET ROLE;
DELETE FROM public.sys_role_menu WHERE menu_id IN(SELECT id FROM public.sys_menu WHERE name='TmsReportReceiptTracking:EditFollowup');
SELECT set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
SELECT set_config('request.headers','{}',true);
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
 BEGIN
  PERFORM public.tms_save_receipt_followup_secure('a9fc0005-1023-4620-9220-000000000001','无权原因','无权',NULL);
  RAISE EXCEPTION 'Missing button permission accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
RESET ROLE;
ROLLBACK;
