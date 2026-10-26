BEGIN;

DO $refund_rounding$
DECLARE
 tenant uuid:='111e83d3-190e-4405-84c8-440d484d13a6';actor uuid:='a9eeb9b7-e474-43e3-9cc2-c2f46c0f0ec3';old_book uuid;book uuid;currency uuid;fund uuid;supplier uuid;organization uuid;purpose uuid;scheme uuid;
 material uuid;unit_id uuid;document_type uuid;receipt uuid;receipt_line uuid;payable uuid;matched uuid;finance jsonb;result jsonb;preview jsonb;
 payable_ids uuid[]:='{}';record_ids uuid[]:='{}';position integer;today date:=app_private.payable_business_date();original_ledger_count bigint;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);PERFORM set_config('request.headers','{}',true);
 SELECT id INTO old_book FROM public.fms_account_set WHERE tenant_id=tenant AND is_default AND status='active';
 SELECT id,inventory_unit_id INTO material,unit_id FROM public.mdm_material WHERE tenant_id=tenant AND inventory_unit_id IS NOT NULL LIMIT 1;
 SELECT id INTO document_type FROM public.mdm_document_type WHERE tenant_id=tenant AND document_type_code='AP_FIN_EXPENSE';
 SELECT id INTO organization FROM public.mdm_organization WHERE tenant_id=tenant AND organization_type='company' LIMIT 1;
 SELECT id INTO purpose FROM public.mdm_payment_purpose WHERE tenant_id=tenant AND code='205';
 INSERT INTO public.mdm_supplier(tenant_id,supplier_code,supplier_name) VALUES(tenant,'QA_PRF_MICRO_'||upper(left(gen_random_uuid()::text,8)),'退款尾差回滚供应商') RETURNING id INTO supplier;
 scheme:=public.fms_save_payable_reference_secure('scheme',jsonb_build_object('tenant_id',tenant,'code','QA_PRF_MICRO_'||upper(left(gen_random_uuid()::text,8)),'name','退款尾差回滚方案',
  'rules',jsonb_build_array(jsonb_build_object('primary_field','supplier_id','secondary_field','supplier_id','operator','eq','empty_matches',false))));
 INSERT INTO public.fms_account_set(tenant_id,account_set_code,account_set_name,legal_entity_name,base_currency_code,enabled_on,status)
 VALUES(tenant,'QA_PRF_MICRO_'||upper(left(gen_random_uuid()::text,8)),'退款尾差非默认回滚账套','虚构尾差主体','CNY',today,'active') RETURNING id INTO book;
 INSERT INTO public.fms_currency(tenant_id,account_set_id,currency_code,currency_name,symbol,is_enabled,is_base) VALUES(tenant,book,'CNY','人民币','¥',true,true);
 INSERT INTO public.fms_currency(tenant_id,account_set_id,currency_code,currency_name,symbol,is_enabled,is_base) VALUES(tenant,book,'USD','美元','$',true,false) RETURNING id INTO currency;
 INSERT INTO public.fms_accounting_period(tenant_id,account_set_id,fiscal_year,period_no,start_date,end_date,status)
 VALUES(tenant,book,extract(year FROM today)::integer,extract(month FROM today)::integer,date_trunc('month',today)::date,(date_trunc('month',today)+interval '1 month'-interval '1 day')::date,'open');
 INSERT INTO public.fms_fund_account(tenant_id,account_set_id,currency_id,account_code,account_name,account_type,bank_name,account_no_masked,account_no_fingerprint,opening_balance)
 VALUES(tenant,book,currency,'QA_PRF_MICRO_'||upper(left(gen_random_uuid()::text,8)),'退款尾差回滚账户','bank','虚构验收银行','**** QA',md5(gen_random_uuid()::text),0) RETURNING id INTO fund;
 receipt:=public.fms_save_receipt_secure(jsonb_build_object('supplierId',supplier,'purposeId',purpose,'settlementOrganizationId',organization,'fundAccountId',fund,'currencyCode','USD',
  'exchangeRate',0.1,'paymentMethod','bank_transfer','businessDate',today,'lines',jsonb_build_array(jsonb_build_object('amount',0.05),jsonb_build_object('amount',0.05),jsonb_build_object('amount',0.05))));
 PERFORM public.fms_act_receipt_secure(receipt,'submit');PERFORM public.fms_act_receipt_secure(receipt,'approve');PERFORM public.fms_act_receipt_secure(receipt,'confirm');
 IF(SELECT sum(app_private.supplier_receipt_line_base_amount(id)) FROM public.fms_receipt_line WHERE receipt_id=receipt)<>0.02
  OR EXISTS(SELECT 1 FROM public.fms_receipt_line WHERE receipt_id=receipt AND app_private.supplier_receipt_line_base_amount(id)<0) THEN RAISE EXCEPTION 'Receipt line allocation lost header rounding or produced negative residual';END IF;
 UPDATE public.fms_account_set SET is_default=false WHERE id=old_book;UPDATE public.fms_account_set SET is_default=true WHERE id=book;
 FOR position IN 1..3 LOOP
  finance:=public.fms_save_purchase_payable_secure(jsonb_build_object('kind','financial','tenant_id',tenant,'supplier_id',supplier,'organization_id',organization,'document_type_id',document_type,
   'business_date',today,'currency_code','USD','exchange_rate',0.1,'input_tax_inclusive_price',false,'is_credit',true,
   'lines',jsonb_build_array(jsonb_build_object('material_id',material,'inventory_unit_id',unit_id,'quantity',1,'unit_price',0.05,'tax_rate',0))));
  payable:=(finance->>'id')::uuid;payable_ids:=array_append(payable_ids,payable);
  PERFORM public.fms_act_purchase_payable_secure(array[payable],'submit');PERFORM public.fms_act_purchase_payable_secure(array[payable],'approve');
 END LOOP;
 UPDATE public.fms_account_set SET is_default=false WHERE id=book;UPDATE public.fms_account_set SET is_default=true WHERE id=old_book;
 SELECT count(*) INTO original_ledger_count FROM public.fms_fund_ledger_entry;
 FOR position IN 1..3 LOOP
  SELECT id INTO receipt_line FROM public.fms_receipt_line WHERE receipt_id=receipt AND line_no=position*10;
  result:=public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('relation','payable_refund','payable_id',payable_ids[position],'receipt_line_id',receipt_line,'amount',0.05,'receipt_amount',0.05,'request_id',gen_random_uuid())),scheme,today,'非默认账套小额逐行核销');
  matched:=(result->>0)::uuid;record_ids:=array_append(record_ids,matched);
  IF app_private.payable_unwritten_base_amount(payable_ids[position])<>0 OR app_private.supplier_receipt_line_unwritten_base(receipt_line)<>0 THEN RAISE EXCEPTION 'Small completed refund retained base residual';END IF;
  IF position=2 THEN
   IF NOT(SELECT needs_voucher FROM public.fms_payable_writeoff_record WHERE id=matched) THEN RAISE EXCEPTION 'Rounding exchange difference lost its accounting bill';END IF;
   preview:=public.fms_payable_settlement_voucher_secure(matched,'writeoff',true);
   IF jsonb_array_length(preview->'lines')<>0 OR preview->>'message' LIKE '%默认账套%' THEN RAISE EXCEPTION 'Nondefault refund preview borrowed default book or gave default-book advice';END IF;
  END IF;
 END LOOP;
 SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
 IF app_private.supplier_receipt_available(receipt)<>0 OR(SELECT sum(receipt_base_amount) FROM public.fms_payable_writeoff_record WHERE id=ANY(record_ids))<>0.02
  OR(SELECT sum(payable_base_amount) FROM public.fms_payable_writeoff_record WHERE id=ANY(record_ids))<>0.03 THEN RAISE EXCEPTION 'Multi-line refund lost actual original-book allocation';END IF;
 IF(SELECT count(*) FROM public.fms_fund_ledger_entry)<>original_ledger_count THEN RAISE EXCEPTION 'Small refund writeoff created another cash movement';END IF;
 FOREACH matched IN ARRAY record_ids LOOP PERFORM public.fms_reverse_payable_writeoff_secure(matched,'恢复非默认账套原币及尾差');END LOOP;
 IF app_private.supplier_receipt_available(receipt)<>0.15 THEN RAISE EXCEPTION 'Small refund reversal did not restore original-currency receipt';END IF;
 PERFORM public.fms_cancel_supplier_receipt_secure(receipt,'全部反核销后冲回模拟到账');SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
 IF(SELECT sum(CASE direction WHEN 'inflow' THEN amount ELSE -amount END) FROM public.fms_fund_ledger_entry WHERE fund_account_id=fund)<>0 THEN RAISE EXCEPTION 'Small refund cancellation changed actual net cash';END IF;
END $refund_rounding$;

ROLLBACK;
