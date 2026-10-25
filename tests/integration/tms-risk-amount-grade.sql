BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
SELECT set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE amount numeric; eid uuid; actual jsonb; expected text;
BEGIN
 FOREACH amount IN ARRAY ARRAY[0,999.99,1000,9999.99,10000]::numeric[] LOOP
  eid:=public.tms_create_order_exception_secure('a9fc0005-1023-4620-9220-000000000007',
   jsonb_build_object('exception_type','damage','stage','transit','description','[风险金额边界回滚验收] 核实运输损失',
   'occurred_at','2026-10-23T08:00:00+08:00','estimated_loss',amount));
  SELECT r INTO actual FROM jsonb_array_elements(public.tms_management_report(
   'business-risk','2026-09-01','2026-10-31',null,0,200)->'records') r WHERE r->>'exception_id'=eid::text;
  IF actual IS NULL OR actual->>'risk_level' IS NOT NULL OR actual->>'risk_basis' IS DISTINCT FROM '依据不足'
  THEN RAISE EXCEPTION 'Unverified work order incorrectly graded'; END IF;
  PERFORM public.tms_transition_order_exception_secure(eid,'pending','start','核对本次损失');
  PERFORM public.tms_transition_order_exception_secure(eid,'in_progress','resolve','完成损失核实',amount,0);
  PERFORM public.tms_transition_order_exception_secure(eid,'resolved','close','已核对结案');
  SELECT r INTO actual FROM jsonb_array_elements(public.tms_management_report(
   'business-risk','2026-09-01','2026-10-31',null,0,200)->'records') r WHERE r->>'exception_id'=eid::text;
  expected:=case when amount>=10000 then '高' when amount>=1000 then '中' else '低' end;
  IF actual IS NULL OR actual->>'risk_level' IS DISTINCT FROM expected
   OR actual->>'risk_basis' IS DISTINCT FROM '默认金额分级'
  THEN RAISE EXCEPTION 'Risk amount grade mismatch for %: %',amount,actual; END IF;
 END LOOP;
END $test$;
RESET ROLE;
ROLLBACK;
