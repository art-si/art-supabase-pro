
begin;
set local jit=off;
set local statement_timeout='8s';

create function pg_temp.prepare_auto_payment_fx(p_case integer) returns jsonb
language plpgsql as $prepare$
declare tenant uuid;actor uuid;book uuid;payment_book uuid;currency_ident uuid;fund_ident uuid;supplier uuid;material uuid;unit_ident uuid;
 finance_type uuid;payment_type uuid;purpose_ident uuid;method_ident uuid;scheme_ident uuid;refund_type uuid;refund_purpose uuid;platform_tenant uuid;platform_actor uuid;
 finance jsonb;payment jsonb;refund_document jsonb;finance_ids jsonb:='[]';query_value jsonb;index_value integer;
 primary_currency text:=case when p_case in(2,3,4,8,9) then 'CNY' else 'USD' end;
 payment_currency text:=case when p_case in(8,9) then 'CNY' else 'USD' end;
 primary_rate numeric:=case when p_case in(2,3,4,8,9) then 1 when p_case=6 then 1.4 else 7 end;
 payment_rate numeric:=case when p_case in(8,9) then 1 when p_case=6 then 1.5 else 7.2 end;
 invoice_amount numeric:=case when p_case in(2,4) then 734.4 when p_case=3 then 360 when p_case=5 then 51 when p_case=6 then 0.01 when p_case=7 then 51 when p_case=8 then 1 else 102 end;
 cash_value numeric:=case when p_case=6 then 0.03 when p_case=8 then 2 else 100 end;
 discount_value numeric:=case when p_case=6 then 0 when p_case=8 then 1 else 2 end;
 invoice_count integer:=case when p_case=5 then 2 when p_case in(6,8) then 3 else 1 end;
 mode_value text:=case when p_case in(4,9) then 'same_currency' when p_case=3 then 'book_equivalent' else 'full_pair' end;
 expected_count integer:=case when p_case in(4,9) then 0 else invoice_count end;
begin
 if p_case not between 1 and 12 then raise exception 'Unknown automatic payment FX case';end if;
 select id into tenant from public.sys_tenant where tenant_code='qa-payable-20261022';
 select auth_user_id into actor from public.sys_user where tenant_id=tenant and status='1' and auth_user_id is not null order by id limit 1;
 select id into book from public.fms_account_set where tenant_id=tenant and is_default and status='active' and base_currency_code='CNY';
 if actor is null or book is null then raise exception 'Missing ordinary automatic payment fixtures';end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers','{}',true);
 if app_private.is_platform_super() then raise exception 'Automatic payment test requires ordinary managed permissions';end if;
 if has_function_privilege('authenticated','app_private.payable_payment_allocation(jsonb,jsonb,numeric,numeric)','EXECUTE')
  or has_function_privilege('anon','app_private.payable_payment_allocation(jsonb,jsonb,numeric,numeric)','EXECUTE') then
  raise exception 'Internal payment allocation became directly client executable';
 end if;
 select id into supplier from public.mdm_supplier where tenant_id=tenant order by id limit 1;
 select id,inventory_unit_id into material,unit_ident from public.mdm_material where tenant_id=tenant and inventory_unit_id is not null order by id limit 1;
 select id into finance_type from public.mdm_document_type where tenant_id=tenant and document_type_code='AP_FIN_STANDARD';
 select id into payment_type from public.mdm_document_type where tenant_id=tenant and document_type_code='AP_PAYMENT_PURCHASE';
 select id into purpose_ident from public.mdm_payment_purpose where tenant_id=tenant and code=case when p_case=7 then '202' else '201' end;
 select id into method_ident from public.mdm_settlement_method where tenant_id=tenant and category='cash' and enabled order by id limit 1;
 payment_book:=book;
 if p_case=9 then
  insert into public.fms_account_set(tenant_id,account_set_code,account_set_name,legal_entity_name,base_currency_code,enabled_on,status)
  values(tenant,'AUTO_FX_BOOK_'||upper(left(gen_random_uuid()::text,8)),'自动核销隔离账套回滚夹具','虚构回滚主体','CNY',app_private.payable_business_date(),'active') returning id into payment_book;
 end if;
 insert into public.fms_currency(tenant_id,account_set_id,currency_code,currency_name,is_enabled,is_base)
 values(tenant,payment_book,payment_currency,case when payment_currency='CNY' then '人民币' else '美元' end,true,payment_currency='CNY')
 on conflict(account_set_id,currency_code) do update set is_enabled=true returning id into currency_ident;
 insert into public.fms_fund_account(tenant_id,account_set_id,currency_id,account_code,account_name,account_type,account_no_masked,account_no_fingerprint,opening_balance,online_banking_enabled)
 values(tenant,payment_book,currency_ident,'AUTO_FX_'||upper(left(gen_random_uuid()::text,8)),'自动应付核销回滚虚构现金户','cash','**** QA',md5(gen_random_uuid()::text),10000,false) returning id into fund_ident;
 for index_value in 1..invoice_count loop
  finance:=public.fms_save_purchase_payable_secure(jsonb_build_object('kind','financial','tenant_id',tenant,'document_type_id',finance_type,
   'supplier_id',supplier,'business_date',app_private.payable_business_date(),'currency_code',primary_currency,'exchange_rate',primary_rate,
   'lines',jsonb_build_array(jsonb_build_object('material_id',material,'inventory_unit_id',unit_ident,'quantity',1,'unit_price',invoice_amount,'tax_rate',0))));
  perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'submit');
  perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'approve');
  finance_ids:=finance_ids||jsonb_build_array(finance->>'id');
 end loop;
 payment:=public.fms_save_payable_settlement_secure(jsonb_build_object('kind','payment','tenant_id',tenant,'document_type_id',payment_type,'business_date',app_private.payable_business_date(),
  'account_set_id',payment_book,'currency_code',payment_currency,'exchange_rate',payment_rate,
  'lines',jsonb_build_array(jsonb_build_object('purpose_id',purpose_ident,'supplier_id',supplier,'settlement_method_id',method_ident,
   'fund_account_id',fund_ident,'amount',cash_value,'cash_discount',discount_value))));
 perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'submit');
 perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'approve');
 perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'confirm');
 if p_case=7 then
  select id into refund_purpose from public.mdm_payment_purpose where tenant_id=tenant and business_type='advance_refund' and enabled order by id limit 1;
  select document_type.id into refund_type from public.mdm_document_type document_type join public.sys_menu menu on menu.id=document_type.menu_id
   where document_type.tenant_id=tenant and menu.name='FinancePayableRefund' and document_type.enabled order by document_type.id limit 1;
  refund_document:=public.fms_save_payable_settlement_secure(jsonb_build_object('kind','refund','document_type_id',refund_type,'business_date',app_private.payable_business_date(),'exchange_rate',7.3,
   'lines',jsonb_build_array(jsonb_build_object('refund_payment_line_id',payment->'lines'->0->>'id','purpose_id',refund_purpose,
    'settlement_method_id',method_ident,'fund_account_id',fund_ident,'amount',50,'expired_discount_amount',1))));
  perform public.fms_act_payable_settlement_secure(array[(refund_document->>'id')::uuid],'submit');
  perform public.fms_act_payable_settlement_secure(array[(refund_document->>'id')::uuid],'approve');
  perform public.fms_act_payable_settlement_secure(array[(refund_document->>'id')::uuid],'confirm');
 end if;
 insert into public.fms_payable_writeoff_scheme(tenant_id,code,name,rules,automatic)
 values(tenant,'AUTO_FX_'||upper(left(gen_random_uuid()::text,8)),'自动应付历史本位币回滚方案',
  jsonb_build_array(jsonb_build_object('primary_field','supplier_id','secondary_field','supplier_id','operator','eq','empty_matches',false)),true) returning id into scheme_ident;
 if p_case=10 then
  select id into platform_tenant from public.sys_tenant where builtin_type='platform' order by id limit 1;
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',platform_tenant)::text,true);
 end if;
 if p_case in(11,12) then
  select auth_user_id into platform_actor from public.sys_user where auth_user_id is not null and status='1' and user_roles @>array['R_SUPER'] order by id limit 1;
  perform set_config('request.jwt.claim.sub',platform_actor::text,true);
  if app_private.is_platform_super() is distinct from true then raise exception 'Missing platform-all automatic payment actor';end if;
  if p_case=12 then perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',tenant)::text,true);end if;
 end if;
 query_value:=jsonb_build_object('relation','payable_payment','cross_currency_mode',mode_value,'document_ids',finance_ids||jsonb_build_array(payment->>'id'));
 return jsonb_build_object('case',p_case,'scheme_id',scheme_ident,'query',query_value,'date',app_private.payable_business_date(),'tenant_id',tenant,
  'finance_ids',finance_ids,'payment_id',payment->>'id','payment_line_id',payment->'lines'->0->>'id','currency_id',currency_ident,
  'primary_currency',primary_currency,'secondary_currency',payment_currency,'expected_count',expected_count,
  'expected_amount',case when expected_count=0 then 0 else invoice_amount*invoice_count end,
  'expected_face',case when expected_count=0 then 0 when p_case=3 then 50 when p_case=7 then 51 else cash_value+discount_value end,
  'expected_cash',case when expected_count=0 then 0 when p_case=3 then 49.02 when p_case=7 then 50 else cash_value end,
  'expected_discount',case when expected_count=0 then 0 when p_case=3 then 0.98 when p_case=7 then 1 else discount_value end,
  'expected_primary_base',case when expected_count=0 then 0 else round(invoice_amount*primary_rate,2)*invoice_count end,
  'expected_cash_base',case when expected_count=0 then 0 when p_case=3 then 352.94 when p_case=7 then 360 else round(cash_value*payment_rate,2) end,
  'expected_discount_base',case when expected_count=0 then 0 when p_case=3 then 7.06 when p_case=7 then 7.2 else round(discount_value*payment_rate,2) end,
  'ledger_count',(select count(*) from public.fms_fund_ledger_entry));
end $prepare$;

create function pg_temp.assert_auto_payment_fx(p_context jsonb,p_result jsonb,p_executed boolean default false) returns void
language plpgsql as $assert$
declare totals record;item jsonb;matched public.fms_payable_writeoff_record;source_state jsonb;base_state jsonb;
begin
 if(p_result->>'record_count')::integer<>(p_context->>'expected_count')::integer then raise exception 'Automatic AP matching offered unexpected pairs';end if;
 select coalesce(sum((entry->>'amount')::numeric),0) amount,coalesce(sum((entry->>'payment_face_amount')::numeric),0) face,
  coalesce(sum((entry->>'payment_amount')::numeric),0) cash,coalesce(sum((entry->>'cash_discount_amount')::numeric),0) discount,
  coalesce(sum((entry->>'payable_base_amount')::numeric),0) primary_base,coalesce(sum((entry->>'payment_base_amount')::numeric),0) cash_base,
  coalesce(sum((entry->>'cash_discount_base_amount')::numeric),0) discount_base into totals from jsonb_array_elements(p_result->'items') entry;
 if totals.amount<>(p_context->>'expected_amount')::numeric or totals.face<>(p_context->>'expected_face')::numeric
  or totals.cash<>(p_context->>'expected_cash')::numeric or totals.discount<>(p_context->>'expected_discount')::numeric
  or totals.primary_base<>(p_context->>'expected_primary_base')::numeric or totals.cash_base<>(p_context->>'expected_cash_base')::numeric
  or totals.discount_base<>(p_context->>'expected_discount_base')::numeric then
  raise exception 'Automatic AP preview lost original amounts, discount ratios or historic base residuals: %',to_jsonb(totals);
 end if;
 if(p_result->>'total_amount')::numeric<>totals.amount then raise exception 'Automatic AP total mixed original currencies or base money';end if;
 if p_executed then
  for item in select value from jsonb_array_elements(p_result->'record_ids') loop
   select * into matched from public.fms_payable_writeoff_record where id=(item#>>'{}')::uuid;
   if matched.tenant_id is distinct from(p_context->>'tenant_id')::uuid or matched.actor is distinct from auth.uid() then
    raise exception 'Automatic AP writeoff changed its inherited tenant or authenticated actor';
   end if;
   if not exists(select 1 from jsonb_array_elements(p_result->'items') entry where entry->>'payable_id'=matched.payable_id::text
    and entry->>'payment_line_id'=matched.payment_line_id::text and(entry->>'amount')::numeric=matched.amount
    and(entry->>'payment_face_amount')::numeric=matched.payment_face_amount and(entry->>'payment_amount')::numeric=matched.payment_amount
    and(entry->>'cash_discount_amount')::numeric=matched.cash_discount_amount and(entry->>'payable_base_amount')::numeric=matched.payable_base_amount
    and(entry->>'payment_base_amount')::numeric=matched.payment_base_amount and(entry->>'cash_discount_base_amount')::numeric=matched.cash_discount_base_amount
    and(entry->>'needs_voucher')::boolean=matched.needs_voucher) then raise exception 'Executed AP allocation differs from the confirmed preview';end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(p_context->'finance_ids') entry where(app_private.payable_writeoff_source_values((entry#>>'{}')::uuid)->>'unpaid_amount')::numeric<>0) then
   raise exception 'Automatic AP allocation did not close its selected original debts';end if;
  source_state:=app_private.payable_payment_line_state((p_context->>'payment_line_id')::uuid);
  if(p_context->>'case')::integer=3 then
   if(source_state->>'available_settlement_face')::numeric<>52 then raise exception 'Book-equivalent AP allocation erased remaining payment face';end if;
  elsif(source_state->>'available_settlement_face')::numeric<>0 then raise exception 'Automatic AP allocation retained unspent eligible face';end if;
  if(p_context->>'case')::integer=7 then
   base_state:=app_private.payable_payment_base_balances((p_context->>'payment_line_id')::uuid);
   if(base_state->>'expired_base')::numeric<>7.2 or(base_state->>'cash_base_remaining')::numeric<>360 then raise exception 'Automatic AP spent expired discount or refund-reserved principal value';end if;
  end if;
 end if;
 if(select count(*) from public.fms_fund_ledger_entry)<>(p_context->>'ledger_count')::bigint then raise exception 'Automatic AP matching generated another cash movement';end if;
end $assert$;

select set_config('test.fx.auto.payment',pg_temp.prepare_auto_payment_fx(1)::text,true);
select set_config('test.fx.auto.payment.plan',public.fms_auto_payable_writeoff_secure(
 (current_setting('test.fx.auto.payment')::jsonb->>'scheme_id')::uuid,(current_setting('test.fx.auto.payment')::jsonb->>'date')::date,
 current_setting('test.fx.auto.payment')::jsonb->'query',false)::text,true);
select pg_temp.assert_auto_payment_fx(current_setting('test.fx.auto.payment')::jsonb,current_setting('test.fx.auto.payment.plan')::jsonb,false);
do $master$
declare context_value jsonb:=current_setting('test.fx.auto.payment')::jsonb;
begin
 insert into public.fms_exchange_rate(tenant_id,account_set_id,currency_id,rate_date,rate_type,direct_rate)
 select tenant_id,account_set_id,id,(context_value->>'date')::date,'spot',11 from public.fms_currency where id=(context_value->>'currency_id')::uuid
 on conflict(account_set_id,currency_id,rate_date,rate_type) do update set direct_rate=excluded.direct_rate;
 perform set_config('test.fx.auto.payment.old_token',current_setting('test.fx.auto.payment.plan')::jsonb->>'plan_token',true);
end $master$;
select set_config('test.fx.auto.payment.plan',public.fms_auto_payable_writeoff_secure(
 (current_setting('test.fx.auto.payment')::jsonb->>'scheme_id')::uuid,(current_setting('test.fx.auto.payment')::jsonb->>'date')::date,
 current_setting('test.fx.auto.payment')::jsonb->'query',false)::text,true);
do $recorded_rate$
begin
 if current_setting('test.fx.auto.payment.old_token') is distinct from current_setting('test.fx.auto.payment.plan')::jsonb->>'plan_token' then
  raise exception 'Current exchange rate repriced an AP preview based on stored historical rates';
 end if;
end $recorded_rate$;
select set_config('test.fx.auto.payment.result',public.fms_auto_payable_writeoff_secure(
 (current_setting('test.fx.auto.payment')::jsonb->>'scheme_id')::uuid,(current_setting('test.fx.auto.payment')::jsonb->>'date')::date,
 current_setting('test.fx.auto.payment')::jsonb->'query',true,current_setting('test.fx.auto.payment.plan')::jsonb->>'plan_token')::text,true);
select pg_temp.assert_auto_payment_fx(current_setting('test.fx.auto.payment')::jsonb,current_setting('test.fx.auto.payment.result')::jsonb,true);

select set_config('test.fx.auto.payment',pg_temp.prepare_auto_payment_fx(2)::text,true);
select set_config('test.fx.auto.payment.plan',public.fms_auto_payable_writeoff_secure(
 (current_setting('test.fx.auto.payment')::jsonb->>'scheme_id')::uuid,(current_setting('test.fx.auto.payment')::jsonb->>'date')::date,
 current_setting('test.fx.auto.payment')::jsonb->'query',false)::text,true);
select pg_temp.assert_auto_payment_fx(current_setting('test.fx.auto.payment')::jsonb,current_setting('test.fx.auto.payment.plan')::jsonb,false);
select public.fms_act_payable_settlement_secure(array[(current_setting('test.fx.auto.payment')::jsonb->>'payment_id')::uuid],'cancel_payment','自动预览执行身份回归');
select public.fms_act_payable_settlement_secure(array[(current_setting('test.fx.auto.payment')::jsonb->>'payment_id')::uuid],'confirm');
do $stale$
declare context_value jsonb:=current_setting('test.fx.auto.payment')::jsonb;blocked boolean:=false;
begin
 begin perform public.fms_auto_payable_writeoff_secure((context_value->>'scheme_id')::uuid,(context_value->>'date')::date,context_value->'query',true,current_setting('test.fx.auto.payment.plan')::jsonb->>'plan_token');
 exception when serialization_failure then blocked:=true;end;
 if not blocked then raise exception 'Reconfirmed payment reused an old AP execution preview';end if;
 perform set_config('test.fx.auto.payment',(context_value||jsonb_build_object('ledger_count',(select count(*) from public.fms_fund_ledger_entry)))::text,true);
end $stale$;
select set_config('test.fx.auto.payment.plan',public.fms_auto_payable_writeoff_secure(
 (current_setting('test.fx.auto.payment')::jsonb->>'scheme_id')::uuid,(current_setting('test.fx.auto.payment')::jsonb->>'date')::date,
 current_setting('test.fx.auto.payment')::jsonb->'query',false)::text,true);
select set_config('test.fx.auto.payment.result',public.fms_auto_payable_writeoff_secure(
 (current_setting('test.fx.auto.payment')::jsonb->>'scheme_id')::uuid,(current_setting('test.fx.auto.payment')::jsonb->>'date')::date,
 current_setting('test.fx.auto.payment')::jsonb->'query',true,current_setting('test.fx.auto.payment.plan')::jsonb->>'plan_token')::text,true);
select pg_temp.assert_auto_payment_fx(current_setting('test.fx.auto.payment')::jsonb,current_setting('test.fx.auto.payment.result')::jsonb,true);

select set_config('test.fx.auto.payment',pg_temp.prepare_auto_payment_fx(3)::text,true);
select set_config('test.fx.auto.payment.plan',public.fms_auto_payable_writeoff_secure(
 (current_setting('test.fx.auto.payment')::jsonb->>'scheme_id')::uuid,(current_setting('test.fx.auto.payment')::jsonb->>'date')::date,
 current_setting('test.fx.auto.payment')::jsonb->'query',false)::text,true);
select pg_temp.assert_auto_payment_fx(current_setting('test.fx.auto.payment')::jsonb,current_setting('test.fx.auto.payment.plan')::jsonb,false);
select set_config('test.fx.auto.payment.result',public.fms_auto_payable_writeoff_secure(
 (current_setting('test.fx.auto.payment')::jsonb->>'scheme_id')::uuid,(current_setting('test.fx.auto.payment')::jsonb->>'date')::date,
 current_setting('test.fx.auto.payment')::jsonb->'query',true,current_setting('test.fx.auto.payment.plan')::jsonb->>'plan_token')::text,true);
select pg_temp.assert_auto_payment_fx(current_setting('test.fx.auto.payment')::jsonb,current_setting('test.fx.auto.payment.result')::jsonb,true);

select set_config('test.fx.auto.payment',pg_temp.prepare_auto_payment_fx(4)::text,true);
select set_config('test.fx.auto.payment.plan',public.fms_auto_payable_writeoff_secure(
 (current_setting('test.fx.auto.payment')::jsonb->>'scheme_id')::uuid,(current_setting('test.fx.auto.payment')::jsonb->>'date')::date,
 current_setting('test.fx.auto.payment')::jsonb->'query',false)::text,true);
select pg_temp.assert_auto_payment_fx(current_setting('test.fx.auto.payment')::jsonb,current_setting('test.fx.auto.payment.plan')::jsonb,false);
do $no_match$
declare context_value jsonb:=current_setting('test.fx.auto.payment')::jsonb;blocked boolean:=false;
begin
 begin perform public.fms_auto_payable_writeoff_secure((context_value->>'scheme_id')::uuid,(context_value->>'date')::date,context_value->'query',true,current_setting('test.fx.auto.payment.plan')::jsonb->>'plan_token');
 exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Automatic matching executed a forbidden cross-currency or cross-book pair';end if;
end $no_match$;

select set_config('test.fx.auto.payment',pg_temp.prepare_auto_payment_fx(5)::text,true);
select set_config('test.fx.auto.payment.plan',public.fms_auto_payable_writeoff_secure(
 (current_setting('test.fx.auto.payment')::jsonb->>'scheme_id')::uuid,(current_setting('test.fx.auto.payment')::jsonb->>'date')::date,
 current_setting('test.fx.auto.payment')::jsonb->'query',false)::text,true);
select pg_temp.assert_auto_payment_fx(current_setting('test.fx.auto.payment')::jsonb,current_setting('test.fx.auto.payment.plan')::jsonb,false);
select set_config('test.fx.auto.payment.result',public.fms_auto_payable_writeoff_secure(
 (current_setting('test.fx.auto.payment')::jsonb->>'scheme_id')::uuid,(current_setting('test.fx.auto.payment')::jsonb->>'date')::date,
 current_setting('test.fx.auto.payment')::jsonb->'query',true,current_setting('test.fx.auto.payment.plan')::jsonb->>'plan_token')::text,true);
select pg_temp.assert_auto_payment_fx(current_setting('test.fx.auto.payment')::jsonb,current_setting('test.fx.auto.payment.result')::jsonb,true);

select set_config('test.fx.auto.payment',pg_temp.prepare_auto_payment_fx(6)::text,true);
select set_config('test.fx.auto.payment.plan',public.fms_auto_payable_writeoff_secure(
 (current_setting('test.fx.auto.payment')::jsonb->>'scheme_id')::uuid,(current_setting('test.fx.auto.payment')::jsonb->>'date')::date,
 current_setting('test.fx.auto.payment')::jsonb->'query',false)::text,true);
select pg_temp.assert_auto_payment_fx(current_setting('test.fx.auto.payment')::jsonb,current_setting('test.fx.auto.payment.plan')::jsonb,false);
select set_config('test.fx.auto.payment.result',public.fms_auto_payable_writeoff_secure(
 (current_setting('test.fx.auto.payment')::jsonb->>'scheme_id')::uuid,(current_setting('test.fx.auto.payment')::jsonb->>'date')::date,
 current_setting('test.fx.auto.payment')::jsonb->'query',true,current_setting('test.fx.auto.payment.plan')::jsonb->>'plan_token')::text,true);
select pg_temp.assert_auto_payment_fx(current_setting('test.fx.auto.payment')::jsonb,current_setting('test.fx.auto.payment.result')::jsonb,true);

select set_config('test.fx.auto.payment',pg_temp.prepare_auto_payment_fx(7)::text,true);
select set_config('test.fx.auto.payment.plan',public.fms_auto_payable_writeoff_secure(
 (current_setting('test.fx.auto.payment')::jsonb->>'scheme_id')::uuid,(current_setting('test.fx.auto.payment')::jsonb->>'date')::date,
 current_setting('test.fx.auto.payment')::jsonb->'query',false)::text,true);
select pg_temp.assert_auto_payment_fx(current_setting('test.fx.auto.payment')::jsonb,current_setting('test.fx.auto.payment.plan')::jsonb,false);
select set_config('test.fx.auto.payment.result',public.fms_auto_payable_writeoff_secure(
 (current_setting('test.fx.auto.payment')::jsonb->>'scheme_id')::uuid,(current_setting('test.fx.auto.payment')::jsonb->>'date')::date,
 current_setting('test.fx.auto.payment')::jsonb->'query',true,current_setting('test.fx.auto.payment.plan')::jsonb->>'plan_token')::text,true);
select pg_temp.assert_auto_payment_fx(current_setting('test.fx.auto.payment')::jsonb,current_setting('test.fx.auto.payment.result')::jsonb,true);

select set_config('test.fx.auto.payment',pg_temp.prepare_auto_payment_fx(8)::text,true);
select set_config('test.fx.auto.payment.plan',public.fms_auto_payable_writeoff_secure(
 (current_setting('test.fx.auto.payment')::jsonb->>'scheme_id')::uuid,(current_setting('test.fx.auto.payment')::jsonb->>'date')::date,
 current_setting('test.fx.auto.payment')::jsonb->'query',false)::text,true);
select pg_temp.assert_auto_payment_fx(current_setting('test.fx.auto.payment')::jsonb,current_setting('test.fx.auto.payment.plan')::jsonb,false);
select set_config('test.fx.auto.payment.result',public.fms_auto_payable_writeoff_secure(
 (current_setting('test.fx.auto.payment')::jsonb->>'scheme_id')::uuid,(current_setting('test.fx.auto.payment')::jsonb->>'date')::date,
 current_setting('test.fx.auto.payment')::jsonb->'query',true,current_setting('test.fx.auto.payment.plan')::jsonb->>'plan_token')::text,true);
select pg_temp.assert_auto_payment_fx(current_setting('test.fx.auto.payment')::jsonb,current_setting('test.fx.auto.payment.result')::jsonb,true);

select set_config('test.fx.auto.payment',pg_temp.prepare_auto_payment_fx(9)::text,true);
select set_config('test.fx.auto.payment.plan',public.fms_auto_payable_writeoff_secure(
 (current_setting('test.fx.auto.payment')::jsonb->>'scheme_id')::uuid,(current_setting('test.fx.auto.payment')::jsonb->>'date')::date,
 current_setting('test.fx.auto.payment')::jsonb->'query',false)::text,true);
select pg_temp.assert_auto_payment_fx(current_setting('test.fx.auto.payment')::jsonb,current_setting('test.fx.auto.payment.plan')::jsonb,false);
do $no_match$
declare context_value jsonb:=current_setting('test.fx.auto.payment')::jsonb;blocked boolean:=false;
begin
 begin perform public.fms_auto_payable_writeoff_secure((context_value->>'scheme_id')::uuid,(context_value->>'date')::date,context_value->'query',true,current_setting('test.fx.auto.payment.plan')::jsonb->>'plan_token');
 exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Automatic matching executed a forbidden cross-currency or cross-book pair';end if;
end $no_match$;

select set_config('test.fx.auto.payment',pg_temp.prepare_auto_payment_fx(10)::text,true);
select set_config('test.fx.auto.payment.plan',public.fms_auto_payable_writeoff_secure(
 (current_setting('test.fx.auto.payment')::jsonb->>'scheme_id')::uuid,(current_setting('test.fx.auto.payment')::jsonb->>'date')::date,
 current_setting('test.fx.auto.payment')::jsonb->'query',false)::text,true);
select pg_temp.assert_auto_payment_fx(current_setting('test.fx.auto.payment')::jsonb,current_setting('test.fx.auto.payment.plan')::jsonb,false);
select set_config('test.fx.auto.payment.result',public.fms_auto_payable_writeoff_secure(
 (current_setting('test.fx.auto.payment')::jsonb->>'scheme_id')::uuid,(current_setting('test.fx.auto.payment')::jsonb->>'date')::date,
 current_setting('test.fx.auto.payment')::jsonb->'query',true,current_setting('test.fx.auto.payment.plan')::jsonb->>'plan_token')::text,true);
select pg_temp.assert_auto_payment_fx(current_setting('test.fx.auto.payment')::jsonb,current_setting('test.fx.auto.payment.result')::jsonb,true);
select set_config('test.fx.auto.payment',pg_temp.prepare_auto_payment_fx(11)::text,true);
select set_config('test.fx.auto.payment.plan',public.fms_auto_payable_writeoff_secure(
 (current_setting('test.fx.auto.payment')::jsonb->>'scheme_id')::uuid,(current_setting('test.fx.auto.payment')::jsonb->>'date')::date,
 current_setting('test.fx.auto.payment')::jsonb->'query',false)::text,true);
select pg_temp.assert_auto_payment_fx(current_setting('test.fx.auto.payment')::jsonb,current_setting('test.fx.auto.payment.plan')::jsonb,false);

select set_config('test.fx.auto.payment.result',public.fms_auto_payable_writeoff_secure(
 (current_setting('test.fx.auto.payment')::jsonb->>'scheme_id')::uuid,(current_setting('test.fx.auto.payment')::jsonb->>'date')::date,
 current_setting('test.fx.auto.payment')::jsonb->'query',true,current_setting('test.fx.auto.payment.plan')::jsonb->>'plan_token')::text,true);
select pg_temp.assert_auto_payment_fx(current_setting('test.fx.auto.payment')::jsonb,current_setting('test.fx.auto.payment.result')::jsonb,true);

select set_config('test.fx.auto.payment',pg_temp.prepare_auto_payment_fx(12)::text,true);
select set_config('test.fx.auto.payment.plan',public.fms_auto_payable_writeoff_secure(
 (current_setting('test.fx.auto.payment')::jsonb->>'scheme_id')::uuid,(current_setting('test.fx.auto.payment')::jsonb->>'date')::date,
 current_setting('test.fx.auto.payment')::jsonb->'query',false)::text,true);
select pg_temp.assert_auto_payment_fx(current_setting('test.fx.auto.payment')::jsonb,current_setting('test.fx.auto.payment.plan')::jsonb,false);

select set_config('test.fx.auto.payment.result',public.fms_auto_payable_writeoff_secure(
 (current_setting('test.fx.auto.payment')::jsonb->>'scheme_id')::uuid,(current_setting('test.fx.auto.payment')::jsonb->>'date')::date,
 current_setting('test.fx.auto.payment')::jsonb->'query',true,current_setting('test.fx.auto.payment.plan')::jsonb->>'plan_token')::text,true);
select pg_temp.assert_auto_payment_fx(current_setting('test.fx.auto.payment')::jsonb,current_setting('test.fx.auto.payment.result')::jsonb,true);
select set_config('test.fx.auto.payment.usd',pg_temp.prepare_auto_payment_fx(1)::text,true);
select set_config('test.fx.auto.payment.cny',pg_temp.prepare_auto_payment_fx(8)::text,true);
do $mixed_query$
declare dollar jsonb:=current_setting('test.fx.auto.payment.usd')::jsonb;yuan jsonb:=current_setting('test.fx.auto.payment.cny')::jsonb;
begin
 perform set_config('test.fx.auto.payment.mixed_query',jsonb_build_object('relation','payable_payment','cross_currency_mode','same_currency',
  'document_ids',(dollar->'finance_ids')||(yuan->'finance_ids')||jsonb_build_array(dollar->>'payment_id',yuan->>'payment_id'))::text,true);
end $mixed_query$;
select set_config('test.fx.auto.payment.mixed_plan',public.fms_auto_payable_writeoff_secure(
 (current_setting('test.fx.auto.payment.usd')::jsonb->>'scheme_id')::uuid,(current_setting('test.fx.auto.payment.usd')::jsonb->>'date')::date,
 current_setting('test.fx.auto.payment.mixed_query')::jsonb,false)::text,true);
do $mixed_totals$
declare plan jsonb:=current_setting('test.fx.auto.payment.mixed_plan')::jsonb;
begin
 if plan->>'total_amount' is not null or(plan->>'record_count')::integer<>4 or jsonb_array_length(plan->'currency_totals')<>2
  or not exists(select 1 from jsonb_array_elements(plan->'currency_totals') entry where entry->>'currency_code'='USD' and(entry->>'amount')::numeric=102)
  or not exists(select 1 from jsonb_array_elements(plan->'currency_totals') entry where entry->>'currency_code'='CNY' and(entry->>'amount')::numeric=3) then
  raise exception 'Automatic AP preview mixed dollar and yuan original totals';
 end if;
end $mixed_totals$;
select set_config('test.fx.auto.payment.mixed_result',public.fms_auto_payable_writeoff_secure(
 (current_setting('test.fx.auto.payment.usd')::jsonb->>'scheme_id')::uuid,(current_setting('test.fx.auto.payment.usd')::jsonb->>'date')::date,
 current_setting('test.fx.auto.payment.mixed_query')::jsonb,true,current_setting('test.fx.auto.payment.mixed_plan')::jsonb->>'plan_token')::text,true);
do $mixed_execution$
declare result jsonb:=current_setting('test.fx.auto.payment.mixed_result')::jsonb;context_value jsonb:=current_setting('test.fx.auto.payment.cny')::jsonb;
begin
 if(result->>'executed')::boolean is distinct from true or jsonb_array_length(result->'record_ids')<>4
  or(select count(*) from public.fms_fund_ledger_entry)<>(context_value->>'ledger_count')::bigint then
  raise exception 'Mixed-currency automatic AP execution lost a pair or generated another fund movement';
 end if;
end $mixed_execution$;
rollback;

