-- Contract expiry alert center: read only, tenant-scoped, and free of recipient/message payloads.
-- Uses the persistent [TMS验收20261102] acceptance contracts; all grant changes roll back.
BEGIN;

DO $schema$
BEGIN
  IF to_regprocedure('public.tms_list_contract_alerts_secure(integer,integer,text,text,date,date,text)') IS NULL
     OR has_function_privilege('anon','public.tms_list_contract_alerts_secure(integer,integer,text,text,date,date,text)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.tms_list_contract_alerts_secure(integer,integer,text,text,date,date,text)','EXECUTE')
     OR NOT EXISTS (
       SELECT 1 FROM public.sys_menu
       WHERE name='TmsAlertCenter' AND component='/tms/alert-center' AND path='alert-center'
     )
     OR NOT EXISTS (SELECT 1 FROM public.sys_menu WHERE name='TmsAlertCenter:View')
  THEN RAISE EXCEPTION 'Alert center menu or API grant is missing'; END IF;
END $schema$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','677f7f08-b69b-4b0e-a033-41a3f1b3011e',true);
SELECT set_config('request.headers','{}',true);
DO $ordinary$
DECLARE v_result jsonb; v_row jsonb;
BEGIN
  v_result:=public.tms_list_contract_alerts_secure(0,49,NULL,NULL,NULL,NULL,'HT202611');
  IF (v_result->>'total')::integer<>6 THEN RAISE EXCEPTION 'Ordinary tenant alert count is wrong'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_result->'records') r
    WHERE r->>'tenantId'<>'7529f951-938e-4e2c-ac0d-316c136ae1f9'
       OR r ?| ARRAY['content','recipientUserId','contractAmount','contactPhone']
  ) THEN RAISE EXCEPTION 'Alert projection leaked tenant or sensitive fields'; END IF;
  v_row:=(public.tms_list_contract_alerts_secure(0,9,NULL,'active','2026-11-09','2026-11-09','HT202611-0008')->'records')->0;
  IF v_row->>'contractId'<>'18c38cb5-86a3-41ba-b879-6587ab480611'
     OR v_row->>'lastDeliveredAt' IS NULL
  THEN RAISE EXCEPTION 'Due-date/status search or delivery summary is wrong'; END IF;
  v_row:=(public.tms_list_contract_alerts_secure(0,9,'expired',NULL,NULL,NULL,'HT202611')->'records')->0;
  IF v_row->>'contractNo'<>'HT202611-0007' THEN RAISE EXCEPTION 'Expired lifecycle filter is wrong'; END IF;
  v_row:=(public.tms_list_contract_alerts_secure(0,9,NULL,'resolved',NULL,NULL,'HT202611')->'records')->0;
  IF v_row->>'contractNo'<>'HT202611-0002' THEN RAISE EXCEPTION 'Resolved alert filter is wrong'; END IF;
END $ordinary$;

SELECT set_config('request.headers','{"x-art-tenant-scope":"028e6a68-a9db-4055-974c-1e05bfe94b0f"}',true);
DO $forged$
BEGIN
  IF (public.tms_list_contract_alerts_secure(0,49,NULL,NULL,NULL,NULL,'HT202611')->>'total')::integer<>6
  THEN RAISE EXCEPTION 'Forged ordinary tenant header changed read scope'; END IF;
END $forged$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','0a872664-874c-447d-a256-d0dbdca6ed45',true);
SELECT set_config('request.headers','{}',true);
DO $platform_all$
BEGIN
  IF (public.tms_list_contract_alerts_secure(0,49,NULL,NULL,NULL,NULL,NULL)->>'total')::integer<8
  THEN RAISE EXCEPTION 'Platform-all did not read the available contract alerts'; END IF;
END $platform_all$;
SELECT set_config('request.headers','{"x-art-tenant-scope":"028e6a68-a9db-4055-974c-1e05bfe94b0f"}',true);
DO $platform_selected$
BEGIN
  IF (public.tms_list_contract_alerts_secure(0,49,NULL,NULL,NULL,NULL,NULL)->>'total')::integer<>0
  THEN RAISE EXCEPTION 'Platform selected tenant saw another tenant alerts'; END IF;
END $platform_selected$;
RESET ROLE;

SAVEPOINT no_alert_view;
DELETE FROM public.sys_role_menu
WHERE role_id='36188252-2075-442c-a85b-8e6c1c99845d'
  AND menu_id='b2000000-0000-4000-8000-000000000005';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','677f7f08-b69b-4b0e-a033-41a3f1b3011e',true);
SELECT set_config('request.headers','{}',true);
DO $no_alert_view$
BEGIN
  BEGIN
    PERFORM public.tms_list_contract_alerts_secure(0,9,NULL,NULL,NULL,NULL,NULL);
    RAISE EXCEPTION 'Alert list allowed a role without TmsAlertCenter:View';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END $no_alert_view$;
RESET ROLE;
ROLLBACK TO SAVEPOINT no_alert_view;

SAVEPOINT no_contract_view;
DELETE FROM public.sys_role_menu
WHERE role_id='36188252-2075-442c-a85b-8e6c1c99845d'
  AND menu_id='31fe208f-09b9-4744-910c-d078479bc6db';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','677f7f08-b69b-4b0e-a033-41a3f1b3011e',true);
SELECT set_config('request.headers','{}',true);
DO $no_contract_view$
BEGIN
  BEGIN
    PERFORM public.tms_list_contract_alerts_secure(0,9,NULL,NULL,NULL,NULL,NULL);
    RAISE EXCEPTION 'Alert list allowed a role without TmsContract:View';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END $no_contract_view$;
RESET ROLE;
ROLLBACK TO SAVEPOINT no_contract_view;

ROLLBACK;
