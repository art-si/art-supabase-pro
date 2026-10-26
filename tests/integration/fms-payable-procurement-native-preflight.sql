BEGIN;
SET LOCAL jit=off;

DO $prepare_procurement_permissions$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.sys_user WHERE auth_user_id='a9eeb9b7-e474-43e3-9cc2-c2f46c0f0ec3'
  AND tenant_id='111e83d3-190e-4405-84c8-440d484d13a6' AND NOT system_protected
  AND user_roles=ARRAY['QA_AP_ACCEPTANCE_01A15DAD']) THEN RAISE EXCEPTION 'Unexpected procurement QA identity';END IF;
 WITH RECURSIVE required_menu AS(
  SELECT id,parent_id FROM public.sys_menu WHERE name IN(
   'ScmPurchaseContract:View','ScmPurchaseContract:Add','ScmPurchaseContract:Submit','ScmPurchaseContract:Approve','ScmPurchaseContract:Activate','ScmPurchaseContract:Push',
   'ScmPurchaseOrder:View','ScmPurchaseOrder:Add','ScmPurchaseOrder:Submit','ScmPurchaseOrder:Approve','ScmPurchaseOrder:Push',
   'MdmMaterialArchive:View','MdmUnitOfMeasure:View','MdmPurchaseSupplier:View','MdmSalesProject:View','MdmDocumentType:View')
  UNION SELECT parent.id,parent.parent_id FROM public.sys_menu parent JOIN required_menu child ON parent.id=child.parent_id
 ) INSERT INTO public.sys_role_menu(tenant_id,role_id,menu_id)
 SELECT '111e83d3-190e-4405-84c8-440d484d13a6','40283472-f334-4cb9-84a0-2a41fcf7ab25',id FROM required_menu menu
 WHERE NOT EXISTS(SELECT 1 FROM public.sys_role_menu access WHERE access.role_id='40283472-f334-4cb9-84a0-2a41fcf7ab25' AND access.menu_id=menu.id);
 PERFORM set_config('request.jwt.claim.sub','a9eeb9b7-e474-43e3-9cc2-c2f46c0f0ec3',true);
 PERFORM set_config('request.jwt.claims','{"sub":"a9eeb9b7-e474-43e3-9cc2-c2f46c0f0ec3","role":"authenticated"}',true);
 PERFORM set_config('request.headers','{"x-art-tenant-scope":"028e6a68-a9db-4055-974c-1e05bfe94b0f"}',true);
END $prepare_procurement_permissions$;

SET LOCAL ROLE authenticated;

DO $procurement_preflight$
DECLARE
 source_kind text;example integer;source_ident uuid;source_no text;supplier uuid;material uuid;unit_name text;
 application jsonb;payment jsonb;amount_value numeric;blocked boolean;line_id uuid;project_ident uuid;type_ident uuid;
 source_tenant uuid:='111e83d3-190e-4405-84c8-440d484d13a6';
BEGIN
 SELECT measure.unit_name INTO STRICT unit_name FROM public.mdm_unit_of_measure measure
 WHERE measure.id='22e389b8-a58d-4fc9-8689-e6fb785d598f' AND measure.tenant_id=source_tenant;
 SELECT id INTO STRICT project_ident FROM public.mdm_project WHERE tenant_id=source_tenant AND project_name='隔离预付款验收项目（非经营）';
 FOREACH source_kind IN ARRAY ARRAY['purchase_contract','purchase_order'] LOOP
  SELECT id INTO STRICT type_ident FROM public.mdm_document_type WHERE tenant_id=source_tenant
   AND document_type_code=CASE source_kind WHEN 'purchase_contract' THEN 'QA_AP_PREPAY_CONTRACT' ELSE 'QA_AP_PREPAY_ORDER' END;
  FOR example IN 1..2 LOOP
   SELECT id INTO STRICT supplier FROM public.mdm_supplier WHERE tenant_id=source_tenant AND supplier_code='QA_AP_SUP_'||example;
   SELECT id INTO STRICT material FROM public.mdm_material WHERE tenant_id=source_tenant AND material_code='QA_AP_MAT_'||example;
   amount_value:=example*100;
   INSERT INTO public.scm_purchase_document(tenant_id,kind,document_type_id,project_id,document_no,supplier_id,document_date,details,lines,remark)
   VALUES(source_tenant,source_kind,type_ident,project_ident,'',supplier,current_date,'{}'::jsonb,jsonb_build_array(jsonb_build_object(
    'line_id',gen_random_uuid(),'line_no',10,'material_id',material,'material_code','QA_AP_MAT_'||example,
    'material_description','验收虚构物料'||example,'unit',unit_name,'base_unit',unit_name,'quantity',1,'base_quantity',1,
    'unit_price',amount_value,'tax_inclusive_unit_price',amount_value,'tax_rate',0,'discount_rate',0,'discount_type','none','gift',false)),
    'QA_AP_PROCUREMENT_PREFLIGHT') RETURNING id,document_no INTO source_ident,source_no;
   IF source_no IS NULL OR source_no='' THEN RAISE EXCEPTION 'Source numbering failed';END IF;
   UPDATE public.scm_purchase_document SET status='submitted' WHERE id=source_ident;
   UPDATE public.scm_purchase_document SET status='approved' WHERE id=source_ident;
   IF source_kind='purchase_contract' THEN UPDATE public.scm_purchase_document SET status='effective' WHERE id=source_ident;END IF;
   application:=public.fms_push_payable_settlement_secure(source_ident,'application','purchase');
   IF application->>'tenant_id' IS DISTINCT FROM source_tenant::text OR(application->>'amount')::numeric IS DISTINCT FROM amount_value
    OR application->'lines'->0->>'purchase_id' IS DISTINCT FROM source_ident::text
    OR application->'lines'->0->>'source_document_id' IS DISTINCT FROM source_ident::text
    OR application->'lines'->0->>'source_document_kind' IS DISTINCT FROM source_kind
    OR application->'lines'->0->>'purpose_type' IS DISTINCT FROM 'advance' THEN RAISE EXCEPTION 'Native procurement push lost source, tenant, purpose or amount';END IF;
   blocked:=false;
   BEGIN PERFORM public.fms_push_payable_settlement_secure(source_ident,'application','purchase');
   EXCEPTION WHEN check_violation THEN blocked:=true;END;
   IF NOT blocked THEN RAISE EXCEPTION 'Source allowed duplicate prepayment';END IF;
   PERFORM public.fms_act_payable_settlement_secure(ARRAY[(application->>'id')::uuid],'submit');
   PERFORM public.fms_act_payable_settlement_secure(ARRAY[(application->>'id')::uuid],'approve');
   payment:=public.fms_push_payable_settlement_secure((application->>'id')::uuid,'payment','application');
   payment:=public.fms_save_payable_settlement_secure(payment||jsonb_build_object('lines',jsonb_build_array(
    payment->'lines'->0||jsonb_build_object('fund_account_id','2361b02b-9ce2-41aa-9ec6-2780e07a14fc'))));
   PERFORM public.fms_act_payable_settlement_secure(ARRAY[(payment->>'id')::uuid],'submit');
   PERFORM public.fms_act_payable_settlement_secure(ARRAY[(payment->>'id')::uuid],'approve');
   PERFORM public.fms_act_payable_settlement_secure(ARRAY[(payment->>'id')::uuid],'confirm');
   payment:=public.fms_payable_settlement_list_secure('payment',jsonb_build_object('id',payment->>'id'))->'data'->0;
   IF payment->>'status' IS DISTINCT FROM 'confirmed'
    OR NOT EXISTS(SELECT 1 FROM public.fms_payable_payment_execution execution WHERE execution.document_id=(payment->>'id')::uuid
     AND execution.tenant_id=source_tenant AND execution.status='posted' AND execution.account_set_id='cf3eeddd-49b0-4e62-97a9-cab2769cb633'
     AND execution.amount=amount_value AND execution.fund_ledger_id IS NOT NULL)
    OR payment->'lines'->0->>'application_line_id' IS DISTINCT FROM application->'lines'->0->>'id'
    OR payment->'lines'->0->>'purchase_id' IS DISTINCT FROM source_ident::text THEN RAISE EXCEPTION 'Prepayment confirmation lost its book or source chain';END IF;
   line_id:=(payment->'lines'->0->>'id')::uuid;
   IF EXISTS(SELECT 1 FROM public.fms_payable_writeoff_record WHERE payment_line_id=line_id AND status='active') THEN
    RAISE EXCEPTION 'Unallocated procurement advance incorrectly wrote off an unrelated payable';END IF;
  END LOOP;
 END LOOP;
END $procurement_preflight$;

RESET ROLE;
ROLLBACK;
