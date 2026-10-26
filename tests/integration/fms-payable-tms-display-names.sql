BEGIN;
SET LOCAL jit=off;

DO $historical_transport_display$
DECLARE source record;projection jsonb;checked integer:=0;stored_snapshot jsonb;
BEGIN
 FOR source IN
  SELECT payable.id,payable.tenant_id,carrier.company_name,line.id line_id,line.line_snapshot,
   item.item_name,cost.cost_type,line.total_amount
  FROM public.fms_purchase_payable_document payable
  JOIN public.tms_carrier_statement statement ON statement.id=payable.tms_statement_id AND statement.tenant_id=payable.tenant_id
  JOIN public.mdm_carrier carrier ON carrier.id=statement.carrier_id AND carrier.tenant_id=statement.tenant_id
  JOIN public.fms_purchase_payable_line line ON line.document_id=payable.id AND line.tenant_id=payable.tenant_id
  JOIN public.tms_waybill_cost cost ON cost.id=(line.line_snapshot->>'tms_cost_id')::uuid AND cost.tenant_id=line.tenant_id
  JOIN public.tms_expense_item item ON item.id=cost.expense_item_id AND item.tenant_id=cost.tenant_id
  WHERE payable.tenant_id='111e83d3-190e-4405-84c8-440d484d13a6' AND payable.kind='financial'
   AND carrier.company_name IN('隔离运输验收承运商1','隔离运输验收承运商2')
 LOOP
  IF source.line_snapshot->>'material_description' IS DISTINCT FROM source.cost_type THEN
   RAISE EXCEPTION 'Historical-code fixture changed; do not rewrite its approved snapshot';
  END IF;
  projection:=app_private.purchase_payable_json(source.id);
  IF projection->'lines'->0->>'material_description' IS DISTINCT FROM source.item_name
   OR projection->'lines'->0->>'supplier_name' IS DISTINCT FROM source.company_name
   OR projection->>'payee_supplier_name' IS DISTINCT FROM source.company_name
   OR(projection->>'total_amount')::numeric<>source.total_amount
   OR(projection->>'unpaid_amount')::numeric<>0 THEN
   RAISE EXCEPTION 'Historical transport display lost the real expense, counterparty or amount';
  END IF;
  SELECT line_snapshot INTO STRICT stored_snapshot FROM public.fms_purchase_payable_line WHERE id=source.line_id;
  IF stored_snapshot IS DISTINCT FROM source.line_snapshot THEN RAISE EXCEPTION 'Projection rewrote historical transport data';END IF;
  checked:=checked+1;
 END LOOP;
 IF checked<>2 THEN RAISE EXCEPTION 'Two actual historical transport fixtures are required';END IF;
END $historical_transport_display$;

ROLLBACK;
