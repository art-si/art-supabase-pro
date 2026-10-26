BEGIN;
SET LOCAL statement_timeout='8s';

DO $original_projection$
DECLARE original_definition text;
BEGIN
 SELECT function_value->>'definition' INTO STRICT original_definition
 FROM app_private.payable_workspace_recovery_snapshot backup
 CROSS JOIN LATERAL jsonb_array_elements(backup.snapshot->'functions') function_value
 WHERE backup.snapshot->>'type'='payable_projection_batch'
  AND function_value->>'name'='payable_settlement_json'
 ORDER BY backup.captured_at DESC LIMIT 1;
 EXECUTE replace(original_definition,'FUNCTION app_private.payable_settlement_json(',
  'FUNCTION pg_temp.original_payable_settlement_json(');
END $original_projection$;

CREATE FUNCTION pg_temp.check_payable_projection(p_scope text,p_kind text) RETURNS jsonb
LANGUAGE plpgsql AS $test$
DECLARE actor uuid;own_tenant uuid;selected_tenant uuid;source_ids uuid[];
 source record;expected jsonb;actual jsonb;result jsonb;view_mode text;tested integer:=0;expected_total integer;
BEGIN
 IF p_scope IN('all','selected') THEN
  SELECT auth_user_id,tenant_id INTO STRICT actor,own_tenant FROM public.sys_user
  WHERE auth_user_id IS NOT NULL AND 'R_SUPER'=ANY(user_roles) AND status='1' ORDER BY id LIMIT 1;
 ELSE
  SELECT auth_user_id,tenant_id INTO STRICT actor,own_tenant FROM public.sys_user
  WHERE user_roles=ARRAY['QA_AP_ACCEPTANCE_01A15DAD'] AND NOT system_protected;
 END IF;
 SELECT tenant_id INTO STRICT selected_tenant FROM public.sys_user
 WHERE user_roles=ARRAY['QA_AP_ACCEPTANCE_01A15DAD'] AND NOT system_protected;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 PERFORM set_config('request.headers',CASE WHEN p_scope='selected' THEN jsonb_build_object('x-art-tenant-scope',selected_tenant)::text
  WHEN p_scope='forged' THEN jsonb_build_object('x-art-tenant-scope',gen_random_uuid())::text ELSE '{}' END,true);
 SELECT array_agg(id ORDER BY id) INTO source_ids FROM (
  SELECT id FROM public.fms_payable_settlement_document
  WHERE kind=p_kind AND tenant_id=selected_tenant ORDER BY id LIMIT 2
 ) sources;
 IF cardinality(source_ids) IS DISTINCT FROM 2 THEN RAISE EXCEPTION 'Need two actual documents per settlement kind';END IF;
 FOR source IN SELECT * FROM app_private.payable_settlement_documents_json(source_ids) LOOP
  expected:=pg_temp.original_payable_settlement_json(source.document_id);
  actual:=app_private.payable_settlement_json(source.document_id);
  IF source.value IS DISTINCT FROM expected OR actual IS DISTINCT FROM expected THEN
   RAISE EXCEPTION 'Batch projection changed monetary, source, status, permission or NULL semantics';
  END IF;
  FOREACH view_mode IN ARRAY ARRAY['document','line'] LOOP
   result:=public.fms_payable_settlement_list_secure(p_kind,jsonb_build_object('id',source.document_id,'view_mode',view_mode));
   IF (result->>'total')::integer<>(CASE WHEN view_mode='line' THEN jsonb_array_length(expected->'lines') ELSE 1 END) THEN
    RAISE EXCEPTION 'Settlement list total changed';
   END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(result->'data') row_value WHERE(row_value->>'tenant_id')::uuid<>selected_tenant) THEN
    RAISE EXCEPTION 'Settlement list tenant scope leaked';
   END IF;
   IF view_mode='document' AND (result->'data'->0) IS DISTINCT FROM (expected||jsonb_build_object('record_key',expected->>'id')) THEN
    RAISE EXCEPTION 'Document list projection differs from original';
   END IF;
   IF view_mode='line' AND EXISTS(
    SELECT 1 FROM jsonb_array_elements(result->'data') row_value
    LEFT JOIN LATERAL(SELECT line_value FROM jsonb_array_elements(expected->'lines') line_value
     WHERE line_value->>'id'=row_value->'lines'->0->>'id') original_line ON true
    WHERE original_line.line_value IS NULL OR row_value IS DISTINCT FROM expected||jsonb_build_object(
     'lines',jsonb_build_array(original_line.line_value),'record_key',(expected->>'id')||':'||(original_line.line_value->>'id'),
     'amount',original_line.line_value->'amount','counterparty_name',original_line.line_value->'supplier_name',
     'approved_amount',original_line.line_value->'approved_amount','planned_amount',original_line.line_value->'planned_amount',
     'paid_amount',original_line.line_value->'paid_amount')
   ) THEN RAISE EXCEPTION 'Line list projection differs from original';END IF;
  END LOOP;
  tested:=tested+1;
 END LOOP;
 IF tested<>2 OR EXISTS(SELECT 1 FROM app_private.payable_settlement_documents_json(ARRAY[]::uuid[]))
  OR EXISTS(SELECT 1 FROM app_private.payable_settlement_documents_json(NULL::uuid[]))
  OR app_private.payable_settlement_json(gen_random_uuid()) IS NOT NULL THEN
  RAISE EXCEPTION 'Batch empty or missing-document semantics changed';
 END IF;
 result:=public.fms_payable_settlement_list_secure(p_kind,jsonb_build_object('size',1));
 SELECT count(*) INTO expected_total FROM public.fms_payable_settlement_document
 WHERE kind=p_kind AND (p_scope='all' OR tenant_id=selected_tenant);
 IF (result->>'total')::integer<>expected_total OR jsonb_array_length(result->'data')<>least(expected_total,1)
  OR(p_scope<>'all' AND EXISTS(SELECT 1 FROM jsonb_array_elements(result->'data') row_value
   WHERE(row_value->>'tenant_id')::uuid<>selected_tenant)) THEN
  RAISE EXCEPTION 'Full-list tenant scope or pagination changed';
 END IF;
 IF has_function_privilege('anon','app_private.payable_settlement_documents_json(uuid[])','EXECUTE')
  OR has_function_privilege('authenticated','app_private.payable_settlement_documents_json(uuid[])','EXECUTE') THEN
  RAISE EXCEPTION 'Internal batch projection became publicly executable';
 END IF;
 RETURN jsonb_build_object('scope',p_scope,'kind',p_kind,'documents',tested,'views',2);
END $test$;

SELECT pg_temp.check_payable_projection('all','application');
SELECT pg_temp.check_payable_projection('selected','application');
SELECT pg_temp.check_payable_projection('ordinary','application');
SELECT pg_temp.check_payable_projection('forged','application');
SELECT pg_temp.check_payable_projection('all','payment');
SELECT pg_temp.check_payable_projection('selected','payment');
SELECT pg_temp.check_payable_projection('ordinary','payment');
SELECT pg_temp.check_payable_projection('forged','payment');
SELECT pg_temp.check_payable_projection('all','refund');
SELECT pg_temp.check_payable_projection('selected','refund');
SELECT pg_temp.check_payable_projection('ordinary','refund');
SELECT pg_temp.check_payable_projection('forged','refund');

ROLLBACK;
