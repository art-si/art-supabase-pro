BEGIN;
SET LOCAL statement_timeout='8s';

CREATE FUNCTION pg_temp.prepare_sales_refund_kernel(p_currency text,p_payment_rate numeric DEFAULT NULL,p_source_rate numeric DEFAULT NULL,p_principal numeric DEFAULT 60) RETURNS jsonb
LANGUAGE plpgsql AS $test$
DECLARE tenant uuid;actor uuid;profile uuid;original_roles text[];fixture_role uuid;
 fixture_code text:='QA_SALES_REFUND_'||upper(left(gen_random_uuid()::text,8));
 book uuid;currency_ident uuid;customer uuid;customer_owner uuid;customer_owner_auth uuid;organization uuid;financial_type uuid;application_type uuid;payment_type uuid;
 resource_ident uuid;field_ident uuid;bank_resource uuid;bank_field uuid;source_id uuid;source_line uuid;application_id uuid;application_line uuid;
 purpose uuid;method uuid;fund uuid;context_value jsonb;application_json jsonb;options_json jsonb;source_json jsonb;
 source_rate numeric:=CASE WHEN p_currency='CNY' THEN 1 ELSE coalesce(p_source_rate,7.2) END;
 payment_rate numeric:=CASE WHEN p_currency='CNY' THEN 1 ELSE coalesce(p_payment_rate,7) END;
BEGIN
 IF p_currency NOT IN('CNY','USD') THEN RAISE EXCEPTION 'Unsupported sales refund test currency';END IF;
 IF p_principal NOT BETWEEN 10 AND 100 THEN RAISE EXCEPTION 'Unsupported sales refund test principal';END IF;
 SELECT id INTO STRICT tenant FROM public.sys_tenant WHERE tenant_code='qa-payable-20261022';
 SELECT id,auth_user_id,user_roles INTO STRICT profile,actor,original_roles FROM public.sys_user
 WHERE tenant_id=tenant AND user_roles=ARRAY['QA_AP_ACCEPTANCE_01A15DAD'];
 SELECT id INTO STRICT book FROM public.fms_account_set WHERE tenant_id=tenant AND is_default AND status='active';
 SELECT id INTO STRICT currency_ident FROM public.fms_currency WHERE tenant_id=tenant AND account_set_id=book AND currency_code=p_currency AND is_enabled;
 SELECT id,auth_user_id INTO STRICT customer_owner,customer_owner_auth FROM public.sys_user WHERE auth_user_id IS NOT NULL AND status='1' AND 'R_SUPER'=ANY(user_roles) ORDER BY id LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',customer_owner_auth::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',customer_owner_auth,'role','authenticated')::text,true);
 PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',tenant)::text,true);
 INSERT INTO public.mdm_customer(tenant_id,customer_code,customer_name,created_by_user_id,bank_account,bank_name)
 VALUES(tenant,fixture_code,'仅回滚销售退款客户'||p_currency||right(fixture_code,8),customer_owner,'00000000000000000001','仅回滚虚构开户行') RETURNING id INTO customer;
 SELECT id INTO STRICT organization FROM public.mdm_organization WHERE tenant_id=tenant AND organization_type='company' AND status='1' ORDER BY id LIMIT 1;
 SELECT id INTO STRICT financial_type FROM public.mdm_document_type WHERE tenant_id=tenant AND document_type_code='AR_FIN_STANDARD';
 SELECT id INTO STRICT application_type FROM public.mdm_document_type WHERE tenant_id=tenant AND document_type_code='AP_APP_SALES_REFUND';
 SELECT id INTO STRICT payment_type FROM public.mdm_document_type WHERE tenant_id=tenant AND document_type_code='AP_PAYMENT_OTHER';
 SELECT id INTO STRICT method FROM public.mdm_settlement_method WHERE tenant_id=tenant AND code='JSFS01' AND enabled;
 SELECT account.id INTO STRICT fund FROM public.fms_fund_account account JOIN public.fms_currency currency ON currency.id=account.currency_id AND currency.tenant_id=account.tenant_id
 WHERE account.tenant_id=tenant AND account.account_set_id=book AND account.account_type='cash' AND account.status='active' AND currency.currency_code=p_currency ORDER BY account.id LIMIT 1;
 INSERT INTO public.sys_role(tenant_id,role_code,role_name,enabled) VALUES(tenant,fixture_code,'销售退款桥接回滚角色',true) RETURNING id INTO fixture_role;
 INSERT INTO public.sys_role_menu(role_id,menu_id,tenant_id) SELECT fixture_role,id,tenant FROM public.sys_menu WHERE name IN(
  'FinanceFinancialReceivable','FinanceFinancialReceivable:View','FinanceFinancialReceivable:Add','FinanceFinancialReceivable:Submit','FinanceFinancialReceivable:Approve','FinanceFinancialReceivable:Push','FinanceFinancialReceivable:Delete',
  'FinanceReceivablePaymentRequest','FinanceReceivablePaymentRequest:View','FinanceReceivablePaymentRequest:Add','FinanceReceivablePaymentRequest:Delete',
  'FinancePayableApplication','FinancePayableApplication:View','FinancePayableApplication:Add','FinancePayableApplication:Edit','FinancePayableApplication:Submit','FinancePayableApplication:Approve','FinancePayableApplication:Push','FinancePayableApplication:Close','FinancePayableApplication:Delete',
  'FinancePayablePayment','FinancePayablePayment:View','FinancePayablePayment:Add','FinancePayablePayment:Edit','FinancePayablePayment:Submit','FinancePayablePayment:Approve','FinancePayablePayment:Confirm','FinancePayablePayment:Void');
 UPDATE public.sys_user SET user_roles=ARRAY[fixture_code] WHERE id=profile;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 PERFORM set_config('request.headers','{}',true);
 IF app_private.is_platform_super() THEN RAISE EXCEPTION 'Kernel regression must exercise ordinary permissions';END IF;
 SELECT resource.id,field.id INTO STRICT resource_ident,field_ident FROM public.sys_permission_resource resource
 JOIN public.sys_permission_field field ON field.resource_id=resource.id AND field.tenant_id=resource.tenant_id
 WHERE resource.tenant_id=tenant AND resource.resource_key='fms.receivable' AND field.field_key='amounts';
 INSERT INTO public.sys_role_field_permission(tenant_id,role_id,resource_id,field_id,access_level,create_by)
 VALUES(tenant,fixture_role,resource_ident,field_ident,'edit',actor::text);
 SELECT resource.id,field.id INTO STRICT bank_resource,bank_field FROM public.sys_permission_resource resource
 JOIN public.sys_permission_field field ON field.resource_id=resource.id AND field.tenant_id=resource.tenant_id
 WHERE resource.tenant_id=tenant AND resource.resource_key='tms.customer' AND field.field_key='bankAccount';
 INSERT INTO public.sys_role_field_permission(tenant_id,role_id,resource_id,field_id,access_level,create_by)
 VALUES(tenant,fixture_role,bank_resource,bank_field,'edit',actor::text);
 IF p_currency='USD' THEN
  INSERT INTO public.fms_exchange_rate(tenant_id,account_set_id,currency_id,rate_date,rate_type,direct_rate)
  VALUES(tenant,book,currency_ident,app_private.payable_business_date(),'spot',source_rate)
  ON CONFLICT(account_set_id,currency_id,rate_date,rate_type) DO UPDATE SET direct_rate=excluded.direct_rate;
 END IF;
 source_id:=public.fms_save_receivable_document_secure(jsonb_build_object('kind','financial','tenantId',tenant,'documentTypeId',financial_type,
  'customerId',customer,'settlementOrganizationId',organization,'businessDate',app_private.payable_business_date(),'currencyCode',p_currency,'isCredit',true,
  'settlementMethod','cash','lines',jsonb_build_array(jsonb_build_object('lineNo',10,'basis','amount','materialDescription','销售退款桥接回滚金额行',
   'enteredGrossAmount',100,'quantity',0,'unitPrice',0,'priceBasis','taxed','taxRate',0,'discountMethod','none'))));
 PERFORM public.fms_act_receivable_document_secure(source_id,'submit');
 PERFORM public.fms_act_receivable_document_secure(source_id,'approve');
 source_json:=public.fms_receivable_workspace_secure('financial',jsonb_build_object('id',source_id,'size',1))->'records'->0;
 IF(source_json->>'account_set_id')::uuid IS DISTINCT FROM book OR(source_json->>'exchange_rate')::numeric IS DISTINCT FROM source_rate
  OR source_json->>'accountSetName' IS DISTINCT FROM(SELECT account_set_name FROM public.fms_account_set WHERE id=book)
  OR(source_json->'bookContext'->>'configured')::boolean IS DISTINCT FROM true
  OR(source_json->'bookContext'->>'exchange_rate')::numeric IS DISTINCT FROM source_rate THEN
  RAISE EXCEPTION 'Source AR detail projection omitted its real original book name or historical quote';END IF;
 SELECT id INTO STRICT source_line FROM public.fms_receivable_line WHERE document_id=source_id;
 context_value:=app_private.payable_sales_refund_context(source_line,tenant);
 IF(context_value->>'exchange_rate')::numeric IS DISTINCT FROM source_rate OR(context_value->>'account_set_id')::uuid IS DISTINCT FROM book
  OR(context_value->>'available_amount')::numeric IS DISTINCT FROM 100::numeric THEN RAISE EXCEPTION 'Sales refund context did not preserve actual original receivable';END IF;
 IF p_currency='USD' THEN
  UPDATE public.fms_exchange_rate SET direct_rate=payment_rate WHERE account_set_id=book AND currency_id=currency_ident AND rate_date=app_private.payable_business_date() AND rate_type='spot';
 END IF;
 options_json:=public.fms_payable_settlement_options_secure('application',tenant);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(options_json->'receivable') value WHERE(value->>'receivable_line_id')::uuid=source_line
  AND(value->>'source_document_id')::uuid=source_id AND(value->>'account_set_id')::uuid=book AND(value->>'amount')::numeric=100)
  OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(options_json->'customer') value WHERE(value->>'id')::uuid=customer)
  OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(options_json->'bank') value WHERE(value->>'customer_id')::uuid=customer
   AND value->>'bank_account'='00000000000000000001' AND value->>'currency_code' IS NULL AND value->>'account_name'='') THEN
  RAISE EXCEPTION 'Source/customer options lost verified identity or invented customer bank currency/account holder';END IF;
 UPDATE public.sys_role_field_permission SET access_level='hidden' WHERE role_id=fixture_role AND field_id=bank_field;
 options_json:=public.fms_payable_settlement_options_secure('application',tenant);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(options_json->'bank') value WHERE(value->>'customer_id')::uuid=customer) THEN
  RAISE EXCEPTION 'Hidden customer bank account leaked through payment options';END IF;
 UPDATE public.sys_role_field_permission SET access_level='edit' WHERE role_id=fixture_role AND field_id=bank_field;
 application_json:=public.fms_push_payable_settlement_secure(source_id,'application','receivable');
 application_id:=(application_json->>'id')::uuid;
 application_line:=(application_json->'lines'->0->>'id')::uuid;
 purpose:=(application_json->'lines'->0->>'purpose_id')::uuid;
 IF application_json->>'kind' IS DISTINCT FROM 'application' OR(application_json->>'document_type_id')::uuid IS DISTINCT FROM application_type OR(application_json->>'account_set_id')::uuid IS DISTINCT FROM book
  OR application_json->>'currency_code' IS DISTINCT FROM p_currency OR(application_json->>'exchange_rate')::numeric IS DISTINCT FROM payment_rate
  OR application_json->'lines'->0->>'source_document_kind' IS DISTINCT FROM 'financial_receivable'
  OR(application_json->'lines'->0->>'source_document_id')::uuid IS DISTINCT FROM source_id
  OR(application_json->'lines'->0->>'customer_id')::uuid IS DISTINCT FROM customer
  OR app_private.ar_line_balance(source_line)<>0 THEN
  RAISE EXCEPTION 'Public AR downpush lost its real customer/source/book or failed to reserve native AR balance';
 END IF;
 context_value:=jsonb_build_object('tenant',tenant,'actor',actor,'profile',profile,'original_roles',to_jsonb(original_roles),'fixture_role_code',fixture_code,
  'book',book,'currency',p_currency,'currency_id',currency_ident,'customer',customer,'source',source_id,'source_line',source_line,'source_rate',source_rate,'payment_rate',payment_rate,'principal',p_principal,
  'application',application_id,'application_line',application_line,'payment_type',payment_type,'purpose',purpose,'method',method,'fund',fund);
 PERFORM set_config('qa.sales_refund_kernel_'||lower(p_currency),context_value::text,true);
 UPDATE public.sys_user SET user_roles=original_roles WHERE id=profile;
 RETURN jsonb_build_object('currency',p_currency,'prepared',true);
END $test$;

CREATE FUNCTION pg_temp.check_sales_refund_kernel(p_currency text,p_step integer) RETURNS jsonb
LANGUAGE plpgsql AS $test$
DECLARE context_value jsonb:=current_setting('qa.sales_refund_kernel_'||lower(p_currency))::jsonb;
 tenant uuid:=(context_value->>'tenant')::uuid;actor uuid:=(context_value->>'actor')::uuid;
 application_id uuid:=(context_value->>'application')::uuid;source_line uuid:=(context_value->>'source_line')::uuid;
 principal numeric:=(context_value->>'principal')::numeric;
 payment_id uuid;payment_line uuid;execution_id uuid;legacy_id uuid;blocked boolean;fact public.fms_receivable_application;balance_value jsonb;document_json jsonb;payload jsonb;dependencies jsonb;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 PERFORM set_config('request.headers','{}',true);
 UPDATE public.sys_user SET user_roles=ARRAY[context_value->>'fixture_role_code'] WHERE id=(context_value->>'profile')::uuid;
 IF p_step=1 THEN
  dependencies:=public.fms_ar_delete_dependencies_secure('financial',ARRAY[(context_value->>'source')::uuid]);
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(dependencies) value WHERE value->>'dependencyCode'='payable_application'
   AND(value->>'targetId')::uuid=application_id AND nullif(value->>'recordNo','') IS NOT NULL) THEN
   RAISE EXCEPTION 'Original AR deletion guard omitted recognizable unified application history';END IF;
  PERFORM app_private.sync_payable_sales_refund(application_id);
  PERFORM app_private.sync_payable_sales_refund(application_id);
  IF app_private.ar_line_balance(source_line)<>0 OR(SELECT count(*) FROM public.fms_receivable_application
   WHERE source_type='payable_sales_refund_reservation' AND source_id=application_id)<>1 THEN RAISE EXCEPTION 'Draft reservation duplicated or missed native AR balance';END IF;
  blocked:=false;
  BEGIN PERFORM public.fms_create_credit_payment_request_secure((context_value->>'source')::uuid,jsonb_build_object('amount',10,'businessDate',app_private.payable_business_date(),'fundAccountId',context_value->>'fund','remark','旧申请重复占用必须被拦截'));
  EXCEPTION WHEN check_violation THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'Legacy AR payment request bypassed unified reservation';END IF;
  document_json:=app_private.payable_settlement_json(application_id);
  document_json:=jsonb_set(document_json,'{lines}',(SELECT jsonb_agg(value||jsonb_build_object('amount',principal,'approved_amount',principal,'planned_amount',principal,
   'details',jsonb_build_object('source_line_no','forged-line'))) FROM jsonb_array_elements(document_json->'lines') value));
  document_json:=public.fms_save_payable_settlement_secure(document_json);
  IF document_json->'lines'->0->'details'->>'source_line_no' IS DISTINCT FROM '10' THEN RAISE EXCEPTION 'Generated customer refund source line number could be forged';END IF;
  PERFORM public.fms_act_payable_settlement_secure(ARRAY[application_id],'submit');
  PERFORM public.fms_act_payable_settlement_secure(ARRAY[application_id],'approve');
  IF app_private.ar_line_balance(source_line)<>100-principal THEN RAISE EXCEPTION 'Application did not reserve its exact requested principal';END IF;
 ELSIF p_step=2 THEN
  document_json:=public.fms_push_payable_settlement_secure(application_id,'payment','application');
  payment_id:=(document_json->>'id')::uuid;
  payment_line:=(document_json->'lines'->0->>'id')::uuid;
  IF(document_json->>'document_type_id')::uuid IS DISTINCT FROM(context_value->>'payment_type')::uuid
   OR(document_json->'lines'->0->>'application_line_id')::uuid IS DISTINCT FROM(context_value->>'application_line')::uuid
   OR(document_json->'lines'->0->>'receivable_line_id')::uuid IS DISTINCT FROM source_line THEN RAISE EXCEPTION 'Public application downpush replaced original customer refund source';END IF;
  blocked:=false;
  BEGIN
   PERFORM public.fms_save_payable_settlement_secure(jsonb_set(document_json,'{lines}',(document_json->'lines')||jsonb_build_array(
    (document_json->'lines'->0)-'id'||jsonb_build_object('application_line_id',NULL,'amount',1,'approved_amount',1,'planned_amount',1,'line_no',20))));
  EXCEPTION WHEN check_violation THEN blocked:=true;END;
  IF NOT blocked OR(SELECT count(*) FROM public.fms_payable_settlement_line WHERE document_id=payment_id)<>1 THEN
   RAISE EXCEPTION 'A second customer payment line bypassed its own approved application';END IF;
  document_json:=public.fms_save_payable_settlement_secure(jsonb_set(document_json,'{lines}',jsonb_build_array(
   (document_json->'lines'->0)||jsonb_build_object('amount',principal/2,'approved_amount',principal/2,'planned_amount',principal/2),
   (document_json->'lines'->0)-'id'||jsonb_build_object('amount',principal/2,'approved_amount',principal/2,'planned_amount',principal/2,'line_no',20))));
  document_json:=public.fms_save_payable_settlement_secure(jsonb_set(document_json,'{lines}',jsonb_build_array(
   (document_json->'lines'->0)||jsonb_build_object('amount',principal/2+5,'approved_amount',principal/2+5,'planned_amount',principal/2+5),
   (document_json->'lines'->1)||jsonb_build_object('amount',principal/2-5,'approved_amount',principal/2-5,'planned_amount',principal/2-5))));
  document_json:=public.fms_save_payable_settlement_secure(jsonb_set(document_json,'{lines}',jsonb_build_array(
   (document_json->'lines'->0)||jsonb_build_object('amount',principal,'approved_amount',principal,'planned_amount',principal))));
  document_json:=jsonb_set(document_json,'{lines}',(SELECT jsonb_agg(value||jsonb_build_object('fund_account_id',(context_value->>'fund')::uuid)) FROM jsonb_array_elements(document_json->'lines') value));
  PERFORM public.fms_save_payable_settlement_secure(document_json);
  PERFORM public.fms_act_payable_settlement_secure(ARRAY[payment_id],'submit');
  PERFORM public.fms_act_payable_settlement_secure(ARRAY[payment_id],'approve');
  PERFORM public.fms_act_payable_settlement_secure(ARRAY[payment_id],'confirm');
  dependencies:=public.fms_ar_delete_dependencies_secure('financial',ARRAY[(context_value->>'source')::uuid]);
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(dependencies) value WHERE value->>'dependencyCode'='payable_payment'
   AND(value->>'targetId')::uuid=payment_id AND value->>'recordStatus'='confirmed') THEN
   RAISE EXCEPTION 'Original AR deletion guard omitted confirmed unified customer payment';END IF;
  SELECT id INTO STRICT execution_id FROM public.fms_payable_payment_execution WHERE document_id=payment_id AND status='posted';
  SELECT * INTO STRICT fact FROM public.fms_receivable_application WHERE source_type='payable_sales_refund' AND source_id=execution_id;
  balance_value:=app_private.payable_sales_refund_context(source_line,tenant);
  IF fact.ledger_snapshot_version IS DISTINCT FROM 1 OR fact.amount<>principal OR fact.ledger_base_amount<>round(principal*(context_value->>'source_rate')::numeric,2)
   OR fact.ledger_account_set_id IS DISTINCT FROM(context_value->>'book')::uuid
   OR(balance_value->>'original_remaining')::numeric IS DISTINCT FROM 100-principal OR(balance_value->>'available_amount')::numeric IS DISTINCT FROM 100-principal THEN
   RAISE EXCEPTION 'Actual payment did not consume original AR carrying value and release its application reservation';END IF;
  payload:=app_private.payable_settlement_posting_payload(payment_line);
  IF payload IS NULL OR(payload->>'customer_id')::uuid IS DISTINCT FROM(context_value->>'customer')::uuid
   OR(payload->>'receivable_amount')::numeric IS DISTINCT FROM fact.ledger_base_amount
   OR(payload->>'exchange_gain_loss')::numeric IS DISTINCT FROM round(principal*(context_value->>'payment_rate')::numeric,2)-round(principal*(context_value->>'source_rate')::numeric,2) THEN
   RAISE EXCEPTION 'Customer refund posting payload replaced original AR carrying amount or FX loss/gain';END IF;
  blocked:=false;
  BEGIN DELETE FROM public.fms_receivable_application WHERE id=fact.id;EXCEPTION WHEN foreign_key_violation THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'Confirmed customer refund history was deletable';END IF;
  context_value:=context_value||jsonb_build_object('payment',payment_id,'execution',execution_id,'fact',fact.id);
  PERFORM set_config('qa.sales_refund_kernel_'||lower(p_currency),context_value::text,true);
 ELSIF p_step=3 THEN
  payment_id:=(context_value->>'payment')::uuid;
  PERFORM public.fms_act_payable_settlement_secure(ARRAY[payment_id],'cancel_payment','只回滚虚构现金验收');
  SELECT * INTO STRICT fact FROM public.fms_receivable_application WHERE reversal_application_id=(context_value->>'fact')::uuid;
  balance_value:=app_private.payable_sales_refund_context(source_line,tenant);
  IF fact.effect<>-1 OR fact.ledger_base_amount<>round(principal*(context_value->>'source_rate')::numeric,2)
   OR(balance_value->>'original_remaining')::numeric IS DISTINCT FROM 100::numeric OR(balance_value->>'available_amount')::numeric IS DISTINCT FROM 100-principal THEN
   RAISE EXCEPTION 'Cancellation did not restore exact original AR balance and remaining approved reservation';END IF;
  PERFORM app_private.sync_payable_sales_refund(payment_id);
  IF(SELECT count(*) FROM public.fms_receivable_application WHERE reversal_application_id=(context_value->>'fact')::uuid)<>1 THEN RAISE EXCEPTION 'Replayed sync duplicated a reversal';END IF;
  PERFORM public.fms_act_payable_settlement_secure(ARRAY[payment_id],'void','取消后不再付款');
  PERFORM public.fms_act_payable_settlement_secure(ARRAY[application_id],'close','申请不再付款');
  IF app_private.ar_line_balance(source_line)<>100 THEN RAISE EXCEPTION 'Closed application retained draft reservation';END IF;
  legacy_id:=public.fms_create_credit_payment_request_secure((context_value->>'source')::uuid,jsonb_build_object('amount',10,'businessDate',app_private.payable_business_date(),'fundAccountId',context_value->>'fund','remark','旧申请共用额度验证'));
  IF app_private.ar_line_balance(source_line)<>90 THEN RAISE EXCEPTION 'Legacy request no longer shares the authoritative AR ledger';END IF;
  dependencies:=public.fms_ar_delete_dependencies_secure('financial',ARRAY[(context_value->>'source')::uuid]);
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(dependencies) value WHERE value->>'dependencyCode'='payment_request'
   AND(value->>'targetId')::uuid=legacy_id) THEN RAISE EXCEPTION 'Legacy credit application disappeared from original AR deletion references';END IF;
  PERFORM public.fms_act_receivable_payment_request_secure(legacy_id,'delete');
  IF app_private.ar_line_balance(source_line)<>100 THEN RAISE EXCEPTION 'Legacy draft deletion did not release only its own reservation';END IF;
 ELSE RAISE EXCEPTION 'Unknown sales refund kernel test step';END IF;
 UPDATE public.sys_user SET user_roles=ARRAY(SELECT jsonb_array_elements_text(context_value->'original_roles')) WHERE id=(context_value->>'profile')::uuid;
 RETURN jsonb_build_object('currency',p_currency,'step',p_step,'passed',true);
END $test$;

CREATE FUNCTION pg_temp.check_sales_refund_security(p_currency text) RETURNS jsonb
LANGUAGE plpgsql AS $test$
DECLARE context_value jsonb:=current_setting('qa.sales_refund_kernel_'||lower(p_currency))::jsonb;
 actor uuid;platform_tenant uuid;tenant uuid:=(context_value->>'tenant')::uuid;source_line uuid:=(context_value->>'source_line')::uuid;
 scope_name text;blocked boolean;actual jsonb;created jsonb;
BEGIN
 SELECT auth_user_id,tenant_id INTO STRICT actor,platform_tenant FROM public.sys_user
 WHERE auth_user_id IS NOT NULL AND status='1' AND 'R_SUPER'=ANY(user_roles) ORDER BY id LIMIT 1;
 FOREACH scope_name IN ARRAY ARRAY['all','selected','ordinary','forged'] LOOP
  IF scope_name IN('ordinary','forged') THEN actor:=(context_value->>'actor')::uuid;END IF;
  UPDATE public.sys_user SET user_roles=ARRAY[context_value->>'fixture_role_code'] WHERE id=(context_value->>'profile')::uuid;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  PERFORM set_config('request.headers',CASE WHEN scope_name='selected' THEN jsonb_build_object('x-art-tenant-scope',tenant)::text
   WHEN scope_name='forged' THEN jsonb_build_object('x-art-tenant-scope',platform_tenant)::text ELSE '{}' END,true);
  actual:=app_private.payable_sales_refund_context(source_line,tenant);
  IF(actual->>'tenant_id')::uuid IS DISTINCT FROM tenant OR(actual->>'customer_id')::uuid IS DISTINCT FROM(context_value->>'customer')::uuid
   OR(actual->>'account_set_id')::uuid IS DISTINCT FROM(context_value->>'book')::uuid THEN RAISE EXCEPTION 'Sales refund context changed tenant or original book';END IF;
  created:=public.fms_push_payable_settlement_secure((context_value->>'source')::uuid,'application','receivable');
  IF(created->>'tenant_id')::uuid IS DISTINCT FROM tenant OR(created->>'account_set_id')::uuid IS DISTINCT FROM(context_value->>'book')::uuid
   OR app_private.ar_line_balance(source_line)<>0 THEN RAISE EXCEPTION 'Source-inherited creation changed tenant or did not reserve its original ledger';END IF;
  PERFORM public.fms_save_payable_settlement_secure(created||jsonb_build_object('reason','来源继承租户下编辑'));
  PERFORM public.fms_act_payable_settlement_secure(ARRAY[(created->>'id')::uuid],'delete');
  IF app_private.ar_line_balance(source_line)<>100 THEN RAISE EXCEPTION 'Authorized draft deletion retained an inherited source reservation';END IF;
 END LOOP;
 blocked:=false;
 BEGIN PERFORM app_private.payable_sales_refund_context(source_line,platform_tenant);EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Forged tenant argument bypassed ordinary source ownership';END IF;
 blocked:=false;
 BEGIN
  UPDATE public.sys_role_field_permission SET access_level='hidden' WHERE role_id=(SELECT id FROM public.sys_role WHERE tenant_id=tenant AND role_code=context_value->>'fixture_role_code');
  PERFORM app_private.payable_sales_refund_context(source_line,tenant);
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Hidden AR amount was used to originate a customer refund';END IF;
 blocked:=false;
 BEGIN
  DELETE FROM public.sys_role_menu WHERE role_id=(SELECT id FROM public.sys_role WHERE tenant_id=tenant AND role_code=context_value->>'fixture_role_code')
   AND menu_id IN(SELECT id FROM public.sys_menu WHERE name='FinanceFinancialReceivable:View');
  PERFORM app_private.payable_sales_refund_context(source_line,tenant);
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Missing source View permission was ignored';END IF;
 blocked:=false;
 BEGIN
  UPDATE public.fms_receivable_document SET is_credit=false WHERE id=(context_value->>'source')::uuid;
  PERFORM app_private.payable_sales_refund_context(source_line,tenant);
 EXCEPTION WHEN check_violation THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Ordinary blue receivable could originate an outgoing refund';END IF;
 IF has_function_privilege('authenticated','app_private.payable_sales_refund_context(uuid,uuid)','EXECUTE')
  OR has_function_privilege('anon','app_private.sync_payable_sales_refund(uuid,boolean)','EXECUTE') THEN
  RAISE EXCEPTION 'Customer refund internals became a client write bypass';END IF;
 UPDATE public.sys_user SET user_roles=ARRAY(SELECT jsonb_array_elements_text(context_value->'original_roles')) WHERE id=(context_value->>'profile')::uuid;
 RETURN jsonb_build_object('currency',p_currency,'scopes',4,'hidden_and_missing_permission_blocked',true);
END $test$;

SELECT pg_temp.prepare_sales_refund_kernel('CNY');
SELECT pg_temp.check_sales_refund_kernel('CNY',1);
SELECT pg_temp.check_sales_refund_kernel('CNY',2);
SELECT pg_temp.check_sales_refund_kernel('CNY',3);
SELECT pg_temp.check_sales_refund_security('CNY');
SELECT pg_temp.prepare_sales_refund_kernel('USD');
SELECT pg_temp.check_sales_refund_kernel('USD',1);
SELECT pg_temp.check_sales_refund_kernel('USD',2);
SELECT pg_temp.check_sales_refund_kernel('USD',3);
SELECT pg_temp.check_sales_refund_security('USD');

ROLLBACK;
