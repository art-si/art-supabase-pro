BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
SELECT set_config('request.headers','{}',true);
SELECT set_config('test.foreign_assignee',(SELECT id::text FROM public.sys_user WHERE tenant_id<>'7529f951-938e-4e2c-ac0d-316c136ae1f9' LIMIT 1),true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE order_id uuid; exception_id uuid; rows jsonb; history jsonb;
BEGIN
 IF nullif(current_setting('test.foreign_assignee',true),'') IS NULL THEN RAISE EXCEPTION 'Missing foreign assignee fixture'; END IF;
 BEGIN
  PERFORM public.tms_create_order_exception_secure('a9fc0005-1023-4620-9220-000000000007',jsonb_build_object('exception_type','delay','stage','pickup','description','跨租户责任人拒绝回归','occurred_at','2026-10-23T08:00:00+08:00','responsible_user_id',current_setting('test.foreign_assignee')));
  RAISE EXCEPTION 'Foreign assignee accepted' USING ERRCODE='23514';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM<>'责任人不属于订单租户' THEN RAISE; END IF;
 END;
 FOREACH order_id IN ARRAY ARRAY['a9fc0005-1023-4620-9220-000000000007'::uuid,'a9fc0005-1023-4620-9220-000000000008'::uuid] LOOP
 exception_id:=public.tms_create_order_exception_secure(order_id,jsonb_build_object(
 'exception_type','delay','stage','pickup','description','[责任人流程回归] 提货延误，已安排跟进人',
 'occurred_at','2026-10-23T08:00:00+08:00','estimated_loss',0,
 'responsible_user_id','93f2f1e8-a3dc-4f5a-999b-6c8c02d0c7e9'));
 PERFORM public.tms_transition_order_exception_secure(exception_id,'pending','start','跟进人开始核实');
 PERFORM public.tms_transition_order_exception_secure(exception_id,'in_progress','resolve','已协调恢复提货，无货损或理赔',0,0);
 PERFORM public.tms_transition_order_exception_secure(exception_id,'resolved','close','责任跟进完成，确认结案');
 rows:=public.tms_management_report('order-exceptions','2026-10-01','2026-10-31','报表验收',0,200)->'records';
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(rows) j WHERE j->>'exception_id'=exception_id::text AND j->>'responsible' IS NOT NULL AND j->>'status_code'='closed') THEN RAISE EXCEPTION 'Assigned exception missing in report'; END IF;
 history:=public.tms_get_order_exception_history_secure(exception_id);
 IF jsonb_array_length(history)<>4 OR history->3->>'action'<>'close' THEN RAISE EXCEPTION 'Assigned lifecycle history incomplete'; END IF;
 END LOOP;
END $test$;
ROLLBACK;
