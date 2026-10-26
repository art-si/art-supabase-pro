BEGIN;

DO $public_receipt$
<<receipt_contract>>
DECLARE
 actor uuid:='a9eeb9b7-e474-43e3-9cc2-c2f46c0f0ec3';tenant uuid:='111e83d3-190e-4405-84c8-440d484d13a6';role_id uuid:='40283472-f334-4cb9-84a0-2a41fcf7ab25';
 root_actor uuid;foreign_tenant uuid;organization uuid;supplier uuid;purpose uuid;book uuid;fund uuid;currency uuid;receipt uuid;execution uuid;old_execution uuid;
 debit uuid;credit uuid;rule_id uuid;voucher uuid;document_no text;payload jsonb;listing jsonb;row_value jsonb;preview jsonb;generated jsonb;repeated jsonb;
 event public.fms_posting_event;scenario integer;blocked boolean;posting_date date:=app_private.payable_business_date();currency_code text;rate numeric;original_amount numeric;
 restricted_role uuid;restricted_code text:='QA_SRP_MASK_'||upper(left(gen_random_uuid()::text,8));original_roles text[];
BEGIN
 SELECT auth_user_id INTO root_actor FROM public.sys_user WHERE user_roles @>array['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1;
 SELECT id INTO foreign_tenant FROM public.sys_tenant WHERE id<>tenant LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',root_actor::text,true);PERFORM set_config('request.headers','{}',true);
 INSERT INTO public.sys_role_menu(tenant_id,role_id,menu_id)
 SELECT tenant,role_id,id FROM public.sys_menu WHERE name IN('FinanceReceipt','FinanceReceipt:View','FinanceReceipt:Add','FinanceReceipt:Edit','FinanceReceipt:Submit',
  'FinanceReceipt:Approve','FinanceReceipt:Confirm','FinanceReceipt:Cancel','FinanceReceipt:Delete','FinanceReceipt:VoucherPreview','FinanceReceipt:VoucherGenerate') ON CONFLICT DO NOTHING;
 SELECT id INTO organization FROM public.mdm_organization WHERE tenant_id=tenant LIMIT 1;
 SELECT id INTO purpose FROM public.mdm_payment_purpose WHERE tenant_id=tenant AND business_type='purchase_refund' AND enabled ORDER BY code LIMIT 1;
 IF organization IS NULL OR purpose IS NULL THEN RAISE EXCEPTION 'Supplier receipt public fixtures required';END IF;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 FOR scenario IN 1..2 LOOP
  currency_code:=CASE WHEN scenario=1 THEN 'CNY' ELSE 'USD' END;rate:=CASE WHEN scenario=1 THEN 1 ELSE 7.25 END;original_amount:=scenario*12.34;
  SELECT id INTO supplier FROM public.mdm_supplier WHERE tenant_id=tenant AND supplier_code='QA_RPT_'||scenario;
  INSERT INTO public.fms_account_set(tenant_id,account_set_code,account_set_name,legal_entity_name,base_currency_code,enabled_on,status)
  VALUES(tenant,'QA_SRP_'||upper(left(gen_random_uuid()::text,8)),'供应商收款公共接口回滚账套','虚构验收主体','CNY',date_trunc('month',posting_date)::date,'active') RETURNING id INTO book;
  INSERT INTO public.fms_currency(tenant_id,account_set_id,currency_code,currency_name,symbol,is_enabled,is_base) VALUES(tenant,book,'CNY','人民币','¥',true,true) RETURNING id INTO currency;
  IF scenario=2 THEN
   INSERT INTO public.fms_currency(tenant_id,account_set_id,currency_code,currency_name,symbol,is_enabled,is_base) VALUES(tenant,book,'USD','美元','$',true,false) RETURNING id INTO currency;
  END IF;
  INSERT INTO public.fms_accounting_period(tenant_id,account_set_id,fiscal_year,period_no,start_date,end_date,status)
  VALUES(tenant,book,extract(year FROM posting_date)::integer,extract(month FROM posting_date)::integer,date_trunc('month',posting_date)::date,(date_trunc('month',posting_date)+interval '1 month'-interval '1 day')::date,'open');
  INSERT INTO public.fms_fund_account(tenant_id,account_set_id,currency_id,account_code,account_name,account_type,bank_name,account_no_masked,account_no_fingerprint,opening_balance)
  VALUES(tenant,book,currency,'QA_SRP_'||upper(left(gen_random_uuid()::text,8)),'供应商公共收款回滚账户',CASE WHEN scenario=1 THEN 'cash' ELSE 'bank' END,'虚构验收银行','**** QA',md5(gen_random_uuid()::text),0) RETURNING id INTO fund;
  payload:=jsonb_build_object('supplierId',supplier,'purposeId',purpose,'settlementOrganizationId',organization,'fundAccountId',fund,'currencyCode',currency_code,
   'exchangeRate',rate,'paymentMethod',CASE WHEN scenario=1 THEN 'cash' ELSE 'bank_transfer' END,'businessDate',posting_date,'requestId',gen_random_uuid(),
   'lines',jsonb_build_array(jsonb_build_object('amount',original_amount,'remark','公共入口回滚验证，不连接银行')));
  receipt:=public.fms_save_receipt_secure(payload);
  IF public.fms_save_receipt_secure(payload)<>receipt THEN RAISE EXCEPTION 'Public supplier save replay duplicated document';END IF;
  PERFORM public.fms_save_receipt_secure((payload-'requestId')||jsonb_build_object('id',receipt,'remark','原供应商收款草稿编辑'));
  SELECT receipt_no INTO document_no FROM public.fms_receipt_document WHERE id=receipt;
  listing:=public.fms_receivable_workspace_secure('receipt',jsonb_build_object('id',receipt));row_value:=listing->'records'->0;
  IF(listing->>'total')::integer<>1 OR row_value->>'partyType'<>'supplier' OR row_value->>'supplierName' IS NULL OR row_value->>'customer_id' IS NOT NULL
   OR(row_value->>'account_set_id')::uuid<>book OR(row_value->>'availableAmount')::numeric<>0 OR jsonb_array_length(row_value->'lines')<>1 THEN RAISE EXCEPTION 'Unified receipt workspace dropped supplier or fabricated customer';END IF;
  listing:=public.fms_receivable_workspace_secure('receipt',jsonb_build_object('id',receipt,'keyword',(SELECT supplier_name FROM public.mdm_supplier WHERE id=supplier),'supplierId',supplier,'partyType','supplier'));
  IF(listing->>'total')::integer<>1 OR jsonb_array_length(listing->'records')<>1 THEN RAISE EXCEPTION 'Supplier identity search/count and row projection disagree';END IF;
  listing:=public.fms_receivable_workspace_secure('receipt',jsonb_build_object('id',receipt,'partyType','customer'));
  IF(listing->>'total')::integer<>0 OR jsonb_array_length(listing->'records')<>0 THEN RAISE EXCEPTION 'Customer-only picker includes supplier refund receipts';END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.fms_ar_options_secure('supplier_receipt_fund',tenant,'')) option WHERE(option->>'id')::uuid=fund AND(option->>'account_set_id')::uuid=book)
   OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.fms_ar_options_secure('supplier_receipt_purpose',tenant,'')) option WHERE(option->>'id')::uuid=purpose) THEN RAISE EXCEPTION 'Supplier options omitted source book or native refund purpose';END IF;
  blocked:=false;BEGIN PERFORM public.fms_ar_voucher_secure('receipt',receipt,false);EXCEPTION WHEN check_violation THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'Unfunded supplier receipt was voucher eligible';END IF;
  PERFORM public.fms_act_receipt_secure(receipt,'submit');PERFORM public.fms_act_receipt_secure(receipt,'approve');PERFORM public.fms_act_receipt_secure(receipt,'confirm');
  SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
  SELECT id INTO execution FROM public.fms_receipt_fund_execution WHERE receipt_id=receipt AND status='posted';
  SELECT * INTO event FROM public.fms_posting_event WHERE source_type='system' AND event_code='ap_supplier_refund_received' AND source_id=execution;
  IF event.id IS NULL OR event.account_set_id<>book OR event.status<>'pending_configuration' OR(event.payload->>'gross_amount')::numeric<>round(original_amount*rate,2)
   OR(event.payload->>'original_gross_amount')::numeric<>original_amount OR(event.payload->>'exchange_rate')::numeric<>rate THEN RAISE EXCEPTION 'Supplier receipt event used default book, missing configuration was hidden, or rate was replaced';END IF;
  PERFORM public.fms_act_receipt_secure(receipt,'confirm');
  IF(SELECT count(*) FROM public.fms_posting_event WHERE source_type='system' AND event_code='ap_supplier_refund_received' AND source_id=execution)<>1
   OR(SELECT count(*) FROM public.fms_receipt_fund_execution WHERE receipt_id=receipt)<>1 THEN RAISE EXCEPTION 'Repeated confirmation duplicated funding or posting';END IF;
  listing:=public.fms_receivable_workspace_secure('receipt',jsonb_build_object('id',receipt));
  IF(listing->'records'->0->>'availableAmount')::numeric<>original_amount OR(listing->'records'->0->>'executionId')::uuid<>execution THEN RAISE EXCEPTION 'Unified read omitted actual original-currency receipt balance';END IF;
  PERFORM public.fms_cancel_supplier_receipt_secure(receipt,'回滚验证待配置事件不能在取消后重试');
  event:=app_private.process_fms_posting_event(event.id,true);
  IF event.status<>'ignored' OR event.voucher_id IS NOT NULL THEN RAISE EXCEPTION 'Forced retry resurrected cancelled supplier funding';END IF;
  old_execution:=execution;PERFORM public.fms_act_receipt_secure(receipt,'confirm');
  SELECT id INTO execution FROM public.fms_receipt_fund_execution WHERE receipt_id=receipt AND status='posted';
  IF execution=old_execution THEN RAISE EXCEPTION 'Reconfirmation reused reversed funding identity';END IF;
  INSERT INTO public.fms_subject(tenant_id,account_set_id,subject_code,subject_name,category,balance_direction,allow_foreign_currency)
  VALUES(tenant,book,'991001','供应商收款回滚借方','asset','debit',true) RETURNING id INTO debit;
  INSERT INTO public.fms_subject(tenant_id,account_set_id,subject_code,subject_name,category,balance_direction,allow_foreign_currency)
  VALUES(tenant,book,'992001','供应商收款回滚贷方','liability','credit',true) RETURNING id INTO credit;
  INSERT INTO public.fms_posting_rule(tenant_id,account_set_id,rule_code,rule_name,source_type,event_code,priority,submission_mode)
  VALUES(tenant,book,'QA_SRP_'||upper(left(gen_random_uuid()::text,8)),'供应商原账套回滚规则','system','ap_supplier_refund_received',999999,'draft') RETURNING id INTO rule_id;
  INSERT INTO public.fms_posting_rule_line(tenant_id,account_set_id,rule_id,line_no,subject_id,direction,amount_key)
  VALUES(tenant,book,rule_id,1,debit,'debit','gross_amount'),(tenant,book,rule_id,2,credit,'credit','gross_amount');
  preview:=public.fms_ar_voucher_secure('receipt',receipt,false);
  IF jsonb_array_length(preview->'lines')<>2 OR(preview->'lines'->0->>'debitAmount')::numeric<>round(original_amount*rate,2) THEN RAISE EXCEPTION 'Supplier receipt preview ignored actual original-book rule';END IF;
  generated:=public.fms_ar_voucher_secure('receipt',receipt,true);voucher:=(generated->>'voucherId')::uuid;
  IF generated->>'status'<>'generated' OR voucher IS NULL THEN RAISE EXCEPTION 'Supplier receipt posting failed: %',generated;END IF;
  repeated:=public.fms_ar_voucher_secure('receipt',receipt,true);
  IF repeated->>'voucherId' IS DISTINCT FROM voucher::text OR NOT EXISTS(SELECT 1 FROM public.fms_voucher WHERE id=voucher AND account_set_id=book AND source_id=execution AND total_debit=round(original_amount*rate,2) AND total_credit=round(original_amount*rate,2)) THEN RAISE EXCEPTION 'Receipt voucher was duplicated, unbalanced, or posted against wrong source';END IF;
  IF scenario=2 AND(SELECT count(*) FROM public.fms_voucher_line line WHERE line.voucher_id=voucher AND line.currency_id=currency AND line.original_amount=receipt_contract.original_amount AND line.exchange_rate=rate)<>2 THEN RAISE EXCEPTION 'Foreign receipt voucher lost original amount or original rate';END IF;
  blocked:=false;BEGIN PERFORM public.fms_cancel_supplier_receipt_secure(receipt,'已有凭证不可取消');EXCEPTION WHEN check_violation THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'Active receipt voucher did not block cash cancellation';END IF;
  PERFORM set_config('request.jwt.claim.sub',root_actor::text,true);
  PERFORM public.transition_fms_voucher(voucher,'void','回滚验证后取消原到账',null);
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  blocked:=false;BEGIN PERFORM public.fms_ar_voucher_secure('receipt',receipt,true);EXCEPTION WHEN check_violation THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'Voided receipt voucher was returned as generated';END IF;
  PERFORM public.fms_cancel_supplier_receipt_secure(receipt,'凭证作废后按原执行冲回');SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
  IF(SELECT sum(CASE direction WHEN 'inflow' THEN amount ELSE -amount END) FROM public.fms_fund_ledger_entry WHERE fund_account_id=fund)<>0 THEN RAISE EXCEPTION 'Public confirm/cancel left duplicate bank cash';END IF;
  receipt:=public.fms_save_receipt_secure(payload||jsonb_build_object('requestId',gen_random_uuid()));
  PERFORM public.fms_act_receipt_secure(receipt,'delete');
  IF EXISTS(SELECT 1 FROM public.fms_receipt_document WHERE id=receipt) THEN RAISE EXCEPTION 'Supplier draft delete did not use original lifecycle';END IF;
 END LOOP;
 PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',foreign_tenant)::text,true);
 receipt:=public.fms_save_receipt_secure(payload||jsonb_build_object('requestId',gen_random_uuid()));
 IF(SELECT tenant_id FROM public.fms_receipt_document WHERE id=receipt)<>tenant THEN RAISE EXCEPTION 'Ordinary forged header changed public supplier receipt tenant';END IF;
 PERFORM set_config('request.jwt.claim.sub',root_actor::text,true);
 listing:=public.fms_receivable_workspace_secure('receipt',jsonb_build_object('id',receipt));
 IF(listing->>'total')::integer<>0 THEN RAISE EXCEPTION 'Selected platform scope read foreign supplier receipt';END IF;
 PERFORM set_config('request.headers','{}',true);
 listing:=public.fms_receivable_workspace_secure('receipt',jsonb_build_object('id',receipt));
 IF(listing->>'total')::integer<>1 THEN RAISE EXCEPTION 'Platform all scope omitted supplier receipt';END IF;
 PERFORM public.fms_save_receipt_secure((payload-'requestId')||jsonb_build_object('id',receipt));
 PERFORM public.fms_act_receipt_secure(receipt,'submit');PERFORM public.fms_act_receipt_secure(receipt,'approve');PERFORM public.fms_act_receipt_secure(receipt,'confirm');
 SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
 IF NOT app_private.supplier_receipt_funding_valid(receipt) THEN RAISE EXCEPTION 'Platform all could not act on inherited source tenant';END IF;
 INSERT INTO public.sys_role(tenant_id,role_code,role_name,enabled) VALUES(tenant,restricted_code,'供应商收款隐藏金额回滚角色',true) RETURNING id INTO restricted_role;
 INSERT INTO public.sys_role_menu(tenant_id,role_id,menu_id)
 SELECT tenant,restricted_role,id FROM public.sys_menu WHERE name IN('FinanceReceipt','FinanceReceipt:View','FinanceReceipt:Confirm','FinanceReceipt:Cancel','FinanceReceipt:VoucherPreview','FinanceReceipt:VoucherGenerate');
 SELECT user_roles INTO original_roles FROM public.sys_user WHERE auth_user_id=actor;
 UPDATE public.sys_user SET user_roles=array[restricted_code] WHERE auth_user_id=actor;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 listing:=public.fms_receivable_workspace_secure('receipt',jsonb_build_object('id',receipt));row_value:=listing->'records'->0;
 IF row_value IS NULL OR row_value->'amount' IS DISTINCT FROM 'null'::jsonb OR row_value->'availableAmount' IS DISTINCT FROM 'null'::jsonb
  OR row_value->'lines'->0->'amount' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Supplier receipt projection exposed restricted monetary values';END IF;
 blocked:=false;BEGIN PERFORM public.fms_ar_voucher_secure('receipt',receipt,false);EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Supplier voucher preview bypassed monetary field restriction';END IF;
 blocked:=false;BEGIN PERFORM public.fms_cancel_supplier_receipt_secure(receipt,'隐藏金额不能操作资金');EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Supplier cash cancellation bypassed monetary field restriction';END IF;
 PERFORM set_config('request.jwt.claim.sub',root_actor::text,true);
 UPDATE public.sys_user SET user_roles=original_roles WHERE auth_user_id=actor;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 DELETE FROM public.sys_role_menu grants WHERE grants.role_id=receipt_contract.role_id AND menu_id IN(SELECT id FROM public.sys_menu WHERE name IN('FinanceReceipt:Cancel','FinanceReceipt:VoucherGenerate'));
 blocked:=false;BEGIN PERFORM public.fms_cancel_supplier_receipt_secure(receipt,'无取消权限');EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Public supplier cancellation bypassed precise managed permission';END IF;
 blocked:=false;BEGIN PERFORM public.fms_ar_voucher_secure('receipt',receipt,true);EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Public supplier voucher bypassed precise managed permission';END IF;
 IF has_function_privilege('anon','public.fms_cancel_supplier_receipt_secure(uuid,text)','execute')
  OR has_function_privilege('authenticated','app_private.post_supplier_receipt_event(uuid)','execute') THEN RAISE EXCEPTION 'Private supplier posting authority exposed to clients';END IF;
END $public_receipt$;

ROLLBACK;
