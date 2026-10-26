BEGIN;

DO $match_projection$
DECLARE
 source record;payload jsonb;expected jsonb;actual jsonb;checked integer:=0;
BEGIN
 FOR source IN
  SELECT document.*,statement.carrier_id
  FROM public.fms_purchase_payable_document document
  LEFT JOIN public.tms_carrier_statement statement ON statement.id=document.tms_statement_id AND statement.tenant_id=document.tenant_id
 LOOP
  payload:=app_private.purchase_payable_json(source.id);
  expected:=jsonb_build_object(
   'supplier_id',coalesce(source.supplier_id,source.carrier_id),'currency_code',source.currency_code,
   'project_id',source.project_id,'organization_id',source.organization_id,'source_id',source.id,
   'document_no',source.document_no,'business_date',source.business_date,
   'source_document_no',payload->>'source_document_no','amount',(payload->>'total_amount')::numeric,
   'account_set_id',source.account_set_id);
  actual:=app_private.payable_primary_match_values(source.id,payload);
  IF actual IS DISTINCT FROM expected OR app_private.payable_writeoff_match_values(source.id,'primary') IS DISTINCT FROM expected THEN
   RAISE EXCEPTION 'Cached and uncached primary matching projections differ for %',source.id;
  END IF;
  IF app_private.payable_primary_match_values(source.id,'{}') IS NOT NULL
   OR app_private.payable_primary_match_values(source.id,jsonb_set(payload,'{id}',to_jsonb(gen_random_uuid()))) IS NOT NULL
   OR app_private.payable_primary_match_values(source.id,jsonb_set(payload,'{tenant_id}',to_jsonb(gen_random_uuid()))) IS NOT NULL THEN
   RAISE EXCEPTION 'Cached matching projection accepted a mismatched source identity';
  END IF;
  checked:=checked+1;
 END LOOP;
 IF checked<2 THEN RAISE EXCEPTION 'Matching projection regression needs at least two source documents';END IF;
 IF has_function_privilege('anon','app_private.payable_primary_match_values(uuid,jsonb)','EXECUTE')
  OR has_function_privilege('authenticated','app_private.payable_primary_match_values(uuid,jsonb)','EXECUTE')
  OR has_function_privilege('service_role','app_private.payable_primary_match_values(uuid,jsonb)','EXECUTE') THEN
  RAISE EXCEPTION 'Server-only matching cache projection became client-executable';
 END IF;
END $match_projection$;

ROLLBACK;
