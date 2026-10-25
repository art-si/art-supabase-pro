BEGIN;
-- Isolate the original prompt scenario; the final ROLLBACK restores retained UI acceptance records.
DELETE FROM public.tms_order_exception
WHERE order_id IN ('a9fc0005-1023-4620-9220-000000000007','a9fc0005-1023-4620-9220-000000000008')
  AND tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9'
  AND (description LIKE '[TMS报表验收20261024]%' OR description LIKE '[责任人流程验收20261025]%');
SELECT set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
DO $test$
DECLARE j jsonb;
BEGIN
 j:=public.tms_management_report('order-exceptions','2026-09-01','2026-10-24','报表验收',0,20)->'summary';
 IF (j->>'count')::int<>2 OR (j->>'unregistered')::int<>2 OR (j->>'open_work_orders')::int<>0 OR (j->>'closed_work_orders')::int<>0 THEN
  RAISE EXCEPTION 'Unregistered delay prompts must not count as work orders: %',j;
 END IF;
 j:=public.tms_management_report('order-exceptions','2026-09-01','2026-10-24','不存在的异常验收记录',0,20)->'summary';
 IF (j->>'count')::int<>0 OR (j->>'unregistered')::int<>0 OR (j->>'open_work_orders')::int<>0 OR (j->>'closed_work_orders')::int<>0 THEN
  RAISE EXCEPTION 'Empty exception summary must return zero counts: %',j;
 END IF;
END $test$;
ROLLBACK;
