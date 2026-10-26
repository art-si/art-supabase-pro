begin;
set local jit=off;
set local statement_timeout='8s';

do $fixtures$
begin
 if to_regprocedure('pg_temp.check_payable_refund_fx(integer,integer)') is null
  or to_regprocedure('pg_temp.check_payable_refund_fx_matching(jsonb,boolean,text)') is null then
  raise exception 'Load the refund FX lifecycle fixture declarations in the same rollback transaction';
 end if;
end $fixtures$;

create function pg_temp.prepare_auto_refund_fx(p_context jsonb,p_mode text) returns jsonb
language plpgsql as $prepare$
declare parent_ident uuid;
begin
 perform set_config('request.jwt.claim.sub',p_context->>'actor',true);
 perform set_config('request.headers',(p_context->'headers')::text,true);
 if app_private.is_platform_super() then raise exception 'Automatic FX acceptance must use ordinary permissions';end if;
 update public.fms_payable_writeoff_scheme set automatic=true where id=(p_context->>'selected_scheme_id')::uuid and tenant_id=(p_context->>'tenant_id')::uuid;
 select document_id into parent_ident from public.fms_payable_settlement_line where id=(p_context->>'selected_payment_line_id')::uuid;
 return p_context||jsonb_build_object('mode',p_mode,'selected_parent_id',parent_ident,
  'query',jsonb_build_object('relation','payment_refund','cross_currency_mode',p_mode,
   'document_ids',jsonb_build_array(parent_ident,p_context->>'refund_id')),
  'ledger_count',(select count(*) from public.fms_fund_ledger_entry));
end $prepare$;

create function pg_temp.assert_auto_refund_fx(p_context jsonb,p_plan jsonb,p_count integer,p_payment numeric,p_refund numeric,p_refund_base numeric,p_executed boolean default false) returns void
language plpgsql as $assert$
declare item jsonb;matched public.fms_payable_writeoff_record;
begin
 if(p_plan->>'record_count')::integer<>p_count or jsonb_array_length(p_plan->'items')<>p_count then raise exception 'Unexpected automatic FX pair count';end if;
 if p_count=1 then
  item:=p_plan->'items'->0;
  if(item->>'amount')::numeric<>p_payment or(item->>'refund_amount')::numeric<>p_refund
   or(item->>'payment_base_amount')::numeric<>720 or(item->>'refund_base_amount')::numeric<>p_refund_base
   or(item->>'exchange_difference')::numeric<>p_refund_base-720 or(item->>'needs_voucher')::boolean is distinct from true
   or item->>'currency_code'<>(case when p_context->>'selected_payment_rate'='8' then 'EUR' else 'USD' end)
   or item->>'secondary_currency_code'<>'USD' or item->>'base_currency_code'<>'CNY'
   or(p_plan->>'total_amount')::numeric<>p_payment then
   raise exception 'Automatic FX preview mixed original amounts, local values or realized exchange difference';
  end if;
  if p_executed then
   select * into matched from public.fms_payable_writeoff_record where id=(p_plan->'record_ids'->>0)::uuid;
   if matched.payment_amount<>p_payment or matched.refund_amount<>p_refund or matched.payment_base_amount<>720
    or matched.refund_base_amount<>p_refund_base or matched.cash_discount_amount<>0 or matched.cash_discount_base_amount<>0 then
    raise exception 'Executed FX allocation differs from its confirmed plan';
   end if;
  end if;
 end if;
 if(select count(*) from public.fms_fund_ledger_entry)<>(p_context->>'ledger_count')::bigint then raise exception 'Automatic preview or writeoff generated another fund movement';end if;
end $assert$;

select pg_temp.check_payable_refund_fx(1,1);
select pg_temp.check_payable_refund_fx(1,2);
select pg_temp.check_payable_refund_fx(1,3);
select pg_temp.check_payable_refund_fx(1,4);
select pg_temp.check_payable_refund_fx(1,5);
select pg_temp.check_payable_refund_fx(1,6);
select set_config('test.fx.auto.context',pg_temp.check_payable_refund_fx(1,7)::text,true);
select set_config('test.fx.auto.context',pg_temp.check_payable_refund_fx_matching(current_setting('test.fx.auto.context')::jsonb,false,'prepare')::text,true);
select set_config('test.fx.auto.context',pg_temp.prepare_auto_refund_fx(current_setting('test.fx.auto.context')::jsonb,'same_currency')::text,true);
select set_config('test.fx.auto.plan',public.fms_auto_payable_writeoff_secure(
 (current_setting('test.fx.auto.context')::jsonb->>'selected_scheme_id')::uuid,
 (current_setting('test.fx.auto.context')::jsonb->>'business_date')::date,
 current_setting('test.fx.auto.context')::jsonb->'query',false)::text,true);
select pg_temp.assert_auto_refund_fx(current_setting('test.fx.auto.context')::jsonb,current_setting('test.fx.auto.plan')::jsonb,1,100,100,730,false);
select set_config('test.fx.auto.result',public.fms_auto_payable_writeoff_secure(
 (current_setting('test.fx.auto.context')::jsonb->>'selected_scheme_id')::uuid,
 (current_setting('test.fx.auto.context')::jsonb->>'business_date')::date,
 current_setting('test.fx.auto.context')::jsonb->'query',true,
 current_setting('test.fx.auto.plan')::jsonb->>'plan_token')::text,true);
select pg_temp.assert_auto_refund_fx(current_setting('test.fx.auto.context')::jsonb,current_setting('test.fx.auto.result')::jsonb,1,100,100,730,true);

select pg_temp.check_payable_refund_fx(1,1);
select pg_temp.check_payable_refund_fx(1,2);
select pg_temp.check_payable_refund_fx(1,3);
select pg_temp.check_payable_refund_fx(1,4);
select pg_temp.check_payable_refund_fx(1,5);
select pg_temp.check_payable_refund_fx(1,6);
select set_config('test.fx.auto.context',pg_temp.check_payable_refund_fx(1,7)::text,true);
select set_config('test.fx.auto.context',pg_temp.check_payable_refund_fx_matching(current_setting('test.fx.auto.context')::jsonb,true,'prepare')::text,true);
select set_config('test.fx.auto.context',pg_temp.prepare_auto_refund_fx(current_setting('test.fx.auto.context')::jsonb,'full_pair')::text,true);
select set_config('test.fx.auto.plan',public.fms_auto_payable_writeoff_secure(
 (current_setting('test.fx.auto.context')::jsonb->>'selected_scheme_id')::uuid,
 (current_setting('test.fx.auto.context')::jsonb->>'business_date')::date,
 current_setting('test.fx.auto.context')::jsonb->'query',false)::text,true);
select pg_temp.assert_auto_refund_fx(current_setting('test.fx.auto.context')::jsonb,current_setting('test.fx.auto.plan')::jsonb,1,90,100,730,false);

do $master_rate$
declare context_value jsonb:=current_setting('test.fx.auto.context')::jsonb;
begin
 update public.fms_exchange_rate set direct_rate=11 where account_set_id=(context_value->>'book_id')::uuid
  and currency_id in((context_value->>'currency_id')::uuid,(context_value->>'selected_currency_id')::uuid);
 perform set_config('test.fx.auto.original_token',current_setting('test.fx.auto.plan')::jsonb->>'plan_token',true);
end $master_rate$;
select set_config('test.fx.auto.plan',public.fms_auto_payable_writeoff_secure(
 (current_setting('test.fx.auto.context')::jsonb->>'selected_scheme_id')::uuid,
 (current_setting('test.fx.auto.context')::jsonb->>'business_date')::date,
 current_setting('test.fx.auto.context')::jsonb->'query',false)::text,true);
do $historical$
begin
 if current_setting('test.fx.auto.original_token') is distinct from current_setting('test.fx.auto.plan')::jsonb->>'plan_token' then
  raise exception 'Current exchange rates repriced the historical automatic plan';
 end if;
end $historical$;


select public.fms_act_payable_settlement_secure(array[(current_setting('test.fx.auto.context')::jsonb->>'selected_parent_id')::uuid],'cancel_payment','核对旧预览执行身份');
select public.fms_act_payable_settlement_secure(array[(current_setting('test.fx.auto.context')::jsonb->>'selected_parent_id')::uuid],'confirm');
do $stale$
declare context_value jsonb:=current_setting('test.fx.auto.context')::jsonb;blocked boolean:=false;
begin
 begin
  perform public.fms_auto_payable_writeoff_secure((context_value->>'selected_scheme_id')::uuid,(context_value->>'business_date')::date,
   context_value->'query',true,current_setting('test.fx.auto.plan')::jsonb->>'plan_token');
 exception when serialization_failure then blocked:=true;end;
 if not blocked then raise exception 'A cancelled and reconfirmed execution reused its old automatic preview';end if;
 perform set_config('test.fx.auto.context',(context_value||jsonb_build_object('ledger_count',(select count(*) from public.fms_fund_ledger_entry)))::text,true);
end $stale$;
select set_config('test.fx.auto.plan',public.fms_auto_payable_writeoff_secure(
 (current_setting('test.fx.auto.context')::jsonb->>'selected_scheme_id')::uuid,
 (current_setting('test.fx.auto.context')::jsonb->>'business_date')::date,
 current_setting('test.fx.auto.context')::jsonb->'query',false)::text,true);

select set_config('test.fx.auto.result',public.fms_auto_payable_writeoff_secure(
 (current_setting('test.fx.auto.context')::jsonb->>'selected_scheme_id')::uuid,
 (current_setting('test.fx.auto.context')::jsonb->>'business_date')::date,
 current_setting('test.fx.auto.context')::jsonb->'query',true,
 current_setting('test.fx.auto.plan')::jsonb->>'plan_token')::text,true);
select pg_temp.assert_auto_refund_fx(current_setting('test.fx.auto.context')::jsonb,current_setting('test.fx.auto.result')::jsonb,1,90,100,730,true);

select pg_temp.check_payable_refund_fx(1,1);
select pg_temp.check_payable_refund_fx(1,2);
select pg_temp.check_payable_refund_fx(1,3);
select pg_temp.check_payable_refund_fx(1,4);
select pg_temp.check_payable_refund_fx(1,5);
select pg_temp.check_payable_refund_fx(1,6);
select set_config('test.fx.auto.context',pg_temp.check_payable_refund_fx(1,7)::text,true);
select set_config('test.fx.auto.context',pg_temp.check_payable_refund_fx_matching(current_setting('test.fx.auto.context')::jsonb,true,'prepare')::text,true);
select set_config('test.fx.auto.context',pg_temp.prepare_auto_refund_fx(current_setting('test.fx.auto.context')::jsonb,'book_equivalent')::text,true);
select set_config('test.fx.auto.plan',public.fms_auto_payable_writeoff_secure(
 (current_setting('test.fx.auto.context')::jsonb->>'selected_scheme_id')::uuid,
 (current_setting('test.fx.auto.context')::jsonb->>'business_date')::date,
 current_setting('test.fx.auto.context')::jsonb->'query',false)::text,true);
select pg_temp.assert_auto_refund_fx(current_setting('test.fx.auto.context')::jsonb,current_setting('test.fx.auto.plan')::jsonb,1,90,98.63,720,false);
select set_config('test.fx.auto.result',public.fms_auto_payable_writeoff_secure(
 (current_setting('test.fx.auto.context')::jsonb->>'selected_scheme_id')::uuid,
 (current_setting('test.fx.auto.context')::jsonb->>'business_date')::date,
 current_setting('test.fx.auto.context')::jsonb->'query',true,
 current_setting('test.fx.auto.plan')::jsonb->>'plan_token')::text,true);
select pg_temp.assert_auto_refund_fx(current_setting('test.fx.auto.context')::jsonb,current_setting('test.fx.auto.result')::jsonb,1,90,98.63,720,true);
do $tail$
declare context_value jsonb:=current_setting('test.fx.auto.context')::jsonb;workspace jsonb;
begin
 workspace:=public.fms_payable_writeoff_workspace_secure(context_value->'query');
 if(select sum((entry->>'available_amount')::numeric) from jsonb_array_elements(workspace->'secondary') entry)<>1.37
  or(select sum((entry->>'available_base_amount')::numeric) from jsonb_array_elements(workspace->'secondary') entry)<>10 then
  raise exception 'Book-equivalent allocation erased the remaining refund original currency or local value';
 end if;
end $tail$;

select pg_temp.check_payable_refund_fx(1,1);
select pg_temp.check_payable_refund_fx(1,2);
select pg_temp.check_payable_refund_fx(1,3);
select pg_temp.check_payable_refund_fx(1,4);
select pg_temp.check_payable_refund_fx(1,5);
select pg_temp.check_payable_refund_fx(1,6);
select set_config('test.fx.auto.context',pg_temp.check_payable_refund_fx(1,7)::text,true);
select set_config('test.fx.auto.context',pg_temp.check_payable_refund_fx_matching(current_setting('test.fx.auto.context')::jsonb,true,'prepare')::text,true);
select set_config('test.fx.auto.context',pg_temp.prepare_auto_refund_fx(current_setting('test.fx.auto.context')::jsonb,'same_currency')::text,true);
select set_config('test.fx.auto.plan',public.fms_auto_payable_writeoff_secure(
 (current_setting('test.fx.auto.context')::jsonb->>'selected_scheme_id')::uuid,
 (current_setting('test.fx.auto.context')::jsonb->>'business_date')::date,
 current_setting('test.fx.auto.context')::jsonb->'query',false)::text,true);
select pg_temp.assert_auto_refund_fx(current_setting('test.fx.auto.context')::jsonb,current_setting('test.fx.auto.plan')::jsonb,0,0,0,0,false);
do $no_match$
declare context_value jsonb:=current_setting('test.fx.auto.context')::jsonb;blocked boolean:=false;
begin
 begin
  perform public.fms_auto_payable_writeoff_secure((context_value->>'selected_scheme_id')::uuid,(context_value->>'business_date')::date,
   context_value->'query',true,current_setting('test.fx.auto.plan')::jsonb->>'plan_token');
 exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Same-currency mode executed a foreign pair';end if;
end $no_match$;
rollback;

