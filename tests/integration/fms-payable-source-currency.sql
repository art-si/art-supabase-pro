begin;
set local jit=off;
set local statement_timeout='8s';

create function pg_temp.check_payable_source_currency(p_case integer) returns jsonb
language plpgsql as $test$
declare
 tenant uuid;
 actor uuid;
 book uuid;
 currency_ident uuid;
 supplier uuid;
 payee uuid;
 material uuid;
 unit_ident uuid;
 finance_type uuid;
 fund_ident uuid;
 finance jsonb;
 application jsonb;
 payment jsonb;
 result jsonb;
 source_option jsonb;
 writeoff_ident uuid;
 source_date date:=app_private.payable_business_date()-1;
 invoice_rate numeric:=7;
 payment_rate numeric:=7.2;
 current_rate numeric:=9;
 face_value numeric:=102;
 cash_value numeric:=100;
 discount_value numeric:=2;
begin
 if p_case not in(1,2) then raise exception 'Unsupported source currency case';end if;
 face_value:=face_value*p_case;cash_value:=cash_value*p_case;discount_value:=discount_value*p_case;
 select id into tenant from public.sys_tenant where tenant_code='qa-payable-20261022';
 select auth_user_id into actor from public.sys_user where tenant_id=tenant and status='1' and auth_user_id is not null order by id limit 1;
 select id into book from public.fms_account_set where tenant_id=tenant and is_default and status='active' and base_currency_code='CNY';
 if actor is null or book is null then raise exception 'Missing ordinary source-currency fixtures';end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers','{}',true);
 if app_private.is_platform_super() then raise exception 'Source currency must use ordinary business permissions';end if;
 select id into supplier from public.mdm_supplier where tenant_id=tenant order by id limit 1;
 select id into payee from public.mdm_supplier where tenant_id=tenant and id<>supplier order by id limit 1;
 if payee is null then raise exception 'Need two suppliers for distinct liability and payee verification';end if;
 select id,inventory_unit_id into material,unit_ident from public.mdm_material where tenant_id=tenant and inventory_unit_id is not null order by id limit 1;
 select id into finance_type from public.mdm_document_type where tenant_id=tenant and document_type_code='AP_FIN_STANDARD';
 insert into public.fms_currency(tenant_id,account_set_id,currency_code,currency_name,is_enabled)
 values(tenant,book,'USD','美元',true) on conflict(account_set_id,currency_code) do update set is_enabled=true returning id into currency_ident;
 insert into public.fms_exchange_rate(tenant_id,account_set_id,currency_id,rate_date,rate_type,direct_rate)
 values(tenant,book,currency_ident,app_private.payable_business_date(),'spot',current_rate)
 on conflict(account_set_id,currency_id,rate_date,rate_type) do update set direct_rate=excluded.direct_rate;
 insert into public.fms_fund_account(tenant_id,account_set_id,currency_id,account_code,account_name,account_type,account_no_masked,account_no_fingerprint,opening_balance,online_banking_enabled)
 values(tenant,book,currency_ident,'FX_SOURCE_'||upper(left(gen_random_uuid()::text,8)),
  '同源外币流程回滚虚构现金户','cash','**** QA',md5(gen_random_uuid()::text),10000,false) returning id into fund_ident;
 finance:=public.fms_save_purchase_payable_secure(jsonb_build_object('kind','financial','tenant_id',tenant,'document_type_id',finance_type,
  'business_date',source_date,'supplier_id',supplier,'payee_supplier_id',payee,'currency_code','USD','exchange_rate',invoice_rate,
  'lines',jsonb_build_array(jsonb_build_object('material_id',material,'inventory_unit_id',unit_ident,'quantity',1,'unit_price',face_value,'tax_rate',0))));
 perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'submit');
 perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'approve');
 select option into source_option from jsonb_array_elements(public.fms_payable_settlement_options_secure('application',tenant)->'payable') option
 where option->>'id'=finance->>'id';
 if source_option is null or source_option->>'currency_code' is distinct from 'USD' or source_option->>'base_currency_code' is distinct from 'CNY'
  or(source_option->>'account_set_id')::uuid is distinct from book or nullif(source_option->>'account_set_name','') is null
  or(source_option->>'amount')::numeric is distinct from face_value then
  raise exception 'Foreign payable selector lost its actual currency, book or available original amount';
 end if;
 if (source_option->>'payee_supplier_id')::uuid is distinct from payee or nullif(source_option->>'payee_supplier_name','') is null then
  raise exception 'Payable selector replaced the actual receiving supplier with the liability supplier';
 end if;
 application:=public.fms_push_payable_settlement_secure((finance->>'id')::uuid,'application','payable');
 if application->>'currency_code'<>'USD' or(application->>'exchange_rate')::numeric<>current_rate
  or(application->>'account_set_id')::uuid<>book or(application->>'amount')::numeric<>face_value then
  raise exception 'Payable application guessed CNY or copied the invoice historical rate';
 end if;
 if nullif(application->>'account_set_name','') is null or(application->'lines'->0->>'account_set_id')::uuid is distinct from book
  or application->'lines'->0->>'currency_code' is distinct from 'USD' or application->'lines'->0->>'base_currency_code' is distinct from 'CNY' then
  raise exception 'Application projection lost its original book identity and line currency context';
 end if;
 if (application->'lines'->0->>'payee_supplier_id')::uuid is distinct from payee then
  raise exception 'Source push did not retain the original receiving supplier';
 end if;
 perform public.fms_act_payable_settlement_secure(array[(application->>'id')::uuid],'submit');
 perform public.fms_act_payable_settlement_secure(array[(application->>'id')::uuid],'approve');
 payment:=public.fms_push_payable_settlement_secure((application->>'id')::uuid,'payment','application');
 if payment->>'currency_code'<>'USD' or(payment->>'account_set_id')::uuid<>book then raise exception 'Application push lost the source currency or book';end if;
 payment:=public.fms_save_payable_settlement_secure(payment||jsonb_build_object('exchange_rate',payment_rate,'lines',
  jsonb_build_array((payment->'lines'->0)||jsonb_build_object('amount',cash_value,'approved_amount',cash_value,'planned_amount',cash_value,
   'cash_discount',discount_value,'fund_account_id',fund_ident))));
 perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'submit');
 perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'approve');
 perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'confirm');
 select id into strict writeoff_ident from public.fms_payable_writeoff_record where payable_id=(finance->>'id')::uuid and payment_line_id=(payment->'lines'->0->>'id')::uuid and status='active';
 if not exists(select 1 from public.fms_payable_writeoff_record where id=writeoff_ident and amount=face_value and payment_amount=cash_value
  and cash_discount_amount=discount_value and payable_base_amount=face_value*invoice_rate and payment_base_amount=cash_value*payment_rate
  and cash_discount_base_amount=discount_value*payment_rate and needs_voucher)
  or(app_private.purchase_payable_json((finance->>'id')::uuid)->>'unpaid_amount')::numeric<>0
  or(app_private.purchase_payable_json((finance->>'id')::uuid)->>'exchange_rate')::numeric<>invoice_rate then
  raise exception 'Same-source automatic matching repriced the invoice or failed to clear its original face amount';
 end if;
 result:=app_private.payable_settlement_json((application->>'id')::uuid);
 if result->>'payment_status'<>'full' or(result->>'paid_amount')::numeric<>cash_value then raise exception 'Application face settlement was confused with actual original cash';end if;
 return jsonb_build_object('case',p_case,'status','passed','invoice_rate',invoice_rate,'application_rate',current_rate,'payment_rate',payment_rate,
  'original_cash',cash_value,'original_discount',discount_value);
end $test$;

select pg_temp.check_payable_source_currency(1);
select pg_temp.check_payable_source_currency(2);
rollback;
