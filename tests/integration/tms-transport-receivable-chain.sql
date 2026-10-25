-- Two transport estimates are saved, submitted, approved and converted through business RPCs.
-- All generated documents and workflow changes roll back.
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
SELECT set_config('request.headers','{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}',true);
DO $test$
DECLARE w uuid; e uuid; f uuid; org uuid; d public.fms_receivable_document; lines jsonb; report jsonb; expected numeric; actual numeric; account uuid; receipt uuid;
BEGIN
 SELECT id INTO org FROM public.mdm_organization WHERE tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9' AND organization_type='company' AND status='1' ORDER BY id LIMIT 1;
 IF org IS NULL THEN RAISE EXCEPTION 'Missing enabled company fixture'; END IF;
 FOREACH w IN ARRAY ARRAY['a9fc0006-1023-4620-9220-000000000001'::uuid,'a9fc0006-1023-4620-9220-000000000002'::uuid] LOOP
 e:=(public.fms_create_transport_estimated_receivables_secure(w)->>0)::uuid;
 SELECT * INTO d FROM public.fms_receivable_document WHERE id=e;
 expected:=d.total_amount;
 IF d.status='approved' THEN
  SELECT id INTO f FROM public.fms_receivable_document WHERE estimate_id=e AND kind='financial' AND status='approved';
  IF f IS NULL THEN RAISE EXCEPTION 'Approved estimate missing financial document'; END IF;
  SELECT r.id INTO receipt FROM public.fms_receipt_document r JOIN public.fms_receipt_line rl ON rl.receipt_id=r.id JOIN public.fms_receivable_line fl ON fl.id=rl.financial_line_id WHERE fl.document_id=f AND r.status='confirmed';
  IF receipt IS NULL THEN RAISE EXCEPTION 'Financial fixture missing confirmed receipt'; END IF;
  -- Existing persisted acceptance fixtures must support idempotent confirmation.
  PERFORM public.fms_act_receipt_secure(receipt,'confirm');
  CONTINUE;
 END IF;
 SELECT jsonb_agg(jsonb_build_object('lineNo',line_no,'basis',basis,'sourceLineId',source_line_id,'sourceLineNo',source_line_no,'sourceTotalAmount',source_total_amount,'materialDescription',material_description,'quantity',quantity,'priceBasis','taxed','taxInclusiveUnitPrice',tax_inclusive_unit_price,'taxRate',9,'enteredGrossAmount',total_amount)) INTO lines FROM public.fms_receivable_line WHERE document_id=e;
 PERFORM public.fms_save_receivable_document_secure(jsonb_build_object('id',e,'kind','estimate','customerId',d.customer_id,'documentTypeId',d.document_type_id,'settlementOrganizationId',org,'businessDate','2026-10-01','currencyCode','CNY','remark','TMS报表验收：运输应收链路','lines',lines));
 PERFORM public.fms_act_receivable_document_secure(e,'submit');
 PERFORM public.fms_act_receivable_document_secure(e,'approve');
 f:=public.fms_push_financial_receivable_secure(e);
 PERFORM public.fms_act_receivable_document_secure(f,'submit');
 PERFORM public.fms_act_receivable_document_secure(f,'approve');
 IF NOT EXISTS(SELECT 1 FROM public.fms_receivable_document WHERE id=f AND status='approved') THEN RAISE EXCEPTION 'Financial receivable not approved'; END IF;
 SELECT fa.id INTO account FROM public.fms_fund_account fa JOIN public.fms_currency c ON c.id=fa.currency_id AND c.tenant_id=fa.tenant_id
 WHERE fa.tenant_id=d.tenant_id AND fa.status='active' AND fa.account_set_id=app_private.resolve_fms_posting_account_set(d.tenant_id) AND c.currency_code='CNY' ORDER BY fa.id LIMIT 1;
 IF account IS NULL THEN RAISE EXCEPTION 'Missing fixture fund account'; END IF;
 SELECT jsonb_agg(jsonb_build_object('financialLineId',id,'amount',round(total_amount/2,2),'remark','报表验收半额收款')) INTO lines FROM public.fms_receivable_line WHERE document_id=f;
 receipt:=public.fms_save_receipt_secure(jsonb_build_object('tenantId',d.tenant_id,'customerId',d.customer_id,'settlementOrganizationId',org,'businessDate',current_date,'currencyCode','CNY','fundAccountId',account,'remark','TMS报表验收：半额收款','lines',lines));
 PERFORM public.fms_act_receipt_secure(receipt,'submit');
 PERFORM public.fms_act_receipt_secure(receipt,'approve');
 PERFORM public.fms_act_receipt_secure(receipt,'confirm');
 IF NOT EXISTS(SELECT 1 FROM public.fms_receipt_document WHERE id=receipt AND status='confirmed') THEN RAISE EXCEPTION 'Receipt not confirmed'; END IF;
 SELECT total_amount INTO actual FROM public.fms_receivable_document WHERE id=f;
 IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Source total changed during receivable conversion'; END IF;
 END LOOP;
 PERFORM set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
 PERFORM set_config('request.headers','{"x-art-tenant-scope":"2824c2b5-2774-4781-b995-f55e8bcee920"}',true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 report:=public.tms_management_report('receivables','2026-09-01',greatest(current_date,'2026-10-31'::date),'报表验收',0,200);
 SELECT sum((r->>'total_amount')::numeric) INTO actual FROM jsonb_array_elements(report->'records') r
 WHERE r->>'order_id' IN ('a9fc0005-1023-4620-9220-000000000001','a9fc0005-1023-4620-9220-000000000002');
 IF actual IS DISTINCT FROM 20000::numeric THEN RAISE EXCEPTION 'Ordinary report must retain both transport receivables totaling 20000'; END IF;
 SELECT sum((r->>'amount')::numeric) INTO actual FROM jsonb_array_elements(report->'records') r WHERE r->>'order_id' IN ('a9fc0005-1023-4620-9220-000000000001','a9fc0005-1023-4620-9220-000000000002');
 IF actual IS DISTINCT FROM 10000::numeric THEN RAISE EXCEPTION 'Half receipts must leave 10000 outstanding, got %',actual; END IF;
 -- Closing balance is a point-in-time value, including in the annual overview.
 report:=public.tms_management_report('monthly-overview','2026-10-01','2026-10-31',null,0,1);
 IF (report->'summary'->>'receivable')::numeric IS DISTINCT FROM 10000::numeric THEN RAISE EXCEPTION 'Monthly closing balance differs from receipts'; END IF;
 report:=public.tms_management_report('monthly-overview','2026-01-01','2026-10-31',null,0,1);
 IF (report->'summary'->>'receivable')::numeric IS DISTINCT FROM 10000::numeric THEN RAISE EXCEPTION 'Annual closing balance was accumulated'; END IF;
 -- (Opening 0 + closing 10000) / 2 / sales 20000 * 31 days = 7.75.
 report:=public.tms_management_report('operations-kpi','2026-10-01','2026-10-31','报表验收',0,20);
 SELECT (r->>'actual')::numeric INTO actual FROM jsonb_array_elements(report->'records') r WHERE r->>'code'='turnover';
 IF actual IS DISTINCT FROM 7.75::numeric THEN RAISE EXCEPTION 'Operational turnover differs from receivable chain: %',actual; END IF;
END $test$;
ROLLBACK;
