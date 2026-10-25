BEGIN;
SELECT set_config('test.collection.documents', (
 SELECT jsonb_agg(id ORDER BY document_no)::text
 FROM public.fms_receivable_document
 WHERE tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9'
 AND document_no IN ('AR-F-202610-007','AR-F-202610-008')
), true);
SELECT set_config('request.jwt.claims','{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
SELECT set_config('request.headers','{}',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE documents jsonb:=current_setting('test.collection.documents')::jsonb;
 document jsonb; document_id uuid; record_id uuid; records jsonb;
BEGIN
 IF jsonb_array_length(documents)<>2 THEN RAISE EXCEPTION 'Two receivable fixtures required'; END IF;
 FOR document IN SELECT value FROM jsonb_array_elements(documents) LOOP
  document_id:=(document#>>'{}')::uuid;
  record_id:=public.tms_add_receivable_collection_secure(document_id,jsonb_build_object(
   'contacted_at',now()-interval '1 hour','method','电话',
   'note','[催收回滚验收] 已核对余额，约定后续跟进','next_follow_up',current_date+1));
  records:=public.tms_list_receivable_collections_secure(document_id);
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(records) r WHERE r->>'id'=record_id::text
   AND r->>'method'='电话' AND r->>'note'='[催收回滚验收] 已核对余额，约定后续跟进'
   AND nullif(r->>'actorName','') IS NOT NULL)
  THEN RAISE EXCEPTION 'Collection save/read roundtrip failed'; END IF;
  BEGIN
   PERFORM public.tms_add_receivable_collection_secure(document_id,jsonb_build_object(
    'contacted_at',now()+interval '1 day','method','电话','note','未来联系不应保存'));
   RAISE EXCEPTION 'Future contact accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
   PERFORM public.tms_add_receivable_collection_secure(document_id,jsonb_build_object(
    'contacted_at',now(),'method','电话','note','跟进日期不能早于联系','next_follow_up',current_date-2));
   RAISE EXCEPTION 'Invalid follow-up date accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  PERFORM set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
  BEGIN
   PERFORM public.tms_list_receivable_collections_secure(document_id);
   RAISE EXCEPTION 'Selected foreign tenant read accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
   PERFORM public.tms_add_receivable_collection_secure(document_id,jsonb_build_object(
    'contacted_at',now(),'method','电话','note','外租户写入应拒绝'));
   RAISE EXCEPTION 'Selected foreign tenant write accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM set_config('request.headers','{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}',true);
  records:=public.tms_list_receivable_collections_secure(document_id);
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(records) r WHERE r->>'id'=record_id::text)
  THEN RAISE EXCEPTION 'Selected own tenant history missing'; END IF;
 END LOOP;
 PERFORM set_config('request.jwt.claims','{"sub":"9850d41a-77e9-40a7-b2cb-0ad02ac01440","role":"authenticated"}',true);
 BEGIN
  PERFORM public.tms_list_receivable_collections_secure(document_id);
  RAISE EXCEPTION 'Unauthorized collection history exposed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.tms_add_receivable_collection_secure(document_id,jsonb_build_object(
   'contacted_at',now(),'method','电话','note','无权限写入应拒绝'));
  RAISE EXCEPTION 'Unauthorized collection write accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF has_table_privilege('authenticated','public.fms_receivable_collection_record','SELECT')
 OR has_table_privilege('authenticated','public.fms_receivable_collection_record','INSERT')
 OR has_table_privilege('anon','public.fms_receivable_collection_record','SELECT')
 THEN RAISE EXCEPTION 'Raw collection table exposed'; END IF;
END $test$;
RESET ROLE;
DO $test$
BEGIN
 IF (SELECT count(*) FROM public.fms_receivable_collection_record
 WHERE note='[催收回滚验收] 已核对余额，约定后续跟进'
 AND tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9')<>2
 THEN RAISE EXCEPTION 'Parent tenant inheritance failed'; END IF;
 BEGIN
  UPDATE public.fms_receivable_collection_record SET note='覆盖历史'
  WHERE note='[催收回滚验收] 已核对余额，约定后续跟进';
  RAISE EXCEPTION 'History overwrite accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  DELETE FROM public.fms_receivable_collection_record
  WHERE note='[催收回滚验收] 已核对余额，约定后续跟进';
  RAISE EXCEPTION 'History deletion accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
END $test$;
ROLLBACK;
