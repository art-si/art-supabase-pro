begin;
set local jit=off;
set local statement_timeout='8s';

create function pg_temp.prepare_tms_receivable_virtual_payment(p_case integer) returns jsonb
language plpgsql as $prepare$
declare context_value jsonb:=current_setting('qa.tms_ar_'||p_case)::jsonb;method_ident uuid;payment jsonb;
begin
 select id into method_ident from public.mdm_settlement_method where tenant_id=(context_value->>'tenant')::uuid
  and category='virtual' and enabled order by code limit 1;
 if method_ident is null then raise exception 'Missing native virtual settlement method fixture';end if;
 payment:=public.fms_push_payable_settlement_secure((context_value->>'payable')::uuid,'payment');
 payment:=public.fms_save_payable_settlement_secure(payment||jsonb_build_object('lines',(
  select jsonb_agg(line||jsonb_build_object('settlement_method_id',method_ident,'fund_account_id',null,
   'amount',0.05,'approved_amount',0.05,'planned_amount',0.05)) from jsonb_array_elements(payment->'lines') line)));
 perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'submit');
 perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'approve');
 perform set_config('qa.tms_ar_'||p_case,(context_value||jsonb_build_object('virtual_payment',payment->>'id'))::text,true);
 return jsonb_build_object('case',p_case,'status','virtual_payment_approved');
end $prepare$;

create function pg_temp.confirm_tms_receivable_virtual_payment(p_case integer) returns jsonb
language plpgsql as $confirm$
declare context_value jsonb:=current_setting('qa.tms_ar_'||p_case)::jsonb;result jsonb;
begin
 result:=public.fms_act_payable_settlement_secure(array[(context_value->>'virtual_payment')::uuid],'confirm');
 if result->0->>'status' is distinct from 'confirmed' then raise exception 'Existing virtual transport payment did not confirm';end if;
 if(select settled_amount from public.tms_carrier_statement where id=(context_value->>'statement')::uuid) is distinct from 0.07
  or(select count(*) from public.fms_fund_ledger_entry)<>(context_value->>'fund_count')::bigint
  or(select count(*) from public.tms_cash_transaction)<>(context_value->>'cash_count')::bigint
  or(select count(*) from app_private.carrier_statement_noncash_writeoffs where statement_id=(context_value->>'statement')::uuid and current_active)<>1 then
  raise exception 'Virtual transport compatibility lost native cash or duplicated noncash settlement';end if;
 perform set_config('qa.tms_ar_'||p_case,(context_value||jsonb_build_object('initial_settled',0.07))::text,true);
 return jsonb_build_object('case',p_case,'status','virtual_payment_confirmed');
end $confirm$;

create function pg_temp.check_tms_receivable_parallel_settlement(p_case integer) returns jsonb
language plpgsql as $parallel$
declare context_value jsonb:=current_setting('qa.tms_ar_'||p_case)::jsonb;
begin
 if(select count(*) from app_private.carrier_statement_noncash_writeoffs where statement_id=(context_value->>'statement')::uuid and current_active)<>2
  or app_private.carrier_statement_settlement_total((context_value->>'statement')::uuid) is distinct from 0.07+(context_value->>'offset_amount')::numeric then
  raise exception 'Native cash, virtual payment and receivable offset did not coexist exactly once';end if;
 if exists(select 1 from app_private.carrier_statement_noncash_writeoffs where record_id=(context_value->'records'->>0)::uuid
  and(execution_id is not null or execution_status is not null or payment_document_id is not null)) then
  raise exception 'Receivable offset fabricated a payment execution to coexist with virtual settlement';end if;
 return jsonb_build_object('case',p_case,'status','parallel_native_settlement_passed');
end $parallel$;

create function pg_temp.cancel_tms_receivable_virtual_payment(p_case integer) returns jsonb
language plpgsql as $cancel$
declare context_value jsonb:=current_setting('qa.tms_ar_'||p_case)::jsonb;result jsonb;
begin
 result:=public.fms_act_payable_settlement_secure(array[(context_value->>'virtual_payment')::uuid],'cancel_payment','回滚验收恢复原运输虚拟结算');
 if result->0->>'status' is distinct from 'approved'
  or(select settled_amount from public.tms_carrier_statement where id=(context_value->>'statement')::uuid) is distinct from 0.02
  or(select count(*) from app_private.carrier_statement_noncash_writeoffs where statement_id=(context_value->>'statement')::uuid and current_active)<>0
  or(select count(*) from public.fms_fund_ledger_entry)<>(context_value->>'fund_count')::bigint
  or(select count(*) from public.tms_cash_transaction)<>(context_value->>'cash_count')::bigint then
  raise exception 'Virtual payment cancellation did not preserve original native cash and reversed AR offset history';end if;
 perform set_config('qa.tms_ar_'||p_case,(context_value||jsonb_build_object('initial_settled',0.02))::text,true);
 return jsonb_build_object('case',p_case,'status','virtual_payment_cancelled');
end $cancel$;

select pg_temp.prepare_ar_application_base('USD');
select pg_temp.prepare_tms_receivable_case(1);
select pg_temp.create_tms_receivable_cost(1);
select pg_temp.create_tms_receivable_statement(1);
select pg_temp.create_tms_receivable_documents(1);
select pg_temp.create_tms_receivable_native_application(1);
select pg_temp.create_tms_receivable_native_cash(1);
select pg_temp.prepare_tms_receivable_virtual_payment(1);
select pg_temp.confirm_tms_receivable_virtual_payment(1);
select pg_temp.check_tms_receivable_case(1,'before');
select pg_temp.match_tms_receivable_case(1);
select pg_temp.check_tms_receivable_case(1,'after');
select pg_temp.check_tms_receivable_parallel_settlement(1);
select pg_temp.reverse_tms_receivable_case(1);
select pg_temp.check_tms_receivable_case(1,'restored');
select pg_temp.cancel_tms_receivable_virtual_payment(1);
select pg_temp.check_tms_receivable_case(1,'restored');
rollback;
