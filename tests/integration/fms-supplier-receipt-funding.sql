BEGIN;

DO $funding$
DECLARE
 actor uuid:='a9eeb9b7-e474-43e3-9cc2-c2f46c0f0ec3';tenant uuid:='111e83d3-190e-4405-84c8-440d484d13a6';role_id uuid:='40283472-f334-4cb9-84a0-2a41fcf7ab25';
 root_actor uuid;foreign_tenant uuid;fund uuid;cash_fund uuid;bank_fund uuid;book uuid;organization uuid;supplier uuid;purpose uuid;invalid_purpose uuid;button_id uuid;
 receipt uuid;first_execution uuid;latest_execution uuid;entry uuid;payload jsonb;document public.fms_receipt_document;blocked boolean;row_count integer;before_net numeric;current_net numeric;
 scenario integer;foreign_supplier uuid;customer_receipt uuid;other_book uuid;other_currency uuid;other_fund uuid;period_template public.fms_accounting_period;
BEGIN
 SELECT auth_user_id INTO root_actor FROM public.sys_user WHERE user_roles @>array['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1;
 SELECT id INTO foreign_tenant FROM public.sys_tenant WHERE id<>tenant LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',root_actor::text,true);PERFORM set_config('request.headers','{}',true);
 SELECT id INTO button_id FROM public.sys_menu WHERE name='FinanceReceipt:Cancel';
 IF button_id IS NULL THEN
  INSERT INTO public.sys_menu(name,path,component,type,app_code,parent_id,meta,sort)
  SELECT 'FinanceReceipt:Cancel','','','button','fms',id,'{"title":"取消收款","is_enable":true,"is_auth_button":true}',95 FROM public.sys_menu WHERE name='FinanceReceipt' RETURNING id INTO button_id;
 END IF;
 INSERT INTO public.sys_role_menu(tenant_id,role_id,menu_id) VALUES(tenant,role_id,button_id) ON CONFLICT DO NOTHING;
 INSERT INTO public.sys_role_menu(tenant_id,role_id,menu_id)
 SELECT tenant,role_id,id FROM public.sys_menu WHERE name IN('FinanceReceipt','FinanceReceipt:View','FinanceReceipt:Add','FinanceReceipt:Edit','FinanceReceipt:Submit','FinanceReceipt:Approve','FinanceReceipt:Confirm') ON CONFLICT DO NOTHING;
 SELECT id INTO book FROM public.fms_account_set WHERE tenant_id=tenant AND is_default AND status='active';
 SELECT account.id INTO fund FROM public.fms_fund_account account JOIN public.fms_currency currency ON currency.id=account.currency_id AND currency.tenant_id=account.tenant_id
 WHERE account.tenant_id=tenant AND account.account_set_id=book AND account.account_type='cash' AND account.status='active' AND currency.currency_code='CNY' LIMIT 1;
 cash_fund:=fund;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 INSERT INTO public.fms_fund_account(tenant_id,account_set_id,currency_id,account_code,account_name,account_type,bank_name,account_no_masked,account_no_fingerprint,opening_balance)
 SELECT tenant,book,currency_id,'QA_SR_'||upper(left(gen_random_uuid()::text,8)),'供应商收款回滚账户','bank','虚构验收银行','**** QA',md5(gen_random_uuid()::text),0 FROM public.fms_fund_account WHERE id=cash_fund RETURNING id INTO bank_fund;
 SELECT id INTO organization FROM public.mdm_organization WHERE tenant_id=tenant LIMIT 1;
 SELECT id INTO purpose FROM public.mdm_payment_purpose WHERE tenant_id=tenant AND business_type='purchase_refund' AND enabled ORDER BY code LIMIT 1;
 SELECT id INTO invalid_purpose FROM public.mdm_payment_purpose WHERE tenant_id=tenant AND business_type='purchase' AND enabled ORDER BY code LIMIT 1;
 IF fund IS NULL OR organization IS NULL OR purpose IS NULL OR invalid_purpose IS NULL THEN RAISE EXCEPTION 'Supplier receipt funding fixtures required';END IF;
 SELECT coalesce(sum(CASE direction WHEN 'inflow' THEN amount ELSE -amount END),0) INTO before_net FROM public.fms_fund_ledger_entry WHERE fund_account_id=fund;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);PERFORM set_config('request.headers','{}',true);
 FOR scenario IN 1..2 LOOP
  fund:=CASE WHEN scenario=1 THEN cash_fund ELSE bank_fund END;
  SELECT coalesce(sum(CASE direction WHEN 'inflow' THEN amount ELSE -amount END),0) INTO before_net FROM public.fms_fund_ledger_entry WHERE fund_account_id=fund;
  SELECT id INTO supplier FROM public.mdm_supplier WHERE tenant_id=tenant AND supplier_code='QA_RPT_'||scenario;
  IF supplier IS NULL THEN RAISE EXCEPTION 'Two ordinary acceptance suppliers required';END IF;
  payload:=jsonb_build_object('tenantId',tenant,'supplierId',supplier,'purposeId',purpose,'settlementOrganizationId',organization,
   'fundAccountId',fund,'currencyCode','CNY','paymentMethod',CASE WHEN scenario=1 THEN 'cash' ELSE 'bank_transfer' END,'businessDate',app_private.payable_business_date(),
   'requestId',gen_random_uuid(),'lines',jsonb_build_array(jsonb_build_object('amount',scenario*10,'remark','回滚验证，不连接实际银行')));
  receipt:=app_private.save_supplier_cash_receipt(payload);
  IF app_private.save_supplier_cash_receipt(payload)<>receipt THEN RAISE EXCEPTION 'Supplier receipt save request replay created duplicate';END IF;
  SELECT * INTO document FROM public.fms_receipt_document WHERE id=receipt;
  IF document.customer_id IS NOT NULL OR document.supplier_id<>supplier OR document.account_set_id<>book OR document.amount<>scenario*10 THEN RAISE EXCEPTION 'Supplier receipt invented a customer or used wrong source book';END IF;
  BLOCKED:=false;BEGIN PERFORM app_private.act_supplier_cash_receipt(receipt,'confirm');EXCEPTION WHEN check_violation THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'Unapproved supplier receipt confirmed';END IF;
  PERFORM app_private.act_supplier_cash_receipt(receipt,'submit');PERFORM app_private.act_supplier_cash_receipt(receipt,'approve');PERFORM app_private.act_supplier_cash_receipt(receipt,'confirm');
  SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
  IF NOT app_private.supplier_receipt_funding_valid(receipt) THEN RAISE EXCEPTION 'Confirmed supplier receipt lacks matching native funding';END IF;
  SELECT id,ledger_entry_id INTO first_execution,entry FROM public.fms_receipt_fund_execution WHERE receipt_id=receipt AND status='posted';
  PERFORM app_private.act_supplier_cash_receipt(receipt,'confirm');
  IF(SELECT count(*) FROM public.fms_receipt_fund_execution WHERE receipt_id=receipt)<>1 THEN RAISE EXCEPTION 'Duplicate confirm repeated bank receipt';END IF;
  blocked:=false;BEGIN UPDATE public.fms_fund_ledger_entry SET source_id=gen_random_uuid() WHERE id=entry;SET CONSTRAINTS ALL IMMEDIATE;EXCEPTION WHEN check_violation THEN blocked:=true;END;SET CONSTRAINTS ALL DEFERRED;
  IF NOT blocked THEN RAISE EXCEPTION 'Actual receipt funding source could be forged after confirmation';END IF;
  blocked:=false;BEGIN UPDATE public.fms_receipt_document SET supplier_id=(SELECT id FROM public.mdm_supplier WHERE tenant_id=tenant AND id<>supplier LIMIT 1) WHERE id=receipt;EXCEPTION WHEN check_violation THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'Confirmed supplier identity was mutable';END IF;
  blocked:=false;BEGIN UPDATE public.fms_receipt_line SET amount=amount+1 WHERE receipt_id=receipt;EXCEPTION WHEN check_violation THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'Confirmed receipt amount was mutable';END IF;
  blocked:=false;BEGIN DELETE FROM public.fms_receipt_fund_execution WHERE id=first_execution;EXCEPTION WHEN check_violation THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'Receipt funding audit was deletable';END IF;
  blocked:=false;BEGIN PERFORM public.fms_save_payable_reference_secure('purpose',(SELECT to_jsonb(p) FROM public.mdm_payment_purpose p WHERE id=purpose)||'{"business_type":"advance_refund"}');EXCEPTION WHEN foreign_key_violation THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'Referenced supplier receipt purpose classification was mutable';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.get_mdm_payable_master_delete_dependencies_secure('mdm_payment_purpose',array[purpose::text],null) dependency WHERE dependency.record_id=receipt::text) THEN RAISE EXCEPTION 'Receipt purpose reference not detected before deletion';END IF;
  blocked:=false;BEGIN PERFORM app_private.act_supplier_cash_receipt(receipt,'cancel','');EXCEPTION WHEN invalid_parameter_value THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'Receipt cancellation accepted an empty reason';END IF;
  PERFORM app_private.act_supplier_cash_receipt(receipt,'cancel','回滚场景取消到账');
  SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
  IF app_private.supplier_receipt_funding_valid(receipt) OR(SELECT status FROM public.fms_fund_ledger_entry WHERE id=entry)<>'reversed' THEN RAISE EXCEPTION 'Cancellation kept posted funding active';END IF;
  SELECT coalesce(sum(CASE direction WHEN 'inflow' THEN amount ELSE -amount END),0) INTO current_net FROM public.fms_fund_ledger_entry WHERE fund_account_id=fund;
  IF current_net<>before_net THEN RAISE EXCEPTION 'Supplier receipt cancellation failed to restore actual funds';END IF;
  PERFORM app_private.act_supplier_cash_receipt(receipt,'confirm');
  SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
  SELECT id INTO latest_execution FROM public.fms_receipt_fund_execution WHERE receipt_id=receipt AND status='posted';
  IF latest_execution=first_execution OR(SELECT count(*) FROM public.fms_receipt_fund_execution WHERE receipt_id=receipt)<>2 THEN RAISE EXCEPTION 'Reconfirmation reused reversed cash history';END IF;
  blocked:=false;BEGIN UPDATE public.fms_receipt_fund_execution SET amount=amount+1 WHERE id=latest_execution;EXCEPTION WHEN check_violation THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'Posted execution amount was mutable';END IF;
  PERFORM app_private.act_supplier_cash_receipt(receipt,'cancel','回滚第二次实际资金冲回');
  SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
  blocked:=false;BEGIN PERFORM app_private.save_supplier_cash_receipt((payload-'requestId')||jsonb_build_object('purposeId',invalid_purpose));EXCEPTION WHEN check_violation THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'Supplier incoming receipt accepted outgoing purchase payment purpose';END IF;
  blocked:=false;BEGIN PERFORM app_private.save_supplier_cash_receipt((payload-'requestId')||'{"customerId":"00000000-0000-4000-8000-000000000001"}');EXCEPTION WHEN invalid_parameter_value THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'Supplier receipt accepted forged customer association';END IF;
 END LOOP;
 blocked:=false;BEGIN PERFORM app_private.save_supplier_cash_receipt((payload-'requestId')||jsonb_build_object('tenantId',foreign_tenant));EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Ordinary caller created foreign supplier receipt';END IF;
 PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',foreign_tenant)::text,true);
 receipt:=app_private.save_supplier_cash_receipt(payload||jsonb_build_object('requestId',gen_random_uuid()));
 IF(SELECT tenant_id FROM public.fms_receipt_document WHERE id=receipt)<>tenant THEN RAISE EXCEPTION 'Forged ordinary header changed receipt tenant';END IF;
 PERFORM set_config('request.jwt.claim.sub',root_actor::text,true);PERFORM set_config('request.headers','{}',true);
 receipt:=app_private.save_supplier_cash_receipt(payload||jsonb_build_object('requestId',gen_random_uuid()));
 PERFORM app_private.save_supplier_cash_receipt((payload-'requestId')||jsonb_build_object('id',receipt));
 PERFORM app_private.act_supplier_cash_receipt(receipt,'submit');PERFORM app_private.act_supplier_cash_receipt(receipt,'approve');PERFORM app_private.act_supplier_cash_receipt(receipt,'confirm');
 SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
 IF NOT app_private.supplier_receipt_funding_valid(receipt) THEN RAISE EXCEPTION 'Platform-all cannot confirm inherited business-tenant receipt';END IF;
 PERFORM app_private.act_supplier_cash_receipt(receipt,'cancel','全部租户按来源原账套取消');SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
 PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',foreign_tenant)::text,true);
 blocked:=false;BEGIN PERFORM app_private.save_supplier_cash_receipt((payload-'requestId')||jsonb_build_object('id',receipt));EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Platform selected scope modified foreign existing receipt';END IF;
 PERFORM set_config('request.headers','{}',true);
 IF has_function_privilege('authenticated','app_private.save_supplier_cash_receipt(jsonb)','execute') OR has_function_privilege('anon','app_private.act_supplier_cash_receipt(uuid,text,text)','execute')
  OR has_table_privilege('authenticated','public.fms_receipt_fund_execution','insert') THEN RAISE EXCEPTION 'Private supplier receipt kernel exposed to clients';END IF;
END $funding$;

DO $book_currency$
DECLARE actor uuid:='a9eeb9b7-e474-43e3-9cc2-c2f46c0f0ec3';tenant uuid:='111e83d3-190e-4405-84c8-440d484d13a6';book uuid;currency uuid;fund uuid;supplier uuid;purpose uuid;organization uuid;
 receipt uuid;payload jsonb;blocked boolean;entry_count integer;document public.fms_receipt_document;period_start date:=date_trunc('month',app_private.payable_business_date())::date;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);PERFORM set_config('request.headers','{}',true);
 INSERT INTO public.fms_account_set(tenant_id,account_set_code,account_set_name,legal_entity_name,base_currency_code,enabled_on,status)
 VALUES(tenant,'QA_SR_BOOK_'||upper(left(gen_random_uuid()::text,8)),'供应商收款非默认回滚账套','虚构验收主体','CNY',period_start,'active') RETURNING id INTO book;
 INSERT INTO public.fms_currency(tenant_id,account_set_id,currency_code,currency_name,symbol,is_enabled,is_base) VALUES(tenant,book,'CNY','人民币','¥',true,true);
 INSERT INTO public.fms_currency(tenant_id,account_set_id,currency_code,currency_name,symbol,is_enabled,is_base) VALUES(tenant,book,'USD','美元','$',true,false) RETURNING id INTO currency;
 INSERT INTO public.fms_accounting_period(tenant_id,account_set_id,fiscal_year,period_no,start_date,end_date,status)
 VALUES(tenant,book,extract(year FROM period_start)::integer,extract(month FROM period_start)::integer,period_start,(period_start+interval '1 month'-interval '1 day')::date,'open');
 INSERT INTO public.fms_fund_account(tenant_id,account_set_id,currency_id,account_code,account_name,account_type,bank_name,account_no_masked,account_no_fingerprint,opening_balance)
 VALUES(tenant,book,currency,'QA_SR_USD_'||upper(left(gen_random_uuid()::text,8)),'供应商收款美元回滚账户','bank','虚构验收银行','**** QA',md5(gen_random_uuid()::text),0) RETURNING id INTO fund;
 SELECT id INTO supplier FROM public.mdm_supplier WHERE tenant_id=tenant AND supplier_code='QA_RPT_1';
 SELECT id INTO purpose FROM public.mdm_payment_purpose WHERE tenant_id=tenant AND code='205';
 SELECT id INTO organization FROM public.mdm_organization WHERE tenant_id=tenant LIMIT 1;
 payload:=jsonb_build_object('supplierId',supplier,'purposeId',purpose,'settlementOrganizationId',organization,'fundAccountId',fund,'paymentMethod','bank_transfer',
  'currencyCode','USD','exchangeRate',7.25,'businessDate',app_private.payable_business_date(),'lines',jsonb_build_array(jsonb_build_object('amount',12.34)));
 receipt:=app_private.save_supplier_cash_receipt(payload);PERFORM app_private.act_supplier_cash_receipt(receipt,'submit');PERFORM app_private.act_supplier_cash_receipt(receipt,'approve');
 PERFORM app_private.act_supplier_cash_receipt(receipt,'confirm');SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
 SELECT * INTO document FROM public.fms_receipt_document WHERE id=receipt;
 IF document.account_set_id<>book OR document.exchange_rate<>7.25 OR document.currency_code<>'USD' OR document.base_currency_code<>'CNY'
  OR NOT app_private.supplier_receipt_funding_valid(receipt) THEN RAISE EXCEPTION 'Supplier receipt defaulted to another book or replaced its original rate';END IF;
 PERFORM app_private.act_supplier_cash_receipt(receipt,'cancel','外币原账套冲回验证');SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
 IF(SELECT sum(CASE direction WHEN 'inflow' THEN amount ELSE -amount END) FROM public.fms_fund_ledger_entry WHERE fund_account_id=fund)<>0 THEN RAISE EXCEPTION 'Foreign receipt reversal moved the wrong account or currency';END IF;
 blocked:=false;BEGIN PERFORM app_private.save_supplier_cash_receipt(payload||'{"currencyCode":"CNY","exchangeRate":1}');EXCEPTION WHEN check_violation THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Receipt borrowed another account currency';END IF;
 receipt:=app_private.save_supplier_cash_receipt(payload);
 blocked:=false;BEGIN UPDATE public.fms_receipt_document SET status='confirmed' WHERE id=receipt;SET CONSTRAINTS ALL IMMEDIATE;EXCEPTION WHEN check_violation THEN blocked:=true;END;SET CONSTRAINTS ALL DEFERRED;
 IF NOT blocked THEN RAISE EXCEPTION 'A confirmed label substituted for real funding';END IF;
 blocked:=false;BEGIN INSERT INTO public.fms_receivable_application(tenant_id,receipt_id,event_kind,source_type,source_id,source_line_id,event_date,amount,created_by_auth_user_id)
 VALUES(tenant,receipt,'receipt','receipt',receipt,gen_random_uuid(),app_private.payable_business_date(),1,actor);EXCEPTION WHEN check_violation THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Supplier money entered customer receipt allocation';END IF;
END $book_currency$;

ROLLBACK;
