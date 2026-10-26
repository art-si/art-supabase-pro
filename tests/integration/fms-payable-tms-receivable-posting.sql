begin;
set local jit=off;
set local statement_timeout='8s';

create function pg_temp.configure_tms_receivable_posting(p_case integer) returns jsonb
language plpgsql as $configure$
declare context_value jsonb:=current_setting('qa.tms_ar_'||p_case)::jsonb;tenant uuid:=(context_value->>'tenant')::uuid;
 book uuid:=(context_value->>'book')::uuid;record_ident uuid:=(context_value->'records'->>0)::uuid;payload jsonb;
 payable_subject uuid;receivable_subject uuid;exchange_subject uuid;carrier_type uuid;customer_type uuid;carrier_item uuid;customer_item uuid;
 customer uuid;rule_ident uuid;suffix text:=to_char(clock_timestamp(),'YYYYMMDDHH24MISSUS');
begin
 payload:=app_private.payable_receivable_writeoff_posting_payload(record_ident);
 if payload->>'carrier_id' is distinct from context_value->>'carrier'
  or payload->>'source_statement_id' is distinct from context_value->>'statement'
  or(payload->>'has_actual_cash')::boolean is distinct from false
  or(payload->>'paid_amount')::numeric is distinct from 0 then
  raise exception 'Transport offset posting lost its real carrier, statement or noncash identity';end if;
 update public.fms_posting_rule set is_enabled=false where account_set_id=book and source_type='system' and event_code='ap_receivable_offset_approved';
 insert into public.fms_subject(tenant_id,account_set_id,subject_code,subject_name,category,balance_direction)
 values(tenant,book,'981'||suffix,'运输抵销原应付回滚科目','liability','credit') returning id into payable_subject;
 insert into public.fms_subject(tenant_id,account_set_id,subject_code,subject_name,category,balance_direction,allow_foreign_currency)
 values(tenant,book,'982'||suffix,'运输抵销原应收回滚科目','asset','debit',true) returning id into receivable_subject;
 insert into public.fms_subject(tenant_id,account_set_id,subject_code,subject_name,category,balance_direction)
 values(tenant,book,'983'||suffix,'运输抵销真实汇兑损益回滚科目','expense','debit') returning id into exchange_subject;
 insert into public.fms_auxiliary_type(tenant_id,account_set_id,type_code,type_name,source_type)
 values(tenant,book,'TMS_CARRIER_'||upper(left(gen_random_uuid()::text,8)),'运输抵销原承运商回滚维度','carrier') returning id into carrier_type;
 insert into public.fms_auxiliary_type(tenant_id,account_set_id,type_code,type_name,source_type)
 values(tenant,book,'TMS_CUSTOMER_'||upper(left(gen_random_uuid()::text,8)),'运输抵销原客户回滚维度','customer') returning id into customer_type;
 select customer_id into customer from public.fms_receivable_document where id=(context_value->>'document')::uuid;
 insert into public.fms_auxiliary_item(tenant_id,account_set_id,auxiliary_type_id,item_code,item_name,external_entity_type,external_entity_id)
 values(tenant,book,carrier_type,'CARRIER_'||upper(left(gen_random_uuid()::text,8)),context_value->>'carrier_name','mdm_carrier',
  (context_value->>'carrier')::uuid) returning id into carrier_item;
 insert into public.fms_auxiliary_item(tenant_id,account_set_id,auxiliary_type_id,item_code,item_name,external_entity_type,external_entity_id)
 values(tenant,book,customer_type,'CUSTOMER_'||upper(left(gen_random_uuid()::text,8)),'运输抵销原客户回滚项','mdm_customer',customer) returning id into customer_item;
 insert into public.fms_subject_auxiliary_type(tenant_id,account_set_id,subject_id,auxiliary_type_id,is_required)
 values(tenant,book,payable_subject,carrier_type,true),(tenant,book,receivable_subject,customer_type,true);
 insert into public.fms_posting_rule(tenant_id,account_set_id,rule_code,rule_name,source_type,event_code,priority,submission_mode,voucher_type,match_conditions)
 values(tenant,book,'TMS_AR_POST_'||upper(left(gen_random_uuid()::text,8)),'原运输应付抵销回滚制证规则','system','ap_receivable_offset_approved',999999,'draft','transfer',
  jsonb_build_object('writeoff_record_id',record_ident,'fx_snapshot_version',1)) returning id into rule_ident;
 insert into public.fms_posting_rule_line(tenant_id,account_set_id,rule_id,line_no,subject_id,direction,amount_key,auxiliary_bindings)
 values(tenant,book,rule_ident,10,payable_subject,'debit','payable_base_amount',jsonb_build_object(carrier_type,'carrier_id')),
  (tenant,book,rule_ident,20,receivable_subject,'credit','receivable_amount',jsonb_build_object(customer_type,'customer_id')),
  (tenant,book,rule_ident,30,exchange_subject,'debit','exchange_gain_loss','{}');
 context_value:=context_value||jsonb_build_object('posting_record',record_ident,'payable_subject',payable_subject,'receivable_subject',receivable_subject,
  'exchange_subject',exchange_subject,'carrier_type',carrier_type,'customer_type',customer_type,'carrier_item',carrier_item,'customer_item',customer_item,'rule',rule_ident);
 perform set_config('qa.tms_ar_'||p_case,context_value::text,true);
 return jsonb_build_object('case',p_case,'status','posting_configured');
end $configure$;

create function pg_temp.preview_tms_receivable_posting(p_case integer) returns jsonb
language plpgsql as $preview$
declare context_value jsonb:=current_setting('qa.tms_ar_'||p_case)::jsonb;result jsonb;
begin
 result:=public.fms_payable_settlement_voucher_secure((context_value->>'posting_record')::uuid,'writeoff',true);
 if jsonb_array_length(result->'lines')<>3
  or(select sum((line->>'debit_amount')::numeric-(line->>'credit_amount')::numeric) from jsonb_array_elements(result->'lines') line)<>0 then
  raise exception 'Transport offset preview did not balance historical carrying amounts and real exchange gain/loss';end if;
 if not exists(select 1 from jsonb_array_elements(result->'lines') line where line->>'subject_name'='运输抵销原应收回滚科目'
  and line->>'currency_code'='USD' and(line->>'original_amount')::numeric=0.01 and(line->>'exchange_rate')::numeric=7.333333) then
  raise exception 'Transport offset preview replaced the native AR original currency or historical rate';end if;
 return jsonb_build_object('case',p_case,'status','posting_previewed');
end $preview$;

create function pg_temp.generate_tms_receivable_posting(p_case integer) returns jsonb
language plpgsql as $generate$
declare context_value jsonb:=current_setting('qa.tms_ar_'||p_case)::jsonb;result jsonb;voucher_ident uuid;
begin
 result:=public.fms_payable_settlement_voucher_secure((context_value->>'posting_record')::uuid,'writeoff',false);
 if result->>'status'<>'generated' or jsonb_array_length(result->'voucher_ids')<>1 then
  raise exception 'Transport offset did not generate its native carrier/customer voucher: %',result;end if;
 voucher_ident:=(result->'voucher_ids'->>0)::uuid;
 perform set_config('qa.tms_ar_'||p_case,(context_value||jsonb_build_object('voucher',voucher_ident))::text,true);
 return jsonb_build_object('case',p_case,'status','posting_generated');
end $generate$;

create function pg_temp.check_tms_receivable_posting(p_case integer) returns jsonb
language plpgsql as $check$
declare context_value jsonb:=current_setting('qa.tms_ar_'||p_case)::jsonb;matched public.fms_payable_writeoff_record;
 voucher_ident uuid:=(context_value->>'voucher')::uuid;blocked boolean;line_ident uuid;result jsonb;forged_item uuid;
begin
 select * into matched from public.fms_payable_writeoff_record where id=(context_value->>'posting_record')::uuid;
 if not exists(select 1 from public.fms_voucher where id=voucher_ident and account_set_id=matched.account_set_id and tenant_id=matched.tenant_id
  and source_id=matched.id and source_event_code='ap_receivable_offset_approved' and total_debit=total_credit)
  or not exists(select 1 from public.fms_voucher_line where voucher_id=voucher_ident and subject_id=(context_value->>'payable_subject')::uuid
   and debit_amount=matched.payable_base_amount and currency_id is null and original_amount=0 and exchange_rate=1
   and auxiliary_values->>(context_value->>'carrier_type')=context_value->>'carrier_item')
  or not exists(select 1 from public.fms_voucher_line where voucher_id=voucher_ident and subject_id=(context_value->>'receivable_subject')::uuid
   and credit_amount=matched.receivable_base_amount and currency_id is not null and original_amount=0.01 and exchange_rate=7.333333
   and auxiliary_values->>(context_value->>'customer_type')=context_value->>'customer_item')
  or not exists(select 1 from public.fms_voucher_line where voucher_id=voucher_ident and subject_id=(context_value->>'exchange_subject')::uuid
   and debit_amount-credit_amount=matched.receivable_base_amount-matched.payable_base_amount and currency_id is null and original_amount=0 and exchange_rate=1) then
  raise exception 'Transport offset voucher lost source carrying bases, historical AR rate or required carrier/customer auxiliary items';end if;
 result:=public.fms_payable_settlement_voucher_secure(matched.id,'writeoff',false);
 if(result->'voucher_ids'->>0)::uuid is distinct from voucher_ident then raise exception 'Transport offset generated a duplicate voucher';end if;
 blocked:=false;
 begin perform public.fms_reverse_payable_writeoff_secure(matched.id,'已制证运输抵销不得直接反核销');exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Posted transport offset could be reversed before its voucher was handled';end if;
 select id into line_ident from public.fms_voucher_line where voucher_id=voucher_ident and subject_id=(context_value->>'payable_subject')::uuid;
 select id into forged_item from public.fms_auxiliary_item where tenant_id=matched.tenant_id and account_set_id=matched.account_set_id
  and auxiliary_type_id=(context_value->>'carrier_type')::uuid and external_entity_id is distinct from(context_value->>'carrier')::uuid limit 1;
 if forged_item is null then
  insert into public.fms_auxiliary_item(tenant_id,account_set_id,auxiliary_type_id,item_code,item_name,external_entity_type,external_entity_id)
  select matched.tenant_id,matched.account_set_id,(context_value->>'carrier_type')::uuid,'OTHER_'||upper(left(gen_random_uuid()::text,8)),
   '不是原运输承运商的回滚核算项','mdm_carrier',carrier.id from public.mdm_carrier carrier
  where carrier.tenant_id=matched.tenant_id and carrier.id<>(context_value->>'carrier')::uuid order by carrier.id limit 1 returning id into forged_item;
 end if;
 if forged_item is null then raise exception 'Missing a distinct real carrier for source-proof rejection';end if;
 blocked:=false;
 begin update public.fms_voucher_line set auxiliary_values=jsonb_set(auxiliary_values,array[context_value->>'carrier_type'],to_jsonb(forged_item::text))
  where id=line_ident;exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Transport source voucher accepted another carrier auxiliary item';end if;
 if(select count(*) from public.fms_fund_ledger_entry)<>(context_value->>'fund_count')::bigint
  or(select count(*) from public.tms_cash_transaction)<>(context_value->>'cash_count')::bigint
  or exists(select 1 from public.fms_cash_flow_allocation allocation join public.fms_voucher_line line on line.id=allocation.voucher_line_id
   where line.voucher_id=voucher_ident) then raise exception 'Noncash transport offset posting manufactured cash or cash-flow allocations';end if;
 return jsonb_build_object('case',p_case,'status','posting_source_proved');
end $check$;

create function pg_temp.void_tms_receivable_posting(p_case integer) returns jsonb
language plpgsql as $void$
declare context_value jsonb:=current_setting('qa.tms_ar_'||p_case)::jsonb;
begin
 perform public.transition_fms_voucher((context_value->>'voucher')::uuid,'void','回滚验收先作废凭证再反核销',null);
 return jsonb_build_object('case',p_case,'status','posting_voided');
end $void$;

select pg_temp.prepare_ar_application_base('USD');
select pg_temp.prepare_tms_receivable_case(1);
select pg_temp.create_tms_receivable_cost(1);
select pg_temp.create_tms_receivable_statement(1);
select pg_temp.create_tms_receivable_documents(1);
select pg_temp.create_tms_receivable_native_application(1);
select pg_temp.create_tms_receivable_native_cash(1);
select pg_temp.match_tms_receivable_case(1);
select pg_temp.configure_tms_receivable_posting(1);
select pg_temp.preview_tms_receivable_posting(1);
select pg_temp.generate_tms_receivable_posting(1);
select pg_temp.check_tms_receivable_posting(1);
select pg_temp.check_tms_receivable_case(1,'after');
select pg_temp.void_tms_receivable_posting(1);
select pg_temp.reverse_tms_receivable_case(1);
select pg_temp.check_tms_receivable_case(1,'restored');
select pg_temp.prepare_ar_application_base('USD');
select pg_temp.prepare_tms_receivable_case(2);
select pg_temp.create_tms_receivable_cost(2);
select pg_temp.create_tms_receivable_statement(2);
select pg_temp.create_tms_receivable_documents(2);
select pg_temp.create_tms_receivable_native_application(2);
select pg_temp.create_tms_receivable_native_cash(2);
select pg_temp.match_tms_receivable_case(2);
select pg_temp.configure_tms_receivable_posting(2);
select pg_temp.preview_tms_receivable_posting(2);
select pg_temp.generate_tms_receivable_posting(2);
select pg_temp.check_tms_receivable_posting(2);
select pg_temp.check_tms_receivable_case(2,'after');
select pg_temp.void_tms_receivable_posting(2);
select pg_temp.reverse_tms_receivable_case(2);
select pg_temp.check_tms_receivable_case(2,'restored');
rollback;
