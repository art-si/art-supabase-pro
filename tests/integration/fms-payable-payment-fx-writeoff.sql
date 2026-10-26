begin;
set local jit=off;
set local statement_timeout='8s';

create function pg_temp.check_payable_payment_fx(p_case integer,p_stage text default 'match') returns jsonb
language plpgsql as $test$
declare
 tenant uuid;
 actor uuid;
 book uuid;
 supplier uuid;
 material uuid;
 unit_ident uuid;
 finance_type uuid;
 payment_type uuid;
 purpose_ident uuid;
 method_ident uuid;
 currency_ident uuid;
 fund_ident uuid;
 scheme_ident uuid;
 default_scheme uuid;
 payment_line uuid;
 record_ident uuid;
 first_record uuid;
 posting_date date;
 finance jsonb;
 payment jsonb;
 command jsonb;
 result jsonb;
 row_record public.fms_payable_writeoff_record;
 record_ids uuid[]:='{}';
 primary_currency text:=case when p_case=2 then 'CNY' else 'USD' end;
 primary_rate numeric:=case p_case when 1 then 7 when 2 then 1 when 3 then 1.4 when 4 then 7.5 else 7.2 end;
 payment_rate numeric:=case when p_case=3 then 1.5 else 7.2 end;
 primary_amount numeric:=case p_case when 1 then 102 when 2 then 734.4 when 3 then 0.03 else 100 end;
 cash_amount numeric:=case when p_case=3 then 0.03 else 100 end;
 discount_amount numeric:=case when p_case in(1,2) then 2 else 0 end;
 pieces integer:=case when p_case=3 then 3 when p_case in(1,2) then 2 else 1 end;
 piece_primary numeric;
 piece_payment numeric;
 index_value integer;
 original_count bigint;
 ledger_count bigint;
 expected_needs boolean:=p_case<>5;
 payable_subject uuid;
 payment_subject uuid;
 discount_subject uuid;
 exchange_subject uuid;
 rule_ident uuid;
 generated_voucher uuid;
 payment_voucher uuid;
 posting_payload jsonb;
 voucher_result jsonb;
 subject_suffix text:=to_char(clock_timestamp(),'YYYYMMDDHH24MISSUS');
 workspace jsonb;
 blocked boolean;
 stage_context jsonb:=coalesce(nullif(current_setting('test.payment_fx_stage_'||p_case,true),''),'{}')::jsonb;
begin
 if p_case not between 1 and 5 then raise exception 'Unsupported foreign payment matching case';end if;
 if p_stage not in('match','writeoff_post','payment_post') then raise exception 'Unknown payment FX verification stage';end if;
 if p_stage<>'match' then
  if stage_context->>'stage' is distinct from(case when p_stage='writeoff_post' then 'match' else 'writeoff_post' end) then
   raise exception 'Prepare matching, then verify writeoff posting, then payment posting';end if;
 select stored.tenant,stored.actor,stored.book,stored.supplier,stored.currency_ident,stored.fund_ident,stored.payment_line,stored.posting_date,stored.finance,stored.payment,stored.result,stored.record_ids,stored.ledger_count,stored.payable_subject,stored.payment_subject,stored.discount_subject,stored.exchange_subject into tenant,actor,book,supplier,currency_ident,fund_ident,payment_line,posting_date,finance,payment,result,record_ids,ledger_count,payable_subject,payment_subject,discount_subject,exchange_subject
 from jsonb_to_record(stage_context) as stored(tenant uuid,actor uuid,book uuid,supplier uuid,currency_ident uuid,fund_ident uuid,payment_line uuid,posting_date date,finance jsonb,payment jsonb,result jsonb,record_ids uuid[],ledger_count bigint,payable_subject uuid,payment_subject uuid,discount_subject uuid,exchange_subject uuid);
 end if;
 case p_stage when 'match' then
 select id into tenant from public.sys_tenant where tenant_code='qa-payable-20261022';
 select auth_user_id into actor from public.sys_user where tenant_id=tenant and status='1' and auth_user_id is not null order by id limit 1;
 select id into book from public.fms_account_set where tenant_id=tenant and is_default and status='active' and base_currency_code='CNY';
 select start_date into posting_date from public.fms_accounting_period where account_set_id=book and status='open' order by start_date desc limit 1;
 if actor is null or posting_date is null then raise exception 'Missing ordinary foreign payment acceptance fixture';end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.headers','{}',true);
 if app_private.is_platform_super() then raise exception 'Foreign matching test must use an ordinary actor';end if;
 if has_function_privilege('authenticated','app_private.apply_payable_payment_writeoff(uuid,uuid,numeric,date,uuid,text,boolean,numeric)','EXECUTE')
  or has_function_privilege('anon','app_private.apply_payable_payment_writeoff(uuid,uuid,numeric,date,uuid,text,boolean,numeric)','EXECUTE')
  or has_function_privilege('authenticated','app_private.payable_payment_writeoff_posting_payload(uuid)','EXECUTE')
  or has_function_privilege('anon','app_private.payable_settlement_posting_payload(uuid)','EXECUTE') then
  raise exception 'Private original/base-currency writer or posting projection became client executable';
 end if;
 select id into supplier from public.mdm_supplier where tenant_id=tenant order by id limit 1;
 select id,inventory_unit_id into material,unit_ident from public.mdm_material where tenant_id=tenant and inventory_unit_id is not null order by id limit 1;
 select id into finance_type from public.mdm_document_type where tenant_id=tenant and document_type_code='AP_FIN_STANDARD';
 select id into payment_type from public.mdm_document_type where tenant_id=tenant and document_type_code='AP_PAYMENT_PURCHASE';
 select id into purpose_ident from public.mdm_payment_purpose where tenant_id=tenant and code='201';
 select id into method_ident from public.mdm_settlement_method where tenant_id=tenant and category='cash' and enabled order by id limit 1;
 select id into default_scheme from public.fms_payable_writeoff_scheme where tenant_id=tenant and code='AP-MANUAL';
 scheme_ident:=default_scheme;
 if p_case=2 then
  insert into public.fms_payable_writeoff_scheme(tenant_id,code,name,rules,automatic)
  values(tenant,'FX_PAIR_'||upper(left(gen_random_uuid()::text,8)),'同单位明确双方原币的回滚核销方案',
   jsonb_build_array(jsonb_build_object('primary_field','supplier_id','secondary_field','supplier_id','operator','eq','empty_matches',false)),false)
  returning id into scheme_ident;
 end if;
 insert into public.fms_currency(tenant_id,account_set_id,currency_code,currency_name,is_enabled)
 values(tenant,book,'USD','美元',true) on conflict(account_set_id,currency_code) do update set is_enabled=true returning id into currency_ident;
 insert into public.fms_exchange_rate(tenant_id,account_set_id,currency_id,rate_date,rate_type,direct_rate)
 values(tenant,book,currency_ident,posting_date,'spot',payment_rate)
 on conflict(account_set_id,currency_id,rate_date,rate_type) do update set direct_rate=excluded.direct_rate;
 insert into public.fms_fund_account(tenant_id,account_set_id,currency_id,account_code,account_name,account_type,account_no_masked,account_no_fingerprint,opening_balance,online_banking_enabled)
 values(tenant,book,currency_ident,'FX_MATCH_'||upper(left(gen_random_uuid()::text,8)),
  '外币核销回滚虚构现金账户','cash','**** QA',md5(gen_random_uuid()::text),1000,false) returning id into fund_ident;
 finance:=public.fms_save_purchase_payable_secure(jsonb_build_object('kind','financial','tenant_id',tenant,'document_type_id',finance_type,
  'supplier_id',supplier,'business_date',posting_date,'currency_code',primary_currency,'exchange_rate',primary_rate,
  'lines',jsonb_build_array(jsonb_build_object('material_id',material,'inventory_unit_id',unit_ident,'quantity',1,'unit_price',primary_amount,'tax_rate',0))));
 perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'submit');
 perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'approve');
 payment:=public.fms_save_payable_settlement_secure(jsonb_build_object('kind','payment','tenant_id',tenant,'document_type_id',payment_type,
  'business_date',posting_date,'currency_code','USD','exchange_rate',payment_rate,'account_set_id',book,
  'lines',jsonb_build_array(jsonb_build_object('purpose_id',purpose_ident,'supplier_id',supplier,'settlement_method_id',method_ident,
   'fund_account_id',fund_ident,'amount',cash_amount,'cash_discount',discount_amount))));
 perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'submit');
 perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'approve');
 perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'confirm');
 payment_line:=(payment->'lines'->0->>'id')::uuid;
 workspace:=public.fms_payable_writeoff_workspace_secure(jsonb_build_object('document_ids',jsonb_build_array(finance->>'id',payment->>'id')));
 if not exists(select 1 from jsonb_array_elements(workspace->'primary') entry where entry->>'id'=finance->>'id'
   and entry->>'currency_code'=primary_currency and entry->>'base_currency_code'='CNY' and(entry->>'exchange_rate')::numeric=primary_rate
   and(entry->>'available_base_amount')::numeric=round(primary_amount*primary_rate,2))
  or not exists(select 1 from jsonb_array_elements(workspace->'secondary') entry where entry->>'id'=payment_line::text
   and entry->>'currency_code'='USD' and(entry->>'exchange_rate')::numeric=payment_rate
   and(entry->>'available_amount')::numeric=cash_amount+discount_amount
   and(entry->>'available_base_amount')::numeric=round(cash_amount*payment_rate,2)+round(discount_amount*payment_rate,2)) then
  raise exception 'Writeoff workspace omitted historical original currency or real local capacity';
 end if;
 update public.fms_exchange_rate set direct_rate=9 where account_set_id=book and currency_id=currency_ident and rate_date=posting_date and rate_type='spot';
 select count(*) into ledger_count from public.fms_fund_ledger_entry;
 piece_primary:=round(primary_amount/pieces,2);
 piece_payment:=round((cash_amount+discount_amount)/pieces,2);
 command:=jsonb_build_object('payable_id',finance->>'id','payment_line_id',payment_line,'amount',piece_primary,'payment_face_amount',piece_payment);
 if p_case=2 then
  blocked:=false;
  begin
   perform public.fms_payable_writeoff_secure(jsonb_build_array(command),default_scheme,posting_date,'原同币种方案必须拒绝异币');
  exception when check_violation then blocked:=true;end;
  if not blocked then raise exception 'Foreign pair bypassed the configured same-currency rule';end if;
  blocked:=false;
  begin
   perform public.fms_payable_writeoff_secure(jsonb_build_array(command-'payment_face_amount'),scheme_ident,posting_date,'不能推算另一原币金额');
  exception when invalid_parameter_value then blocked:=true;end;
  if not blocked then raise exception 'Cross-currency matching guessed its secondary original amount';end if;
 else
  blocked:=false;
  begin
   perform public.fms_payable_writeoff_secure(jsonb_build_array(command||jsonb_build_object('payment_face_amount',piece_payment+0.01)),scheme_ident,posting_date,'同币种双方须相等');
  exception when check_violation then blocked:=true;end;
  if not blocked then raise exception 'Same-currency sources accepted unequal original amounts';end if;
 end if;
 select count(*) into original_count from public.fms_payable_writeoff_record;
 blocked:=false;
 begin
  perform public.fms_payable_writeoff_secure(jsonb_build_array(command,command||jsonb_build_object('amount',99999,'payment_face_amount',99999)),scheme_ident,posting_date,'整批金额校验');
 exception when check_violation then blocked:=true;end;
 if not blocked or(select count(*) from public.fms_payable_writeoff_record)<>original_count then raise exception 'Failed matching batch retained a partial first writeoff';end if;
 for index_value in 1..pieces loop
  result:=public.fms_payable_writeoff_secure(jsonb_build_array(command||jsonb_build_object('payable_base_amount',999,'payment_base_amount',999)),scheme_ident,posting_date,'双方原汇率分摊');
  record_ident:=(result->>0)::uuid;
  record_ids:=array_append(record_ids,record_ident);
  select * into row_record from public.fms_payable_writeoff_record where id=record_ident;
  if row_record.fx_snapshot_version is distinct from 1 or row_record.account_set_id<>book
   or row_record.amount<>piece_primary or row_record.payment_face_amount<>piece_payment
   or row_record.payment_amount+row_record.cash_discount_amount<>piece_payment
   or row_record.needs_voucher is distinct from expected_needs
   or (row_record.match_snapshot->'primary'->>'exchange_rate')::numeric<>primary_rate
   or (row_record.match_snapshot->'secondary'->>'exchange_rate')::numeric<>payment_rate then
   raise exception 'Foreign writeoff changed original amounts, source rates or posting requirement';
  end if;
 end loop;
 if(select sum(amount) from public.fms_payable_writeoff_record where id=any(record_ids))<>primary_amount
  or(select sum(payment_amount) from public.fms_payable_writeoff_record where id=any(record_ids))<>cash_amount
  or(select sum(cash_discount_amount) from public.fms_payable_writeoff_record where id=any(record_ids))<>discount_amount
  or(select sum(payable_base_amount) from public.fms_payable_writeoff_record where id=any(record_ids))<>round(primary_amount*primary_rate,2)
  or(select sum(payment_base_amount) from public.fms_payable_writeoff_record where id=any(record_ids))<>round(cash_amount*payment_rate,2)
  or(select sum(cash_discount_base_amount) from public.fms_payable_writeoff_record where id=any(record_ids))<>round(discount_amount*payment_rate,2)
  or(app_private.purchase_payable_json((finance->>'id')::uuid)->>'unpaid_amount')::numeric<>0
  or app_private.payable_unwritten_base_amount((finance->>'id')::uuid)<>0
  or(app_private.payable_payment_line_state(payment_line)->>'available_settlement_face')::numeric<>0 then
  raise exception 'Partial foreign matching lost a final cent or original-currency balance';
 end if;
 first_record:=record_ids[1];
 blocked:=false;
 begin update public.fms_payable_writeoff_record set payment_base_amount=payment_base_amount+1 where id=first_record;
 exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Historical local-currency allocation could be repriced';end if;
 blocked:=false;
 begin delete from public.fms_payable_writeoff_record where id=first_record;
 exception when foreign_key_violation then blocked:=true;end;
 if not blocked then raise exception 'Historical foreign allocation could be deleted';end if;
 perform public.fms_reverse_payable_writeoff_secure(first_record,'恢复双方原币与原本位币余量');
 if(app_private.purchase_payable_json((finance->>'id')::uuid)->>'unpaid_amount')::numeric<>piece_primary
  or(app_private.payable_payment_line_state(payment_line)->>'available_settlement_face')::numeric<>piece_payment then
  raise exception 'Reversal restored equal nominal money instead of the two original amounts';
 end if;
 result:=public.fms_payable_writeoff_secure(jsonb_build_array(command),scheme_ident,posting_date,'反核销后按原汇率重新分摊');
 workspace:=public.fms_payable_writeoff_workspace_secure(jsonb_build_object('record_id',result->>0));
 if jsonb_array_length(workspace->'primary')<>0 or jsonb_array_length(workspace->'secondary')<>0
  or not exists(select 1 from jsonb_array_elements(workspace->'history') entry where entry->>'id'=result->>0
  and entry->>'currency_code'=primary_currency and entry->>'secondary_currency_code'='USD'
  and(entry->>'primary_exchange_rate')::numeric=primary_rate and(entry->>'secondary_exchange_rate')::numeric=payment_rate) then
  raise exception 'Writeoff history lost its two original currencies or recorded rates';
 end if;
 if app_private.payable_unwritten_base_amount((finance->>'id')::uuid)<>0
  or(select sum(payment_base_amount) from public.fms_payable_writeoff_record where payment_line_id=payment_line and status='active')<>round(cash_amount*payment_rate,2)
  or(select count(*) from public.fms_fund_ledger_entry)<>ledger_count then
  raise exception 'Reapplication repriced historical money or generated another fund transaction';
 end if;

 when 'writeoff_post' then
  if p_case=5 then raise exception 'Equal-rate symmetric writeoff does not require a voucher';end if;
  record_ident:=case when p_case=3 then record_ids[3] else(result->>0)::uuid end;
  select * into row_record from public.fms_payable_writeoff_record where id=record_ident;
  posting_payload:=app_private.payable_payment_writeoff_posting_payload(record_ident);
  if(posting_payload->>'payable_base_amount')::numeric<>row_record.payable_base_amount
   or(posting_payload->>'paid_amount')::numeric<>row_record.payment_base_amount
   or(posting_payload->>'discount_amount')::numeric<>row_record.cash_discount_base_amount
   or(posting_payload->>'exchange_gain_loss')::numeric<>row_record.payment_base_amount+row_record.cash_discount_base_amount-row_record.payable_base_amount then
   raise exception 'Voucher payload lost historical local money or exchange gain/loss';
  end if;
  insert into public.fms_subject(tenant_id,account_set_id,subject_code,subject_name,category,balance_direction,allow_foreign_currency)
  values(tenant,book,'991'||subject_suffix,'应付核销回滚科目','liability','credit',true) returning id into payable_subject;
  insert into public.fms_subject(tenant_id,account_set_id,subject_code,subject_name,category,balance_direction,allow_foreign_currency)
  values(tenant,book,'992'||subject_suffix,'付款本金回滚科目','asset','debit',true) returning id into payment_subject;
  insert into public.fms_subject(tenant_id,account_set_id,subject_code,subject_name,category,balance_direction,allow_foreign_currency)
  values(tenant,book,'993'||subject_suffix,'已实现折扣回滚科目','income','credit',true) returning id into discount_subject;
  insert into public.fms_subject(tenant_id,account_set_id,subject_code,subject_name,category,balance_direction,allow_foreign_currency)
  values(tenant,book,'994'||subject_suffix,'汇兑损益回滚科目','expense','debit',false) returning id into exchange_subject;
  insert into public.fms_posting_rule(tenant_id,account_set_id,rule_code,rule_name,source_type,event_code,priority,submission_mode,match_conditions)
  values(tenant,book,'FX_WO_'||upper(left(gen_random_uuid()::text,8)),'双方历史汇率核销回滚规则','system','ap_writeoff_approved',999999,'draft',
   jsonb_build_object('fx_snapshot_version',1,'fund_account_id',fund_ident)) returning id into rule_ident;
  insert into public.fms_posting_rule_line(tenant_id,account_set_id,rule_id,line_no,subject_id,direction,amount_key)
  values(tenant,book,rule_ident,10,payable_subject,'debit','gross_amount'),
   (tenant,book,rule_ident,20,payment_subject,'credit','paid_amount'),
   (tenant,book,rule_ident,30,discount_subject,'credit','discount_amount'),
   (tenant,book,rule_ident,40,exchange_subject,'debit','exchange_gain_loss');
  voucher_result:=public.fms_payable_settlement_voucher_secure(record_ident,'writeoff',true);
  if(select coalesce(sum((entry->>'debit_amount')::numeric-(entry->>'credit_amount')::numeric),0) from jsonb_array_elements(voucher_result->'lines') entry)<>0 then
   raise exception 'Foreign writeoff voucher preview did not reverse the exchange gain direction';
  end if;
  voucher_result:=public.fms_payable_settlement_voucher_secure(record_ident,'writeoff',false);
  if voucher_result->>'status'<>'generated' then raise exception 'Foreign writeoff failed to post: %',voucher_result;end if;
  generated_voucher:=(voucher_result->'voucher_ids'->>0)::uuid;
  if not exists(select 1 from public.fms_voucher where id=generated_voucher and account_set_id=book and total_debit=total_credit)
   or not exists(select 1 from public.fms_voucher_line where voucher_id=generated_voucher and subject_id=payable_subject and debit_amount=row_record.payable_base_amount)
   or not exists(select 1 from public.fms_voucher_line where voucher_id=generated_voucher and subject_id=payment_subject and credit_amount=row_record.payment_base_amount
    and original_amount=row_record.payment_amount and exchange_rate=payment_rate and currency_id=currency_ident) then
   raise exception 'Foreign voucher did not preserve source book, original principal or base allocation';
  end if;
  if primary_currency='USD' and not exists(select 1 from public.fms_voucher_line where voucher_id=generated_voucher and subject_id=payable_subject
   and original_amount=row_record.amount and exchange_rate=primary_rate and currency_id=currency_ident) then
   raise exception 'Payable voucher line lost its own original currency and historical rate';
  end if;
  if row_record.cash_discount_amount>0 and not exists(select 1 from public.fms_voucher_line where voucher_id=generated_voucher and subject_id=discount_subject
   and credit_amount=row_record.cash_discount_base_amount and original_amount=row_record.cash_discount_amount and exchange_rate=payment_rate) then
   raise exception 'Discount voucher line used the payable rather than payment historical rate';
  end if;
  if row_record.payable_base_amount<>row_record.payment_base_amount+row_record.cash_discount_base_amount
   and not exists(select 1 from public.fms_voucher_line where voucher_id=generated_voucher and subject_id=exchange_subject
    and debit_amount-credit_amount=row_record.payment_base_amount+row_record.cash_discount_base_amount-row_record.payable_base_amount) then
   raise exception 'Exchange gain/loss sign or local amount changed';
  end if;
  voucher_result:=public.fms_payable_settlement_voucher_secure(record_ident,'writeoff',false);
  if(voucher_result->'voucher_ids'->>0)::uuid<>generated_voucher then raise exception 'Repeated foreign writeoff posting duplicated a voucher';end if;
  blocked:=false;
  begin perform public.fms_reverse_payable_writeoff_secure(record_ident,'已生成凭证禁止反核销');exception when check_violation then blocked:=true;end;
  if not blocked then raise exception 'Posted foreign writeoff could be reversed';end if;

 when 'payment_post' then
  posting_payload:=app_private.payable_settlement_posting_payload(payment_line);
  if(posting_payload->>'discount_amount')::numeric<>0 or(posting_payload->>'payable_amount')::numeric<>round(cash_amount*payment_rate,2)
   or(posting_payload->>'offered_discount_amount')::numeric<>round(discount_amount*payment_rate,2) then
   raise exception 'Offered payment discount was treated as realized income before writeoff';
  end if;
  insert into public.fms_posting_rule(tenant_id,account_set_id,rule_code,rule_name,source_type,event_code,priority,submission_mode,match_conditions)
  values(tenant,book,'FX_PAY_'||upper(left(gen_random_uuid()::text,8)),'原币本金付款回滚规则','system','ap_payment_confirmed',999999,'draft',
   jsonb_build_object('fx_snapshot_version',1,'fund_account_id',fund_ident)) returning id into rule_ident;
  insert into public.fms_posting_rule_line(tenant_id,account_set_id,rule_id,line_no,subject_id,direction,amount_key)
  values(tenant,book,rule_ident,10,payment_subject,'debit','paid_amount'),
   (tenant,book,rule_ident,20,payable_subject,'credit','gross_amount'),
   (tenant,book,rule_ident,30,discount_subject,'credit','discount_amount');
  voucher_result:=public.fms_payable_settlement_voucher_secure((payment->>'id')::uuid,'payment',false);
  if voucher_result->>'status'<>'generated' then raise exception 'Foreign payment failed to post: %',voucher_result;end if;
  payment_voucher:=(voucher_result->'voucher_ids'->>0)::uuid;
  if not exists(select 1 from public.fms_voucher_line where voucher_id=payment_voucher and subject_id=payment_subject
   and debit_amount=round(cash_amount*payment_rate,2) and original_amount=cash_amount and exchange_rate=payment_rate and currency_id=currency_ident)
   or exists(select 1 from public.fms_voucher_line where voucher_id=payment_voucher and subject_id=discount_subject) then
   raise exception 'Payment voucher lost original currency or prematurely realized an offered discount';
  end if;
  if(select count(*) from public.fms_fund_ledger_entry)<>ledger_count then raise exception 'Voucher posting generated another fund transaction';end if;
 end case;
 select to_jsonb(snapshot)||jsonb_build_object('stage',p_stage) into stage_context from(select tenant as tenant,actor as actor,book as book,supplier as supplier,currency_ident as currency_ident,fund_ident as fund_ident,payment_line as payment_line,posting_date as posting_date,finance as finance,payment as payment,result as result,record_ids as record_ids,ledger_count as ledger_count,payable_subject as payable_subject,payment_subject as payment_subject,discount_subject as discount_subject,exchange_subject as exchange_subject) snapshot;
 perform set_config('test.payment_fx_stage_'||p_case,stage_context::text,true);
 return jsonb_build_object('case',p_case,'stage',p_stage,'status','passed','payable_id',finance->>'id','tenant_id',tenant,'supplier_id',supplier,'payable_base',round(primary_amount*primary_rate,2),
  'payment_base',round(cash_amount*payment_rate,2),'discount_base',round(discount_amount*payment_rate,2),
  'exchange_gain',round(primary_amount*primary_rate,2)-round(cash_amount*payment_rate,2)-round(discount_amount*payment_rate,2));
end $test$;

select pg_temp.check_payable_payment_fx(1);
select pg_temp.check_payable_payment_fx(2);
select set_config('test.payable_fx_report',pg_temp.check_payable_payment_fx(3)::text,true);
do $report$
declare context_value jsonb:=current_setting('test.payable_fx_report')::jsonb;fact jsonb;
begin
 select value into strict fact from app_private.payable_report_source_balances(jsonb_build_object('kind','financial','tenant_id',context_value->>'tenant_id',
  'party_type','supplier','party_id',context_value->>'supplier_id')) value where value->>'document_id'=context_value->>'payable_id';
 if fact->>'balance_state'<>'ready' or(fact->>'balance_amount')::numeric<>0 or(fact->>'base_balance_amount')::numeric<>0 then
  raise exception 'Payable report recalculated partial writeoffs and lost the actual final base-currency cent';
 end if;
end $report$;
select pg_temp.check_payable_payment_fx(4);
select pg_temp.check_payable_payment_fx(5);
select pg_temp.check_payable_payment_fx(1);
select pg_temp.check_payable_payment_fx(1,'writeoff_post');
select pg_temp.check_payable_payment_fx(1,'payment_post');
select pg_temp.check_payable_payment_fx(2);
select pg_temp.check_payable_payment_fx(2,'writeoff_post');
select pg_temp.check_payable_payment_fx(2,'payment_post');
select pg_temp.check_payable_payment_fx(3);
select pg_temp.check_payable_payment_fx(3,'writeoff_post');
select pg_temp.check_payable_payment_fx(3,'payment_post');
select pg_temp.check_payable_payment_fx(4);
select pg_temp.check_payable_payment_fx(4,'writeoff_post');
select pg_temp.check_payable_payment_fx(4,'payment_post');
rollback;
