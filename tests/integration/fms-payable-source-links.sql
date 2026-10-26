BEGIN;
SET LOCAL jit=off;

CREATE TEMPORARY TABLE qa_source_links(
 tenant_id uuid,actor uuid,root_actor uuid,other_tenant uuid,payable_id uuid,payment_id uuid,statement_id uuid
) ON COMMIT DROP;
GRANT SELECT ON qa_source_links TO authenticated;

DO $prepare_source_links$
DECLARE actor_ident uuid;root_ident uuid;qa uuid;other_ident uuid;role_ident uuid;
BEGIN
 SELECT auth_user_id,tenant_id INTO STRICT actor_ident,qa FROM public.sys_user
 WHERE auth_user_id='a9eeb9b7-e474-43e3-9cc2-c2f46c0f0ec3' AND NOT system_protected;
 SELECT auth_user_id INTO STRICT root_ident FROM public.sys_user WHERE system_protected AND user_roles @>ARRAY['R_SUPER'] AND status='1' ORDER BY id LIMIT 1;
 SELECT id INTO STRICT other_ident FROM public.sys_tenant WHERE id<>qa AND status='1' AND builtin_type IS DISTINCT FROM 'platform'
  AND(service_start_date IS NULL OR service_start_date<=(now() AT TIME ZONE 'Asia/Shanghai')::date)
  AND(service_end_date IS NULL OR service_end_date>=(now() AT TIME ZONE 'Asia/Shanghai')::date) ORDER BY id LIMIT 1;
 SELECT id INTO STRICT role_ident FROM public.sys_role WHERE tenant_id=qa AND role_code='QA_AP_ACCEPTANCE_01A15DAD';
 WITH RECURSIVE required_menu AS(
  SELECT id,parent_id FROM public.sys_menu WHERE name='FinanceCarrierSettlement:View'
  UNION SELECT parent.id,parent.parent_id FROM public.sys_menu parent JOIN required_menu child ON parent.id=child.parent_id
 ) INSERT INTO public.sys_role_menu(tenant_id,role_id,menu_id)
 SELECT qa,role_ident,id FROM required_menu menu
 WHERE NOT EXISTS(SELECT 1 FROM public.sys_role_menu access WHERE access.role_id=role_ident AND access.menu_id=menu.id);
 INSERT INTO qa_source_links
 SELECT qa,actor_ident,root_ident,other_ident,payable.id,payment.id,statement.id
 FROM public.mdm_carrier carrier
 JOIN public.tms_carrier_statement statement ON statement.carrier_id=carrier.id AND statement.tenant_id=carrier.tenant_id
 JOIN public.fms_purchase_payable_document payable ON payable.tms_statement_id=statement.id AND payable.tenant_id=statement.tenant_id AND payable.kind='financial'
 JOIN public.fms_payable_settlement_line line ON line.payable_id=payable.id AND line.tenant_id=payable.tenant_id
 JOIN public.fms_payable_settlement_document payment ON payment.id=line.document_id AND payment.tenant_id=line.tenant_id AND payment.kind='payment'
 WHERE carrier.tenant_id=qa AND carrier.company_name IN('隔离运输验收承运商1','隔离运输验收承运商2');
 IF(SELECT count(*) FROM qa_source_links)<>2 THEN RAISE EXCEPTION 'Two real linked transport examples are required';END IF;
END $prepare_source_links$;

SET LOCAL ROLE authenticated;

DO $source_scope_matrix$
DECLARE context qa_source_links;mode text;finance jsonb;payment jsonb;
BEGIN
 FOR context IN SELECT * FROM qa_source_links LOOP
  FOREACH mode IN ARRAY ARRAY['ordinary_own','ordinary_forged','platform_all','platform_selected'] LOOP
   PERFORM set_config('request.jwt.claim.sub',CASE WHEN mode LIKE 'platform%' THEN context.root_actor ELSE context.actor END::text,true);
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',CASE WHEN mode LIKE 'platform%' THEN context.root_actor ELSE context.actor END,'role','authenticated')::text,true);
   PERFORM set_config('request.headers',CASE WHEN mode='ordinary_forged' THEN jsonb_build_object('x-art-tenant-scope',context.other_tenant)::text WHEN mode='platform_selected' THEN jsonb_build_object('x-art-tenant-scope',context.tenant_id)::text ELSE '{}' END,true);
   finance:=public.fms_purchase_payable_list_secure('financial',p_id=>context.payable_id)->'data'->0;
   payment:=public.fms_payable_settlement_list_secure('payment',jsonb_build_object('id',context.payment_id))->'data'->0;
   IF finance->>'tenant_id' IS DISTINCT FROM context.tenant_id::text
    OR finance->>'tms_statement_id' IS DISTINCT FROM context.statement_id::text
    OR finance->>'source_document_id' IS NOT NULL
    OR payment->'lines'->0->>'source_document_id' IS DISTINCT FROM context.payable_id::text
    OR payment->'lines'->0->>'source_document_kind' IS DISTINCT FROM 'financial_payable' THEN
    RAISE EXCEPTION 'Source pointer was missing, guessed, or taken from another tenant';
   END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claim.sub',context.root_actor::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',context.root_actor,'role','authenticated')::text,true);
  PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',context.other_tenant)::text,true);
  IF(public.fms_purchase_payable_list_secure('financial',p_id=>context.payable_id)->>'total')::integer<>0
   OR(public.fms_payable_settlement_list_secure('payment',jsonb_build_object('id',context.payment_id))->>'total')::integer<>0 THEN
   RAISE EXCEPTION 'Foreign selected scope disclosed a source reference';
  END IF;
 END LOOP;
END $source_scope_matrix$;

RESET ROLE;

DO $actual_parent_identity$
DECLARE line record;projection jsonb;related jsonb;expected_id uuid;expected_kind text;
BEGIN
 FOR line IN SELECT item.*,document.kind document_kind FROM public.fms_payable_settlement_line item
 JOIN public.fms_payable_settlement_document document ON document.id=item.document_id AND document.tenant_id=item.tenant_id
 WHERE item.tenant_id='111e83d3-190e-4405-84c8-440d484d13a6' LOOP
  projection:=app_private.payable_settlement_json(line.document_id);
  SELECT value INTO STRICT related FROM jsonb_array_elements(projection->'lines') WHERE value->>'id'=line.id::text;
  expected_id:=NULL;expected_kind:=NULL;
  IF line.document_kind='refund' THEN
   SELECT parent.id,'payable_payment' INTO expected_id,expected_kind
   FROM public.fms_payable_settlement_line source JOIN public.fms_payable_settlement_document parent ON parent.id=source.document_id AND parent.tenant_id=source.tenant_id AND parent.kind='payment'
   WHERE source.id=line.refund_payment_line_id AND source.tenant_id=line.tenant_id;
  ELSIF line.payable_id IS NOT NULL THEN
   SELECT id,CASE kind WHEN 'financial' THEN 'financial_payable' ELSE 'estimated_payable' END INTO expected_id,expected_kind
   FROM public.fms_purchase_payable_document WHERE id=line.payable_id AND tenant_id=line.tenant_id;
  ELSIF line.purchase_id IS NOT NULL THEN
   SELECT id,kind INTO expected_id,expected_kind FROM public.scm_purchase_document
   WHERE id=line.purchase_id AND tenant_id=line.tenant_id AND kind IN('purchase_contract','purchase_order');
  ELSIF line.document_kind='payment' AND line.application_line_id IS NOT NULL THEN
   SELECT parent.id,'payable_application' INTO expected_id,expected_kind
   FROM public.fms_payable_settlement_line source JOIN public.fms_payable_settlement_document parent ON parent.id=source.document_id AND parent.tenant_id=source.tenant_id AND parent.kind='application'
   WHERE source.id=line.application_line_id AND source.tenant_id=line.tenant_id;
  END IF;
  IF related->>'source_document_id' IS DISTINCT FROM expected_id::text
   OR related->>'source_document_kind' IS DISTINCT FROM expected_kind THEN
   RAISE EXCEPTION 'Source navigation used a line identifier or the wrong document family';
  END IF;
 END LOOP;
END $actual_parent_identity$;

ROLLBACK;
