begin;
set local jit=off;
set local statement_timeout='8s';

create function pg_temp.check_payable_refund_fx(p_case integer,p_stage integer) returns jsonb
language plpgsql as $test$
declare
 tenant uuid;
 actor uuid;
 platform_actor uuid;
 platform_tenant uuid;
 book uuid;
 currency_ident uuid;
 supplier uuid;
 purpose_ident uuid;
 refund_purpose uuid;
 method_ident uuid;
 payment_type uuid;
 refund_type uuid;
 fund_ident uuid;
 receiving_ident uuid;
 payment_line uuid;
 original_execution uuid;
 refund_ident uuid;
 current_execution uuid;
 old_execution uuid;
 finance_type uuid;
 material uuid;
 unit_ident uuid;
 scheme_ident uuid;
 posting_date date;
 payment jsonb;
 refund_document jsonb;
 request_document jsonb;
 refund_lines jsonb;
 refund_line jsonb;
 finance jsonb;
 result jsonb;
 state jsonb;
 balances jsonb;
 money jsonb;
 cash_value numeric:=case when p_case=3 then 0.02 else 100 end;
 offered_discount numeric:=case when p_case=3 then 0.02 else 2 end;
 refund_value numeric:=case when p_case=2 then 50 when p_case=3 then 0.02 else 100 end;
 expiry_value numeric:=case when p_case=2 then 1 when p_case=3 then 0.02 else 2 end;
 payment_rate numeric:=case when p_case=3 then 1.4 else 7.2 end;
 refund_rate numeric:=case when p_case=3 then 1.5 else 7.3 end;
 fee_value numeric:=case when p_case=3 then 0 else 1 end;
 expiry_base numeric;
 receipt_base numeric;
 initial_count bigint;
 blocked boolean;
 stage_context jsonb;
begin
 if p_case not between 1 and 7 then raise exception 'Unsupported foreign refund receipt case';end if;
 if p_stage not between 1 and 7 then raise exception 'Unsupported foreign refund receipt phase';end if;
 if p_stage>1 then
  stage_context:=current_setting('test.payable_refund_fx_'||p_case)::jsonb;
  if(stage_context->>'stage')::integer<>p_stage-1 then raise exception 'Run each foreign refund phase once in order';end if;
  select stored.tenant_id,stored.owner_actor,stored.platform_actor,stored.platform_tenant,stored.book_id,stored.currency_id,
   stored.supplier_id,stored.refund_purpose,stored.method_id,stored.payment_type_id,stored.refund_type,stored.receiving_fund_id,
   stored.payment_line_id,stored.original_execution,stored.refund_id,stored.old_execution,stored.business_date,
   stored.payment,stored.refund_document,stored.request_document,stored.refund_lines,stored.expired_base,stored.refund_base,stored.finance,stored.discount_scheme_id
  into tenant,actor,platform_actor,platform_tenant,book,currency_ident,supplier,refund_purpose,method_ident,payment_type,refund_type,
   receiving_ident,payment_line,original_execution,refund_ident,old_execution,posting_date,payment,refund_document,request_document,
   refund_lines,expiry_base,receipt_base,finance,scheme_ident
  from jsonb_to_record(stage_context) as stored(tenant_id uuid,owner_actor uuid,platform_actor uuid,platform_tenant uuid,book_id uuid,currency_id uuid,
   supplier_id uuid,refund_purpose uuid,method_id uuid,payment_type_id uuid,refund_type uuid,receiving_fund_id uuid,payment_line_id uuid,
   original_execution uuid,refund_id uuid,old_execution uuid,business_date date,payment jsonb,refund_document jsonb,request_document jsonb,
   refund_lines jsonb,expired_base numeric,refund_base numeric,finance jsonb,discount_scheme_id uuid);
  perform set_config('request.jwt.claim.sub',stage_context->>'actor',true);
  perform set_config('request.headers',(stage_context->'headers')::text,true);
 end if;
 case p_stage when 1 then
 select id into tenant from public.sys_tenant where tenant_code='qa-payable-20261022';
 select auth_user_id into actor from public.sys_user where tenant_id=tenant and status='1' and auth_user_id is not null order by id limit 1;
 select auth_user_id,tenant_id into platform_actor,platform_tenant from public.sys_user where auth_user_id is not null and user_roles @>array['R_SUPER'] order by id limit 1;
 select id into book from public.fms_account_set where tenant_id=tenant and is_default and status='active' and base_currency_code='CNY';
 select start_date into posting_date from public.fms_accounting_period where account_set_id=book and status='open' order by start_date desc limit 1;
 if actor is null or posting_date is null then raise exception 'Missing ordinary foreign refund acceptance fixtures';end if;
 if has_function_privilege('authenticated','app_private.apply_payable_refund_writeoff(uuid,uuid,numeric,date,uuid,text,numeric)','EXECUTE')
  or has_function_privilege('anon','app_private.payable_payment_base_balances(uuid,uuid)','EXECUTE')
  or has_function_privilege('authenticated','app_private.payable_refund_writeoff_posting_payload(uuid)','EXECUTE') then
  raise exception 'Private refund money or posting writer became client executable';
 end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.headers','{}',true);
 if app_private.is_platform_super() then raise exception 'Source payment must be created by an ordinary actor';end if;
 select id into supplier from public.mdm_supplier where tenant_id=tenant order by id limit 1;
 select id into purpose_ident from public.mdm_payment_purpose where tenant_id=tenant and code='202' and enabled;
 select id into refund_purpose from public.mdm_payment_purpose where tenant_id=tenant and business_type='advance_refund' and enabled order by id limit 1;
 select id into method_ident from public.mdm_settlement_method where tenant_id=tenant and category='cash' and enabled order by id limit 1;
 select id into payment_type from public.mdm_document_type where tenant_id=tenant and document_type_code='AP_PAYMENT_PURCHASE';
 select document_type.id into refund_type from public.mdm_document_type document_type join public.sys_menu menu on menu.id=document_type.menu_id
 where document_type.tenant_id=tenant and menu.name='FinancePayableRefund' and document_type.enabled order by document_type.id limit 1;
 if refund_purpose is null or refund_type is null then raise exception 'Missing enabled symmetric refund masters';end if;
 insert into public.fms_currency(tenant_id,account_set_id,currency_code,currency_name,is_enabled)
 values(tenant,book,'USD','美元',true) on conflict(account_set_id,currency_code) do update set is_enabled=true returning id into currency_ident;
 insert into public.fms_exchange_rate(tenant_id,account_set_id,currency_id,rate_date,rate_type,direct_rate)
 values(tenant,book,currency_ident,posting_date,'spot',refund_rate)
 on conflict(account_set_id,currency_id,rate_date,rate_type) do update set direct_rate=excluded.direct_rate;
 insert into public.fms_fund_account(tenant_id,account_set_id,currency_id,account_code,account_name,account_type,account_no_masked,account_no_fingerprint,opening_balance,online_banking_enabled)
 values(tenant,book,currency_ident,'FX_RF_OUT_'||upper(left(gen_random_uuid()::text,8)),'外币退款回滚虚构原付款户','cash','**** QA',md5(gen_random_uuid()::text),1000,false) returning id into fund_ident;
 insert into public.fms_fund_account(tenant_id,account_set_id,currency_id,account_code,account_name,account_type,account_no_masked,account_no_fingerprint,opening_balance,online_banking_enabled)
 values(tenant,book,currency_ident,'FX_RF_IN_'||upper(left(gen_random_uuid()::text,8)),'外币退款回滚虚构收款户','cash','**** QA',md5(gen_random_uuid()::text),0,false) returning id into receiving_ident;
 payment:=public.fms_save_payable_settlement_secure(jsonb_build_object('kind','payment','tenant_id',tenant,'document_type_id',payment_type,
  'account_set_id',book,'currency_code','USD','exchange_rate',payment_rate,'business_date',posting_date,'details',jsonb_build_object('fee',fee_value),
  'lines',jsonb_build_array(jsonb_build_object('purpose_id',purpose_ident,'supplier_id',supplier,'settlement_method_id',method_ident,
   'fund_account_id',fund_ident,'amount',cash_value,'cash_discount',offered_discount))));
 perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'submit');
 perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'approve');
 perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'confirm');
 payment_line:=(payment->'lines'->0->>'id')::uuid;
 select id into original_execution from public.fms_payable_payment_execution where line_id=payment_line and status='posted';
 when 2 then
 if p_case in(4,5) then
  perform set_config('request.jwt.claim.sub',platform_actor::text,true);
  if app_private.is_platform_super() is distinct from true then raise exception 'Missing platform refund scope fixture';end if;
 end if;
 if p_case=5 then perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',tenant)::text,true);end if;
 if p_case=6 then perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',platform_tenant)::text,true);end if;
 refund_line:=jsonb_build_object('refund_payment_line_id',payment_line,'purpose_id',refund_purpose,'settlement_method_id',method_ident,'fund_account_id',receiving_ident,
  'amount',case when p_case=3 then 0.01 else refund_value end,'expired_discount_amount',case when p_case=2 then expiry_value else 0 end);
 refund_lines:=jsonb_build_array(refund_line);
 if p_case=3 then refund_lines:=refund_lines||jsonb_build_array(refund_line);end if;
 request_document:=jsonb_build_object('kind','refund','document_type_id',refund_type,'business_date',posting_date,'exchange_rate',refund_rate,
  'base_currency_code','EUR','base_amount',999,'lines',refund_lines);
 if p_case=7 then
  insert into public.fms_exchange_rate(tenant_id,account_set_id,currency_id,rate_date,rate_type,direct_rate)
  values(tenant,book,currency_ident,app_private.payable_business_date(),'spot',refund_rate)
  on conflict(account_set_id,currency_id,rate_date,rate_type) do update set direct_rate=excluded.direct_rate;
  refund_document:=public.fms_push_payable_settlement_secure((payment->>'id')::uuid,'refund','payment');
  if refund_document->>'currency_code'<>'USD' or(refund_document->>'exchange_rate')::numeric<>refund_rate then
   raise exception 'Payment push lost the refund currency or copied the original payment rate';
  end if;
  refund_document:=public.fms_save_payable_settlement_secure(refund_document||jsonb_build_object('business_date',posting_date,'exchange_rate',refund_rate,
   'lines',(select jsonb_agg(entry||jsonb_build_object('fund_account_id',receiving_ident)) from jsonb_array_elements(refund_document->'lines') entry)));
 else
  refund_document:=public.fms_save_payable_settlement_secure(request_document);
 end if;
 refund_ident:=(refund_document->>'id')::uuid;
 if(refund_document->>'tenant_id')::uuid<>tenant or(refund_document->>'account_set_id')::uuid<>book
  or refund_document->>'currency_code'<>'USD' or refund_document->>'base_currency_code'<>'CNY' or(refund_document->>'exchange_rate')::numeric<>refund_rate
  or(refund_document->>'amount')::numeric<>refund_value
  or(select sum((entry->>'expired_discount_amount')::numeric) from jsonb_array_elements(refund_document->'lines') entry)<>expiry_value then
  raise exception 'Refund did not inherit its source tenant/book/currency or full-discount expiry';
 end if;
 select count(*) into initial_count from public.fms_payable_settlement_document;
 blocked:=false;
 begin perform public.fms_save_payable_settlement_secure(request_document||jsonb_build_object('currency_code','CNY'));
 exception when check_violation then blocked:=true;end;
 if not blocked or(select count(*) from public.fms_payable_settlement_document)<>initial_count then raise exception 'Refund currency mismatch kept a partial document';end if;
 if p_case=6 then
  blocked:=false;
  begin perform public.fms_save_payable_settlement_secure(request_document||jsonb_build_object('tenant_id',platform_tenant));
  exception when insufficient_privilege then blocked:=true;end;
  if not blocked then raise exception 'Forged ordinary header changed the refund parent tenant';end if;
 end if;
 update public.fms_exchange_rate set direct_rate=9 where account_set_id=book and currency_id=currency_ident and rate_date=posting_date and rate_type='spot';
 refund_document:=public.fms_save_payable_settlement_secure(refund_document-'exchange_rate');
 if(refund_document->>'exchange_rate')::numeric<>refund_rate then raise exception 'Unrelated refund draft edit repriced its stored rate';end if;
 when 3 then
 perform public.fms_act_payable_settlement_secure(array[refund_ident],'submit');
 perform public.fms_act_payable_settlement_secure(array[refund_ident],'approve');
 perform public.fms_act_payable_settlement_secure(array[refund_ident],'confirm');
 select sum(expired_discount_base_amount),sum(cash_base_amount) into expiry_base,receipt_base
 from public.fms_payable_payment_execution where document_id=refund_ident and status='posted';
 if expiry_base<>round(expiry_value*payment_rate,2) or receipt_base<>round(refund_value*refund_rate,2)
  or exists(select 1 from public.fms_payable_payment_execution where document_id=refund_ident and status='posted'
   and(source_payment_execution_id is distinct from original_execution or fee_base_amount<>0 or discount_base_amount<>0)) then
  raise exception 'Refund cash or expired discount used the wrong historical rate';
 end if;
 for refund_line in select value from jsonb_array_elements(refund_document->'lines') loop
  if app_private.payable_refund_receipt_valid((refund_line->>'id')::uuid) is distinct from true then raise exception 'Foreign receipt lost its actual nominal funds';end if;
  money:=app_private.payable_settlement_execution_values((refund_line->>'id')::uuid);
  if(money->>'exchange_rate')::numeric<>refund_rate or(money->>'source_payment_exchange_rate')::numeric<>payment_rate then raise exception 'Refund replaced either historical rate';end if;
 end loop;
 if(select sum(ledger.amount) from public.fms_payable_payment_execution execution join public.fms_fund_ledger_entry ledger on ledger.id=execution.fund_ledger_id
   where execution.document_id=refund_ident and execution.status='posted')<>refund_value then raise exception 'Refund credited local rather than original currency cash';end if;
 state:=app_private.payable_payment_line_state(payment_line);
 if(state->>'confirmed_refund_cash')::numeric<>refund_value or(state->>'expired_discount')::numeric<>expiry_value then raise exception 'Refund and expiry did not reserve the original balances';end if;
 when 4 then
 if p_case=2 then
  select id into finance_type from public.mdm_document_type where tenant_id=tenant and document_type_code='AP_FIN_STANDARD';
  select id,inventory_unit_id into material,unit_ident from public.mdm_material where tenant_id=tenant and inventory_unit_id is not null order by id limit 1;
  select id into scheme_ident from public.fms_payable_writeoff_scheme where tenant_id=tenant and code='AP-MANUAL';
  finance:=public.fms_save_purchase_payable_secure(jsonb_build_object('kind','financial','tenant_id',tenant,'document_type_id',finance_type,'business_date',posting_date,
   'supplier_id',supplier,'currency_code','USD','exchange_rate',7,'lines',jsonb_build_array(jsonb_build_object('material_id',material,'inventory_unit_id',unit_ident,'quantity',1,'unit_price',51,'tax_rate',0))));
  perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'submit');perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'approve');
 end if;
 when 5 then
 if p_case=2 then
  result:=public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('payable_id',finance->>'id','payment_line_id',payment_line,'amount',51)),scheme_ident,posting_date,'退款后仅核销未失效折扣');
  if not exists(select 1 from public.fms_payable_writeoff_record where id=(result->>0)::uuid and payment_amount=50 and cash_discount_amount=1 and cash_discount_base_amount=7.2) then
   raise exception 'Refund-expired discount was reused or realized in payable matching';
  end if;
 end if;
 balances:=app_private.payable_payment_base_balances(payment_line);
 if(balances->>'expired_base')::numeric<>expiry_base then raise exception 'Original discount pool forgot actual refund expiry';end if;
 when 6 then
 select id into old_execution from public.fms_payable_payment_execution where document_id=refund_ident and status='posted' order by id limit 1;
 perform public.fms_act_payable_settlement_secure(array[refund_ident],'confirm');
 if(select count(*) from public.fms_payable_payment_execution where document_id=refund_ident and status='posted')<>jsonb_array_length(refund_lines) then raise exception 'Repeated refund receipt duplicated a cash execution';end if;
 perform public.fms_act_payable_settlement_secure(array[refund_ident],'cancel_payment','按原币和原执行撤销到账');
 if exists(select 1 from public.fms_payable_payment_execution where document_id=refund_ident and status='posted')
  or not exists(select 1 from public.fms_payable_payment_execution execution join public.fms_fund_ledger_entry original on original.id=execution.fund_ledger_id
   join public.fms_fund_ledger_entry reversal on reversal.id=execution.reversal_ledger_id and reversal.reversal_of_id=original.id
   where execution.id=old_execution and execution.status='reversed' and execution.exchange_rate=refund_rate and reversal.amount=original.amount) then
  raise exception 'Cancelling refund receipt repriced its original cash';
 end if;
 if(app_private.payable_payment_base_balances(payment_line)->>'expired_base')::numeric<>0 then raise exception 'Cancelled receipt kept an active discount expiry';end if;
 when 7 then
 perform public.fms_act_payable_settlement_secure(array[refund_ident],'confirm');
 select id into current_execution from public.fms_payable_payment_execution where document_id=refund_ident and status='posted' order by id limit 1;
 if current_execution=old_execution or(select sum(cash_base_amount) from public.fms_payable_payment_execution where document_id=refund_ident and status='posted')<>receipt_base
  or(select sum(expired_discount_base_amount) from public.fms_payable_payment_execution where document_id=refund_ident and status='posted')<>expiry_base then
  raise exception 'Reconfirmation used the current rate or lost an original discount cent';
 end if;
 end case;
 stage_context:=jsonb_build_object('case',p_case,'stage',p_stage,'status','passed','refund_original',refund_value,'refund_base',receipt_base,'expired_original',expiry_value,'expired_base',expiry_base,
  'tenant_id',tenant,'actor',auth.uid(),'owner_actor',actor,'headers',current_setting('request.headers')::jsonb,'book_id',book,
  'payment_line_id',payment_line,'refund_id',refund_ident,'payment_rate',payment_rate,'refund_rate',refund_rate,
  'supplier_id',supplier,'currency_id',currency_ident,'receiving_fund_id',receiving_ident,'business_date',posting_date,'payment_type_id',payment_type)
  ||jsonb_build_object('platform_actor',platform_actor,'platform_tenant',platform_tenant,'refund_type',refund_type,'refund_purpose',refund_purpose,
   'method_id',method_ident,'original_execution',original_execution,'old_execution',old_execution,'payment',payment,
   'refund_document',refund_document,'request_document',request_document,'refund_lines',refund_lines,'finance',finance,'discount_scheme_id',scheme_ident);
 perform set_config('test.payable_refund_fx_'||p_case,stage_context::text,true);
 return stage_context;
end $test$;

create function pg_temp.check_payable_refund_fx_matching(p_context jsonb,p_cross boolean default false,p_phase text default 'prepare') returns jsonb
language plpgsql as $test$
declare
 tenant uuid:=(p_context->>'tenant_id')::uuid;
 book uuid:=(p_context->>'book_id')::uuid;
 supplier uuid:=(p_context->>'supplier_id')::uuid;
 payment_line uuid:=coalesce(nullif(p_context->>'selected_payment_line_id','')::uuid,(p_context->>'payment_line_id')::uuid);
 refund_ident uuid:=(p_context->>'refund_id')::uuid;
 primary_currency uuid:=coalesce(nullif(p_context->>'selected_currency_id','')::uuid,(p_context->>'currency_id')::uuid);
 primary_rate numeric:=coalesce(nullif(p_context->>'selected_payment_rate','')::numeric,(p_context->>'payment_rate')::numeric);
 refund_rate numeric:=(p_context->>'refund_rate')::numeric;
 posting_date date:=(p_context->>'business_date')::date;
 primary_total numeric:=coalesce(nullif(p_context->>'selected_payment_total','')::numeric,(p_context->>'refund_original')::numeric);
 scheme_ident uuid;
 default_scheme uuid;
 fund_ident uuid;
 purpose_ident uuid;
 method_ident uuid;
 primary_subject uuid;
 refund_subject uuid;
 exchange_subject uuid;
 discount_subject uuid;
 payment_document_id uuid;
 rule_ident uuid;
 generated_voucher uuid;
 receipt_voucher uuid;
 record_ident uuid;
 last_record uuid;
 primary_document jsonb;
 command jsonb;
 result jsonb;
 payload jsonb;
 preview jsonb;
 balances jsonb;
 workspace jsonb;
 refund_line public.fms_payable_settlement_line;
 matched public.fms_payable_writeoff_record;
 records uuid[]:='{}';
 ledger_count bigint;
 principal_sum numeric;
 refund_sum numeric;
 payment_base_sum numeric;
 refund_base_sum numeric;
 subject_suffix text:=to_char(clock_timestamp(),'YYYYMMDDHH24MISSUS');
 blocked boolean;
begin
 if p_phase not in('prepare','match','writeoff_config','writeoff_preview','writeoff_generate','writeoff_check','writeoff_replay','writeoff_reverse_guard','receipt_config','receipt_generate','receipt_check') then raise exception 'Unknown refund verification phase';end if;
 perform set_config('request.jwt.claim.sub',p_context->>'actor',true);
 perform set_config('request.headers',(p_context->'headers')::text,true);
 select id into default_scheme from public.fms_payable_writeoff_scheme where tenant_id=tenant and code='AP-MANUAL';
 scheme_ident:=coalesce(nullif(p_context->>'selected_scheme_id','')::uuid,default_scheme);
 if p_cross and p_phase='prepare' then
  if(p_context->>'refund_original')::numeric<>100 then raise exception 'Cross-currency case needs one full USD refund';end if;
  insert into public.fms_currency(tenant_id,account_set_id,currency_code,currency_name,is_enabled)
  values(tenant,book,'EUR','欧元',true) on conflict(account_set_id,currency_code) do update set is_enabled=true returning id into primary_currency;
  insert into public.fms_fund_account(tenant_id,account_set_id,currency_id,account_code,account_name,account_type,account_no_masked,account_no_fingerprint,opening_balance,online_banking_enabled)
  values(tenant,book,primary_currency,'FX_RF_EUR_'||upper(left(gen_random_uuid()::text,8)),
   '异币退款匹配回滚虚构欧元户','cash','**** QA',md5(gen_random_uuid()::text),1000,false) returning id into fund_ident;
  select purpose_id,settlement_method_id into purpose_ident,method_ident from public.fms_payable_settlement_line where id=payment_line;
  primary_total:=90;primary_rate:=8;
  primary_document:=public.fms_save_payable_settlement_secure(jsonb_build_object('kind','payment','tenant_id',tenant,'document_type_id',p_context->>'payment_type_id',
   'account_set_id',book,'business_date',posting_date,'currency_code','EUR','exchange_rate',primary_rate,
   'lines',jsonb_build_array(jsonb_build_object('purpose_id',purpose_ident,'supplier_id',supplier,'settlement_method_id',method_ident,'fund_account_id',fund_ident,'amount',primary_total))));
  perform public.fms_act_payable_settlement_secure(array[(primary_document->>'id')::uuid],'submit');
  perform public.fms_act_payable_settlement_secure(array[(primary_document->>'id')::uuid],'approve');
  perform public.fms_act_payable_settlement_secure(array[(primary_document->>'id')::uuid],'confirm');
  payment_line:=(primary_document->'lines'->0->>'id')::uuid;
  insert into public.fms_payable_writeoff_scheme(tenant_id,code,name,rules,automatic)
  values(tenant,'FX_RF_PAIR_'||upper(left(gen_random_uuid()::text,8)),'明确双方原币的付款冲退款回滚方案',
   jsonb_build_array(jsonb_build_object('primary_field','supplier_id','secondary_field','supplier_id','operator','eq','empty_matches',false)),false) returning id into scheme_ident;
 end if;
 if p_phase='prepare' then
  select source_line.document_id into payment_document_id from public.fms_payable_settlement_line source_line where source_line.id=payment_line;
  workspace:=public.fms_payable_writeoff_workspace_secure(jsonb_build_object('relation','payment_refund','document_ids',jsonb_build_array(payment_document_id,refund_ident)));
  if not exists(select 1 from jsonb_array_elements(workspace->'primary') entry where entry->>'id'=payment_line::text
    and entry->>'currency_code'=case when p_cross then 'EUR' else 'USD' end and entry->>'base_currency_code'='CNY'
    and(entry->>'available_amount')::numeric=primary_total and(entry->>'available_base_amount')::numeric=round(primary_total*primary_rate,2)
    and(entry->>'exchange_rate')::numeric=primary_rate)
   or(select sum((entry->>'available_amount')::numeric) from jsonb_array_elements(workspace->'secondary') entry)<>(p_context->>'refund_original')::numeric
   or(select sum((entry->>'available_base_amount')::numeric) from jsonb_array_elements(workspace->'secondary') entry)<>(p_context->>'refund_base')::numeric then
   raise exception 'Refund workspace omitted an original currency, rate or genuine local balance';
  end if;
  return p_context||jsonb_build_object('selected_payment_line_id',payment_line,'selected_currency_id',primary_currency,
   'selected_payment_rate',primary_rate,'selected_payment_total',primary_total,'selected_scheme_id',scheme_ident,
   'ledger_count',(select count(*) from public.fms_fund_ledger_entry));
 end if;
 ledger_count:=(p_context->>'ledger_count')::bigint;
 if p_phase='match' then
 for refund_line in select * from public.fms_payable_settlement_line where document_id=refund_ident order by line_no loop
  command:=jsonb_build_object('relation','payment_refund','payment_line_id',payment_line,'refund_line_id',refund_line.id,
   'amount',case when p_cross then primary_total else refund_line.amount end,'refund_amount',refund_line.amount);
  if p_cross then
   blocked:=false;
   begin perform public.fms_payable_writeoff_secure(jsonb_build_array(command-'refund_amount'),scheme_ident,posting_date,'不可猜测另一原币');exception when invalid_parameter_value then blocked:=true;end;
   if not blocked then raise exception 'Cross-currency refund guessed its secondary amount';end if;
   blocked:=false;
   begin perform public.fms_payable_writeoff_secure(jsonb_build_array(command),default_scheme,posting_date,'同币种方案仍须拒绝异币');exception when check_violation then blocked:=true;end;
   if not blocked then raise exception 'Cross-currency refund bypassed configured matching rules';end if;
  end if;
  result:=public.fms_payable_writeoff_secure(jsonb_build_array(command||jsonb_build_object('payment_base_amount',999,'refund_base_amount',999)),scheme_ident,posting_date,'原执行本金与到账原汇率核销');
  record_ident:=(result->>0)::uuid;records:=array_append(records,record_ident);
  select * into matched from public.fms_payable_writeoff_record where id=record_ident;
  if matched.fx_snapshot_version is distinct from 1 or matched.account_set_id<>book or matched.payment_amount<>(command->>'amount')::numeric
   or matched.refund_amount<>refund_line.amount or matched.cash_discount_amount<>0 or matched.cash_discount_base_amount<>0
   or(matched.match_snapshot->'payment_money_snapshot'->>'exchange_rate')::numeric<>primary_rate
   or(matched.match_snapshot->'refund_money_snapshot'->>'exchange_rate')::numeric<>refund_rate then
   raise exception 'Refund matching mixed original principal, discount expiry or historical rates';
  end if;
 end loop;
 select sum(payment_amount),sum(refund_amount),sum(payment_base_amount),sum(refund_base_amount)
 into principal_sum,refund_sum,payment_base_sum,refund_base_sum from public.fms_payable_writeoff_record where id=any(records);
 if principal_sum<>primary_total or refund_sum<>(p_context->>'refund_original')::numeric
  or payment_base_sum<>round(primary_total*primary_rate,2) or refund_base_sum<>(p_context->>'refund_base')::numeric then
  raise exception 'Refund matching lost either original currency or a local rounding residual';
 end if;
 balances:=app_private.payable_payment_base_balances(payment_line);
 if(balances->>'cash_original_remaining')::numeric<>0 or(balances->>'cash_base_remaining')::numeric<>0 then raise exception 'Refund matching left original payment principal or local value';end if;
 last_record:=records[array_length(records,1)];
 select * into matched from public.fms_payable_writeoff_record where id=last_record;
 blocked:=false;
 begin update public.fms_payable_writeoff_record set refund_base_amount=refund_base_amount+1 where id=last_record;exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Refund local allocation history was mutable';end if;
 perform public.fms_reverse_payable_writeoff_secure(last_record,'按双方原币恢复退款核销');
 balances:=app_private.payable_payment_base_balances(payment_line);
 if(balances->>'cash_original_remaining')::numeric<>matched.payment_amount or(balances->>'cash_base_remaining')::numeric<>matched.payment_base_amount then raise exception 'Refund reversal repriced the original principal';end if;
 command:=jsonb_build_object('relation','payment_refund','payment_line_id',payment_line,'refund_line_id',matched.refund_line_id,'amount',matched.payment_amount,'refund_amount',matched.refund_amount);
 result:=public.fms_payable_writeoff_secure(jsonb_build_array(command),scheme_ident,posting_date,'按原汇率重新核销退款');record_ident:=(result->>0)::uuid;
 select * into matched from public.fms_payable_writeoff_record where id=record_ident;
 workspace:=public.fms_payable_writeoff_workspace_secure(jsonb_build_object('relation','payment_refund','record_id',record_ident));
 if jsonb_array_length(workspace->'primary')<>0 or jsonb_array_length(workspace->'secondary')<>0
  or not exists(select 1 from jsonb_array_elements(workspace->'history') entry where entry->>'id'=record_ident::text
  and entry->>'currency_code'=case when p_cross then 'EUR' else 'USD' end and entry->>'secondary_currency_code'='USD'
  and entry->>'base_currency_code'='CNY' and(entry->>'primary_exchange_rate')::numeric=primary_rate
  and(entry->>'secondary_exchange_rate')::numeric=refund_rate
  and(entry->>'exchange_difference')::numeric=matched.refund_base_amount-matched.payment_base_amount) then
  raise exception 'Refund history lost either original currency, historical rate or realized exchange difference';
 end if;
 if(select count(*) from public.fms_fund_ledger_entry)<>ledger_count then raise exception 'Refund matching or reversal generated another fund entry';end if;
 return p_context||jsonb_build_object('record_id',record_ident,'payment_original_total',principal_sum,'refund_original_total',refund_sum,
  'payment_base_total',payment_base_sum,'refund_base_total',refund_base_sum);
 end if;
 if p_phase in('writeoff_config','writeoff_preview','writeoff_generate','writeoff_check','writeoff_replay','writeoff_reverse_guard','receipt_config','receipt_generate','receipt_check') then
  record_ident:=(p_context->>'record_id')::uuid;
  select * into matched from public.fms_payable_writeoff_record where id=record_ident;
  if matched.id is null then raise exception 'Missing completed refund matching context';end if;
  primary_subject:=(p_context->>'primary_subject_id')::uuid;
  refund_subject:=(p_context->>'refund_subject_id')::uuid;
  discount_subject:=(p_context->>'discount_subject_id')::uuid;
  generated_voucher:=(p_context->>'writeoff_voucher_id')::uuid;
  receipt_voucher:=(p_context->>'receipt_voucher_id')::uuid;
  if p_phase='writeoff_config' then
  if matched.needs_voucher is distinct from true then raise exception 'Selected FX difference should require a voucher';end if;
  payload:=app_private.payable_refund_writeoff_posting_payload(record_ident);
  if(payload->>'exchange_gain_loss')::numeric<>matched.payment_base_amount-matched.refund_base_amount or(payload->>'discount_amount')::numeric<>0 then raise exception 'Refund posting realized an expired discount or changed exchange gain/loss';end if;
  insert into public.fms_subject(tenant_id,account_set_id,subject_code,subject_name,category,balance_direction,allow_foreign_currency)
  values(tenant,book,'995'||subject_suffix,'退款核销原付款回滚科目','asset','debit',true) returning id into primary_subject;
  insert into public.fms_subject(tenant_id,account_set_id,subject_code,subject_name,category,balance_direction,allow_foreign_currency)
  values(tenant,book,'996'||subject_suffix,'退款到账回滚科目','asset','debit',true) returning id into refund_subject;
  insert into public.fms_subject(tenant_id,account_set_id,subject_code,subject_name,category,balance_direction,allow_foreign_currency)
  values(tenant,book,'997'||subject_suffix,'退款汇兑损益回滚科目','expense','debit',false) returning id into exchange_subject;
  insert into public.fms_subject(tenant_id,account_set_id,subject_code,subject_name,category,balance_direction,allow_foreign_currency)
  values(tenant,book,'998'||subject_suffix,'不得确认失效折扣回滚科目','income','credit',false) returning id into discount_subject;
  insert into public.fms_posting_rule(tenant_id,account_set_id,rule_code,rule_name,source_type,event_code,priority,submission_mode,match_conditions)
  values(tenant,book,'FX_RF_WO_'||upper(left(gen_random_uuid()::text,8)),'原币退款核销回滚规则','system','ap_payment_refund_writeoff_approved',999999,'draft',
   jsonb_build_object('fx_snapshot_version',1,'fund_account_id',p_context->>'receiving_fund_id')) returning id into rule_ident;
  insert into public.fms_posting_rule_line(tenant_id,account_set_id,rule_id,line_no,subject_id,direction,amount_key)
  values(tenant,book,rule_ident,10,refund_subject,'debit','refund_amount'),(tenant,book,rule_ident,20,primary_subject,'credit','paid_amount'),
   (tenant,book,rule_ident,30,exchange_subject,'debit','exchange_gain_loss'),(tenant,book,rule_ident,40,discount_subject,'credit','discount_amount');
  return p_context||jsonb_build_object('primary_subject_id',primary_subject,'refund_subject_id',refund_subject,'discount_subject_id',discount_subject);
  end if;
  if p_phase='writeoff_preview' then
  preview:=public.fms_payable_settlement_voucher_secure(record_ident,'writeoff',true);
  if(select sum((entry->>'debit_amount')::numeric-(entry->>'credit_amount')::numeric) from jsonb_array_elements(preview->'lines') entry)<>0 then raise exception 'Refund FX preview did not balance its gain/loss direction';end if;
  return p_context;
  end if;
  if p_phase='writeoff_generate' then
  result:=public.fms_payable_settlement_voucher_secure(record_ident,'writeoff',false);
  if result->>'status'<>'generated' then raise exception 'Refund FX writeoff voucher failed: %',result;end if;
  generated_voucher:=(result->'voucher_ids'->>0)::uuid;
  return p_context||jsonb_build_object('writeoff_voucher_id',generated_voucher);
  end if;
  if p_phase='writeoff_check' then
  if not exists(select 1 from public.fms_voucher_line where voucher_id=generated_voucher and subject_id=primary_subject and credit_amount=matched.payment_base_amount
    and original_amount=matched.payment_amount and exchange_rate=primary_rate and currency_id=primary_currency)
   or not exists(select 1 from public.fms_voucher_line where voucher_id=generated_voucher and subject_id=refund_subject and debit_amount=matched.refund_base_amount
    and original_amount=matched.refund_amount and exchange_rate=refund_rate and currency_id=(p_context->>'currency_id')::uuid)
   or exists(select 1 from public.fms_voucher_line where voucher_id=generated_voucher and subject_id=discount_subject) then
   raise exception 'Refund voucher lost an original rate or realized an expired discount';
  end if;
  return p_context;
  end if;
  if p_phase='writeoff_replay' then
  result:=public.fms_payable_settlement_voucher_secure(record_ident,'writeoff',false);
  if(result->'voucher_ids'->>0)::uuid<>generated_voucher then raise exception 'Refund writeoff posted a duplicate voucher';end if;
  return p_context;
  end if;
  if p_phase='writeoff_reverse_guard' then
  blocked:=false;
  begin perform public.fms_reverse_payable_writeoff_secure(record_ident,'已制证不得反核销');exception when check_violation then blocked:=true;end;
  if not blocked then raise exception 'Posted refund writeoff could be reversed';end if;
  return p_context||jsonb_build_object('primary_subject_id',primary_subject,'refund_subject_id',refund_subject,'discount_subject_id',discount_subject);
  end if;
  if p_phase='receipt_config' then
  insert into public.fms_posting_rule(tenant_id,account_set_id,rule_code,rule_name,source_type,event_code,priority,submission_mode,match_conditions)
  values(tenant,book,'FX_RF_IN_'||upper(left(gen_random_uuid()::text,8)),'原币退款到账回滚规则','system','ap_payment_refund_received',999999,'draft',
   jsonb_build_object('fx_snapshot_version',1,'fund_account_id',p_context->>'receiving_fund_id')) returning id into rule_ident;
  insert into public.fms_posting_rule_line(tenant_id,account_set_id,rule_id,line_no,subject_id,direction,amount_key)
  values(tenant,book,rule_ident,10,refund_subject,'debit','received_amount'),(tenant,book,rule_ident,20,primary_subject,'credit','gross_amount'),
   (tenant,book,rule_ident,30,discount_subject,'credit','discount_amount');
  return p_context;
  end if;
  if p_phase='receipt_generate' then
  result:=public.fms_payable_settlement_voucher_secure(refund_ident,'refund',false);
  if result->>'status'<>'generated' then raise exception 'Refund receipt FX voucher failed: %',result;end if;
  receipt_voucher:=(result->'voucher_ids'->>0)::uuid;
  return p_context||jsonb_build_object('receipt_voucher_id',receipt_voucher,'receipt_voucher_ids',result->'voucher_ids');
  end if;
  if p_phase='receipt_check' then
  if not exists(select 1 from public.fms_voucher_line where voucher_id=receipt_voucher and subject_id=refund_subject and currency_id=(p_context->>'currency_id')::uuid and exchange_rate=refund_rate)
   or exists(select 1 from public.fms_voucher_line where voucher_id in(select value::uuid from jsonb_array_elements_text(p_context->'receipt_voucher_ids')) and subject_id=discount_subject) then
   raise exception 'Receipt voucher lost its own original currency or recognized unearned expiry as income';
  end if;
  blocked:=false;
  begin perform public.fms_act_payable_settlement_secure(array[refund_ident],'cancel_payment','已制证不得取消到账');exception when check_violation then blocked:=true;end;
  if not blocked then raise exception 'Posted refund receipt could be cancelled';end if;
  end if;
 end if;
 return jsonb_build_object('status','passed','cross_currency',p_cross,'payment_original',p_context->'payment_original_total','refund_original',p_context->'refund_original_total',
  'payment_base',p_context->'payment_base_total','refund_base',p_context->'refund_base_total',
  'exchange_gain',(p_context->>'refund_base_total')::numeric-(p_context->>'payment_base_total')::numeric);
end $test$;

select pg_temp.check_payable_refund_fx(1,1);
select pg_temp.check_payable_refund_fx(1,2);
select pg_temp.check_payable_refund_fx(1,3);
select pg_temp.check_payable_refund_fx(1,4);
select pg_temp.check_payable_refund_fx(1,5);
select pg_temp.check_payable_refund_fx(1,6);
select pg_temp.check_payable_refund_fx(1,7);
select pg_temp.check_payable_refund_fx(2,1);
select pg_temp.check_payable_refund_fx(2,2);
select pg_temp.check_payable_refund_fx(2,3);
select pg_temp.check_payable_refund_fx(2,4);
select pg_temp.check_payable_refund_fx(2,5);
select pg_temp.check_payable_refund_fx(2,6);
select pg_temp.check_payable_refund_fx(2,7);
select pg_temp.check_payable_refund_fx(3,1);
select pg_temp.check_payable_refund_fx(3,2);
select pg_temp.check_payable_refund_fx(3,3);
select pg_temp.check_payable_refund_fx(3,4);
select pg_temp.check_payable_refund_fx(3,5);
select pg_temp.check_payable_refund_fx(3,6);
select pg_temp.check_payable_refund_fx(3,7);
select pg_temp.check_payable_refund_fx(4,1);
select pg_temp.check_payable_refund_fx(4,2);
select pg_temp.check_payable_refund_fx(4,3);
select pg_temp.check_payable_refund_fx(4,4);
select pg_temp.check_payable_refund_fx(4,5);
select pg_temp.check_payable_refund_fx(4,6);
select pg_temp.check_payable_refund_fx(4,7);
select pg_temp.check_payable_refund_fx(5,1);
select pg_temp.check_payable_refund_fx(5,2);
select pg_temp.check_payable_refund_fx(5,3);
select pg_temp.check_payable_refund_fx(5,4);
select pg_temp.check_payable_refund_fx(5,5);
select pg_temp.check_payable_refund_fx(5,6);
select pg_temp.check_payable_refund_fx(5,7);
select pg_temp.check_payable_refund_fx(6,1);
select pg_temp.check_payable_refund_fx(6,2);
select pg_temp.check_payable_refund_fx(6,3);
select pg_temp.check_payable_refund_fx(6,4);
select pg_temp.check_payable_refund_fx(6,5);
select pg_temp.check_payable_refund_fx(6,6);
select pg_temp.check_payable_refund_fx(6,7);
select pg_temp.check_payable_refund_fx(7,1);
select pg_temp.check_payable_refund_fx(7,2);
select pg_temp.check_payable_refund_fx(7,3);
select pg_temp.check_payable_refund_fx(7,4);
select pg_temp.check_payable_refund_fx(7,5);
select pg_temp.check_payable_refund_fx(7,6);
select pg_temp.check_payable_refund_fx(7,7);
select pg_temp.check_payable_refund_fx(1,1);
select pg_temp.check_payable_refund_fx(1,2);
select pg_temp.check_payable_refund_fx(1,3);
select pg_temp.check_payable_refund_fx(1,4);
select pg_temp.check_payable_refund_fx(1,5);
select pg_temp.check_payable_refund_fx(1,6);
select set_config('test.payable_fx_refund_context',pg_temp.check_payable_refund_fx(1,7)::text,true);
select set_config('test.payable_fx_refund_context',pg_temp.check_payable_refund_fx_matching(current_setting('test.payable_fx_refund_context')::jsonb,false,'prepare')::text,true);
select set_config('test.payable_fx_refund_context',pg_temp.check_payable_refund_fx_matching(current_setting('test.payable_fx_refund_context')::jsonb,false,'match')::text,true);
select set_config('test.payable_fx_refund_context',pg_temp.check_payable_refund_fx_matching(current_setting('test.payable_fx_refund_context')::jsonb,false,'writeoff_config')::text,true);
select set_config('test.payable_fx_refund_context',pg_temp.check_payable_refund_fx_matching(current_setting('test.payable_fx_refund_context')::jsonb,false,'writeoff_preview')::text,true);
select set_config('test.payable_fx_refund_context',pg_temp.check_payable_refund_fx_matching(current_setting('test.payable_fx_refund_context')::jsonb,false,'writeoff_generate')::text,true);
select set_config('test.payable_fx_refund_context',pg_temp.check_payable_refund_fx_matching(current_setting('test.payable_fx_refund_context')::jsonb,false,'writeoff_check')::text,true);
select set_config('test.payable_fx_refund_context',pg_temp.check_payable_refund_fx_matching(current_setting('test.payable_fx_refund_context')::jsonb,false,'writeoff_replay')::text,true);
select set_config('test.payable_fx_refund_context',pg_temp.check_payable_refund_fx_matching(current_setting('test.payable_fx_refund_context')::jsonb,false,'writeoff_reverse_guard')::text,true);
select set_config('test.payable_fx_refund_context',pg_temp.check_payable_refund_fx_matching(current_setting('test.payable_fx_refund_context')::jsonb,false,'receipt_config')::text,true);
select set_config('test.payable_fx_refund_context',pg_temp.check_payable_refund_fx_matching(current_setting('test.payable_fx_refund_context')::jsonb,false,'receipt_generate')::text,true);
select pg_temp.check_payable_refund_fx_matching(current_setting('test.payable_fx_refund_context')::jsonb,false,'receipt_check');
select pg_temp.check_payable_refund_fx(2,1);
select pg_temp.check_payable_refund_fx(2,2);
select pg_temp.check_payable_refund_fx(2,3);
select pg_temp.check_payable_refund_fx(2,4);
select pg_temp.check_payable_refund_fx(2,5);
select pg_temp.check_payable_refund_fx(2,6);
select set_config('test.payable_fx_refund_context',pg_temp.check_payable_refund_fx(2,7)::text,true);
select set_config('test.payable_fx_refund_context',pg_temp.check_payable_refund_fx_matching(current_setting('test.payable_fx_refund_context')::jsonb,false,'prepare')::text,true);
select set_config('test.payable_fx_refund_context',pg_temp.check_payable_refund_fx_matching(current_setting('test.payable_fx_refund_context')::jsonb,false,'match')::text,true);
select set_config('test.payable_fx_refund_context',pg_temp.check_payable_refund_fx_matching(current_setting('test.payable_fx_refund_context')::jsonb,false,'writeoff_config')::text,true);
select set_config('test.payable_fx_refund_context',pg_temp.check_payable_refund_fx_matching(current_setting('test.payable_fx_refund_context')::jsonb,false,'writeoff_preview')::text,true);
select set_config('test.payable_fx_refund_context',pg_temp.check_payable_refund_fx_matching(current_setting('test.payable_fx_refund_context')::jsonb,false,'writeoff_generate')::text,true);
select set_config('test.payable_fx_refund_context',pg_temp.check_payable_refund_fx_matching(current_setting('test.payable_fx_refund_context')::jsonb,false,'writeoff_check')::text,true);
select set_config('test.payable_fx_refund_context',pg_temp.check_payable_refund_fx_matching(current_setting('test.payable_fx_refund_context')::jsonb,false,'writeoff_replay')::text,true);
select set_config('test.payable_fx_refund_context',pg_temp.check_payable_refund_fx_matching(current_setting('test.payable_fx_refund_context')::jsonb,false,'writeoff_reverse_guard')::text,true);
select set_config('test.payable_fx_refund_context',pg_temp.check_payable_refund_fx_matching(current_setting('test.payable_fx_refund_context')::jsonb,false,'receipt_config')::text,true);
select set_config('test.payable_fx_refund_context',pg_temp.check_payable_refund_fx_matching(current_setting('test.payable_fx_refund_context')::jsonb,false,'receipt_generate')::text,true);
select pg_temp.check_payable_refund_fx_matching(current_setting('test.payable_fx_refund_context')::jsonb,false,'receipt_check');
select pg_temp.check_payable_refund_fx(3,1);
select pg_temp.check_payable_refund_fx(3,2);
select pg_temp.check_payable_refund_fx(3,3);
select pg_temp.check_payable_refund_fx(3,4);
select pg_temp.check_payable_refund_fx(3,5);
select pg_temp.check_payable_refund_fx(3,6);
select set_config('test.payable_fx_refund_context',pg_temp.check_payable_refund_fx(3,7)::text,true);
select set_config('test.payable_fx_refund_context',pg_temp.check_payable_refund_fx_matching(current_setting('test.payable_fx_refund_context')::jsonb,false,'prepare')::text,true);
select set_config('test.payable_fx_refund_context',pg_temp.check_payable_refund_fx_matching(current_setting('test.payable_fx_refund_context')::jsonb,false,'match')::text,true);
select set_config('test.payable_fx_refund_context',pg_temp.check_payable_refund_fx_matching(current_setting('test.payable_fx_refund_context')::jsonb,false,'writeoff_config')::text,true);
select set_config('test.payable_fx_refund_context',pg_temp.check_payable_refund_fx_matching(current_setting('test.payable_fx_refund_context')::jsonb,false,'writeoff_preview')::text,true);
select set_config('test.payable_fx_refund_context',pg_temp.check_payable_refund_fx_matching(current_setting('test.payable_fx_refund_context')::jsonb,false,'writeoff_generate')::text,true);
select set_config('test.payable_fx_refund_context',pg_temp.check_payable_refund_fx_matching(current_setting('test.payable_fx_refund_context')::jsonb,false,'writeoff_check')::text,true);
select set_config('test.payable_fx_refund_context',pg_temp.check_payable_refund_fx_matching(current_setting('test.payable_fx_refund_context')::jsonb,false,'writeoff_replay')::text,true);
select set_config('test.payable_fx_refund_context',pg_temp.check_payable_refund_fx_matching(current_setting('test.payable_fx_refund_context')::jsonb,false,'writeoff_reverse_guard')::text,true);
select set_config('test.payable_fx_refund_context',pg_temp.check_payable_refund_fx_matching(current_setting('test.payable_fx_refund_context')::jsonb,false,'receipt_config')::text,true);
select set_config('test.payable_fx_refund_context',pg_temp.check_payable_refund_fx_matching(current_setting('test.payable_fx_refund_context')::jsonb,false,'receipt_generate')::text,true);
select pg_temp.check_payable_refund_fx_matching(current_setting('test.payable_fx_refund_context')::jsonb,false,'receipt_check');
select pg_temp.check_payable_refund_fx(1,1);
select pg_temp.check_payable_refund_fx(1,2);
select pg_temp.check_payable_refund_fx(1,3);
select pg_temp.check_payable_refund_fx(1,4);
select pg_temp.check_payable_refund_fx(1,5);
select pg_temp.check_payable_refund_fx(1,6);
select set_config('test.payable_fx_refund_context',pg_temp.check_payable_refund_fx(1,7)::text,true);
select set_config('test.payable_fx_refund_context',pg_temp.check_payable_refund_fx_matching(current_setting('test.payable_fx_refund_context')::jsonb,true,'prepare')::text,true);
select set_config('test.payable_fx_refund_context',pg_temp.check_payable_refund_fx_matching(current_setting('test.payable_fx_refund_context')::jsonb,true,'match')::text,true);
select set_config('test.payable_fx_refund_context',pg_temp.check_payable_refund_fx_matching(current_setting('test.payable_fx_refund_context')::jsonb,true,'writeoff_config')::text,true);
select set_config('test.payable_fx_refund_context',pg_temp.check_payable_refund_fx_matching(current_setting('test.payable_fx_refund_context')::jsonb,true,'writeoff_preview')::text,true);
select set_config('test.payable_fx_refund_context',pg_temp.check_payable_refund_fx_matching(current_setting('test.payable_fx_refund_context')::jsonb,true,'writeoff_generate')::text,true);
select set_config('test.payable_fx_refund_context',pg_temp.check_payable_refund_fx_matching(current_setting('test.payable_fx_refund_context')::jsonb,true,'writeoff_check')::text,true);
select set_config('test.payable_fx_refund_context',pg_temp.check_payable_refund_fx_matching(current_setting('test.payable_fx_refund_context')::jsonb,true,'writeoff_replay')::text,true);
select set_config('test.payable_fx_refund_context',pg_temp.check_payable_refund_fx_matching(current_setting('test.payable_fx_refund_context')::jsonb,true,'writeoff_reverse_guard')::text,true);
select set_config('test.payable_fx_refund_context',pg_temp.check_payable_refund_fx_matching(current_setting('test.payable_fx_refund_context')::jsonb,true,'receipt_config')::text,true);
select set_config('test.payable_fx_refund_context',pg_temp.check_payable_refund_fx_matching(current_setting('test.payable_fx_refund_context')::jsonb,true,'receipt_generate')::text,true);
select pg_temp.check_payable_refund_fx_matching(current_setting('test.payable_fx_refund_context')::jsonb,true,'receipt_check');
rollback;
