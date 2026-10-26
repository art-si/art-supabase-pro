BEGIN;
SET LOCAL jit=off;

CREATE TEMPORARY TABLE qa_transport_source_context(
 tenant_id uuid,actor uuid,profile_id uuid,carrier_id uuid,waybill_id uuid,expense_id uuid,
 source_index integer,statement_id uuid,payable_id uuid,payment_id uuid,
 virtual_method_id uuid,initial_ledger bigint,initial_cash bigint,root_actor uuid,other_tenant uuid,carrier_name text
) ON COMMIT DROP;
GRANT SELECT,UPDATE ON qa_transport_source_context TO authenticated;

CREATE TEMPORARY TABLE qa_transport_submission_denials(
 tenant_id uuid,actor uuid,root_actor uuid,cost_id uuid,statement_id uuid,other_tenant uuid
) ON COMMIT DROP;
GRANT SELECT,INSERT ON qa_transport_submission_denials TO authenticated;

DO $prepare_sources$
DECLARE
 tenant_ident uuid;actor_ident uuid;profile_ident uuid;role_ident uuid;root_actor uuid;other_tenant uuid;
 expense_ident uuid;carrier_ident uuid;waybill_ident uuid;definition_ident uuid;business text;
 saved jsonb;configuration jsonb;source_index integer;virtual_method uuid;ledger_count bigint;cash_count bigint;
 marker text:='QA_NC_'||upper(left(gen_random_uuid()::text,8));
BEGIN
 SELECT tenant.id,profile.auth_user_id,profile.id,role.id
 INTO STRICT tenant_ident,actor_ident,profile_ident,role_ident
 FROM public.sys_tenant tenant
 JOIN public.sys_user profile ON profile.tenant_id=tenant.id
 JOIN public.sys_role role ON role.tenant_id=tenant.id AND role.role_code='QA_AP_ACCEPTANCE_01A15DAD'
 WHERE tenant.tenant_code='qa-payable-20261022' AND profile.auth_user_id='a9eeb9b7-e474-43e3-9cc2-c2f46c0f0ec3'
  AND NOT profile.system_protected;
 SELECT auth_user_id INTO STRICT root_actor FROM public.sys_user
 WHERE system_protected AND user_roles @>ARRAY['R_SUPER'] AND status='1' ORDER BY id LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',root_actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',root_actor,'role','authenticated')::text,true);
 PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',tenant_ident)::text,true);
 SELECT id INTO STRICT other_tenant FROM public.sys_tenant WHERE id<>tenant_ident AND status='1'
  AND builtin_type IS DISTINCT FROM 'platform'
  AND(service_start_date IS NULL OR service_start_date<=(now() AT TIME ZONE 'Asia/Shanghai')::date)
  AND(service_end_date IS NULL OR service_end_date>=(now() AT TIME ZONE 'Asia/Shanghai')::date)
 ORDER BY id LIMIT 1;

 configuration:=jsonb_build_object('allowAutoApprove',false,'nodes',jsonb_build_array(jsonb_build_object(
  'key','qa_transport_review','name','隔离验收来源复核','order',1,
  'assignee',jsonb_build_object('type','users','userIds',jsonb_build_array(profile_ident),'roleCodes','[]'::jsonb),
  'dueHours',24,'condition',jsonb_build_object('operator','always'),'approvalMode','any',
  'allowSelfApproval',true,'rejectVetoEnabled',true,'approvalThresholdPercent',100)));
 FOREACH business IN ARRAY ARRAY['tms_waybill_cost','tms_carrier_statement'] LOOP
  SELECT id INTO definition_ident FROM public.wf_definition
  WHERE tenant_id=tenant_ident AND business_type=business AND status='published';
  IF definition_ident IS NULL THEN
   saved:=public.save_workflow_definition(jsonb_build_object(
    'tenantId',tenant_ident,'code',CASE WHEN business='tms_waybill_cost' THEN 'QA_AP_NC_COST' ELSE 'QA_AP_NC_STATEMENT' END,
    'name',CASE WHEN business='tms_waybill_cost' THEN '应付验收运输费用审批' ELSE '应付验收承运对账审批' END,
    'businessType',business,'description','仅独立验收租户，明确允许验收账号自审，不修改生产审批策略','config',configuration));
   PERFORM public.publish_workflow_definition((saved->>'definitionId')::uuid);
  END IF;
 END LOOP;

 WITH RECURSIVE required_menu AS(
  SELECT menu.id,menu.parent_id FROM public.sys_menu menu
  WHERE menu.name IN('FinanceWaybillCost:View','FinanceWaybillCost:Add','FinanceWaybillCost:Edit','FinanceWaybillCost:Submit',
   'FinanceCarrierSettlement:View','FinanceCarrierSettlement:Add','FinanceCarrierSettlement:Submit','FinanceCarrierSettlement:Approve',
   'FinanceCashTransaction:Allocate')
  UNION
  SELECT parent.id,parent.parent_id FROM public.sys_menu parent JOIN required_menu child ON parent.id=child.parent_id
 )
 INSERT INTO public.sys_role_menu(tenant_id,role_id,menu_id)
 SELECT tenant_ident,role_ident,menu.id FROM required_menu menu
 WHERE NOT EXISTS(SELECT 1 FROM public.sys_role_menu access WHERE access.role_id=role_ident AND access.menu_id=menu.id);
 UPDATE public.sys_role_field_permission access SET access_level='edit'
 FROM public.sys_permission_resource resource,public.sys_permission_field field
 WHERE access.role_id=role_ident AND access.resource_id=resource.id AND access.field_id=field.id AND field.resource_id=resource.id
  AND resource.tenant_id=tenant_ident
  AND((resource.resource_key='tms.carrier_statement' AND field.field_key IN('statementAmounts','settlementAmounts'))
   OR(resource.resource_key='tms.waybill_cost' AND field.field_key IN('costAmounts','paymentDetails')));
 INSERT INTO public.sys_role_field_permission(tenant_id,role_id,resource_id,field_id,access_level)
 SELECT tenant_ident,role_ident,resource.id,field.id,'edit'
 FROM public.sys_permission_resource resource JOIN public.sys_permission_field field ON field.resource_id=resource.id
 WHERE resource.tenant_id=tenant_ident
  AND((resource.resource_key='tms.carrier_statement' AND field.field_key IN('statementAmounts','settlementAmounts'))
   OR(resource.resource_key='tms.waybill_cost' AND field.field_key IN('costAmounts','paymentDetails')))
  AND NOT EXISTS(SELECT 1 FROM public.sys_role_field_permission access WHERE access.role_id=role_ident AND access.field_id=field.id);

 SELECT id INTO expense_ident FROM public.tms_expense_item WHERE tenant_id=tenant_ident AND item_code='QA_AP_TRANSPORT_FREIGHT';
 IF expense_ident IS NULL THEN
  INSERT INTO public.tms_expense_item(tenant_id,item_code,item_name,business_category,is_selectable,is_enabled,remark)
  VALUES(tenant_ident,'QA_AP_TRANSPORT_FREIGHT','应付验收承运运费','carrier_freight',true,true,'仅独立验收来源')
  RETURNING id INTO expense_ident;
 END IF;
 SELECT id INTO STRICT virtual_method FROM public.mdm_settlement_method
 WHERE tenant_id=tenant_ident AND code='JSFS13' AND enabled;
 SELECT count(*) INTO ledger_count FROM public.fms_fund_ledger_entry WHERE tenant_id=tenant_ident;
 SELECT count(*) INTO cash_count FROM public.tms_cash_transaction WHERE tenant_id=tenant_ident;
 PERFORM set_config('request.jwt.claim.sub',actor_ident::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor_ident,'role','authenticated')::text,true);
 PERFORM set_config('request.headers','{}',true);
 FOR source_index IN 1..2 LOOP
  INSERT INTO public.mdm_carrier(tenant_id,carrier_code,company_name,carrier_type,carrier_types,
   dispatch_channel,dispatch_channels,created_by_user_id)
  VALUES(tenant_ident,marker||'_C'||source_index,'隔离运输验收承运商'||source_index||' · '||marker,'enterprise',ARRAY['enterprise'],
   'offline',ARRAY['offline'],profile_ident) RETURNING id INTO carrier_ident;
  INSERT INTO public.tms_waybill(tenant_id,waybill_no,origin_city,destination_city,shipper_address,receiver_address,
   cargo_name,carrier_id,dispatch_mode,created_by_user_id)
  VALUES(tenant_ident,marker||'_W'||source_index,'验收始发城市','验收到达城市','独立验收始发地址','独立验收到达地址',
   '非实货运输结算验收',carrier_ident,'carrier',profile_ident) RETURNING id INTO waybill_ident;
  INSERT INTO qa_transport_source_context(tenant_id,actor,profile_id,carrier_id,waybill_id,expense_id,source_index,
   virtual_method_id,initial_ledger,initial_cash,root_actor,other_tenant,carrier_name)
  VALUES(tenant_ident,actor_ident,profile_ident,carrier_ident,waybill_ident,expense_ident,source_index,
   virtual_method,ledger_count,cash_count,root_actor,other_tenant,'隔离运输验收承运商'||source_index||' · '||marker);
 END LOOP;
END $prepare_sources$;

SET LOCAL ROLE authenticated;

DO $ordinary_source_flow$
DECLARE
 context qa_transport_source_context;cost jsonb;cost_ident uuid;statement_ident uuid;finance jsonb;payment jsonb;
 source_view jsonb;cost_state text;tested integer:=0;mode text;submission_actor uuid;scope_headers jsonb;
BEGIN
 FOR context IN SELECT * FROM qa_transport_source_context ORDER BY source_index LOOP
  FOREACH mode IN ARRAY ARRAY['ordinary_own','ordinary_forged','platform_all','platform_selected'] LOOP
  PERFORM set_config('request.jwt.claim.sub',context.actor::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',context.actor,'role','authenticated')::text,true);
  PERFORM set_config('request.headers','{}',true);
  IF public.current_is_super() THEN RAISE EXCEPTION 'Source approval acquired administrator authority';END IF;
  cost:=public.tms_save_waybill_cost_secure(NULL,jsonb_build_object(
   'waybill_id',context.waybill_id,'expense_item_id',context.expense_id,'carrier_id',context.carrier_id,
   'amount',context.source_index*100,'occurred_on',current_date,'payee_name','隔离运输验收承运商'||context.source_index,
   'remark','QA_AP_NC_SOURCE_'||context.source_index));
  cost_ident:=(cost->>'id')::uuid;
  IF cost_ident IS NULL THEN RAISE EXCEPTION 'Draft cost was not returned';END IF;
  submission_actor:=CASE WHEN mode LIKE 'platform%' THEN context.root_actor ELSE context.actor END;
  scope_headers:=CASE WHEN mode='platform_selected' THEN jsonb_build_object('x-art-tenant-scope',context.tenant_id)
   WHEN mode='ordinary_forged' THEN jsonb_build_object('x-art-tenant-scope','028e6a68-a9db-4055-974c-1e05bfe94b0f') ELSE '{}'::jsonb END;
  PERFORM set_config('request.jwt.claim.sub',submission_actor::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',submission_actor,'role','authenticated')::text,true);
  PERFORM set_config('request.headers',scope_headers::text,true);
  PERFORM public.start_workflow('tms_waybill_cost',cost_ident,'隔离运输费用来源',p_idempotency_key=>gen_random_uuid()::text);
  PERFORM set_config('request.jwt.claim.sub',context.actor::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',context.actor,'role','authenticated')::text,true);
  PERFORM set_config('request.headers','{}',true);
  PERFORM public.act_workflow_by_business('tms_waybill_cost',cost_ident,'approve','隔离来源审批验收',gen_random_uuid()::text);
  cost_state:=public.tms_get_waybill_cost_secure(cost_ident)->>'audit_status';
  IF cost_state IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION 'Cost workflow callback did not approve its real draft';END IF;
  statement_ident:=public.tms_create_carrier_statement_secure(context.carrier_id,current_date,current_date,ARRAY[cost_ident],'QA_AP_NC_SOURCE_'||context.source_index,NULL);
  PERFORM set_config('request.jwt.claim.sub',submission_actor::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',submission_actor,'role','authenticated')::text,true);
  PERFORM set_config('request.headers',scope_headers::text,true);
  PERFORM public.start_workflow('tms_carrier_statement',statement_ident,'隔离承运对账来源',p_idempotency_key=>gen_random_uuid()::text);
  PERFORM set_config('request.jwt.claim.sub',context.actor::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',context.actor,'role','authenticated')::text,true);
  PERFORM set_config('request.headers','{}',true);
  PERFORM public.act_workflow_by_business('tms_carrier_statement',statement_ident,'approve','隔离对账审批验收',gen_random_uuid()::text);
  source_view:=public.tms_get_carrier_statement_secure(statement_ident);
  IF source_view->>'status' IS DISTINCT FROM 'confirmed' THEN RAISE EXCEPTION 'Statement workflow callback did not confirm its real draft';END IF;
  finance:=public.fms_import_carrier_payable_secure('financial',statement_ident);
  IF finance->'lines'->0->>'material_description' IS DISTINCT FROM '应付验收承运运费'
   OR finance->>'payee_supplier_name' IS DISTINCT FROM context.carrier_name THEN
   RAISE EXCEPTION 'Imported transport fees or payee did not retain a readable source name';
  END IF;
  PERFORM public.fms_act_purchase_payable_secure(ARRAY[(finance->>'id')::uuid],'submit');
  PERFORM public.fms_act_purchase_payable_secure(ARRAY[(finance->>'id')::uuid],'approve');
  payment:=public.fms_push_payable_settlement_secure((finance->>'id')::uuid,'payment');
  payment:=public.fms_save_payable_settlement_secure(payment||jsonb_build_object('lines',(
   SELECT jsonb_agg(line||jsonb_build_object('settlement_method_id',context.virtual_method_id,'fund_account_id',NULL))
   FROM jsonb_array_elements(payment->'lines') line)));
  PERFORM public.fms_act_payable_settlement_secure(ARRAY[(payment->>'id')::uuid],'submit');
  PERFORM public.fms_act_payable_settlement_secure(ARRAY[(payment->>'id')::uuid],'approve');
  PERFORM public.fms_act_payable_settlement_secure(ARRAY[(payment->>'id')::uuid],'confirm');
  source_view:=public.tms_get_carrier_statement_secure(statement_ident);
  IF (source_view->>'settled_amount')::numeric IS DISTINCT FROM context.source_index*100
   OR source_view->>'status' IS DISTINCT FROM 'settled' THEN
   RAISE EXCEPTION 'Virtual payment did not settle the approved original transport source';
  END IF;
  UPDATE qa_transport_source_context SET statement_id=statement_ident,payable_id=(finance->>'id')::uuid,payment_id=(payment->>'id')::uuid
  WHERE source_index=context.source_index;
  tested:=tested+1;
  END LOOP;
 END LOOP;
 IF tested<>8 THEN RAISE EXCEPTION 'Two transport sources must pass all four submission scope modes';END IF;
 cost:=public.tms_save_waybill_cost_secure(NULL,jsonb_build_object(
  'waybill_id',context.waybill_id,'expense_item_id',context.expense_id,'carrier_id',context.carrier_id,
  'amount',1,'occurred_on',current_date,'remark','QA_AP_NC_DENIAL_STATEMENT_SOURCE'));
 cost_ident:=(cost->>'id')::uuid;
 PERFORM public.start_workflow('tms_waybill_cost',cost_ident,'拒绝用例的已审核来源',p_idempotency_key=>gen_random_uuid()::text);
 PERFORM public.act_workflow_by_business('tms_waybill_cost',cost_ident,'approve','隔离拒绝用例来源审批',gen_random_uuid()::text);
 statement_ident:=public.tms_create_carrier_statement_secure(context.carrier_id,current_date,current_date,ARRAY[cost_ident],'QA_AP_NC_DENIAL_DRAFT',NULL);
 cost:=public.tms_save_waybill_cost_secure(NULL,jsonb_build_object(
  'waybill_id',context.waybill_id,'expense_item_id',context.expense_id,'carrier_id',context.carrier_id,
  'amount',1,'occurred_on',current_date,'remark','QA_AP_NC_DENIAL_COST_DRAFT'));
 INSERT INTO qa_transport_submission_denials VALUES(context.tenant_id,context.actor,context.root_actor,(cost->>'id')::uuid,statement_ident,context.other_tenant);
END $ordinary_source_flow$;

RESET ROLE;

DO $source_accounting_invariants$
DECLARE context qa_transport_source_context;
BEGIN
 SELECT * INTO STRICT context FROM qa_transport_source_context WHERE source_index=1;
 IF context.initial_ledger<>(SELECT count(*) FROM public.fms_fund_ledger_entry WHERE tenant_id=context.tenant_id)
  OR context.initial_cash<>(SELECT count(*) FROM public.tms_cash_transaction WHERE tenant_id=context.tenant_id) THEN
  RAISE EXCEPTION 'Noncash workflow created a cash or funding entry';
 END IF;
END $source_accounting_invariants$;

DO $driver_identity_invariants$
DECLARE
 context qa_transport_source_context;original_phone text;test_phone text;driver_ident uuid;own_waybill uuid;
 blocked boolean;driver_view jsonb;foreign_phone text;foreign_tenant uuid;
BEGIN
 SELECT * INTO STRICT context FROM qa_transport_source_context WHERE source_index=1;
 PERFORM set_config('request.jwt.claim.sub',context.actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',context.actor,'role','authenticated')::text,true);
 PERFORM set_config('request.headers','{}',true);
 IF app_private.is_driver_user() OR public.current_is_super() THEN RAISE EXCEPTION 'Unbound ordinary account is a driver or administrator';END IF;
 SELECT user_phone INTO STRICT original_phone FROM public.sys_user WHERE id=context.profile_id AND user_type='2';
 LOOP
  test_phone:='199'||lpad(floor(random()*100000000)::bigint::text,8,'0');
  EXIT WHEN NOT EXISTS(SELECT 1 FROM public.mdm_driver WHERE phone=test_phone)
   AND NOT EXISTS(SELECT 1 FROM public.sys_user WHERE user_phone=test_phone);
 END LOOP;
 UPDATE public.sys_user SET user_phone=test_phone WHERE id=context.profile_id;
 INSERT INTO public.mdm_driver(tenant_id,carrier_id,driver_name,phone,gender,id_card_no,license_type,enabled,created_by_user_id)
 VALUES(context.tenant_id,context.carrier_id,'仅回滚司机身份验收',test_phone,'1',
  'QA'||left(replace(gen_random_uuid()::text,'-',''),16),'C1',false,context.profile_id) RETURNING id INTO driver_ident;
 IF app_private.is_driver_user() THEN RAISE EXCEPTION 'Disabled driver classified the ordinary account as a driver';END IF;
 UPDATE public.mdm_driver SET enabled=true WHERE id=driver_ident;
 IF NOT app_private.is_driver_user() THEN RAISE EXCEPTION 'Valid original driver identity lost access';END IF;
 blocked:=false;
 BEGIN PERFORM public.start_workflow('tms_waybill_cost',gen_random_uuid(),'司机需走专用上报');
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'A real driver bypassed the dedicated reporting entry';END IF;
 blocked:=false;
 BEGIN PERFORM public.tms_get_driver_waybill_expense_context(context.waybill_id);
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Driver read an unassigned waybill';END IF;
 INSERT INTO public.tms_waybill(tenant_id,waybill_no,origin_city,destination_city,shipper_address,receiver_address,
  cargo_name,carrier_id,driver_id,dispatch_mode,created_by_user_id)
 VALUES(context.tenant_id,'QA_DRIVER_'||left(gen_random_uuid()::text,8),'验收始发','验收到达','验收始发地址','验收到达地址',
  '司机身份回滚验收',context.carrier_id,driver_ident,'carrier',context.profile_id) RETURNING id INTO own_waybill;
 driver_view:=public.tms_get_driver_waybill_expense_context(own_waybill);
 IF driver_view->'waybill'->>'id' IS DISTINCT FROM own_waybill::text OR (driver_view->>'can_report')::boolean IS DISTINCT FROM false THEN
  RAISE EXCEPTION 'Valid driver lost its own draft waybill context or reported before acceptance';
 END IF;
 UPDATE public.mdm_driver SET enabled=false WHERE id=driver_ident;
 IF app_private.is_driver_user() THEN RAISE EXCEPTION 'Disabled driver identity remained active';END IF;
 SELECT driver.phone,driver.tenant_id INTO STRICT foreign_phone,foreign_tenant FROM public.mdm_driver driver
 WHERE driver.tenant_id<>context.tenant_id AND driver.enabled ORDER BY driver.id LIMIT 1;
 UPDATE public.sys_user SET user_phone=foreign_phone WHERE id=context.profile_id;
 PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',foreign_tenant)::text,true);
 IF app_private.is_driver_user() THEN RAISE EXCEPTION 'Foreign-tenant matching phone or forged header supplied a driver identity';END IF;
 UPDATE public.sys_user SET user_phone=original_phone WHERE id=context.profile_id;
 PERFORM set_config('request.headers','{}',true);
 UPDATE public.sys_permission_field field SET owner_override_enabled=false
 FROM public.sys_permission_resource resource
 WHERE field.resource_id=resource.id AND resource.tenant_id=context.tenant_id
  AND((resource.resource_key='tms.waybill_cost' AND field.field_key='costAmounts')
   OR(resource.resource_key='tms.carrier_statement' AND field.field_key='statementAmounts'));
 UPDATE public.sys_role_field_permission access SET access_level='hidden'
 FROM public.sys_role role,public.sys_permission_resource resource,public.sys_permission_field field
 WHERE access.role_id=role.id AND role.tenant_id=context.tenant_id AND role.role_code='QA_AP_ACCEPTANCE_01A15DAD'
  AND access.resource_id=resource.id AND access.field_id=field.id AND field.resource_id=resource.id
  AND((resource.resource_key='tms.waybill_cost' AND field.field_key='costAmounts')
   OR(resource.resource_key='tms.carrier_statement' AND field.field_key='statementAmounts'));
END $driver_identity_invariants$;

SET LOCAL ROLE authenticated;

DO $hidden_amount_denial$
DECLARE context qa_transport_submission_denials;source_type text;source_id uuid;blocked boolean;
BEGIN
 SELECT * INTO STRICT context FROM qa_transport_submission_denials;
 FOREACH source_type IN ARRAY ARRAY['tms_waybill_cost','tms_carrier_statement'] LOOP
  source_id:=CASE WHEN source_type='tms_waybill_cost' THEN context.cost_id ELSE context.statement_id END;
  blocked:=false;
  BEGIN PERFORM public.start_workflow(source_type,source_id,'无金额查看权限不得提交');
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'Hidden source amount did not prevent submission';END IF;
 END LOOP;
END $hidden_amount_denial$;

RESET ROLE;

DO $revoke_submission$
DECLARE context qa_transport_submission_denials;
BEGIN
 SELECT * INTO STRICT context FROM qa_transport_submission_denials;
 UPDATE public.sys_role_field_permission access SET access_level='edit'
 FROM public.sys_role role,public.sys_permission_resource resource,public.sys_permission_field field
 WHERE access.role_id=role.id AND role.tenant_id=context.tenant_id AND role.role_code='QA_AP_ACCEPTANCE_01A15DAD'
  AND access.resource_id=resource.id AND access.field_id=field.id AND field.resource_id=resource.id
  AND((resource.resource_key='tms.waybill_cost' AND field.field_key='costAmounts')
   OR(resource.resource_key='tms.carrier_statement' AND field.field_key='statementAmounts'));
 DELETE FROM public.sys_role_menu access USING public.sys_role role,public.sys_menu menu
 WHERE access.role_id=role.id AND access.menu_id=menu.id AND role.tenant_id=context.tenant_id
  AND role.role_code='QA_AP_ACCEPTANCE_01A15DAD'
  AND menu.name IN('FinanceWaybillCost:Submit','FinanceCarrierSettlement:Submit');
END $revoke_submission$;

SET LOCAL ROLE authenticated;

DO $submission_scope_denial$
DECLARE context qa_transport_submission_denials;source_type text;source_id uuid;blocked boolean;mode text;other_tenant uuid;
BEGIN
 SELECT * INTO STRICT context FROM qa_transport_submission_denials;
 other_tenant:=context.other_tenant;
 FOREACH mode IN ARRAY ARRAY['ordinary_no_submit','platform_other_tenant'] LOOP
  PERFORM set_config('request.jwt.claim.sub',CASE WHEN mode='ordinary_no_submit' THEN context.actor ELSE context.root_actor END::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',CASE WHEN mode='ordinary_no_submit' THEN context.actor ELSE context.root_actor END,'role','authenticated')::text,true);
  PERFORM set_config('request.headers',CASE WHEN mode='platform_other_tenant' THEN jsonb_build_object('x-art-tenant-scope',other_tenant)::text ELSE '{}' END,true);
  FOREACH source_type IN ARRAY ARRAY['tms_waybill_cost','tms_carrier_statement'] LOOP
   source_id:=CASE WHEN source_type='tms_waybill_cost' THEN context.cost_id ELSE context.statement_id END;
   blocked:=false;
   BEGIN PERFORM public.start_workflow(source_type,source_id,'无提交权限或不在当前租户');
   EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
   IF NOT blocked THEN RAISE EXCEPTION 'Unauthorized workflow source submitted';END IF;
  END LOOP;
 END LOOP;
END $submission_scope_denial$;

RESET ROLE;

DO $no_denial_instances$
BEGIN
 IF EXISTS(SELECT 1 FROM public.wf_instance instance JOIN qa_transport_submission_denials context
  ON instance.business_id IN(context.cost_id,context.statement_id)) THEN
  RAISE EXCEPTION 'Rejected submission left a workflow instance';
 END IF;
END $no_denial_instances$;

DO $transport_name_snapshot$
DECLARE context qa_transport_source_context;original_name text;projection jsonb;
BEGIN
 SELECT item.item_name INTO STRICT original_name FROM public.tms_expense_item item
 WHERE item.id=(SELECT expense_id FROM qa_transport_source_context LIMIT 1);
 UPDATE public.tms_expense_item SET item_name=original_name||'（回滚更名）'
 WHERE id=(SELECT expense_id FROM qa_transport_source_context LIMIT 1);
 FOR context IN SELECT * FROM qa_transport_source_context LOOP
  projection:=app_private.purchase_payable_json(context.payable_id);
  IF projection->'lines'->0->>'material_description' IS DISTINCT FROM original_name
   OR NOT EXISTS(SELECT 1 FROM public.fms_purchase_payable_line line
    WHERE line.document_id=context.payable_id AND line.tenant_id=context.tenant_id
     AND line.line_snapshot->>'material_description'=original_name) THEN
   RAISE EXCEPTION 'Renaming expense master data rewrote the imported transport name snapshot';
  END IF;
 END LOOP;
END $transport_name_snapshot$;

ROLLBACK;
