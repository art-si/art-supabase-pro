BEGIN;
-- Isolate the original prompt scenario; the final ROLLBACK restores retained UI acceptance records.
DELETE FROM public.tms_order_exception
WHERE order_id IN ('a9fc0005-1023-4620-9220-000000000007','a9fc0005-1023-4620-9220-000000000008')
  AND tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9'
  AND (description LIKE '[TMS报表验收20261024]%' OR description LIKE '[责任人流程验收20261025]%');
DO $test$
DECLARE eid uuid; j jsonb; r jsonb;
BEGIN
PERFORM set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
eid:=public.tms_create_order_exception_secure('a9fc0005-1023-4620-9220-000000000007','{"exception_type":"delay","stage":"transit","description":"[TMS报表验收] 人工延误台账联动","occurred_at":"2026-10-23T08:00:00+08:00","estimated_loss":100}');
j:=public.tms_management_report('order-exceptions','2026-09-01','2026-10-24','报表验收',0,20);
SELECT value INTO r FROM jsonb_array_elements(j->'records') WHERE value->>'exception_id'=eid::text;
IF r IS NULL OR r->>'exception_source'<>'manual' OR r->>'status_code'<>'pending' OR (j->'summary'->>'count')::int<>2 OR (j->'summary'->>'unregistered')::int<>1 OR (j->'summary'->>'open_work_orders')::int<>1 THEN RAISE EXCEPTION 'Manual exception or duplicate prompt mismatch: %',j; END IF;
PERFORM public.tms_transition_order_exception_secure(eid,'pending','start','开始核实延误');
PERFORM public.tms_transition_order_exception_secure(eid,'in_progress','resolve','核实损失并协商理赔',100,80);
PERFORM public.tms_transition_order_exception_secure(eid,'resolved','close','确认完成结案');
j:=public.tms_management_report('order-exceptions','2026-09-01','2026-10-24','报表验收',0,20);
SELECT value INTO r FROM jsonb_array_elements(j->'records') WHERE value->>'exception_id'=eid::text;
IF r->>'status'<>'已结案' OR (r->>'damage')::numeric<>100 OR (r->>'claim')::numeric<>80 OR (j->'summary'->>'closed_work_orders')::int<>1 OR (j->'summary'->>'open_work_orders')::int<>0 THEN RAISE EXCEPTION 'Closed report mismatch: %',j; END IF;
END $test$;
ROLLBACK;
