BEGIN;

DO $workspace$
DECLARE
 tenant uuid:='111e83d3-190e-4405-84c8-440d484d13a6';actor uuid:='a9eeb9b7-e474-43e3-9cc2-c2f46c0f0ec3';book uuid;currency uuid;fund uuid;supplier uuid;organization uuid;purpose uuid;scheme uuid;material uuid;unit_id uuid;document_type uuid;
 payable uuid;receipt uuid;receipt_line uuid;record_id uuid;scenario integer;today date:=app_private.payable_business_date();finance jsonb;workspace jsonb;plan jsonb;executed jsonb;query jsonb;config jsonb;payload jsonb;
 payable_currency text;receipt_currency text;payable_rate numeric;receipt_rate numeric;receipt_amount numeric;blocked boolean;before_count bigint;ledger_count bigint;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);PERFORM set_config('request.headers','{}',true);
 SELECT id INTO book FROM public.fms_account_set WHERE tenant_id=tenant AND is_default AND status='active';
 SELECT id INTO organization FROM public.mdm_organization WHERE tenant_id=tenant AND organization_type='company' LIMIT 1;
 SELECT id,inventory_unit_id INTO material,unit_id FROM public.mdm_material WHERE tenant_id=tenant AND inventory_unit_id IS NOT NULL LIMIT 1;
 SELECT id INTO document_type FROM public.mdm_document_type WHERE tenant_id=tenant AND document_type_code='AP_FIN_EXPENSE';
 SELECT id INTO purpose FROM public.mdm_payment_purpose WHERE tenant_id=tenant AND code='205';
 config:=public.fms_payable_scheme_configuration_secure();
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(config->'relations') option WHERE option->>'value'='payable_refund') THEN RAISE EXCEPTION 'Old client received unsupported fifth configuration relation';END IF;
 config:=public.fms_payable_scheme_configuration_secure(2);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(config->'relations') option WHERE option->>'value'='payable_refund') THEN RAISE EXCEPTION 'New ordinary client cannot configure fifth relation';END IF;
 FOR scenario IN 1..3 LOOP
  payable_currency:=CASE WHEN scenario=1 THEN 'CNY' ELSE 'USD' END;receipt_currency:=CASE WHEN scenario=3 THEN 'EUR' ELSE payable_currency END;
  payable_rate:=CASE WHEN scenario=1 THEN 1 WHEN scenario=2 THEN 7.2 ELSE 7 END;receipt_rate:=CASE WHEN scenario=1 THEN 1 WHEN scenario=2 THEN 7.1 ELSE 8 END;
  receipt_amount:=CASE WHEN scenario=3 THEN 90 ELSE 100 END;
  INSERT INTO public.mdm_supplier(tenant_id,supplier_code,supplier_name) VALUES(tenant,'QA_PRFW_'||upper(left(gen_random_uuid()::text,8)),'退款工作台回滚供应商'||scenario) RETURNING id INTO supplier;
  INSERT INTO public.fms_currency(tenant_id,account_set_id,currency_code,currency_name,symbol,is_enabled,is_base)
  VALUES(tenant,book,payable_currency,payable_currency,'$',true,payable_currency='CNY') ON CONFLICT(account_set_id,currency_code) DO UPDATE SET is_enabled=true;
  INSERT INTO public.fms_currency(tenant_id,account_set_id,currency_code,currency_name,symbol,is_enabled,is_base)
  VALUES(tenant,book,receipt_currency,receipt_currency,'$',true,receipt_currency='CNY') ON CONFLICT(account_set_id,currency_code) DO UPDATE SET is_enabled=true RETURNING id INTO currency;
  INSERT INTO public.fms_fund_account(tenant_id,account_set_id,currency_id,account_code,account_name,account_type,bank_name,account_no_masked,account_no_fingerprint,opening_balance)
  VALUES(tenant,book,currency,'QA_PRFW_'||upper(left(gen_random_uuid()::text,8)),'退款工作台回滚账户','bank','虚构验收银行','**** QA',md5(gen_random_uuid()::text),0) RETURNING id INTO fund;
  scheme:=public.fms_save_payable_reference_secure('scheme',jsonb_build_object('configuration_version',2,'tenant_id',tenant,'code','QA_PRFW_'||upper(left(gen_random_uuid()::text,8)),'name','退款工作台自动回滚方案','automatic',true,
   'rules',jsonb_build_array(jsonb_build_object('primary_field','supplier_id','secondary_field','supplier_id','operator','eq','empty_matches',false)),
   'relation_rules',jsonb_build_array(jsonb_build_object('relation','payable_refund','description','退款收款保持原币与原汇率','rules',jsonb_build_array(jsonb_build_object('primary_field','supplier_id','secondary_field','supplier_id','operator','eq','empty_matches',false))))));
  finance:=public.fms_save_purchase_payable_secure(jsonb_build_object('kind','financial','tenant_id',tenant,'supplier_id',supplier,'organization_id',organization,'document_type_id',document_type,'business_date',today,
   'is_credit',true,'currency_code',payable_currency,'exchange_rate',payable_rate,'input_tax_inclusive_price',false,'lines',jsonb_build_array(jsonb_build_object('material_id',material,'inventory_unit_id',unit_id,'quantity',1,'unit_price',100,'tax_rate',0))));
  payable:=(finance->>'id')::uuid;PERFORM public.fms_act_purchase_payable_secure(array[payable],'submit');PERFORM public.fms_act_purchase_payable_secure(array[payable],'approve');
  receipt:=public.fms_save_receipt_secure(jsonb_build_object('supplierId',supplier,'purposeId',purpose,'settlementOrganizationId',organization,'fundAccountId',fund,'currencyCode',receipt_currency,'exchangeRate',receipt_rate,
   'paymentMethod','bank_transfer','businessDate',today,'lines',jsonb_build_array(jsonb_build_object('amount',receipt_amount))));
  PERFORM public.fms_act_receipt_secure(receipt,'submit');PERFORM public.fms_act_receipt_secure(receipt,'approve');PERFORM public.fms_act_receipt_secure(receipt,'confirm');
  SELECT id INTO receipt_line FROM public.fms_receipt_line WHERE receipt_id=receipt;
  SELECT count(*) INTO ledger_count FROM public.fms_fund_ledger_entry;
  query:=jsonb_build_object('relation','payable_refund','client_version',2,'document_ids',jsonb_build_array(payable,receipt),'as_of_date',today);
  workspace:=public.fms_payable_writeoff_workspace_secure(query);
  IF jsonb_array_length(workspace->'primary')<>1 OR jsonb_array_length(workspace->'secondary')<>1 OR(workspace->'primary'->0->>'amount')::numeric<>-100
   OR(workspace->'secondary'->0->>'id')::uuid<>receipt_line OR(workspace->'secondary'->0->>'document_id')::uuid<>receipt THEN RAISE EXCEPTION 'Fifth workspace confused credit payable, receipt header or receipt line identity';END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(workspace->'relations') option WHERE option->>'value'='payable_refund') THEN RAISE EXCEPTION 'New workspace hid supported fifth relation';END IF;
  workspace:=public.fms_payable_writeoff_workspace_secure(query-'client_version');
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(workspace->'relations') option WHERE option->>'value'='payable_refund') THEN RAISE EXCEPTION 'Legacy workspace discovered unsupported fifth tab';END IF;
  workspace:=public.fms_payable_writeoff_workspace_secure(jsonb_build_object('relation','payable_refund','client_version',2,'receipt_id',receipt));
  IF jsonb_array_length(workspace->'secondary')<>1 OR(workspace->'secondary'->0->>'id')::uuid<>receipt_line THEN RAISE EXCEPTION 'Receipt drilldown did not retain its exact source';END IF;
  IF scenario=3 THEN
   plan:=public.fms_auto_payable_writeoff_secure(scheme,today,query||'{"cross_currency_mode":"same_currency"}',false);
   IF(plan->>'record_count')::integer<>0 THEN RAISE EXCEPTION 'Same-currency automatic mode consumed foreign receipt';END IF;
   plan:=public.fms_auto_payable_writeoff_secure(scheme,today,query||'{"cross_currency_mode":"book_equivalent"}',false);
   IF(plan->'items'->0->>'receipt_amount')::numeric<>87.5 THEN RAISE EXCEPTION 'Book-equivalent refund allocation used wrong historical rate';END IF;
   query:=query||'{"cross_currency_mode":"full_pair"}';
  END IF;
  plan:=public.fms_auto_payable_writeoff_secure(scheme,today,query,false);
  IF(plan->>'record_count')::integer<>1 OR(plan->'items'->0->>'amount')::numeric<>100 OR(plan->'items'->0->>'receipt_amount')::numeric<>receipt_amount THEN RAISE EXCEPTION 'Automatic fifth plan lost original-currency allocations';END IF;
  IF scenario=1 THEN
   PERFORM public.fms_act_purchase_payable_secure(array[payable],'freeze','验证陈旧预览',1);
   SELECT count(*) INTO before_count FROM public.fms_payable_writeoff_record;
   blocked:=false;BEGIN PERFORM public.fms_auto_payable_writeoff_secure(scheme,today,query,true,plan->>'plan_token');EXCEPTION WHEN serialization_failure THEN blocked:=true;END;
   IF NOT blocked OR(SELECT count(*) FROM public.fms_payable_writeoff_record)<>before_count THEN RAISE EXCEPTION 'Stale fifth plan executed after source freeze';END IF;
   PERFORM public.fms_act_purchase_payable_secure(array[payable],'unfreeze','恢复自动核销来源');
   plan:=public.fms_auto_payable_writeoff_secure(scheme,today,query,false);
  END IF;
  executed:=public.fms_auto_payable_writeoff_secure(scheme,today,query,true,plan->>'plan_token');record_id:=(executed->'record_ids'->>0)::uuid;
  SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
  IF record_id IS NULL OR NOT app_private.payable_receipt_refund_valid(record_id) OR app_private.supplier_receipt_available(receipt)<>0
   OR(app_private.purchase_payable_json(payable)->>'face_unpaid_amount')::numeric<>0 THEN RAISE EXCEPTION 'Automatic fifth execution did not consume both balances';END IF;
  workspace:=public.fms_payable_writeoff_workspace_secure(query);
  IF jsonb_array_length(workspace->'history')<>1 OR(workspace->'history'->0->>'receipt_id')::uuid<>receipt THEN RAISE EXCEPTION 'Fifth workspace did not retain linked accounting history';END IF;
  blocked:=false;BEGIN PERFORM public.fms_auto_payable_writeoff_secure(scheme,today,query,true,plan->>'plan_token');EXCEPTION WHEN serialization_failure THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'Successful automatic plan was executed twice';END IF;
  IF(SELECT count(*) FROM public.fms_fund_ledger_entry)<>ledger_count THEN RAISE EXCEPTION 'Automatic fifth writeoff posted another actual receipt';END IF;
  PERFORM public.fms_reverse_payable_writeoff_secure(record_id,'自动方案回滚核销');PERFORM public.fms_cancel_supplier_receipt_secure(receipt,'模拟到账恢复原净额');
 END LOOP;
END $workspace$;

ROLLBACK;
