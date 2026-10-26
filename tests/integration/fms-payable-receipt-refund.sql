BEGIN;

DO $refund_writeoff$
<<refund_case>>
DECLARE
 tenant uuid:='111e83d3-190e-4405-84c8-440d484d13a6';actor uuid:='a9eeb9b7-e474-43e3-9cc2-c2f46c0f0ec3';root_actor uuid;
 book uuid;other_book uuid;currency uuid;fund uuid;cash_fund uuid;organization uuid;supplier uuid;other_supplier uuid;material uuid;unit_id uuid;expense_type uuid;other_type uuid;purpose uuid;scheme uuid;cross_scheme uuid;
 payable uuid;blue uuid;receipt uuid;receipt_line uuid;execution uuid;matched uuid;second_match uuid;red_blue_match uuid;rule_id uuid;voucher uuid;foreign_payable uuid;
 payload jsonb;finance jsonb;command jsonb;result jsonb;repeated jsonb;projection jsonb;preview jsonb;receipt_rows jsonb;event public.fms_posting_event;
 scenario integer;blocked boolean;today date:=app_private.payable_business_date();payable_currency text;receipt_currency text;payable_rate numeric;receipt_rate numeric;receipt_face numeric;first_amount numeric;
 debit_subject uuid;credit_subject uuid;exchange_subject uuid;original_ledger_count bigint;original_record_count bigint;role_id uuid;role_code text:='QA_PRF_MASK_'||upper(left(gen_random_uuid()::text,8));original_roles text[];
BEGIN
 SELECT auth_user_id INTO root_actor FROM public.sys_user WHERE user_roles @>array['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1;
 SELECT id INTO book FROM public.fms_account_set WHERE tenant_id=tenant AND is_default AND status='active' AND base_currency_code='CNY';
 SELECT id INTO organization FROM public.mdm_organization WHERE tenant_id=tenant AND organization_type='company' LIMIT 1;
 SELECT id,inventory_unit_id INTO material,unit_id FROM public.mdm_material WHERE tenant_id=tenant AND inventory_unit_id IS NOT NULL LIMIT 1;
 SELECT id INTO expense_type FROM public.mdm_document_type WHERE tenant_id=tenant AND document_type_code='AP_FIN_EXPENSE';
 SELECT id INTO other_type FROM public.mdm_document_type WHERE tenant_id=tenant AND document_type_code='AP_FIN_OTHER';
 SELECT id INTO purpose FROM public.mdm_payment_purpose WHERE tenant_id=tenant AND code='205';
 SELECT account.id INTO cash_fund FROM public.fms_fund_account account JOIN public.fms_currency currency_row ON currency_row.id=account.currency_id AND currency_row.tenant_id=account.tenant_id
 WHERE account.tenant_id=tenant AND account.account_set_id=book AND account.account_type='cash' AND account.status='active' AND currency_row.currency_code='CNY' LIMIT 1;
 IF book IS NULL OR organization IS NULL OR material IS NULL OR expense_type IS NULL OR other_type IS NULL OR purpose IS NULL OR cash_fund IS NULL THEN RAISE EXCEPTION 'Independent payable refund fixtures required';END IF;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);PERFORM set_config('request.headers','{}',true);
 INSERT INTO public.mdm_supplier(tenant_id,supplier_code,supplier_name) VALUES(tenant,'QA_PRF_'||upper(left(gen_random_uuid()::text,8)),'应付退款核销回滚供应商') RETURNING id INTO supplier;
 INSERT INTO public.mdm_supplier(tenant_id,supplier_code,supplier_name) VALUES(tenant,'QA_PRF_'||upper(left(gen_random_uuid()::text,8)),'应付退款核销另一回滚供应商') RETURNING id INTO other_supplier;
 scheme:=public.fms_save_payable_reference_secure('scheme',jsonb_build_object('tenant_id',tenant,'code','QA_PRF_'||upper(left(gen_random_uuid()::text,8)),'name','应付退款核销回滚方案',
  'rules',jsonb_build_array(jsonb_build_object('primary_field','supplier_id','secondary_field','supplier_id','operator','eq','empty_matches',false))));
 INSERT INTO public.fms_subject(tenant_id,account_set_id,subject_code,subject_name,category,balance_direction,allow_foreign_currency)
 VALUES(tenant,book,'991'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS'),'退款核销应付回滚科目','liability','credit',true) RETURNING id INTO credit_subject;
 INSERT INTO public.fms_subject(tenant_id,account_set_id,subject_code,subject_name,category,balance_direction,allow_foreign_currency)
 VALUES(tenant,book,'992'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS'),'退款核销收款回滚科目','asset','debit',true) RETURNING id INTO debit_subject;
 INSERT INTO public.fms_subject(tenant_id,account_set_id,subject_code,subject_name,category,balance_direction)
 VALUES(tenant,book,'993'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS'),'退款核销汇兑损益回滚科目','expense','debit') RETURNING id INTO exchange_subject;
 INSERT INTO public.fms_posting_rule(tenant_id,account_set_id,rule_code,rule_name,source_type,event_code,priority,submission_mode)
 VALUES(tenant,book,'QA_PRF_'||upper(left(gen_random_uuid()::text,8)),'应付退款核销回滚规则','system','ap_payable_refund_writeoff_approved',999999,'draft') RETURNING id INTO rule_id;
 INSERT INTO public.fms_posting_rule_line(tenant_id,account_set_id,rule_id,line_no,subject_id,direction,amount_key)
 VALUES(tenant,book,rule_id,10,credit_subject,'credit','payable_base_amount'),(tenant,book,rule_id,20,debit_subject,'debit','receipt_base_amount'),(tenant,book,rule_id,30,exchange_subject,'debit','exchange_gain_loss');
 FOR scenario IN 1..4 LOOP
  second_match:=null;
  payable_currency:=CASE WHEN scenario>=3 THEN 'USD' ELSE 'CNY' END;receipt_currency:=CASE WHEN scenario=4 THEN 'EUR' ELSE payable_currency END;
  payable_rate:=CASE WHEN scenario=3 THEN 7.2 WHEN scenario=4 THEN 7 ELSE 1 END;receipt_rate:=CASE WHEN scenario=3 THEN 7.1 WHEN scenario=4 THEN 8 ELSE 1 END;
  receipt_face:=CASE WHEN scenario=4 THEN 90 ELSE 100 END;first_amount:=CASE WHEN scenario IN(1,3) THEN 33.33 ELSE 100 END;
  IF scenario>=3 THEN
   INSERT INTO public.fms_currency(tenant_id,account_set_id,currency_code,currency_name,symbol,is_enabled)
   VALUES(tenant,book,payable_currency,payable_currency,'$',true) ON CONFLICT(account_set_id,currency_code) DO UPDATE SET is_enabled=true;
   INSERT INTO public.fms_currency(tenant_id,account_set_id,currency_code,currency_name,symbol,is_enabled)
   VALUES(tenant,book,receipt_currency,receipt_currency,'$',true) ON CONFLICT(account_set_id,currency_code) DO UPDATE SET is_enabled=true RETURNING id INTO currency;
   INSERT INTO public.fms_fund_account(tenant_id,account_set_id,currency_id,account_code,account_name,account_type,bank_name,account_no_masked,account_no_fingerprint,opening_balance)
   VALUES(tenant,book,currency,'QA_PRF_'||upper(left(gen_random_uuid()::text,8)),'退款核销原币回滚账户','bank','虚构验收银行','**** QA',md5(gen_random_uuid()::text),0) RETURNING id INTO fund;
  ELSE fund:=cash_fund;END IF;
  payload:=jsonb_build_object('kind','financial','tenant_id',tenant,'supplier_id',supplier,'organization_id',organization,'document_type_id',CASE WHEN scenario=2 THEN other_type ELSE expense_type END,
   'business_date',today,'currency_code',payable_currency,'exchange_rate',payable_rate,'input_tax_inclusive_price',false,'is_credit',true,
   'lines',jsonb_build_array(jsonb_build_object('material_id',material,'inventory_unit_id',unit_id,'quantity',1,'unit_price',100,'tax_rate',0)));
  finance:=public.fms_save_purchase_payable_secure(payload);payable:=(finance->>'id')::uuid;
  PERFORM public.fms_act_purchase_payable_secure(array[payable],'submit');PERFORM public.fms_act_purchase_payable_secure(array[payable],'approve');
  receipt:=public.fms_save_receipt_secure(jsonb_build_object('supplierId',supplier,'purposeId',purpose,'settlementOrganizationId',organization,'fundAccountId',fund,'currencyCode',receipt_currency,
   'exchangeRate',receipt_rate,'paymentMethod',CASE WHEN scenario>=3 THEN 'bank_transfer' ELSE 'cash' END,'businessDate',today,'lines',jsonb_build_array(jsonb_build_object('amount',receipt_face))));
  PERFORM public.fms_act_receipt_secure(receipt,'submit');PERFORM public.fms_act_receipt_secure(receipt,'approve');PERFORM public.fms_act_receipt_secure(receipt,'confirm');
  SELECT id INTO receipt_line FROM public.fms_receipt_line WHERE receipt_id=receipt;SELECT id INTO execution FROM public.fms_receipt_fund_execution WHERE receipt_id=receipt AND status='posted';
  SELECT count(*) INTO original_ledger_count FROM public.fms_fund_ledger_entry;
  command:=jsonb_build_array(jsonb_build_object('relation','payable_refund','payable_id',payable,'receipt_line_id',receipt_line,'amount',first_amount,'receipt_amount',CASE WHEN scenario=4 THEN receipt_face ELSE first_amount END,'request_id',gen_random_uuid()));
  result:=public.fms_payable_writeoff_secure(command,scheme,today,'原币及原记账汇率核销');matched:=(result->>0)::uuid;
  SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
  IF NOT app_private.payable_receipt_refund_valid(matched) THEN RAISE EXCEPTION 'Payable refund writeoff lacks actual source or original book';END IF;
  IF(SELECT count(*) FROM public.fms_fund_ledger_entry)<>original_ledger_count THEN RAISE EXCEPTION 'Writeoff posted a second actual cash movement';END IF;
  projection:=public.fms_get_payable_writeoff_record_secure(matched);
  SET LOCAL ROLE authenticated;
  IF NOT EXISTS(SELECT 1 FROM public.fms_payable_writeoff_record WHERE id=matched AND receipt_amount=(command->0->>'receipt_amount')::numeric) THEN RAISE EXCEPTION 'Ordinary authorized RLS read lost refund source';END IF;
  RESET ROLE;
  IF projection->>'payment_no' IS DISTINCT FROM(SELECT receipt_no FROM public.fms_receipt_document WHERE id=receipt)
   OR(projection->>'receipt_execution_id')::uuid<>execution OR(projection->>'amount')::numeric<>first_amount OR(projection->>'account_set_id')::uuid<>book THEN RAISE EXCEPTION 'Recognizable writeoff projection lost original receipt execution';END IF;
  finance:=app_private.purchase_payable_json(payable);
  IF(finance->>'face_unpaid_amount')::numeric<>100-first_amount OR(finance->>'unpaid_amount')::numeric<>-(100-first_amount) THEN RAISE EXCEPTION 'Credit payable balance was increased or double-signed';END IF;
  receipt_rows:=public.fms_receivable_workspace_secure('receipt',jsonb_build_object('id',receipt));
  IF(receipt_rows->'records'->0->>'availableAmount')::numeric<>receipt_face-(command->0->>'receipt_amount')::numeric THEN RAISE EXCEPTION 'Original receipt library did not consume writeoff balance';END IF;
  repeated:=public.fms_payable_writeoff_secure(command,scheme,today,'原币及原记账汇率核销');
  IF repeated<>result THEN RAISE EXCEPTION 'Retried partial writeoff request created another record';END IF;
  IF scenario=3 THEN
   repeated:=public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('relation','payable_refund','payable_id',payable,'receipt_line_id',receipt_line,'amount',66.67,'receipt_amount',66.67,'request_id',gen_random_uuid())),scheme,today,'最后一笔吸收原账尾差');second_match:=(repeated->>0)::uuid;
   IF app_private.payable_unwritten_base_amount(payable)<>0 OR app_private.supplier_receipt_line_unwritten_base(receipt_line)<>0
    OR(app_private.purchase_payable_json(payable)->>'face_unpaid_amount')::numeric<>0 OR app_private.supplier_receipt_line_available(receipt_line)<>0 THEN RAISE EXCEPTION 'Complete foreign refund left original or base-currency rounding residue';END IF;
   IF(SELECT sum(payable_base_amount-receipt_base_amount) FROM public.fms_payable_writeoff_record WHERE id IN(matched,second_match))<>10 THEN RAISE EXCEPTION 'Partial refunds did not preserve total historical exchange loss';END IF;
   IF public.fms_payable_writeoff_secure(command,scheme,today,'原币及原记账汇率核销')<>result THEN RAISE EXCEPTION 'Retried command consumed an already fully written source';END IF;
  END IF;
  blocked:=false;BEGIN PERFORM public.fms_payable_writeoff_secure(jsonb_set(command,'{0,amount}','1'),scheme,today,'原币及原记账汇率核销');EXCEPTION WHEN invalid_parameter_value THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'Reused command identity accepted different monetary content';END IF;
  blocked:=false;BEGIN PERFORM public.fms_cancel_supplier_receipt_secure(receipt,'活动应付核销不得取消');EXCEPTION WHEN check_violation THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'Active payable writeoff did not block actual receipt cancellation';END IF;
  blocked:=false;BEGIN UPDATE public.fms_payable_writeoff_record SET receipt_amount=receipt_amount+1 WHERE id=matched;EXCEPTION WHEN check_violation THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'Historical refund consumption could be rewritten';END IF;
  blocked:=false;BEGIN DELETE FROM public.fms_payable_writeoff_record WHERE id=matched;EXCEPTION WHEN check_violation THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'Historical refund writeoff was deleted';END IF;
  IF scenario=1 THEN
   IF(projection->>'needs_voucher')::boolean OR projection->>'document_no' IS NOT NULL THEN RAISE EXCEPTION 'Symmetric same-party refund generated unnecessary accounting bill';END IF;
   finance:=public.fms_save_purchase_payable_secure(payload||jsonb_build_object('supplier_id',other_supplier));foreign_payable:=(finance->>'id')::uuid;
   PERFORM public.fms_act_purchase_payable_secure(array[foreign_payable],'submit');PERFORM public.fms_act_purchase_payable_secure(array[foreign_payable],'approve');
   blocked:=false;BEGIN PERFORM public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('relation','payable_refund','payable_id',foreign_payable,'receipt_line_id',receipt_line,'amount',1,'receipt_amount',1,'request_id',gen_random_uuid())),scheme,today,'跨往来必须明确启用');EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
   IF NOT blocked THEN RAISE EXCEPTION 'Refund silently enabled cross-counterparty matching';END IF;
   blocked:=false;BEGIN PERFORM public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('relation','payable_refund','payable_id',foreign_payable,'receipt_line_id',receipt_line,'amount',1,'receipt_amount',1,'allow_cross_party',true,'request_id',gen_random_uuid())),scheme,today,'明确启用仍须符合方案');EXCEPTION WHEN check_violation THEN blocked:=true;END;
   IF NOT blocked THEN RAISE EXCEPTION 'Explicit cross-party flag bypassed the configured matching rules';END IF;
   cross_scheme:=public.fms_save_payable_reference_secure('scheme',jsonb_build_object('tenant_id',tenant,'code','QA_PRF_CROSS_'||upper(left(gen_random_uuid()::text,8)),'name','跨往来退款核销回滚方案',
    'rules',jsonb_build_array(jsonb_build_object('primary_field','currency_code','secondary_field','currency_code','operator','eq','empty_matches',false))));
   repeated:=public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('relation','payable_refund','payable_id',foreign_payable,'receipt_line_id',receipt_line,'amount',1,'receipt_amount',1,'allow_cross_party',true,'request_id',gen_random_uuid())),cross_scheme,today,'明确启用且符合所选方案');second_match:=(repeated->>0)::uuid;
   IF NOT(SELECT needs_voucher AND document_no IS NOT NULL FROM public.fms_payable_writeoff_record WHERE id=second_match) THEN RAISE EXCEPTION 'Cross-party refund lost required accounting bill';END IF;
   PERFORM public.fms_reverse_payable_writeoff_secure(second_match,'恢复跨往来原币及本位币余额');second_match:=null;
   SELECT count(*) INTO original_record_count FROM public.fms_payable_writeoff_record;
   blocked:=false;BEGIN
    PERFORM public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('relation','payable_refund','payable_id',payable,'receipt_line_id',receipt_line,'amount',1,'receipt_amount',1,'request_id',gen_random_uuid()),
     jsonb_build_object('relation','payable_refund','payable_id',payable,'receipt_line_id',receipt_line,'amount',1000,'receipt_amount',1000,'request_id',gen_random_uuid())),scheme,today,'整批必须原子回滚');
   EXCEPTION WHEN check_violation THEN blocked:=true;END;
   IF NOT blocked OR(SELECT count(*) FROM public.fms_payable_writeoff_record)<>original_record_count THEN RAISE EXCEPTION 'Failed batch retained partial refund consumption';END IF;
   SELECT id INTO foreign_payable FROM public.fms_purchase_payable_document WHERE tenant_id<>tenant LIMIT 1;
   IF foreign_payable IS NULL THEN RAISE EXCEPTION 'Foreign payable security fixture required';END IF;
   blocked:=false;BEGIN PERFORM public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('relation','payable_refund','payable_id',foreign_payable,'receipt_line_id',receipt_line,'amount',1,'receipt_amount',1,'request_id',gen_random_uuid())),scheme,today,'不能跨租户');EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
   IF NOT blocked THEN RAISE EXCEPTION 'Refund writeoff accepted foreign payable';END IF;
   PERFORM set_config('request.jwt.claim.sub',root_actor::text,true);
   INSERT INTO public.sys_role(tenant_id,role_code,role_name,enabled) VALUES(tenant,role_code,'退款核销隐藏金额回滚角色',true) RETURNING id INTO role_id;
   INSERT INTO public.sys_role_menu(tenant_id,role_id,menu_id)
   SELECT tenant,refund_case.role_id,id FROM public.sys_menu WHERE name IN('FinancePayableWriteoff','FinancePayableWriteoff:View','FinancePayableWriteoff:Writeoff','FinancePayableWriteoff:Reverse','FinancePayableWriteoff:Voucher','FinancePurchasePayable','FinancePurchasePayable:View','FinanceReceipt','FinanceReceipt:View');
   SELECT user_roles INTO original_roles FROM public.sys_user WHERE auth_user_id=actor;
   UPDATE public.sys_user SET user_roles=array[role_code] WHERE auth_user_id=actor;
   PERFORM set_config('request.jwt.claim.sub',actor::text,true);
   projection:=public.fms_get_payable_writeoff_record_secure(matched);
   IF projection->'amount' IS DISTINCT FROM 'null'::jsonb OR projection->'receipt_amount' IS DISTINCT FROM 'null'::jsonb OR projection->'exchange_difference' IS DISTINCT FROM 'null'::jsonb
    OR projection->>'record_no' IS NULL THEN RAISE EXCEPTION 'Refund history leaked restricted money or lost recognizable identity';END IF;
   SET LOCAL ROLE authenticated;
   IF EXISTS(SELECT 1 FROM public.fms_payable_writeoff_record WHERE id=matched) THEN RAISE EXCEPTION 'Direct table read bypassed refund monetary field scope';END IF;
   RESET ROLE;
   blocked:=false;BEGIN PERFORM public.fms_payable_writeoff_secure(command,scheme,today,'原币及原记账汇率核销');EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
   IF NOT blocked THEN RAISE EXCEPTION 'Blind monetary role repeated writeoff';END IF;
   blocked:=false;BEGIN PERFORM public.fms_reverse_payable_writeoff_secure(matched,'隐藏金额不能操作');EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
   IF NOT blocked THEN RAISE EXCEPTION 'Blind monetary role reversed writeoff';END IF;
   PERFORM set_config('request.jwt.claim.sub',root_actor::text,true);
   UPDATE public.sys_user SET user_roles=original_roles WHERE auth_user_id=actor;
   PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',(SELECT tenant_id FROM public.fms_purchase_payable_document WHERE id=foreign_payable))::text,true);
   blocked:=false;BEGIN PERFORM public.fms_get_payable_writeoff_record_secure(matched);EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
   IF NOT blocked THEN RAISE EXCEPTION 'Platform selected scope read foreign refund history';END IF;
   blocked:=false;BEGIN PERFORM public.fms_reverse_payable_writeoff_secure(matched,'选定其他租户不能反核销');EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
   IF NOT blocked THEN RAISE EXCEPTION 'Platform selected scope mutated foreign refund history';END IF;
   SET LOCAL ROLE authenticated;
   IF EXISTS(SELECT 1 FROM public.fms_payable_writeoff_record WHERE id=matched) THEN RAISE EXCEPTION 'Platform selected RLS read ignored its tenant';END IF;
   RESET ROLE;
   PERFORM set_config('request.headers','{}',true);
   IF public.fms_get_payable_writeoff_record_secure(matched)->>'id'<>matched::text THEN RAISE EXCEPTION 'Platform all omitted authorized refund history';END IF;
   SET LOCAL ROLE authenticated;
   IF NOT EXISTS(SELECT 1 FROM public.fms_payable_writeoff_record WHERE id=matched) THEN RAISE EXCEPTION 'Platform all RLS read lost authorized refund history';END IF;
   RESET ROLE;
   PERFORM set_config('request.jwt.claim.sub',actor::text,true);
   PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',(SELECT tenant_id FROM public.fms_purchase_payable_document WHERE id=foreign_payable))::text,true);
   IF public.fms_get_payable_writeoff_record_secure(matched)->>'id'<>matched::text THEN RAISE EXCEPTION 'Forged ordinary scope changed own refund history';END IF;
   PERFORM set_config('request.headers','{}',true);
   PERFORM public.fms_act_purchase_payable_secure(array[payable],'freeze','冻结未核销部分',1);
   IF public.fms_payable_writeoff_secure(command,scheme,today,'原币及原记账汇率核销')<>result THEN RAISE EXCEPTION 'Successful command replay was not idempotent after source freeze';END IF;
   blocked:=false;BEGIN PERFORM public.fms_payable_writeoff_secure(jsonb_set(command,'{0,request_id}',to_jsonb(gen_random_uuid())),scheme,today,'冻结不能新增核销');EXCEPTION WHEN check_violation THEN blocked:=true;END;
   IF NOT blocked THEN RAISE EXCEPTION 'Frozen credit payable was consumed';END IF;
   PERFORM public.fms_act_purchase_payable_secure(array[payable],'unfreeze','解除回滚冻结');
   INSERT INTO public.fms_account_set(tenant_id,account_set_code,account_set_name,legal_entity_name,base_currency_code,enabled_on,status)
   VALUES(tenant,'QA_PRF_'||upper(left(gen_random_uuid()::text,8)),'退款核销另一回滚账套','虚构回滚主体','CNY',today,'active') RETURNING id INTO other_book;
   INSERT INTO public.fms_currency(tenant_id,account_set_id,currency_code,currency_name,symbol,is_enabled,is_base) VALUES(tenant,other_book,'CNY','人民币','¥',true,true);
   UPDATE public.fms_account_set SET is_default=false WHERE id=book;UPDATE public.fms_account_set SET is_default=true WHERE id=other_book;
   finance:=public.fms_save_purchase_payable_secure(payload);foreign_payable:=(finance->>'id')::uuid;
   UPDATE public.fms_account_set SET is_default=false WHERE id=other_book;UPDATE public.fms_account_set SET is_default=true WHERE id=book;
   PERFORM public.fms_act_purchase_payable_secure(array[foreign_payable],'submit');PERFORM public.fms_act_purchase_payable_secure(array[foreign_payable],'approve');
   blocked:=false;BEGIN PERFORM public.fms_payable_writeoff_secure(jsonb_set(jsonb_set(command,'{0,payable_id}',to_jsonb(foreign_payable)),'{0,request_id}',to_jsonb(gen_random_uuid())),scheme,today,'不能跨账套');EXCEPTION WHEN check_violation THEN blocked:=true;END;
   IF NOT blocked THEN RAISE EXCEPTION 'Refund writeoff crossed accounting books';END IF;
   finance:=public.fms_save_purchase_payable_secure(payload||jsonb_build_object('is_credit',false));blue:=(finance->>'id')::uuid;
   PERFORM public.fms_act_purchase_payable_secure(array[blue],'submit');PERFORM public.fms_act_purchase_payable_secure(array[blue],'approve');
   repeated:=public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('relation','payable_red_blue','payable_id',blue,'credit_payable_id',payable,'amount',40,'credit_amount',40)),scheme,today,'与原红蓝对冲共享余额');red_blue_match:=(repeated->>0)::uuid;
   blocked:=false;BEGIN PERFORM public.fms_payable_writeoff_secure(jsonb_set(command,'{0,request_id}',to_jsonb(gen_random_uuid())),scheme,today,'禁止跨关系重复消费');EXCEPTION WHEN check_violation THEN blocked:=true;END;
   IF NOT blocked THEN RAISE EXCEPTION 'Refund reused credit already consumed by red-blue writeoff';END IF;
   PERFORM public.fms_reverse_payable_writeoff_secure(red_blue_match,'恢复原红蓝余额');
  ELSE
   IF NOT(projection->>'needs_voucher')::boolean OR projection->>'document_no' IS NULL THEN RAISE EXCEPTION 'Accounting-required refund writeoff has no recognizable accounting bill';END IF;
   preview:=public.fms_payable_settlement_voucher_secure(matched,'writeoff',true);
   IF jsonb_array_length(preview->'lines')<2 THEN RAISE EXCEPTION 'Original-book refund preview missing';END IF;
   repeated:=public.fms_payable_settlement_voucher_secure(matched,'writeoff',false);voucher:=(repeated->'voucher_ids'->>0)::uuid;
   IF repeated->>'status'<>'generated' OR voucher IS NULL THEN RAISE EXCEPTION 'Original-book refund voucher failed: %',repeated;END IF;
   IF scenario=3 AND NOT EXISTS(SELECT 1 FROM public.fms_voucher_line WHERE voucher_id=voucher AND subject_id=exchange_subject AND debit_amount=round(first_amount*payable_rate,2)-round(first_amount*receipt_rate,2)) THEN RAISE EXCEPTION 'Historical rate loss was not realized';END IF;
   IF scenario=4 AND NOT EXISTS(SELECT 1 FROM public.fms_voucher_line WHERE voucher_id=voucher AND subject_id=exchange_subject AND credit_amount=20) THEN RAISE EXCEPTION 'Historical cross-currency gain was not realized';END IF;
   IF scenario>=3 AND NOT EXISTS(SELECT 1 FROM public.fms_voucher_line WHERE voucher_id=voucher AND subject_id=credit_subject AND exchange_rate=payable_rate AND original_amount=first_amount) THEN RAISE EXCEPTION 'Refund voucher lost payable original amount or rate';END IF;
   blocked:=false;BEGIN PERFORM public.fms_reverse_payable_writeoff_secure(matched,'有效凭证不能反核销');EXCEPTION WHEN check_violation THEN blocked:=true;END;
   IF NOT blocked THEN RAISE EXCEPTION 'Active refund voucher did not block reversal';END IF;
   PERFORM set_config('request.jwt.claim.sub',root_actor::text,true);PERFORM public.transition_fms_voucher(voucher,'void','回滚验证后反核销',null);PERFORM set_config('request.jwt.claim.sub',actor::text,true);
   blocked:=false;BEGIN PERFORM public.fms_payable_settlement_voucher_secure(matched,'writeoff',false);EXCEPTION WHEN check_violation THEN blocked:=true;END;
   IF NOT blocked THEN RAISE EXCEPTION 'Voided refund voucher returned as generated';END IF;
  END IF;
  IF second_match IS NOT NULL THEN PERFORM public.fms_reverse_payable_writeoff_secure(second_match,'先恢复最后一笔尾差');END IF;
  PERFORM public.fms_reverse_payable_writeoff_secure(matched,'原币及本位币余额恢复');
  SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
  IF(app_private.purchase_payable_json(payable)->>'face_unpaid_amount')::numeric<>100 OR app_private.supplier_receipt_line_available(receipt_line)<>receipt_face THEN RAISE EXCEPTION 'Reversal did not restore both source balances';END IF;
  projection:=public.fms_get_payable_writeoff_record_secure(matched);
  IF projection->>'status'<>'reversed' OR projection->>'document_no' IS NOT NULL THEN RAISE EXCEPTION 'Accounting bill survived reversal or history was lost';END IF;
  blocked:=false;BEGIN PERFORM public.fms_payable_writeoff_secure(command,scheme,today,'原币及原记账汇率核销');EXCEPTION WHEN check_violation THEN blocked:=true;END;
  IF NOT blocked THEN RAISE EXCEPTION 'Reversed command resurrected old writeoff history';END IF;
  IF scenario>1 THEN
   SELECT * INTO event FROM public.fms_posting_event WHERE source_type='system' AND event_code='ap_payable_refund_writeoff_approved' AND source_id=matched;
   event:=app_private.process_fms_posting_event(event.id,true);
   IF event.status<>'ignored' THEN RAISE EXCEPTION 'Forced retry resurrected reversed refund writeoff';END IF;
  END IF;
  IF scenario=2 THEN
   PERFORM set_config('request.jwt.claim.sub',root_actor::text,true);PERFORM set_config('request.headers','{}',true);
   repeated:=public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('relation','payable_refund','payable_id',payable,'receipt_line_id',receipt_line,'amount',1,'receipt_amount',1,'request_id',gen_random_uuid())),scheme,today,'全部租户按来源继承业务租户');
   second_match:=(repeated->>0)::uuid;
   IF NOT app_private.payable_receipt_refund_valid(second_match) OR(SELECT tenant_id FROM public.fms_payable_writeoff_record WHERE id=second_match)<>tenant THEN RAISE EXCEPTION 'Platform-all could not create inherited-tenant refund writeoff';END IF;
   PERFORM public.fms_reverse_payable_writeoff_secure(second_match,'全部租户恢复原币及本位币余额');
   PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  END IF;
  PERFORM public.fms_cancel_supplier_receipt_secure(receipt,'核销已反核销后冲回原到账');SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
 END LOOP;
 IF has_function_privilege('authenticated','app_private.apply_payable_receipt_refund(uuid,uuid,numeric,numeric,date,uuid,text,boolean,uuid)','execute') THEN RAISE EXCEPTION 'Private refund ledger writes exposed to clients';END IF;
 IF has_function_privilege('anon','app_private.payable_receipt_refund_amount_access()','execute') OR NOT has_function_privilege('authenticated','app_private.payable_receipt_refund_amount_access()','execute') THEN RAISE EXCEPTION 'Refund RLS capability helper grants are not narrowly scoped';END IF;
END $refund_writeoff$;

ROLLBACK;
