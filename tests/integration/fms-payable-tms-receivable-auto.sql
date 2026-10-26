begin;
set local jit=off;
set local statement_timeout='8s';

create function pg_temp.preview_tms_receivable_auto(p_case integer,p_mode text) returns jsonb
language plpgsql as $preview$
declare context_value jsonb:=current_setting('qa.tms_ar_'||p_case)::jsonb;query_value jsonb;plan jsonb;repeated jsonb;
 expected_amount numeric:=case when p_mode='full_pair' then 2.98 else 0.22 end;
begin
 if p_mode not in('same_currency','book_equivalent','full_pair') then raise exception 'Unsupported transport allocation fixture mode';end if;
 update public.fms_payable_writeoff_scheme set automatic=true where id=(context_value->>'scheme')::uuid;
 query_value:=jsonb_build_object('relation','payable_receivable','document_ids',jsonb_build_array(context_value->>'payable',context_value->>'document'),
  'allow_cross_party',true,'cross_currency_mode',p_mode);
 plan:=public.fms_auto_payable_writeoff_secure((context_value->>'scheme')::uuid,app_private.payable_business_date(),query_value,false);
 if p_mode='same_currency' then
  if jsonb_array_length(plan->'items')<>0 then raise exception 'Same-currency transport allocation silently included a USD receivable';end if;
 else
  if jsonb_array_length(plan->'items')<>1 or not exists(select 1 from jsonb_array_elements(plan->'items') item
   where item->>'payable_id'=context_value->>'payable' and item->>'receivable_line_id'=context_value->>'line'
    and item->>'supplier_name'=context_value->>'carrier_name' and item->>'currency_code'='CNY' and item->>'secondary_currency_code'='USD'
    and(item->>'amount')::numeric=expected_amount and(item->>'receivable_amount')::numeric=0.03
    and(item->>'payable_base_amount')::numeric=expected_amount and(item->>'receivable_base_amount')::numeric=0.22
    and(item->>'secondary_exchange_rate')::numeric=7.333333 and(item->>'needs_voucher')::boolean) then
   raise exception 'Transport automatic plan did not retain native remaining principal and independent AR carrying values: %',plan;end if;
  update public.fms_exchange_rate set direct_rate=123 where account_set_id=(context_value->>'book')::uuid
   and rate_date=app_private.payable_business_date() and currency_id in(select id from public.fms_currency
    where account_set_id=(context_value->>'book')::uuid and currency_code='USD');
  repeated:=public.fms_auto_payable_writeoff_secure((context_value->>'scheme')::uuid,app_private.payable_business_date(),query_value,false);
  if repeated->>'plan_token' is distinct from plan->>'plan_token' then raise exception 'Current FX master repriced native transport/AR originals';end if;
 end if;
 perform set_config('qa.tms_ar_'||p_case,(context_value||jsonb_build_object('auto_query',query_value,'auto_plan',plan,'auto_amount',expected_amount))::text,true);
 return jsonb_build_object('case',p_case,'mode',p_mode,'status','auto_previewed');
end $preview$;

create function pg_temp.reserve_tms_receivable_source(p_case integer) returns jsonb
language plpgsql as $reserve$
declare context_value jsonb:=current_setting('qa.tms_ar_'||p_case)::jsonb;reservation uuid;
begin
 perform pg_temp.use_tms_receivable_actor(p_case,true);
 reservation:=public.save_tms_carrier_payment_application_secure(null,(context_value->>'carrier')::uuid,
  app_private.payable_business_date(),2.98,'bank_transfer','[]','运输抵销自动方案必须尊重的原生付款申请预留',
  jsonb_build_array(jsonb_build_object('statement_id',context_value->>'statement','amount',2.98)),null);
 perform set_config('qa.tms_ar_'||p_case,(context_value||jsonb_build_object('native_reservation',reservation))::text,true);
 perform pg_temp.use_tms_receivable_actor(p_case,false);
 return jsonb_build_object('case',p_case,'status','native_source_reserved');
end $reserve$;

create function pg_temp.check_tms_receivable_reservation(p_case integer) returns jsonb
language plpgsql as $check$
declare context_value jsonb:=current_setting('qa.tms_ar_'||p_case)::jsonb;blocked boolean;plan jsonb;
begin
 blocked:=false;
 begin perform public.fms_auto_payable_writeoff_secure((context_value->>'scheme')::uuid,app_private.payable_business_date(),
  context_value->'auto_query',true,context_value->'auto_plan'->>'plan_token');exception when serialization_failure then blocked:=true;end;
 if not blocked then raise exception 'Stale automatic transport plan consumed a newly reserved native statement';end if;
 blocked:=false;
 begin perform public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('relation','payable_receivable',
  'payable_id',context_value->>'payable','receivable_line_id',context_value->>'line','amount',0.01,'receivable_amount',0.01,'allow_cross_party',true)),
  (context_value->>'scheme')::uuid,app_private.payable_business_date(),'原生申请已预留，不得占用');exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Manual transport offset consumed a native payment application reservation';end if;
 plan:=public.fms_auto_payable_writeoff_secure((context_value->>'scheme')::uuid,app_private.payable_business_date(),context_value->'auto_query',false);
 if jsonb_array_length(plan->'items')<>0 or exists(select 1 from public.fms_payable_writeoff_record where payable_id=(context_value->>'payable')::uuid and status='active') then
  raise exception 'Reserved native source remained auto-selectable or stale rejection committed a partial offset';end if;
 return jsonb_build_object('case',p_case,'status','native_reservation_protected');
end $check$;

create function pg_temp.approve_tms_receivable_reservation(p_case integer) returns jsonb
language plpgsql as $approve$
declare context_value jsonb:=current_setting('qa.tms_ar_'||p_case)::jsonb;reservation uuid:=(context_value->>'native_reservation')::uuid;
begin
 perform pg_temp.use_tms_receivable_actor(p_case,true);
 perform public.validate_tms_carrier_payment_application_submission_secure(reservation);
 perform public.start_workflow('tms_carrier_payment_application',reservation,context_value->>'marker',
  jsonb_build_object('amount',2.98,'carrierId',context_value->>'carrier','statementCount',1),gen_random_uuid()::text);
 if(select status from public.tms_carrier_payment_application where id=reservation)='pending_review' then
  perform public.act_workflow_by_business('tms_carrier_payment_application',reservation,'approve','回滚验收取消前完成真实审批',gen_random_uuid()::text);
 end if;
 if(select status from public.tms_carrier_payment_application where id=reservation) is distinct from 'approved' then
  raise exception 'Native reservation application was not approved';end if;
 perform pg_temp.use_tms_receivable_actor(p_case,false);
 return jsonb_build_object('case',p_case,'status','native_reservation_approved');
end $approve$;

create function pg_temp.cancel_tms_receivable_reservation(p_case integer) returns jsonb
language plpgsql as $cancel$
declare context_value jsonb:=current_setting('qa.tms_ar_'||p_case)::jsonb;
begin
 insert into public.sys_role_menu(tenant_id,role_id,menu_id) select(context_value->>'tenant')::uuid,(context_value->>'fixture_role')::uuid,id
  from public.sys_menu where name='FinanceCarrierPaymentApplication:Cancel' on conflict do nothing;
 perform pg_temp.use_tms_receivable_actor(p_case,true);
 perform public.cancel_tms_carrier_payment_application_secure((context_value->>'native_reservation')::uuid,'回滚验收取消原生预留，再核对自动方案');
 if app_private.payable_reserved_amount((context_value->>'payable')::uuid)<>0 then raise exception 'Cancelled native payment application did not release its source reservation';end if;
 perform pg_temp.use_tms_receivable_actor(p_case,false);
 return jsonb_build_object('case',p_case,'status','native_reservation_cancelled');
end $cancel$;

create function pg_temp.execute_tms_receivable_auto(p_case integer) returns jsonb
language plpgsql as $execute$
declare context_value jsonb:=current_setting('qa.tms_ar_'||p_case)::jsonb;result jsonb;matched public.fms_payable_writeoff_record;
 amount_value numeric:=(context_value->>'auto_amount')::numeric;
begin
 result:=public.fms_auto_payable_writeoff_secure((context_value->>'scheme')::uuid,app_private.payable_business_date(),
  context_value->'auto_query',true,context_value->'auto_plan'->>'plan_token');
 if(result->>'executed')::boolean is distinct from true or jsonb_array_length(result->'record_ids')<>1 then
  raise exception 'Automatic transport/AR offset was not committed atomically';end if;
 select * into matched from public.fms_payable_writeoff_record where id=(result->'record_ids'->>0)::uuid;
 if matched.amount is distinct from amount_value or matched.receivable_amount is distinct from 0.03
  or matched.payable_base_amount is distinct from amount_value or matched.receivable_base_amount is distinct from 0.22
  or app_private.payable_receivable_writeoff_valid(matched.id) is distinct from true
  or(select settled_amount from public.tms_carrier_statement where id=(context_value->>'statement')::uuid) is distinct from 0.02+amount_value
  or(app_private.ar_line_book_balance((context_value->>'line')::uuid)->>'original_remaining')::numeric is distinct from 0
  or(app_private.ar_line_book_balance((context_value->>'line')::uuid)->>'base_remaining')::numeric is distinct from 0
  or app_private.payable_unwritten_base_amount((context_value->>'payable')::uuid) is distinct from 2.98-amount_value then
  raise exception 'Automatic transport offset diverged from native AR, original statement or previewed carrying values';end if;
 if(select count(*) from public.fms_fund_ledger_entry)<>(context_value->>'fund_count')::bigint
  or(select count(*) from public.tms_cash_transaction)<>(context_value->>'cash_count')::bigint then
  raise exception 'Automatic transport/AR offset manufactured cash movement';end if;
 perform set_config('qa.tms_ar_'||p_case,(context_value||jsonb_build_object('records',result->'record_ids'))::text,true);
 set constraints all immediate;
 set constraints all deferred;
 return jsonb_build_object('case',p_case,'status','native_auto_executed');
end $execute$;

select pg_temp.prepare_ar_application_base('USD');
select pg_temp.prepare_tms_receivable_case(1);
select pg_temp.create_tms_receivable_cost(1);
select pg_temp.create_tms_receivable_statement(1);
select pg_temp.create_tms_receivable_documents(1);
select pg_temp.create_tms_receivable_native_application(1);
select pg_temp.create_tms_receivable_native_cash(1);
select pg_temp.preview_tms_receivable_auto(1,'same_currency');
select pg_temp.preview_tms_receivable_auto(1,'full_pair');
select pg_temp.preview_tms_receivable_auto(1,'book_equivalent');
select pg_temp.reserve_tms_receivable_source(1);
select pg_temp.check_tms_receivable_reservation(1);
select pg_temp.approve_tms_receivable_reservation(1);
select pg_temp.check_tms_receivable_reservation(1);
select pg_temp.cancel_tms_receivable_reservation(1);
select pg_temp.preview_tms_receivable_auto(1,'book_equivalent');
select pg_temp.execute_tms_receivable_auto(1);
select pg_temp.reverse_tms_receivable_case(1);
select pg_temp.check_tms_receivable_case(1,'restored');
select pg_temp.preview_tms_receivable_auto(1,'full_pair');
select pg_temp.execute_tms_receivable_auto(1);
select pg_temp.reverse_tms_receivable_case(1);
select pg_temp.check_tms_receivable_case(1,'restored');
rollback;
