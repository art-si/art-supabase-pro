begin;
set local jit=off;
set local statement_timeout='8s';

create temp table payable_tms_half_sources on commit drop as
 select source.id,row_number() over(order by source.id) case_number from public.tms_carrier_statement source
 where source.status='confirmed' and source.settled_amount=0
  and not exists(select 1 from public.fms_purchase_payable_document payable where payable.tms_statement_id=source.id and payable.kind='financial')
  and exists(select 1 from public.fms_fund_account fund join public.fms_currency currency on currency.id=fund.currency_id
   where fund.tenant_id=source.tenant_id and fund.status='active' and fund.account_type='bank' and currency.currency_code='CNY')
  and(select bool_and(item.line_amount>0) and sum(item.line_amount)>1 and mod(round(sum(item.line_amount)*100),2)=0
   from public.tms_carrier_statement_item item where item.statement_id=source.id and item.is_active)
 order by source.id limit 2;

create function pg_temp.check_payable_tms_half_base(p_case integer) returns jsonb
language plpgsql as $test$
declare actor uuid;statement_id uuid;finance jsonb;payment jsonb;fund_ident uuid;half_amount numeric;matched public.fms_payable_writeoff_record;
begin
 select auth_user_id into actor from public.sys_user where auth_user_id is not null and user_roles @>array['R_SUPER'] order by id limit 1;
 select id into strict statement_id from pg_temp.payable_tms_half_sources where case_number=p_case;
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers','{}',true);
 finance:=public.fms_import_carrier_payable_secure('financial',statement_id);
 perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'submit');
 perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'approve');
 payment:=public.fms_push_payable_settlement_secure((finance->>'id')::uuid,'payment');
 half_amount:=(finance->>'total_amount')::numeric/2;
 if half_amount>(payment->>'amount')::numeric then raise exception 'Carrier half-base fixture has insufficient unreserved payment capacity';end if;
 select fund.id into strict fund_ident from public.fms_fund_account fund join public.fms_currency currency on currency.id=fund.currency_id and currency.tenant_id=fund.tenant_id
 where fund.tenant_id=(finance->>'tenant_id')::uuid and fund.account_set_id=(finance->>'account_set_id')::uuid
  and fund.status='active' and fund.account_type='bank' and currency.currency_code='CNY' order by fund.id limit 1;
 payment:=public.fms_save_payable_settlement_secure(payment||jsonb_build_object('lines',jsonb_build_array((payment->'lines'->0)||
  jsonb_build_object('fund_account_id',fund_ident,'amount',half_amount,'approved_amount',half_amount,'planned_amount',half_amount))));
 perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'submit');
 perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'approve');
 perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'confirm');
 select * into strict matched from public.fms_payable_writeoff_record where payable_id=(finance->>'id')::uuid
  and payment_line_id=(payment->'lines'->0->>'id')::uuid and status='active';
 if(app_private.purchase_payable_json((finance->>'id')::uuid)->>'unpaid_amount')::numeric<>half_amount
  or matched.amount<>half_amount or matched.payment_amount<>half_amount or matched.payable_base_amount<>half_amount or matched.payment_base_amount<>half_amount then
  raise exception 'Half-paid carrier allocation mismatch: %',jsonb_build_object('expected',half_amount,
   'unpaid',app_private.purchase_payable_json((finance->>'id')::uuid)->'unpaid_amount','amount',matched.amount,
   'cash',matched.payment_amount,'payable_base',matched.payable_base_amount,'payment_base',matched.payment_base_amount,'version',matched.fx_snapshot_version);
 end if;
 perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'cancel_payment','运输半额回归恢复原结算');
 if(select settled_amount from public.tms_carrier_statement where id=statement_id)<>0 then raise exception 'Half-paid carrier reversal lost original settlement';end if;
 return jsonb_build_object('case',p_case,'status','passed','allocated',half_amount);
end $test$;

select pg_temp.check_payable_tms_half_base(1);
select pg_temp.check_payable_tms_half_base(2);
rollback;
