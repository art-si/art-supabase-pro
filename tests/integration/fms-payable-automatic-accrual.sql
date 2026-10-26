BEGIN;

DO $automatic_accrual$
DECLARE
 root_actor uuid;finance_actor uuid;warehouse_actor uuid;tenant uuid;book uuid;period_id uuid;policy_ident uuid;
 finance_role uuid;warehouse_role uuid;finance_code text:='ACCRUAL_FIN_'||upper(left(gen_random_uuid()::text,8));warehouse_code text:='ACCRUAL_WMS_'||upper(left(gen_random_uuid()::text,8));
 template public.wms_purchase_document;source_line public.wms_purchase_document_line;source_id uuid;source_ids uuid[]:='{}';
 original_book public.fms_account_set;original_period public.fms_accounting_period;
 payload jsonb;line_payload jsonb;parameter jsonb;generated uuid;financial_document uuid;gap jsonb;headers text;old_context text;stock_count integer;
 scenario integer;blocked boolean;
BEGIN
 SELECT auth_user_id INTO STRICT root_actor FROM public.sys_user WHERE system_protected AND 'R_SUPER'=ANY(user_roles) AND status='1' ORDER BY id LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',root_actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',root_actor,'role','authenticated')::text,true);
 PERFORM set_config('request.headers','{}',true);
 SELECT document.* INTO STRICT template FROM public.wms_purchase_document document
 JOIN public.wms_inventory_initialization initialization ON initialization.organization_id=document.organization_id AND initialization.tenant_id=document.tenant_id AND initialization.initialization_closed_at IS NOT NULL
 JOIN public.fms_account_set account ON account.tenant_id=document.tenant_id AND account.is_default AND account.status='active' AND account.base_currency_code='CNY'
 JOIN public.fms_accounting_period period ON period.account_set_id=account.id AND app_private.payable_business_date() BETWEEN period.start_date AND period.end_date AND period.status IN('open','closing')
 WHERE document.kind='purchase_inbound' AND document.status='approved'
 AND(SELECT count(*) FROM public.sys_user profile WHERE profile.tenant_id=document.tenant_id AND profile.status='1' AND profile.auth_user_id IS NOT NULL AND NOT profile.system_protected)>=2
 AND NOT EXISTS(SELECT 1 FROM public.fms_payable_accrual_policy WHERE tenant_id=document.tenant_id AND organization_id=document.organization_id)
 AND NOT EXISTS(SELECT 1 FROM public.wms_purchase_document newer WHERE newer.tenant_id=document.tenant_id AND newer.organization_id=document.organization_id AND newer.kind='purchase_inbound' AND newer.status='approved' AND newer.business_date>=app_private.payable_business_date())
 AND EXISTS(SELECT 1 FROM public.wms_purchase_document_line line JOIN public.mdm_material material ON material.id=line.material_id AND material.tenant_id=line.tenant_id WHERE line.document_id=document.id AND material.status='enabled' AND NOT material.serial_management_enabled)
 ORDER BY document.id LIMIT 1;
 tenant:=template.tenant_id;
 SELECT id INTO STRICT book FROM public.fms_account_set WHERE tenant_id=tenant AND is_default AND status='active' AND base_currency_code='CNY';
 SELECT * INTO STRICT original_book FROM public.fms_account_set WHERE id=book;
 SELECT * INTO STRICT original_period FROM public.fms_accounting_period WHERE account_set_id=book AND app_private.payable_business_date() BETWEEN start_date AND end_date;
 INSERT INTO public.fms_account_set SELECT(jsonb_populate_record(NULL::public.fms_account_set,to_jsonb(original_book)||jsonb_build_object('id',gen_random_uuid(),'account_set_code',finance_code,'account_set_name','自动暂估隔离回滚账套','is_default',false))).* RETURNING id INTO book;
 INSERT INTO public.fms_currency(tenant_id,account_set_id,currency_code,currency_name,symbol,is_enabled,is_base) VALUES(tenant,book,'CNY','人民币','¥',true,true);
 INSERT INTO public.fms_accounting_period(tenant_id,account_set_id,fiscal_year,period_no,start_date,end_date,status)
 VALUES(tenant,book,original_period.fiscal_year,original_period.period_no,original_period.start_date,original_period.end_date,'open') RETURNING id INTO period_id;
 SELECT auth_user_id INTO STRICT finance_actor FROM public.sys_user WHERE tenant_id=tenant AND status='1' AND auth_user_id IS NOT NULL AND NOT system_protected ORDER BY id LIMIT 1;
 SELECT auth_user_id INTO STRICT warehouse_actor FROM public.sys_user WHERE tenant_id=tenant AND status='1' AND auth_user_id IS NOT NULL AND NOT system_protected AND auth_user_id<>finance_actor ORDER BY id LIMIT 1;
 INSERT INTO public.sys_role(role_name,role_code,enabled,tenant_id) VALUES('自动暂估财务回滚角色',finance_code,true,tenant) RETURNING id INTO finance_role;
 INSERT INTO public.sys_role(role_name,role_code,enabled,tenant_id) VALUES('自动暂估仓库回滚角色',warehouse_code,true,tenant) RETURNING id INTO warehouse_role;
 INSERT INTO public.sys_role_menu(tenant_id,role_id,menu_id) SELECT tenant,finance_role,id FROM public.sys_menu WHERE name IN(
  'FinanceEstimatedPayable:View','FinanceEstimatedPayable:Accrual','FinanceEstimatedPayable:AccrualDelete','FinanceEstimatedPayable:AccrualExecute','FinanceEstimatedPayable:Add','FinanceEstimatedPayable:Edit','FinanceEstimatedPayable:Delete','FinanceEstimatedPayable:Submit','FinanceEstimatedPayable:Approve','FinancePurchasePayable:View','FinancePurchasePayable:Add','FinancePurchasePayable:Submit','FinancePurchasePayable:Approve','WmsPurchaseInbound:View','WmsPurchaseInbound:Push');
 INSERT INTO public.sys_role_menu(tenant_id,role_id,menu_id) SELECT tenant,warehouse_role,id FROM public.sys_menu WHERE name IN(
  'WmsPurchaseInbound:View','WmsPurchaseInbound:Add','WmsPurchaseInbound:Edit','WmsPurchaseInbound:Submit','WmsPurchaseInbound:Approve','WmsPurchaseInbound:Push');
 UPDATE public.sys_user SET user_roles=ARRAY[finance_code] WHERE auth_user_id=finance_actor;
 UPDATE public.sys_user SET user_roles=ARRAY[warehouse_code] WHERE auth_user_id=warehouse_actor;
 PERFORM set_config('request.jwt.claim.sub',finance_actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',finance_actor,'role','authenticated')::text,true);
 parameter:=jsonb_build_object('code',finance_code,'name','自动暂估回滚方案','organization_id',template.organization_id,'account_set_id',book,
  'effective_from',app_private.payable_business_date(),'enabled',true,'auto_approve',false,'tax_excluded_from_cost',true);
 policy_ident:=public.fms_save_payable_accrual_policy_secure(parameter);
 IF(SELECT actor_auth_user_id FROM public.fms_payable_accrual_policy WHERE id=policy_ident)<>finance_actor THEN RAISE EXCEPTION 'Policy did not retain its actual financial authorizer';END IF;
 SELECT line.* INTO STRICT source_line FROM public.wms_purchase_document_line line JOIN public.mdm_material material ON material.id=line.material_id AND material.tenant_id=line.tenant_id
 WHERE line.document_id=template.id AND material.status='enabled' AND NOT material.serial_management_enabled ORDER BY line.line_no LIMIT 1;
 line_payload:=to_jsonb(source_line)-ARRAY['id','document_id','movement_id','source_batch_id','source_order_target_line_id','source_document','source_line_no','create_by','create_time','update_by','update_time'];
 line_payload:=line_payload||jsonb_build_object('line_no',10,'quantity',1,'base_quantity',source_line.base_quantity/source_line.quantity,'project_id',NULL,'construction_no',NULL,
  'serial_nos','[]'::jsonb,'unit_price',100,'tax_inclusive_unit_price',113,'tax_rate',13,'gift',false,'discount_method','none','unit_discount_rate',0,'discount_amount',0);
 payload:=(to_jsonb(template)-ARRAY['id','document_no','status','approved_at','create_by','create_time','update_by','update_time'])
  ||jsonb_build_object('business_date',app_private.payable_business_date(),'accounting_date',app_private.payable_business_date(),'lines',jsonb_build_array(line_payload));
 FOR scenario IN 1..2 LOOP
  IF scenario=2 THEN
   PERFORM set_config('request.jwt.claim.sub',finance_actor::text,true);
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',finance_actor,'role','authenticated')::text,true);
   policy_ident:=public.fms_save_payable_accrual_policy_secure(parameter||jsonb_build_object('id',policy_ident,'version',(SELECT version FROM public.fms_payable_accrual_policy WHERE id=policy_ident),'auto_approve',true));
  END IF;
  PERFORM set_config('request.jwt.claim.sub',warehouse_actor::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',warehouse_actor,'role','authenticated')::text,true);
  PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',(SELECT tenant_id FROM public.sys_user WHERE auth_user_id=root_actor),'trace','warehouse-context')::text,true);
  IF app_private.has_permission('FinanceEstimatedPayable:Add') OR app_private.is_platform_super() THEN RAISE EXCEPTION 'Warehouse fixture acquired financial or super permissions';END IF;
  headers:=current_setting('request.headers');old_context:=current_setting('request.jwt.claims');
  source_id:=public.wms_save_purchase_document_secure(payload);
  source_ids:=array_append(source_ids,source_id);
  PERFORM public.wms_change_purchase_document_status_secure(source_id,'submit');
  PERFORM public.wms_change_purchase_document_status_secure(source_id,'approve');
  IF auth.uid()<>warehouse_actor OR current_setting('request.headers')<>headers OR current_setting('request.jwt.claims')<>old_context THEN RAISE EXCEPTION 'Automatic finance delegation leaked into warehouse context';END IF;
  SELECT payable_document_id INTO STRICT generated FROM public.fms_payable_accrual_run WHERE policy_id=policy_ident AND source_document_id=source_id;
  IF(SELECT account_set_id FROM public.fms_purchase_payable_document WHERE id=generated)<>book OR(SELECT created_by_user_id FROM public.fms_purchase_payable_document WHERE id=generated)<>finance_actor THEN RAISE EXCEPTION 'Automatic source lost its authorized principal or book';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.fms_payable_accrual_run WHERE payable_document_id=generated AND triggered_by=warehouse_actor AND executed_by=finance_actor) THEN RAISE EXCEPTION 'Automatic source audit did not retain both principals';END IF;
  IF scenario=1 THEN
   IF(SELECT status FROM public.fms_purchase_payable_document WHERE id=generated)<>'draft' THEN RAISE EXCEPTION 'Default automatic accrual bypassed manual financial review';END IF;
   SELECT value INTO STRICT gap FROM app_private.payable_accrual_gap_rows(period_id) value WHERE value->>'source_document_id'=source_id::text;
   IF(gap->>'recognized_quantity')::numeric<>0 OR(gap->>'difference_quantity')::numeric<>1 OR(gap->>'pending_document_count')::integer<>1 THEN RAISE EXCEPTION 'Draft incorrectly completed period coverage';END IF;
   blocked:=false;BEGIN UPDATE public.fms_accounting_period SET status='closed' WHERE id=period_id;EXCEPTION WHEN check_violation THEN blocked:=true;END;
   IF NOT blocked THEN RAISE EXCEPTION 'Direct table close bypassed missing accrual';END IF;
   PERFORM set_config('request.jwt.claim.sub',finance_actor::text,true);
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',finance_actor,'role','authenticated')::text,true);
   PERFORM public.fms_act_purchase_payable_secure(ARRAY[generated],'delete');
   IF NOT EXISTS(SELECT 1 FROM public.fms_payable_accrual_run WHERE policy_id=policy_ident AND source_document_id=source_id AND payable_document_id IS NULL) THEN RAISE EXCEPTION 'Draft deletion erased its generation history';END IF;
   generated:=(public.fms_execute_payable_accrual_secure(source_id)->'document_ids'->>0)::uuid;
   IF generated IS NULL THEN RAISE EXCEPTION 'Explicit backfill failed after authorized draft deletion';END IF;
   PERFORM public.fms_act_purchase_payable_secure(ARRAY[generated],'submit');
   PERFORM public.fms_act_purchase_payable_secure(ARRAY[generated],'approve');
  ELSE
   IF(SELECT status FROM public.fms_purchase_payable_document WHERE id=generated)<>'approved' THEN RAISE EXCEPTION 'Authorized automatic approval did not execute the real lifecycle';END IF;
  END IF;
 END LOOP;
 PERFORM set_config('request.jwt.claim.sub',finance_actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',finance_actor,'role','authenticated')::text,true);
 financial_document:=(public.wms_push_purchase_payables_secure('financial',jsonb_build_array(jsonb_build_object('document_id',source_ids[1])))->0->>'id')::uuid;
 IF(SELECT account_set_id FROM public.fms_purchase_payable_document WHERE id=financial_document)<>book THEN RAISE EXCEPTION 'Financial downpush guessed the tenant default instead of the mapped source book';END IF;
 PERFORM public.fms_act_purchase_payable_secure(ARRAY[financial_document],'submit');
 PERFORM public.fms_act_purchase_payable_secure(ARRAY[financial_document],'approve');
 IF NOT EXISTS(SELECT 1 FROM public.fms_purchase_payable_document WHERE reversal_source_id=financial_document AND is_reversal AND account_set_id=book) THEN RAISE EXCEPTION 'Same-source accrual reversal lost its non-default book';END IF;
 blocked:=false;BEGIN PERFORM public.wms_push_purchase_payables_secure('financial',jsonb_build_array(jsonb_build_object('document_id',source_ids[2],'account_set_id',original_book.id)));EXCEPTION WHEN check_violation THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Explicit financial downpush escaped the organization book mapping';END IF;
 IF EXISTS(SELECT 1 FROM app_private.payable_accrual_gap_rows(period_id)) THEN RAISE EXCEPTION 'Two fully recognized receipts or same-source reversal still leave an accrual gap';END IF;
 PERFORM set_config('request.jwt.claim.sub',warehouse_actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',warehouse_actor,'role','authenticated')::text,true);
 blocked:=false;BEGIN PERFORM public.wms_push_purchase_payables_secure('estimated',jsonb_build_array(jsonb_build_object('document_id',source_ids[1])));EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Warehouse actor reused delegation for manual financial creation';END IF;
 blocked:=false;BEGIN UPDATE public.wms_purchase_document SET status='draft' WHERE id=source_ids[1];EXCEPTION WHEN check_violation THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Direct source withdrawal bypassed accrual';END IF;
 blocked:=false;BEGIN UPDATE public.wms_purchase_document_line SET quantity=quantity+1 WHERE document_id=source_ids[1];EXCEPTION WHEN check_violation THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Direct approved line mutation changed source coverage';END IF;
 source_id:=public.wms_save_purchase_document_secure(payload);
 PERFORM public.wms_change_purchase_document_status_secure(source_id,'submit');
 DELETE FROM public.sys_role_menu access USING public.sys_menu menu WHERE access.role_id=finance_role AND access.menu_id=menu.id AND menu.name='FinanceEstimatedPayable:Add';
 SELECT count(*) INTO stock_count FROM public.wms_inventory_movement;
 headers:=current_setting('request.headers');old_context:=current_setting('request.jwt.claims');
 blocked:=false;BEGIN PERFORM public.wms_change_purchase_document_status_secure(source_id,'approve');EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
 IF NOT blocked OR(SELECT status FROM public.wms_purchase_document WHERE id=source_id)<>'submitted' OR EXISTS(SELECT 1 FROM public.fms_purchase_payable_document WHERE source_document_id=source_id)
  OR EXISTS(SELECT 1 FROM public.wms_purchase_document_line WHERE document_id=source_id AND movement_id IS NOT NULL) OR(SELECT count(*) FROM public.wms_inventory_movement)<>stock_count THEN RAISE EXCEPTION 'Revoked financial authority left partial warehouse or payable writes';END IF;
 IF auth.uid()<>warehouse_actor OR current_setting('request.headers')<>headers OR current_setting('request.jwt.claims')<>old_context THEN RAISE EXCEPTION 'Failed delegation leaked financial context';END IF;
 INSERT INTO public.sys_role_menu(tenant_id,role_id,menu_id) SELECT tenant,finance_role,id FROM public.sys_menu WHERE name='FinanceEstimatedPayable:Add';
 PERFORM set_config('request.jwt.claim.sub',root_actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',root_actor,'role','authenticated')::text,true);
 PERFORM set_config('request.headers','{}',true);
 PERFORM public.set_fms_accounting_period_status(period_id,'closing');
 PERFORM public.set_fms_accounting_period_status(period_id,'closed');
 PERFORM set_config('request.jwt.claim.sub',warehouse_actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',warehouse_actor,'role','authenticated')::text,true);
 PERFORM set_config('request.headers',headers,true);
 blocked:=false;BEGIN PERFORM public.wms_change_purchase_document_status_secure(source_id,'approve');EXCEPTION WHEN check_violation THEN blocked:=true;END;
 IF NOT blocked OR(SELECT status FROM public.wms_purchase_document WHERE id=source_id)<>'submitted' OR(SELECT count(*) FROM public.wms_inventory_movement)<>stock_count THEN RAISE EXCEPTION 'Closed period accepted late warehouse or payable writes';END IF;
 PERFORM set_config('request.jwt.claim.sub',root_actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',root_actor,'role','authenticated')::text,true);
 PERFORM set_config('request.headers','{}',true);
 PERFORM public.set_fms_accounting_period_status(period_id,'open','回滚测试恢复开放期间');
 PERFORM set_config('request.jwt.claim.sub',finance_actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',finance_actor,'role','authenticated')::text,true);
 policy_ident:=public.fms_save_payable_accrual_policy_secure(parameter||jsonb_build_object('id',policy_ident,'version',(SELECT version FROM public.fms_payable_accrual_policy WHERE id=policy_ident),'enabled',false));
 IF jsonb_array_length(public.fms_payable_accrual_delete_dependencies_secure(ARRAY[policy_ident]))=0 THEN RAISE EXCEPTION 'Used policy has no recognizable dependencies';END IF;
 blocked:=false;BEGIN PERFORM public.fms_delete_payable_accrual_policy_secure(policy_ident);EXCEPTION WHEN foreign_key_violation THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Used policy history was deleted';END IF;
 blocked:=false;BEGIN PERFORM public.fms_save_payable_accrual_policy_secure(parameter||jsonb_build_object('id',policy_ident,'version',(SELECT version FROM public.fms_payable_accrual_policy WHERE id=policy_ident),'effective_from',app_private.payable_business_date()+1));EXCEPTION WHEN check_violation THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Used policy moved its completeness boundary';END IF;
 IF(public.fms_payable_accrual_workspace_secure('{}')->'configurations'->>'total')::integer<>1 THEN RAISE EXCEPTION 'Ordinary policy workspace lost its tenant row';END IF;
 IF has_function_privilege('anon','public.fms_save_payable_accrual_policy_secure(jsonb)','EXECUTE') OR has_function_privilege('authenticated','app_private.apply_payable_accrual_on_inbound(uuid)','EXECUTE') THEN RAISE EXCEPTION 'Internal accrual mutation became public';END IF;
END $automatic_accrual$;

ROLLBACK;
