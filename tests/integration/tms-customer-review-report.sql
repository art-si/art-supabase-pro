BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
SELECT set_config('request.headers','{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE rows jsonb; item jsonb; saved jsonb; actual jsonb; count_rows integer:=0;
BEGIN
 rows:=public.tms_management_report('customer-profit','2026-09-01','2026-10-31',null,0,200)->'records';
 FOR item IN SELECT value FROM jsonb_array_elements(rows) WHERE value->>'group_key' IS NOT NULL LIMIT 2 LOOP
  saved:=public.tms_get_customer_operating_review_secure((item->>'group_key')::uuid,'2026-09-01','2026-10-31');
  PERFORM public.tms_save_customer_operating_review_secure((item->>'group_key')::uuid,'2026-09-01','2026-10-31',
   '复盘回滚验收：维护重点客户','复盘回滚验收：每周核对应收',(saved->>'updatedAt')::timestamptz);
  count_rows:=count_rows+1;
 END LOOP;
 IF count_rows<>2 THEN RAISE EXCEPTION 'Two customer business fixtures required'; END IF;
 PERFORM set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
 PERFORM set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
 rows:=public.tms_management_report('customer-profit','2026-09-01','2026-10-31',null,0,200)->'records';
 SELECT count(*) INTO count_rows FROM jsonb_array_elements(rows) r
 WHERE r->>'customer_strategy'='复盘回滚验收：维护重点客户'
 AND r->>'customer_improvement'='复盘回滚验收：每周核对应收';
 IF count_rows<>2 THEN RAISE EXCEPTION 'Report review join mismatch: %',count_rows; END IF;
 actual:=public.tms_management_report('customer-profit','2026-09-02','2026-10-31',null,0,200)->'records';
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(actual) r WHERE r->>'customer_strategy'='复盘回滚验收：维护重点客户')
 THEN RAISE EXCEPTION 'Review applied to a different query period'; END IF;
END $test$;
RESET ROLE;
ROLLBACK;
