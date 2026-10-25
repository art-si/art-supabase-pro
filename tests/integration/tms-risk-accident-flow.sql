BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
SELECT set_config('request.headers','{}',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE amount numeric; eid uuid; actual jsonb; ids jsonb:='[]'::jsonb;
BEGIN
 FOREACH amount IN ARRAY ARRAY[1500,12000]::numeric[] LOOP
  eid:=public.vms_create_vehicle_accident_secure(jsonb_build_object(
   'vehicle_id','a9fc0004-1023-4620-9220-000000000001',
   'driver_id','a9fc0003-1023-4620-9220-000000000001',
   'accident_time','2026-10-20T09:00:00+08:00','accident_location','验收场地',
   'accident_summary','[风险事故回滚验收] 场内低速擦碰',
   'company_bear_amount',amount,'economic_loss',amount,'processed',false));
  PERFORM public.vms_update_vehicle_accident_secure(eid,jsonb_build_object('processed',true));
  ids:=ids||jsonb_build_array('车辆事故:'||eid::text);
  SELECT r INTO actual FROM jsonb_array_elements(public.tms_management_report(
   'business-risk','2026-09-01','2026-10-31','风险事故回滚验收',0,200)->'records') r
   WHERE r->>'exception_id'='车辆事故:'||eid::text;
  IF actual IS NULL OR actual->>'status' IS DISTINCT FROM '已处理'
   OR actual->>'risk_level' IS DISTINCT FROM (case when amount>=10000 then '高' else '中' end)
   OR actual->>'risk_basis' IS DISTINCT FROM '默认金额分级'
  THEN RAISE EXCEPTION 'Accident workflow grade mismatch: %',actual; END IF;
 END LOOP;
 PERFORM set_config('test.accident_risk_ids',ids::text,true);
END $test$;
RESET ROLE;
DO $setup$
DECLARE rid uuid; code text:='TMS_ACC_MASK_'||replace(gen_random_uuid()::text,'-','');
BEGIN
 INSERT INTO public.sys_role(role_code,role_name,tenant_id,enabled)
 VALUES(code,'事故风险脱敏回归','7529f951-938e-4e2c-ac0d-316c136ae1f9',true) RETURNING id INTO rid;
 INSERT INTO public.sys_role_menu(role_id,menu_id,tenant_id)
 SELECT rid,id,'7529f951-938e-4e2c-ac0d-316c136ae1f9' FROM public.sys_menu WHERE name='TmsReportBusinessRisk';
 UPDATE public.sys_user SET user_roles=ARRAY[code] WHERE auth_user_id='9850d41a-77e9-40a7-b2cb-0ad02ac01440';
END $setup$;
SELECT set_config('request.jwt.claims','{"sub":"9850d41a-77e9-40a7-b2cb-0ad02ac01440","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE rows jsonb; scope text;
BEGIN
 FOREACH scope IN ARRAY ARRAY['{}','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}'] LOOP
  PERFORM set_config('request.headers',scope,true);
  rows:=public.tms_management_report('business-risk','2026-09-01','2026-10-31',null,0,200)->'records';
  IF (SELECT count(*) FROM jsonb_array_elements(rows) r WHERE current_setting('test.accident_risk_ids')::jsonb ? (r->>'exception_id'))<>2
  THEN RAISE EXCEPTION 'Accident fixtures missing'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(rows) r WHERE current_setting('test.accident_risk_ids')::jsonb ? (r->>'exception_id')
   AND (r->>'risk_amount' IS NOT NULL OR r->>'risk_level' IS NOT NULL))
  THEN RAISE EXCEPTION 'Hidden accident amount leaked'; END IF;
 END LOOP;
END $test$;
RESET ROLE;
ROLLBACK;
