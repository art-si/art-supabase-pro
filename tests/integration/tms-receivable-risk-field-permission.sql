BEGIN;
DO $setup$
DECLARE rid uuid; code text:='TMS_RISK_MASK_'||replace(gen_random_uuid()::text,'-','');
BEGIN
 INSERT INTO public.sys_role(role_code,role_name,tenant_id,enabled)
 VALUES(code,'应收风险脱敏回归','7529f951-938e-4e2c-ac0d-316c136ae1f9',true) RETURNING id INTO rid;
 INSERT INTO public.sys_role_menu(role_id,menu_id,tenant_id)
 SELECT rid,id,'7529f951-938e-4e2c-ac0d-316c136ae1f9' FROM public.sys_menu WHERE name IN ('TmsReportReceivables','TmsReportBusinessRisk');
 UPDATE public.sys_user SET user_roles=ARRAY[code] WHERE auth_user_id='ab881b32-87d4-4dce-9014-ce488b8069df';
 PERFORM set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
 IF app_private.resolve_field_access('fms.receivable','amounts',null)<>'hidden' THEN RAISE EXCEPTION 'Fixture amounts are not hidden'; END IF;
END $setup$;
SET LOCAL ROLE authenticated;
DO $test$
DECLARE rows jsonb; header text;
BEGIN
 FOREACH header IN ARRAY ARRAY['{}','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}'] LOOP
 PERFORM set_config('request.headers',header,true);
 rows:=public.tms_management_report('receivables','2026-10-01','2026-10-31','报表验收',0,200)->'records';
 IF jsonb_array_length(rows)<>2 OR EXISTS(SELECT 1 FROM jsonb_array_elements(rows) j WHERE j->>'risk_level' IS NOT NULL OR j->>'amount' IS NOT NULL OR j->>'days' IS NOT NULL) THEN RAISE EXCEPTION 'Hidden amounts leaked via risk or age: %',rows; END IF;
 rows:=public.tms_management_report('business-risk','2026-10-01','2026-10-31','报表验收',0,200)->'records';
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(rows) j WHERE j->>'risk_type'='应收逾期') THEN RAISE EXCEPTION 'Hidden AR creates visible overdue risk'; END IF;
 END LOOP;
END $test$;
ROLLBACK;
