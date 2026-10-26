BEGIN;

DO $balance_equivalence$
DECLARE
 actor uuid;party record;expected numeric;actual numeric;tested integer:=0;source_ids uuid[];
BEGIN
 SELECT auth_user_id INTO STRICT actor FROM public.sys_user WHERE auth_user_id IS NOT NULL AND 'R_SUPER'=ANY(user_roles) AND status='1' ORDER BY id LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 PERFORM set_config('request.headers','{}',true);
 FOR party IN
  SELECT DISTINCT document.tenant_id,document.supplier_id,NULL::uuid carrier_id
  FROM public.fms_purchase_payable_document document WHERE document.kind='financial' AND document.supplier_id IS NOT NULL
  UNION
  SELECT DISTINCT document.tenant_id,NULL::uuid,statement.carrier_id
  FROM public.fms_purchase_payable_document document JOIN public.tms_carrier_statement statement ON statement.id=document.tms_statement_id AND statement.tenant_id=document.tenant_id
  WHERE document.kind='financial' AND statement.carrier_id IS NOT NULL
 LOOP
  SELECT array_agg(document.id) INTO source_ids FROM public.fms_purchase_payable_document document
  WHERE document.tenant_id=party.tenant_id AND document.kind='financial' AND document.status='approved' AND NOT document.is_reversal AND document.business_date<=app_private.payable_business_date()
   AND((party.supplier_id IS NOT NULL AND document.supplier_id=party.supplier_id) OR(party.carrier_id IS NOT NULL AND EXISTS(
    SELECT 1 FROM public.tms_carrier_statement statement WHERE statement.id=document.tms_statement_id AND statement.tenant_id=party.tenant_id AND statement.carrier_id=party.carrier_id)));
  WITH balances AS(
   SELECT value,CASE WHEN jsonb_typeof(value->'base_balance_amount')='number' THEN(value->>'base_balance_amount')::numeric END amount
   FROM app_private.payable_report_source_balances(jsonb_build_object('tenant_id',party.tenant_id,'kind','financial')) value
   WHERE(value->>'document_id')::uuid=ANY(source_ids)
  ) SELECT CASE WHEN count(*)<>coalesce(cardinality(source_ids),0)
   OR coalesce(bool_or(value->>'balance_state' IS DISTINCT FROM 'ready' OR amount IS NULL),false)
   OR coalesce(bool_or(value->>'base_currency_code' IS DISTINCT FROM 'CNY' AND amount<>0),false)
   THEN NULL ELSE coalesce(sum(amount),0) END INTO expected FROM balances;
  actual:=app_private.payable_counterparty_balance(party.tenant_id,party.supplier_id,party.carrier_id);
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Setwise counterparty balance changed authoritative currency or writeoff semantics';END IF;
  tested:=tested+1;
 END LOOP;
 IF tested<2 THEN RAISE EXCEPTION 'Need at least two real counterparty balance scenarios';END IF;
 IF app_private.payable_counterparty_balance(party.tenant_id,NULL,NULL) IS DISTINCT FROM 0 OR app_private.payable_counterparty_balance(party.tenant_id,gen_random_uuid(),NULL) IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'Empty counterparty did not retain its genuine zero balance';END IF;
 IF coalesce(app_private.payable_counterparty_balance(gen_random_uuid(),gen_random_uuid(),NULL),0)<>0 THEN RAISE EXCEPTION 'Unknown tenant disclosed a monetary balance';END IF;
 IF has_function_privilege('anon','app_private.payable_counterparty_balance(uuid,uuid,uuid)','EXECUTE') OR has_function_privilege('authenticated','app_private.payable_counterparty_balance(uuid,uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Internal balance reader became directly executable';END IF;
END $balance_equivalence$;

ROLLBACK;
