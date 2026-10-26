BEGIN;
SET LOCAL jit=off;
SET LOCAL statement_timeout='12s';

DO $test$
DECLARE
 actor uuid; tenant uuid; ordinary uuid; book uuid; currency uuid; supplier uuid;
 guarantee_purpose uuid; purchase_purpose uuid; cash_method uuid; virtual_method uuid; fund uuid; document_type uuid;
 source_document jsonb; target_document jsonb; source_line uuid; target_line uuid; before_ledger bigint; after_ledger bigint;
 fixture_role uuid; fixture_code text:='QA_GUARANTEE_'||upper(left(gen_random_uuid()::text,8)); blocked boolean; case_no integer;
BEGIN
 IF to_regprocedure('public.fms_convert_guarantee_to_purchase_payment_secure(uuid)') IS NULL THEN
  RAISE EXCEPTION 'Missing guarantee-to-purchase-payment RPC';
 END IF;
 SELECT auth_user_id,tenant_id INTO actor,tenant FROM public.sys_user
 WHERE auth_user_id IS NOT NULL AND user_roles @>ARRAY['R_SUPER'] ORDER BY id LIMIT 1;
 SELECT account_set.id,currency_row.id,supplier_row.id,type_row.id INTO book,currency,supplier,document_type
 FROM public.fms_account_set account_set
 JOIN public.fms_currency currency_row ON currency_row.account_set_id=account_set.id AND currency_row.tenant_id=account_set.tenant_id AND currency_row.is_base
 JOIN public.mdm_supplier supplier_row ON supplier_row.tenant_id=account_set.tenant_id
 JOIN public.mdm_document_type type_row ON type_row.tenant_id=account_set.tenant_id AND type_row.document_type_code='AP_PAYMENT_PURCHASE' AND type_row.enabled
 WHERE account_set.status='active' AND account_set.is_default
 AND EXISTS(SELECT 1 FROM public.sys_user user_row WHERE user_row.tenant_id=account_set.tenant_id AND user_row.auth_user_id IS NOT NULL AND user_row.status='1' AND NOT user_row.user_roles @>ARRAY['R_SUPER'])
 AND EXISTS(SELECT 1 FROM public.mdm_settlement_method method WHERE method.tenant_id=account_set.tenant_id AND method.enabled AND method.category='cash')
 AND EXISTS(SELECT 1 FROM public.mdm_settlement_method method WHERE method.tenant_id=account_set.tenant_id AND method.enabled AND method.category='virtual')
 AND EXISTS(SELECT 1 FROM public.fms_fund_account account WHERE account.tenant_id=account_set.tenant_id AND account.account_set_id=account_set.id AND account.currency_id=currency_row.id AND account.account_type='cash')
 ORDER BY account_set.id LIMIT 1;
 tenant:=(SELECT tenant_id FROM public.fms_account_set WHERE id=book);
 SELECT auth_user_id INTO ordinary FROM public.sys_user WHERE tenant_id=tenant AND auth_user_id IS NOT NULL AND status='1' AND NOT user_roles @>ARRAY['R_SUPER'] ORDER BY id LIMIT 1;
 IF ordinary IS NULL THEN RAISE EXCEPTION 'Guarantee regression needs an ordinary tenant user';END IF;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',tenant)::text,true);
 guarantee_purpose:=public.fms_save_payable_reference_secure('purpose',jsonb_build_object('tenant_id',tenant,'code',fixture_code,'name','采购保证金回滚用途','business_type','guarantee','payable_writeoff',false));
 SELECT id INTO purchase_purpose FROM public.mdm_payment_purpose WHERE tenant_id=tenant AND enabled AND business_type='purchase' AND payable_writeoff ORDER BY id LIMIT 1;
 SELECT id INTO cash_method FROM public.mdm_settlement_method WHERE tenant_id=tenant AND enabled AND category='cash' ORDER BY id LIMIT 1;
 SELECT id INTO virtual_method FROM public.mdm_settlement_method WHERE tenant_id=tenant AND enabled AND category='virtual' ORDER BY id LIMIT 1;
 SELECT id INTO fund FROM public.fms_fund_account WHERE tenant_id=tenant AND account_set_id=book AND currency_id=currency AND account_type='cash' ORDER BY id LIMIT 1;
 IF purchase_purpose IS NULL OR cash_method IS NULL OR virtual_method IS NULL OR fund IS NULL THEN RAISE EXCEPTION 'Guarantee regression needs purchase purpose, cash/virtual methods and fund account';END IF;
 INSERT INTO public.sys_role(role_code,role_name,tenant_id,enabled) VALUES(fixture_code,'保证金转货款回滚角色',tenant,true) RETURNING id INTO fixture_role;
 INSERT INTO public.sys_role_menu(role_id,menu_id,tenant_id)
 SELECT fixture_role,id,tenant FROM public.sys_menu WHERE name IN('FinancePayablePayment:View','FinancePayablePayment:Add','FinancePayablePayment:Edit','FinancePayablePayment:Submit','FinancePayablePayment:Approve','FinancePayablePayment:Confirm','FinancePayablePayment:Void','FinancePayablePayment:GuaranteeConvert');
 UPDATE public.sys_user SET user_roles=ARRAY[fixture_code] WHERE auth_user_id=ordinary;
 FOR case_no IN 1..2 LOOP
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  source_document:=public.fms_save_payable_settlement_secure(jsonb_build_object('kind','payment','tenant_id',tenant,'document_type_id',document_type,'business_date',app_private.payable_business_date(),'currency_code',(SELECT currency_code FROM public.fms_currency WHERE id=currency),'lines',jsonb_build_array(jsonb_build_object('purpose_id',guarantee_purpose,'supplier_id',supplier,'settlement_method_id',cash_method,'fund_account_id',fund,'amount',case_no*100))));
  PERFORM public.fms_act_payable_settlement_secure(ARRAY[(source_document->>'id')::uuid],'submit');
  PERFORM public.fms_act_payable_settlement_secure(ARRAY[(source_document->>'id')::uuid],'approve');
  PERFORM public.fms_act_payable_settlement_secure(ARRAY[(source_document->>'id')::uuid],'confirm');
  source_line:=(source_document->'lines'->0->>'id')::uuid;
  SELECT count(*) INTO before_ledger FROM public.fms_fund_ledger_entry WHERE tenant_id=tenant;
  PERFORM set_config('request.jwt.claim.sub',ordinary::text,true);
  target_document:=public.fms_convert_guarantee_to_purchase_payment_secure((source_document->>'id')::uuid);
  target_line:=(target_document->'lines'->0->>'id')::uuid;
  IF target_document->>'kind'<>'payment' OR (target_document->'lines'->0->>'guarantee_payment_line_id')::uuid IS DISTINCT FROM source_line
   OR target_document->'lines'->0->>'purpose_type' IS DISTINCT FROM 'purchase'
   OR (target_document->'lines'->0->>'amount')::numeric IS DISTINCT FROM case_no*100 THEN RAISE EXCEPTION 'Guarantee conversion lost its source, purpose or amount: %',target_document;END IF;
  blocked:=false;BEGIN PERFORM public.fms_convert_guarantee_to_purchase_payment_secure((source_document->>'id')::uuid);EXCEPTION WHEN check_violation THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'Duplicate active guarantee conversion was accepted';END IF;
  PERFORM public.fms_act_payable_settlement_secure(ARRAY[(target_document->>'id')::uuid],'submit');
  PERFORM public.fms_act_payable_settlement_secure(ARRAY[(target_document->>'id')::uuid],'approve');
  PERFORM public.fms_act_payable_settlement_secure(ARRAY[(target_document->>'id')::uuid],'confirm');
  SELECT count(*) INTO after_ledger FROM public.fms_fund_ledger_entry WHERE tenant_id=tenant;
  IF after_ledger<>before_ledger THEN RAISE EXCEPTION 'Guarantee conversion generated a second cash movement';END IF;
  IF (app_private.payable_payment_line_state(target_line)->>'settlement_valid')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Converted purchase payment is not available for payable writeoff';END IF;
  blocked:=false;BEGIN PERFORM public.fms_act_payable_settlement_secure(ARRAY[(source_document->>'id')::uuid],'cancel_payment','active conversion');EXCEPTION WHEN foreign_key_violation THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'Source guarantee payment was cancelled while conversion remained active';END IF;
  PERFORM public.fms_act_payable_settlement_secure(ARRAY[(target_document->>'id')::uuid],'cancel_payment','release conversion');
  PERFORM public.fms_act_payable_settlement_secure(ARRAY[(target_document->>'id')::uuid],'void','release conversion');
  PERFORM public.fms_act_payable_settlement_secure(ARRAY[(source_document->>'id')::uuid],'cancel_payment','conversion voided');
 END LOOP;
END $test$;

ROLLBACK;
