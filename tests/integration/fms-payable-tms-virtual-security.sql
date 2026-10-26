BEGIN;

CREATE TEMPORARY TABLE qa_noncash_context(
 tenant_id uuid,other_tenant uuid,root_actor uuid,ordinary_actor uuid,role_id uuid,statement_id uuid,
 payable_id uuid,payment_id uuid,line_id uuid,ledger_count bigint
) ON COMMIT DROP;
GRANT SELECT ON qa_noncash_context TO authenticated;

DO $setup$
DECLARE
 root_actor uuid;ordinary_actor uuid;source public.tms_carrier_statement;role_ident uuid;other_tenant uuid;
 code text:='QA_NC_'||upper(left(gen_random_uuid()::text,8));finance jsonb;payment jsonb;method_ident uuid;ledger_count bigint;
BEGIN
 SELECT auth_user_id INTO STRICT root_actor FROM public.sys_user WHERE system_protected AND user_roles @>ARRAY['R_SUPER'] AND status='1' ORDER BY id LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',root_actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',root_actor,'role','authenticated')::text,true);
 PERFORM set_config('request.headers','{}',true);
 SELECT statement.* INTO STRICT source FROM public.tms_carrier_statement statement
 WHERE statement.status='confirmed' AND statement.settled_amount=0
  AND(SELECT bool_and(item.line_amount>0) AND sum(item.line_amount)>8 FROM public.tms_carrier_statement_item item WHERE item.statement_id=statement.id AND item.is_active)
  AND NOT EXISTS(SELECT 1 FROM public.fms_purchase_payable_document payable WHERE payable.tms_statement_id=statement.id AND payable.kind='financial')
  AND EXISTS(SELECT 1 FROM public.mdm_settlement_method method WHERE method.tenant_id=statement.tenant_id AND method.category='virtual' AND method.enabled)
  AND EXISTS(SELECT 1 FROM public.sys_user profile WHERE profile.tenant_id=statement.tenant_id AND profile.status='1' AND profile.auth_user_id IS NOT NULL AND NOT profile.system_protected)
 ORDER BY statement.id LIMIT 1;
 SELECT auth_user_id INTO STRICT ordinary_actor FROM public.sys_user WHERE tenant_id=source.tenant_id AND status='1' AND auth_user_id IS NOT NULL AND NOT system_protected ORDER BY id LIMIT 1;
 SELECT tenant.id INTO STRICT other_tenant FROM public.sys_tenant tenant WHERE tenant.id<>source.tenant_id AND tenant.status='1'
  AND tenant.builtin_type IS DISTINCT FROM 'platform'
  AND(tenant.service_start_date IS NULL OR tenant.service_start_date<=(now() AT TIME ZONE 'Asia/Shanghai')::date)
  AND(tenant.service_end_date IS NULL OR tenant.service_end_date>=(now() AT TIME ZONE 'Asia/Shanghai')::date)
 ORDER BY tenant.id LIMIT 1;
 INSERT INTO public.sys_role(tenant_id,role_code,role_name,enabled) VALUES(source.tenant_id,code,'非现金运输结算普通回滚角色',true) RETURNING id INTO role_ident;
 INSERT INTO public.sys_role_menu(tenant_id,role_id,menu_id)
 SELECT source.tenant_id,role_ident,id FROM public.sys_menu WHERE name IN(
  'FinancePurchasePayable:View','FinancePurchasePayable:Add','FinancePurchasePayable:Import','FinancePurchasePayable:Submit','FinancePurchasePayable:Approve','FinancePurchasePayable:Push',
  'FinancePayablePayment:View','FinancePayablePayment:Add','FinancePayablePayment:Edit','FinancePayablePayment:Submit','FinancePayablePayment:Approve','FinancePayablePayment:Confirm',
  'FinancePayableWriteoff:View','FinancePayableWriteoff:Writeoff','FinancePayableWriteoff:Reverse','FinancePayableWriteoff:AutoWriteoff',
  'FinanceCarrierSettlement:View','FinanceCashTransaction:Allocate');
 INSERT INTO public.sys_role_field_permission(tenant_id,role_id,resource_id,field_id,access_level)
 SELECT source.tenant_id,role_ident,resource.id,field.id,'edit' FROM public.sys_permission_resource resource JOIN public.sys_permission_field field ON field.resource_id=resource.id
 WHERE resource.tenant_id=source.tenant_id AND field.tenant_id=source.tenant_id AND resource.resource_key='tms.carrier_statement' AND field.field_key IN('statementAmounts','settlementAmounts');
 UPDATE public.sys_user SET user_roles=ARRAY[code] WHERE auth_user_id=ordinary_actor;
 PERFORM set_config('request.jwt.claim.sub',ordinary_actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ordinary_actor,'role','authenticated')::text,true);
 finance:=public.fms_import_carrier_payable_secure('financial',source.id);
 PERFORM public.fms_act_purchase_payable_secure(ARRAY[(finance->>'id')::uuid],'submit');
 PERFORM public.fms_act_purchase_payable_secure(ARRAY[(finance->>'id')::uuid],'approve');
 SELECT method.id INTO STRICT method_ident FROM public.mdm_settlement_method method WHERE method.tenant_id=source.tenant_id AND method.category='virtual' AND method.enabled ORDER BY method.code LIMIT 1;
 payment:=public.fms_push_payable_settlement_secure((finance->>'id')::uuid,'payment');
 payment:=public.fms_save_payable_settlement_secure(payment||jsonb_build_object('lines',(SELECT jsonb_agg(line||jsonb_build_object('settlement_method_id',method_ident,'fund_account_id',NULL,'amount',1,'approved_amount',1,'planned_amount',1)) FROM jsonb_array_elements(payment->'lines') line)));
 PERFORM public.fms_act_payable_settlement_secure(ARRAY[(payment->>'id')::uuid],'submit');
 PERFORM public.fms_act_payable_settlement_secure(ARRAY[(payment->>'id')::uuid],'approve');
 SELECT count(*) INTO ledger_count FROM public.fms_fund_ledger_entry;
 INSERT INTO qa_noncash_context VALUES(source.tenant_id,other_tenant,root_actor,ordinary_actor,role_ident,source.id,(finance->>'id')::uuid,(payment->>'id')::uuid,(payment->'lines'->0->>'id')::uuid,ledger_count);
END $setup$;

SET LOCAL ROLE authenticated;

DO $matrix$
DECLARE context qa_noncash_context;mode text;result jsonb;blocked boolean;
BEGIN
 SELECT * INTO STRICT context FROM qa_noncash_context;
 IF public.current_is_super() THEN RAISE EXCEPTION 'Ordinary noncash fixture acquired administrator authority';END IF;
 FOREACH mode IN ARRAY ARRAY['ordinary_own','ordinary_forged','platform_all','platform_selected'] LOOP
  PERFORM set_config('request.jwt.claim.sub',CASE WHEN mode LIKE 'ordinary%' THEN context.ordinary_actor ELSE context.root_actor END::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',CASE WHEN mode LIKE 'ordinary%' THEN context.ordinary_actor ELSE context.root_actor END,'role','authenticated')::text,true);
  PERFORM set_config('request.headers',CASE WHEN mode='ordinary_forged' THEN jsonb_build_object('x-art-tenant-scope',context.other_tenant)::text WHEN mode='platform_selected' THEN jsonb_build_object('x-art-tenant-scope',context.tenant_id)::text ELSE '{}' END,true);
  IF(public.fms_purchase_payable_list_secure('financial',p_id=>context.payable_id)->>'total')::integer<>1 THEN RAISE EXCEPTION 'Authorized noncash context lost its source';END IF;
  result:=public.fms_act_payable_settlement_secure(ARRAY[context.payment_id],'confirm');
  IF result->0->>'tenant_id'<>context.tenant_id::text OR result->0->>'status'<>'confirmed' THEN RAISE EXCEPTION 'Confirmation used a header or platform tenant instead of the row tenant';END IF;
  PERFORM public.fms_act_payable_settlement_secure(ARRAY[context.payment_id],'cancel_payment','租户范围矩阵恢复非现金结算');
 END LOOP;
 PERFORM set_config('request.jwt.claim.sub',context.root_actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',context.root_actor,'role','authenticated')::text,true);
 PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',context.other_tenant)::text,true);
 IF(public.fms_purchase_payable_list_secure('financial',p_id=>context.payable_id)->>'total')::integer<>0 THEN RAISE EXCEPTION 'Platform-selected other tenant read the original transport source';END IF;
 blocked:=false;BEGIN PERFORM public.fms_act_payable_settlement_secure(ARRAY[context.payment_id],'confirm');EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Platform-selected other tenant confirmed a foreign noncash payment';END IF;
 IF has_table_privilege('authenticated','app_private.carrier_statement_noncash_writeoffs','SELECT') OR has_function_privilege('authenticated','app_private.refresh_carrier_statement_settlement(uuid)','EXECUTE') THEN RAISE EXCEPTION 'Private transport settlement projection or updater exposed to a client';END IF;
END $matrix$;

RESET ROLE;

DO $deny_statement_field$
DECLARE context qa_noncash_context;
BEGIN
 SELECT * INTO STRICT context FROM qa_noncash_context;
 UPDATE public.sys_role_field_permission permission SET access_level='hidden' FROM public.sys_permission_resource resource,public.sys_permission_field field
 WHERE permission.role_id=context.role_id AND permission.resource_id=resource.id AND permission.field_id=field.id AND field.resource_id=resource.id AND resource.resource_key='tms.carrier_statement' AND field.field_key='statementAmounts';
 PERFORM set_config('request.jwt.claim.sub',context.ordinary_actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',context.ordinary_actor,'role','authenticated')::text,true);
 PERFORM set_config('request.headers','{}',true);
END $deny_statement_field$;

SET LOCAL ROLE authenticated;

DO $hidden_amount$
DECLARE context qa_noncash_context;blocked boolean;workspace jsonb;
BEGIN
 SELECT * INTO STRICT context FROM qa_noncash_context;
 workspace:=public.fms_payable_writeoff_workspace_secure('{}');
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(workspace->'primary') item WHERE item->>'id'=context.payable_id::text)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(workspace->'history') item WHERE item->>'payable_id'=context.payable_id::text) THEN RAISE EXCEPTION 'Transport amount restriction leaked through noncash writeoff workspace';END IF;
 blocked:=false;BEGIN PERFORM public.fms_act_payable_settlement_secure(ARRAY[context.payment_id],'confirm');EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Hidden transport amounts still allowed noncash confirmation';END IF;
END $hidden_amount$;

RESET ROLE;

DO $deny_allocation$
DECLARE context qa_noncash_context;
BEGIN
 SELECT * INTO STRICT context FROM qa_noncash_context;
 UPDATE public.sys_role_field_permission permission SET access_level='edit' FROM public.sys_permission_resource resource,public.sys_permission_field field
 WHERE permission.role_id=context.role_id AND permission.resource_id=resource.id AND permission.field_id=field.id AND field.resource_id=resource.id AND resource.resource_key='tms.carrier_statement' AND field.field_key='statementAmounts';
 DELETE FROM public.sys_role_menu access USING public.sys_menu menu WHERE access.role_id=context.role_id AND access.menu_id=menu.id AND menu.name='FinanceCashTransaction:Allocate';
END $deny_allocation$;

SET LOCAL ROLE authenticated;

DO $allocation_required$
DECLARE context qa_noncash_context;blocked boolean;
BEGIN
 SELECT * INTO STRICT context FROM qa_noncash_context;
 blocked:=false;BEGIN PERFORM public.fms_act_payable_settlement_secure(ARRAY[context.payment_id],'confirm');EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Noncash confirmation bypassed the original settlement allocation authority';END IF;
END $allocation_required$;

RESET ROLE;

DO $preserved$
DECLARE context qa_noncash_context;
BEGIN
 SELECT * INTO STRICT context FROM qa_noncash_context;
 IF(SELECT count(*) FROM public.fms_fund_ledger_entry)<>context.ledger_count OR(SELECT status FROM public.fms_payable_settlement_document WHERE id=context.payment_id)<>'approved'
  OR EXISTS(SELECT 1 FROM public.fms_payable_payment_execution WHERE document_id=context.payment_id AND status='posted')
  OR EXISTS(SELECT 1 FROM public.fms_payable_writeoff_record WHERE payment_line_id=context.line_id AND status='active')
  OR(SELECT settled_amount FROM public.tms_carrier_statement WHERE id=context.statement_id)<>0 THEN RAISE EXCEPTION 'Rejected contexts left partial cash, settlement, or lifecycle writes';END IF;
END $preserved$;

ROLLBACK;
