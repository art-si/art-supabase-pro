begin;
set local jit=off;
set local statement_timeout='8s';

create function pg_temp.prepare_ar_fx_rounding_posting() returns jsonb
language plpgsql as $prepare$
declare context_value jsonb;tenant uuid;book uuid;material uuid;unit_ident uuid;finance_type uuid;ar_type uuid;customer uuid;finance jsonb;receivable uuid;line_ident uuid;commands jsonb;records jsonb;
begin
 context_value:=pg_temp.prepare_payable_receivable_fx(1);tenant:=(context_value->>'tenant')::uuid;book:=(context_value->>'book')::uuid;
 select id,inventory_unit_id into material,unit_ident from public.mdm_material where tenant_id=tenant and inventory_unit_id is not null order by id limit 1;
 select id into finance_type from public.mdm_document_type where tenant_id=tenant and document_type_code='AP_FIN_STANDARD';
 finance:=public.fms_save_purchase_payable_secure(jsonb_build_object('tenant_id',tenant,'kind','financial','document_type_id',finance_type,'supplier_id',context_value->>'supplier',
  'business_date',app_private.payable_business_date(),'currency_code','USD','exchange_rate',7,
  'lines',jsonb_build_array(jsonb_build_object('material_id',material,'inventory_unit_id',unit_ident,'quantity',1,'unit_price',0.07,'tax_rate',0))));
 perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'submit');
 perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'approve');
 update public.fms_exchange_rate set direct_rate=7.333333 where account_set_id=book and rate_date=app_private.payable_business_date()
  and currency_id in(select id from public.fms_currency where account_set_id=book and currency_code='USD');
 select id into ar_type from public.mdm_document_type where tenant_id=tenant and document_type_code='AR_FIN_STANDARD';
 select customer_id into customer from public.fms_receivable_document where id=(context_value->>'document')::uuid;
 receivable:=public.fms_save_receivable_document_secure(jsonb_build_object('kind','financial','tenantId',tenant,'documentTypeId',ar_type,'customerId',customer,
  'settlementOrganizationId',context_value->>'organization','businessDate',app_private.payable_business_date(),'currencyCode','USD','settlementMethod','cash',
  'lines',jsonb_build_array(jsonb_build_object('lineNo',10,'basis','amount','materialDescription','七次部分核销原本位币尾差','enteredGrossAmount',0.07,
   'quantity',0,'unitPrice',0,'priceBasis','taxed','taxRate',0,'discountMethod','none'))));
 perform public.fms_act_receivable_document_secure(receivable,'submit');
 perform public.fms_act_receivable_document_secure(receivable,'approve');
 select id into line_ident from public.fms_receivable_line where document_id=receivable;
 update public.fms_exchange_rate set direct_rate=99 where account_set_id=book and rate_date=app_private.payable_business_date()
  and currency_id in(select id from public.fms_currency where account_set_id=book and currency_code='USD');
 select jsonb_agg(jsonb_build_object('relation','payable_receivable','payable_id',finance->>'id','receivable_line_id',line_ident,'amount',0.01,'receivable_amount',0.01,'allow_cross_party',true))
 into commands from generate_series(1,7);
 records:=public.fms_payable_writeoff_secure(commands,(context_value->>'scheme')::uuid,app_private.payable_business_date(),'七次原币分摊验证真实尾差');
 if jsonb_array_length(records)<>7 or not exists(select 1 from public.fms_payable_writeoff_record where id=(records->>6)::uuid and payable_base_amount=0.07 and receivable_base_amount=0.09)
  or app_private.payable_unwritten_base_amount((finance->>'id')::uuid)<>0 or(app_private.ar_line_book_balance(line_ident)->>'base_remaining')::numeric<>0 then
  raise exception 'Seven partial offsets did not retain the actual final carrying cent';end if;
 context_value:=context_value||jsonb_build_object('case',5,'payable',finance->>'id','document',receivable,'line',line_ident,'primary_amount',0.07,'records',records);
 perform set_config('qa.ap_ar_fx_5',context_value::text,true);
 return context_value;
end $prepare$;

create function pg_temp.configure_ar_fx_posting(p_case integer,p_stage text) returns jsonb
language plpgsql as $configure$
declare context_value jsonb:=current_setting('qa.ap_ar_fx_'||p_case)::jsonb;tenant uuid:=(context_value->>'tenant')::uuid;book uuid:=(context_value->>'book')::uuid;
 record_ident uuid:=(context_value->'records'->>(case when p_case=5 then 6 when p_case<=2 then 2 else 0 end))::uuid;
 forged_record uuid:=(context_value->'records'->>1)::uuid;result jsonb;payload jsonb;event public.fms_posting_event;customer uuid;
 payable_subject uuid;receivable_subject uuid;exchange_subject uuid;rule_ident uuid;supplier_type uuid;customer_type uuid;supplier_item uuid;customer_item uuid;
 subject_suffix text:=to_char(clock_timestamp(),'YYYYMMDDHH24MISSUS');primary_key text:=case p_case when 1 then 'payable_amount' when 2 then 'gross_amount' when 3 then 'net_amount' else 'payable_base_amount' end;
begin
 if p_stage not in('missing_rule','forged_event','configure') then raise exception 'Unknown AR FX posting configuration phase';end if;
 if has_function_privilege('authenticated','app_private.payable_receivable_writeoff_posting_payload(uuid)','EXECUTE')
  or has_function_privilege('anon','app_private.payable_receivable_writeoff_posting_payload(uuid)','EXECUTE')
  or has_function_privilege('authenticated','app_private.payable_writeoff_voucher_line_matches_source(public.fms_voucher_line)','EXECUTE')
  or has_function_privilege('anon','app_private.payable_writeoff_posting_line_values(text,jsonb,text,numeric)','EXECUTE') then raise exception 'Private source posting became client executable';end if;
 if p_stage='missing_rule' then
 update public.fms_posting_rule set is_enabled=false where account_set_id=book and source_type='system' and event_code='ap_receivable_offset_approved';
 result:=public.fms_payable_settlement_voucher_secure(record_ident,'writeoff',true);
 if jsonb_array_length(result->'lines')<>0 then raise exception 'Missing dedicated offset rules reused unrelated posting configuration';end if;
 result:=public.fms_payable_settlement_voucher_secure(record_ident,'writeoff',false);
 if result->>'status'<>'pending_configuration' or jsonb_array_length(result->'voucher_ids')<>0 then raise exception 'Missing offset rules falsely reported a generated voucher';end if;
 payload:=app_private.payable_receivable_writeoff_posting_payload(record_ident);
 if(payload->>'account_set_id')::uuid<>book or(payload->>'paid_amount')::numeric<>0 or(payload->>'discount_amount')::numeric<>0
  or(payload->>'secondary_exchange_rate')::numeric<>7.333333 then raise exception 'Posting source lost its original book, noncash identity or historical AR rate';end if;
 elsif p_stage='forged_event' then
 perform public.fms_payable_settlement_voucher_secure(forged_record,'writeoff',false);
 update public.fms_posting_event pending set payload=jsonb_set(pending.payload,'{receivable_amount}',to_jsonb((pending.payload->>'receivable_amount')::numeric+99))
 where pending.source_id=forged_record and pending.event_code='ap_receivable_offset_approved' and pending.tenant_id=tenant returning * into event;
 event:=app_private.process_fms_posting_event(event.id,true);
 if event.status<>'ignored' or event.voucher_id is not null then raise exception 'Background posting trusted a modified carrying-base payload';end if;
 else
 insert into public.fms_subject(tenant_id,account_set_id,subject_code,subject_name,category,balance_direction,allow_foreign_currency)
 values(tenant,book,'991'||subject_suffix,'抵销原应付回滚科目','liability','credit',true) returning id into payable_subject;
 insert into public.fms_subject(tenant_id,account_set_id,subject_code,subject_name,category,balance_direction,allow_foreign_currency)
 values(tenant,book,'992'||subject_suffix,'抵销原应收回滚科目','asset','debit',true) returning id into receivable_subject;
 insert into public.fms_subject(tenant_id,account_set_id,subject_code,subject_name,category,balance_direction)
 values(tenant,book,'993'||subject_suffix,'抵销真实汇兑损益回滚科目','expense','debit') returning id into exchange_subject;
 insert into public.fms_auxiliary_type(tenant_id,account_set_id,type_code,type_name,source_type)
 values(tenant,book,'AP_SUP_'||upper(left(gen_random_uuid()::text,8)),'抵销供应商回滚维度','manual') returning id into supplier_type;
 insert into public.fms_auxiliary_type(tenant_id,account_set_id,type_code,type_name,source_type)
 values(tenant,book,'AR_CUS_'||upper(left(gen_random_uuid()::text,8)),'抵销客户回滚维度','customer') returning id into customer_type;
 select customer_id into customer from public.fms_receivable_document where id=(context_value->>'document')::uuid;
 insert into public.fms_auxiliary_item(tenant_id,account_set_id,auxiliary_type_id,item_code,item_name,external_entity_type,external_entity_id)
 values(tenant,book,supplier_type,'SUP_'||upper(left(gen_random_uuid()::text,8)),'原供应商回滚核算项','mdm_supplier',(context_value->>'supplier')::uuid) returning id into supplier_item;
 insert into public.fms_auxiliary_item(tenant_id,account_set_id,auxiliary_type_id,item_code,item_name,external_entity_type,external_entity_id)
 values(tenant,book,customer_type,'CUS_'||upper(left(gen_random_uuid()::text,8)),'原客户回滚核算项','mdm_customer',customer) returning id into customer_item;
 insert into public.fms_subject_auxiliary_type(tenant_id,account_set_id,subject_id,auxiliary_type_id,is_required)
 values(tenant,book,payable_subject,supplier_type,true),(tenant,book,receivable_subject,customer_type,true);
 insert into public.fms_posting_rule(tenant_id,account_set_id,rule_code,rule_name,source_type,event_code,priority,submission_mode,voucher_type,match_conditions)
 values(tenant,book,'AP_AR_POST_'||upper(left(gen_random_uuid()::text,8)),'原币抵销真实账套回滚制证规则','system','ap_receivable_offset_approved',999999,'draft','transfer',
  jsonb_build_object('writeoff_record_id',record_ident,'fx_snapshot_version',1)) returning id into rule_ident;
 insert into public.fms_posting_rule_line(tenant_id,account_set_id,rule_id,line_no,subject_id,direction,amount_key,auxiliary_bindings)
 values(tenant,book,rule_ident,10,payable_subject,'debit',primary_key,jsonb_build_object(supplier_type,'supplier_id')),
  (tenant,book,rule_ident,20,receivable_subject,'credit','receivable_amount',jsonb_build_object(customer_type,'customer_id')),
  (tenant,book,rule_ident,30,exchange_subject,'debit','exchange_gain_loss','{}');
 context_value:=context_value||jsonb_build_object('posting_record',record_ident,'forged_record',forged_record,'payable_subject',payable_subject,'receivable_subject',receivable_subject,'exchange_subject',exchange_subject,
  'supplier_type',supplier_type,'customer_type',customer_type,'supplier_item',supplier_item,'customer_item',customer_item,'rule',rule_ident,'primary_key',primary_key);
 perform set_config('qa.ap_ar_fx_'||p_case,context_value::text,true);
 end if;
 return jsonb_build_object('case',p_case,'phase',p_stage,'status','passed','configured_record',record_ident);
end $configure$;

create function pg_temp.post_ar_fx_voucher(p_case integer) returns jsonb
language plpgsql as $post$
declare context_value jsonb:=current_setting('qa.ap_ar_fx_'||p_case)::jsonb;record_ident uuid:=(context_value->>'posting_record')::uuid;
 matched public.fms_payable_writeoff_record;result jsonb;payload jsonb;voucher_ident uuid;blocked boolean;primary_currency uuid;secondary_currency uuid;
 source_line uuid;forged_item uuid;prior_system_posting text;alternate_rule uuid;alternate_line uuid;event public.fms_posting_event;
begin
 select * into matched from public.fms_payable_writeoff_record where id=record_ident;
 payload:=app_private.payable_receivable_writeoff_posting_payload(record_ident);primary_currency:=nullif(payload->>'primary_currency_id','')::uuid;secondary_currency:=(payload->>'secondary_currency_id')::uuid;
 if(payload->>'payable_amount')::numeric<>matched.payable_base_amount or(payload->>'receivable_amount')::numeric<>matched.receivable_base_amount
  or(payload->>'exchange_gain_loss')::numeric<>matched.receivable_base_amount-matched.payable_base_amount then raise exception 'Offset posting payload does not use the actual two carrying bases';end if;
 if p_case=1 then
  update public.fms_subject set allow_foreign_currency=false where id=(context_value->>'receivable_subject')::uuid;
  result:=public.fms_payable_settlement_voucher_secure(record_ident,'writeoff',true);
  if position('未启用外币核算' in result->>'message')=0 or not exists(select 1 from jsonb_array_elements(result->'lines') line
   where line->>'subject_name'='抵销原应收回滚科目' and(line->>'currency_id')::uuid=secondary_currency and(line->>'original_amount')::numeric=matched.receivable_amount) then
   raise exception 'Invalid subject configuration silently hid the source foreign currency in preview';end if;
  result:=public.fms_payable_settlement_voucher_secure(record_ident,'writeoff',false);
  select * into event from public.fms_posting_event where source_id=record_ident and event_code='ap_receivable_offset_approved' and tenant_id=matched.tenant_id;
  if result->>'status'='generated' or jsonb_array_length(result->'voucher_ids')<>0 or event.status<>'failed' or event.last_error<>'当前科目未启用外币核算' then
   raise exception 'Automatic posting dropped foreign metadata instead of requiring valid foreign-account configuration';end if;
  update public.fms_subject set allow_foreign_currency=true where id=(context_value->>'receivable_subject')::uuid;
 end if;
 result:=public.fms_payable_settlement_voucher_secure(record_ident,'writeoff',true);
 if jsonb_array_length(result->'lines')<>3 or(select sum((line->>'debit_amount')::numeric-(line->>'credit_amount')::numeric) from jsonb_array_elements(result->'lines') line)<>0 then
  raise exception 'Offset preview failed to balance the correct exchange gain/loss direction';end if;
 if not exists(select 1 from jsonb_array_elements(result->'lines') line where line->>'subject_name'='抵销原应收回滚科目' and(line->>'currency_id')::uuid=secondary_currency
  and line->>'currency_code'='USD' and(line->>'original_amount')::numeric=matched.receivable_amount and(line->>'exchange_rate')::numeric=7.333333) then
  raise exception 'Offset preview hid the actual AR original currency and historical rate';end if;
 if primary_currency is not null and not exists(select 1 from jsonb_array_elements(result->'lines') line where line->>'subject_name'='抵销原应付回滚科目'
  and(line->>'currency_id')::uuid=primary_currency and(line->>'original_amount')::numeric=matched.amount and(line->>'exchange_rate')::numeric=(payload->>'primary_exchange_rate')::numeric) then
  raise exception 'Offset preview replaced the AP original currency or historical rate';end if;
 result:=public.fms_payable_settlement_voucher_secure(record_ident,'writeoff',false);
 if result->>'status'<>'generated' or jsonb_array_length(result->'voucher_ids')<>1 then raise exception 'Historical FX offset did not generate its voucher: %',result;end if;
 voucher_ident:=(result->'voucher_ids'->>0)::uuid;
 if not exists(select 1 from public.fms_voucher where id=voucher_ident and account_set_id=matched.account_set_id and tenant_id=matched.tenant_id
  and source_id=matched.id and source_event_code='ap_receivable_offset_approved' and total_debit=total_credit)
  or not exists(select 1 from public.fms_voucher_line where voucher_id=voucher_ident and subject_id=(context_value->>'payable_subject')::uuid and debit_amount=matched.payable_base_amount
   and auxiliary_values->>(context_value->>'supplier_type')=context_value->>'supplier_item')
  or not exists(select 1 from public.fms_voucher_line where voucher_id=voucher_ident and subject_id=(context_value->>'receivable_subject')::uuid and credit_amount=matched.receivable_base_amount
   and currency_id=secondary_currency and original_amount=matched.receivable_amount and exchange_rate=7.333333
   and auxiliary_values->>(context_value->>'customer_type')=context_value->>'customer_item') then raise exception 'Offset voucher lost source identity, carrying amounts, AR original currency or required auxiliary items';end if;
 if primary_currency is not null then
  if not exists(select 1 from public.fms_voucher_line where voucher_id=voucher_ident and subject_id=(context_value->>'payable_subject')::uuid and currency_id=primary_currency
   and original_amount=matched.amount and exchange_rate=(payload->>'primary_exchange_rate')::numeric) then raise exception 'Offset voucher replaced the AP historical original and rate';end if;
 elsif exists(select 1 from public.fms_voucher_line where voucher_id=voucher_ident and subject_id=(context_value->>'payable_subject')::uuid and(currency_id is not null or original_amount<>0 or exchange_rate<>1)) then
  raise exception 'Base-currency AP was incorrectly marked as foreign currency';
 end if;
 if not exists(select 1 from public.fms_voucher_line where voucher_id=voucher_ident and subject_id=(context_value->>'exchange_subject')::uuid
  and debit_amount-credit_amount=matched.receivable_base_amount-matched.payable_base_amount and currency_id is null and original_amount=0 and exchange_rate=1) then
  raise exception 'Exchange gain/loss amount, direction or base-currency identity is wrong';end if;
 select id into source_line from public.fms_voucher_line where voucher_id=voucher_ident and subject_id=(context_value->>'receivable_subject')::uuid;
 blocked:=false;
 begin update public.fms_voucher_line set credit_amount=credit_amount+0.02 where id=source_line;exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'A generated source voucher could be assigned a fabricated carrying adjustment';end if;
 blocked:=false;
 begin update public.fms_voucher_line set exchange_rate=99 where id=source_line;exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'A source voucher could be repriced at the current master rate';end if;
 insert into public.fms_auxiliary_item(tenant_id,account_set_id,auxiliary_type_id,item_code,item_name,external_entity_type,external_entity_id)
 values(matched.tenant_id,matched.account_set_id,(context_value->>'customer_type')::uuid,'OTHER_'||upper(left(gen_random_uuid()::text,8)),'不属于原往来单位的回滚核算项','mdm_customer',gen_random_uuid()) returning id into forged_item;
 blocked:=false;
 begin update public.fms_voucher_line set auxiliary_values=jsonb_set(auxiliary_values,array[context_value->>'customer_type'],to_jsonb(forged_item::text)) where id=source_line;
 exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'A source voucher was transferred to another auxiliary counterparty';end if;
 insert into public.fms_posting_rule(tenant_id,account_set_id,rule_code,rule_name,source_type,event_code,priority,submission_mode,voucher_type,match_conditions)
 values(matched.tenant_id,matched.account_set_id,'AP_AR_UNUSED_'||upper(left(gen_random_uuid()::text,8)),'不是原制证规则的回滚配置','system','ap_receivable_offset_approved',1,'draft','transfer',
  jsonb_build_object('writeoff_record_id',record_ident,'fx_snapshot_version',1)) returning id into alternate_rule;
 insert into public.fms_posting_rule_line(tenant_id,account_set_id,rule_id,line_no,subject_id,direction,amount_key,auxiliary_bindings)
 values(matched.tenant_id,matched.account_set_id,alternate_rule,10,(context_value->>'receivable_subject')::uuid,'credit','receivable_amount',
  jsonb_build_object(context_value->>'customer_type','customer_id')) returning id into alternate_line;
 blocked:=false;
 begin update public.fms_voucher_line set source_line_id=alternate_line where id=source_line;exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'A generated source voucher was rebound to another posting rule';end if;
 update public.fms_voucher_line set summary=coalesce(summary,'')||'，核对原业务分摊' where id=source_line;
 insert into public.sys_role_menu(role_id,menu_id,tenant_id)
 select role.id,menu.id,matched.tenant_id from public.sys_role role cross join public.sys_menu menu where role.tenant_id=matched.tenant_id and role.role_code=context_value->>'fixture_role_code'
  and menu.name in('FinanceVoucherCenter','FinanceVoucherCenter:View','FinanceVoucherCenter:Add') on conflict do nothing;
 prior_system_posting:=coalesce(nullif(current_setting('app.fms_system_posting',true),''),'off');
 perform set_config('app.fms_system_posting','off',true);
 blocked:=false;
 begin
  perform public.save_fms_voucher(jsonb_build_object('accountSetId',matched.account_set_id,'voucherDate',matched.writeoff_date,'voucherType','transfer','sourceType','manual',
   'summary','不能套用业务尾差保护伪造普通外币凭证','lines',jsonb_build_array(
    jsonb_build_object('lineNo',1,'subjectId',context_value->>'receivable_subject','auxiliaryValues',jsonb_build_object(context_value->>'customer_type',context_value->>'customer_item'),
     'currencyId',secondary_currency,'exchangeRate',7.333333,'originalAmount',0.01,'debitAmount',0.09,'creditAmount',0),
    jsonb_build_object('lineNo',2,'subjectId',context_value->>'receivable_subject','auxiliaryValues',jsonb_build_object(context_value->>'customer_type',context_value->>'customer_item'),
     'currencyId',secondary_currency,'exchangeRate',7.333333,'originalAmount',0.01,'debitAmount',0,'creditAmount',0.09))));
 exception when check_violation then blocked:=true;end;
 perform set_config('app.fms_system_posting',prior_system_posting,true);
 if not blocked then raise exception 'Ordinary manual foreign vouchers bypassed the original one-cent conversion check';end if;
 result:=public.fms_payable_settlement_voucher_secure(record_ident,'writeoff',false);
 if(result->'voucher_ids'->>0)::uuid<>voucher_ident then raise exception 'Repeated offset generation duplicated a voucher';end if;
 blocked:=false;
 begin perform public.fms_reverse_payable_writeoff_secure(record_ident,'有凭证时禁止直接反核销');exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Offset could be reversed before its generated voucher was voided';end if;
 if(select count(*) from public.fms_fund_ledger_entry)<>(context_value->>'fund_count')::bigint
  or exists(select 1 from public.fms_cash_flow_allocation allocation join public.fms_voucher_line line on line.id=allocation.voucher_line_id where line.voucher_id=voucher_ident) then
  raise exception 'Noncash AP/AR posting generated cash movement or a fictitious cash-flow allocation';end if;
 perform set_config('qa.ap_ar_fx_'||p_case,(context_value||jsonb_build_object('voucher',voucher_ident))::text,true);
 return jsonb_build_object('case',p_case,'status','passed','voucher',voucher_ident,'payable_base',matched.payable_base_amount,'receivable_base',matched.receivable_base_amount);
end $post$;

create function pg_temp.reverse_ar_fx_voucher(p_case integer) returns jsonb
language plpgsql as $reverse$
declare context_value jsonb:=current_setting('qa.ap_ar_fx_'||p_case)::jsonb;record_ident uuid;event public.fms_posting_event;original_roles text[];blocked boolean;
begin
 perform public.transition_fms_voucher((context_value->>'voucher')::uuid,'void','回滚验收先作废凭证再反核销',null);
 blocked:=false;
 begin perform public.fms_payable_settlement_voucher_secure((context_value->>'posting_record')::uuid,'writeoff',false);exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'A voided offset voucher was reported as an active generated voucher';end if;
 select * into event from public.fms_posting_event where source_id=(context_value->>'posting_record')::uuid and event_code='ap_receivable_offset_approved' and tenant_id=(context_value->>'tenant')::uuid;
 event:=app_private.process_fms_posting_event(event.id,true);
 if event.status<>'ignored' then raise exception 'Background retry reused a voided voucher before the offset was reversed';end if;
 for record_ident in select value::uuid from jsonb_array_elements_text(context_value->'records') loop
  perform public.fms_reverse_payable_writeoff_secure(record_ident,'作废后按原币与原本位币追加反向流水');
 end loop;
 select * into event from public.fms_posting_event where source_id=(context_value->>'posting_record')::uuid and event_code='ap_receivable_offset_approved' and tenant_id=(context_value->>'tenant')::uuid;
 event:=app_private.process_fms_posting_event(event.id,true);
 if event.status<>'ignored' then raise exception 'Forced background retry revived a reversed FX offset voucher';end if;
 set constraints payable_receivable_record_consistency,payable_receivable_application_consistency immediate;
 if(app_private.payable_writeoff_source_values((context_value->>'payable')::uuid)->>'unpaid_amount')::numeric<>(context_value->>'primary_amount')::numeric
  or app_private.payable_unwritten_base_amount((context_value->>'payable')::uuid)<>round((context_value->>'primary_amount')::numeric*(context_value->>'primary_rate')::numeric,2)
  or app_private.ar_line_balance((context_value->>'line')::uuid,false)<>(case when p_case=5 then 0.07 else 0.03 end)
  or(app_private.ar_line_book_balance((context_value->>'line')::uuid)->>'base_remaining')::numeric<>(case when p_case=5 then 0.51 else 0.22 end)
  or(select count(*) from public.fms_fund_ledger_entry)<>(context_value->>'fund_count')::bigint then raise exception 'Posted then voided FX offset did not restore exact balances without cash';end if;
 if p_case=2 then
  update public.fms_account_set set is_default=false where id=(context_value->>'other_book')::uuid;
  update public.fms_account_set set is_default=true where id=(context_value->>'book')::uuid;
 end if;
 select array_agg(value) into original_roles from jsonb_array_elements_text(context_value->'original_roles');
 update public.sys_user set user_roles=original_roles where id=(context_value->>'profile')::uuid;
 set constraints payable_receivable_record_consistency,payable_receivable_application_consistency deferred;
 return jsonb_build_object('case',p_case,'status','passed','reversed',jsonb_array_length(context_value->'records'));
end $reverse$;

select pg_temp.prepare_payable_receivable_fx(1);
select pg_temp.match_payable_receivable_fx(1);
select pg_temp.configure_ar_fx_posting(1,'missing_rule');
select pg_temp.configure_ar_fx_posting(1,'forged_event');
select pg_temp.configure_ar_fx_posting(1,'configure');
select pg_temp.post_ar_fx_voucher(1);
select pg_temp.reverse_ar_fx_voucher(1);
select pg_temp.prepare_payable_receivable_fx(2);
select pg_temp.match_payable_receivable_fx(2);
select pg_temp.configure_ar_fx_posting(2,'missing_rule');
select pg_temp.configure_ar_fx_posting(2,'forged_event');
select pg_temp.configure_ar_fx_posting(2,'configure');
select pg_temp.post_ar_fx_voucher(2);
select pg_temp.reverse_ar_fx_voucher(2);
select pg_temp.prepare_payable_receivable_fx(3);
select pg_temp.match_payable_receivable_fx(3);
select pg_temp.configure_ar_fx_posting(3,'missing_rule');
select pg_temp.configure_ar_fx_posting(3,'forged_event');
select pg_temp.configure_ar_fx_posting(3,'configure');
select pg_temp.post_ar_fx_voucher(3);
select pg_temp.reverse_ar_fx_voucher(3);
select pg_temp.prepare_payable_receivable_fx(4);
select pg_temp.match_payable_receivable_fx(4);
select pg_temp.configure_ar_fx_posting(4,'missing_rule');
select pg_temp.configure_ar_fx_posting(4,'forged_event');
select pg_temp.configure_ar_fx_posting(4,'configure');
select pg_temp.post_ar_fx_voucher(4);
select pg_temp.reverse_ar_fx_voucher(4);
select pg_temp.prepare_ar_fx_rounding_posting();
select pg_temp.configure_ar_fx_posting(5,'missing_rule');
select pg_temp.configure_ar_fx_posting(5,'forged_event');
select pg_temp.configure_ar_fx_posting(5,'configure');
select pg_temp.post_ar_fx_voucher(5);
select pg_temp.reverse_ar_fx_voucher(5);
rollback;
