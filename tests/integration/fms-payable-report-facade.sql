BEGIN;

SELECT set_config('request.jwt.claim.sub','a9eeb9b7-e474-43e3-9cc2-c2f46c0f0ec3',true);
SELECT set_config('request.headers','{}',true);

SET LOCAL ROLE authenticated;
DO $report$
DECLARE result jsonb;summary jsonb;item jsonb;expected numeric;blocked boolean;
BEGIN
 result:=public.fms_payable_report_secure('{"mode":"detail","size":1}');
 IF (result->>'total')::integer<2 OR jsonb_array_length(result->'records')<>1 THEN RAISE EXCEPTION 'Report pagination was not applied';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(result->'records') row WHERE row->>'tenant_id'<>'111e83d3-190e-4405-84c8-440d484d13a6') THEN RAISE EXCEPTION 'Report leaked a foreign tenant';END IF;
 summary:=public.fms_payable_report_secure('{"mode":"summary","size":200}');
 IF jsonb_array_length(summary->'records')<2 THEN RAISE EXCEPTION 'At least two real source groups must be reported';END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.fms_payable_report_options_secure()->'books') row WHERE row->>'id'='cf3eeddd-49b0-4e62-97a9-cab2769cb633') THEN RAISE EXCEPTION 'Authorized report book option missing';END IF;
 result:=public.fms_payable_report_secure('{"mode":"aging","size":200}');
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(result->'records') row WHERE row->>'kind'<>'financial') THEN RAISE EXCEPTION 'Estimated liabilities entered financial aging';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(result->'records') LOOP
  IF item->>'balance_state'='ready' AND
   (item->>'current_amount')::numeric+(item->>'age1_to30')::numeric+(item->>'age31_to60')::numeric+
   (item->>'age61_to90')::numeric+(item->>'age91_to180')::numeric+(item->>'age_over180')::numeric+
   (item->>'credit_balance')::numeric<>(item->>'balance_amount')::numeric THEN RAISE EXCEPTION 'Aging buckets lost or doubled money';END IF;
 END LOOP;
 blocked:=false;BEGIN PERFORM public.fms_payable_report_secure('{"mode":"aging","kind":"estimated"}');EXCEPTION WHEN invalid_parameter_value THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Estimated aging was silently accepted';END IF;
 blocked:=false;BEGIN PERFORM public.fms_payable_report_secure('{"action":"export","size":1}');EXCEPTION WHEN invalid_parameter_value THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Export silently truncated report rows';END IF;
 blocked:=false;BEGIN PERFORM public.fms_payable_report_secure('{"size":201}');EXCEPTION WHEN invalid_parameter_value THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'View pagination limit bypassed';END IF;
 PERFORM public.fms_payable_report_secure('{"action":"export","size":10000}');
 PERFORM public.fms_payable_report_secure('{"action":"print","size":2}');
 PERFORM set_config('request.headers','{"x-art-tenant-scope":"028e6a68-a9db-4055-974c-1e05bfe94b0f"}',true);
 result:=public.fms_payable_report_secure('{"size":200}');
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(result->'records') row WHERE row->>'tenant_id'<>'111e83d3-190e-4405-84c8-440d484d13a6') THEN RAISE EXCEPTION 'Forged report scope leaked rows';END IF;
 blocked:=false;BEGIN PERFORM public.fms_payable_report_secure('{"tenant_id":"028e6a68-a9db-4055-974c-1e05bfe94b0f"}');EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Explicit foreign report tenant accepted';END IF;
END $report$;
RESET ROLE;

DO $group_totals$
DECLARE summary jsonb;item jsonb;expected numeric;
BEGIN
 PERFORM set_config('request.headers','{}',true);
 summary:=public.fms_payable_report_secure('{"mode":"summary","size":200}');
 FOR item IN SELECT value FROM jsonb_array_elements(summary->'records') LOOP
  SELECT sum((fact->>'balance_amount')::numeric) INTO expected FROM app_private.payable_report_source_balances('{}') fact
  WHERE fact->>'tenant_id'=item->>'tenant_id' AND fact->>'account_set_id'=item->>'account_set_id'
   AND (fact->>'organization_id') IS NOT DISTINCT FROM (item->>'organization_id')
   AND fact->>'party_type'=item->>'party_type' AND fact->>'party_id'=item->>'party_id'
   AND fact->>'kind'=item->>'kind' AND fact->>'currency_code'=item->>'currency_code'
   AND fact->>'base_currency_code'=item->>'base_currency_code';
  IF item->>'balance_state'='ready' AND expected IS DISTINCT FROM (item->>'balance_amount')::numeric THEN RAISE EXCEPTION 'Report grouped different books, organizations or currencies';END IF;
 END LOOP;
END $group_totals$;

DO $permissions$
DECLARE target_role uuid:='40283472-f334-4cb9-84a0-2a41fcf7ab25';blocked boolean;button_id uuid;
BEGIN
 SELECT id INTO STRICT button_id FROM public.sys_menu WHERE name='FinancePayableReport:Export';
 DELETE FROM public.sys_role_menu WHERE sys_role_menu.role_id=target_role AND menu_id=button_id;
 blocked:=false;BEGIN PERFORM public.fms_payable_report_secure('{"action":"export"}');EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Source export permission bypassed report export permission';END IF;
 SELECT id INTO STRICT button_id FROM public.sys_menu WHERE name='FinancePayableReport:Print';
 DELETE FROM public.sys_role_menu WHERE sys_role_menu.role_id=target_role AND menu_id=button_id;
 blocked:=false;BEGIN PERFORM public.fms_payable_report_secure('{"action":"print"}');EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Report print permission missing server enforcement';END IF;
 DELETE FROM public.sys_role_menu WHERE sys_role_menu.role_id=target_role AND menu_id IN(SELECT id FROM public.sys_menu WHERE name IN('FinanceEstimatedPayable:View','FinancePurchasePayable:View'));
 blocked:=false;BEGIN PERFORM public.fms_payable_report_secure('{}');EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Report permission bypassed missing source permissions';END IF;
 blocked:=false;BEGIN PERFORM public.fms_payable_report_options_secure();EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Report options bypassed missing source permissions';END IF;
 IF has_function_privilege('anon','public.fms_payable_report_secure(jsonb)','execute')
  OR has_function_privilege('anon','public.fms_payable_report_options_secure()','execute')
  OR has_function_privilege('authenticated','app_private.payable_report_source_balances(jsonb)','execute') THEN RAISE EXCEPTION 'Report private or anonymous execute leak';END IF;
END $permissions$;

ROLLBACK;
