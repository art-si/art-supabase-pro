BEGIN;
DO $setup$
DECLARE rid uuid; code text:='TMS_RISK_VIO_MASK_'||replace(gen_random_uuid()::text,'-','');
BEGIN
 INSERT INTO public.sys_role(role_code,role_name,tenant_id,enabled)
 VALUES(code,'违章风险脱敏回归','7529f951-938e-4e2c-ac0d-316c136ae1f9',true) RETURNING id INTO rid;
 INSERT INTO public.sys_role_menu(role_id,menu_id,tenant_id)
 SELECT rid,id,'7529f951-938e-4e2c-ac0d-316c136ae1f9' FROM public.sys_menu WHERE name='TmsReportBusinessRisk';
 UPDATE public.sys_user SET user_roles=ARRAY[code] WHERE auth_user_id='9850d41a-77e9-40a7-b2cb-0ad02ac01440';
 PERFORM set_config('request.jwt.claims','{"sub":"9850d41a-77e9-40a7-b2cb-0ad02ac01440","role":"authenticated"}',true);
 IF app_private.resolve_field_access('vms.vehicle_violation','penaltyAmounts',null)<>'hidden'
 THEN RAISE EXCEPTION 'Fixture violation amounts are not hidden'; END IF;
END $setup$;
SET LOCAL ROLE authenticated;
DO $test$
DECLARE rows jsonb; scope text; n integer;
BEGIN
 FOREACH scope IN ARRAY ARRAY['{}','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}'] LOOP
  PERFORM set_config('request.headers',scope,true);
  rows:=public.tms_management_report('business-risk','2026-09-01','2026-10-31',null,0,200)->'records';
  SELECT count(*) INTO n FROM jsonb_array_elements(rows) r WHERE r->>'risk_type'='司机违章';
  IF n<>2 THEN RAISE EXCEPTION 'Expected two violation fixtures, got %',n; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(rows) r WHERE r->>'risk_type'='司机违章'
    AND (r->>'risk_amount' IS NOT NULL OR r->>'risk_level' IS NOT NULL OR r->>'risk_basis' IS DISTINCT FROM '依据不足'))
  THEN RAISE EXCEPTION 'Hidden fine leaked through risk grade'; END IF;
 END LOOP;
END $test$;
RESET ROLE;
ROLLBACK;
