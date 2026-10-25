begin;
do $test$
declare actor uuid;statement record;finance jsonb;payment jsonb;payment_id uuid;fund uuid;amount_value numeric;old_settled numeric;count_test integer:=0;blocked boolean;preview jsonb;cash uuid;events bigint;
begin
 select auth_user_id into actor from public.sys_user where user_roles @>array['R_SUPER'] and auth_user_id is not null limit 1;
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers','{}',true);
 for statement in select s.* from public.tms_carrier_statement s where s.status='confirmed'
 and exists(select 1 from public.fms_fund_account f where f.tenant_id=s.tenant_id and f.status='active')
 and (select bool_and(i.line_amount>0) from public.tms_carrier_statement_item i where i.statement_id=s.id and i.is_active)
 and not exists(select 1 from public.fms_purchase_payable_document p where p.tms_statement_id=s.id and p.kind='financial') order by s.id limit 2 loop
  old_settled:=statement.settled_amount;
  select f.id into fund from public.fms_fund_account f join public.fms_currency c on c.id=f.currency_id where f.tenant_id=statement.tenant_id and f.status='active' and c.currency_code='CNY' limit 1;
  finance:=public.fms_import_carrier_payable_secure('financial',statement.id);
  perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'submit');
  perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'approve');
  payment:=public.fms_push_payable_settlement_secure((finance->>'id')::uuid,'payment');payment_id:=(payment->>'id')::uuid;amount_value:=(payment->>'amount')::numeric;
  payment:=public.fms_save_payable_settlement_secure(payment||jsonb_build_object('lines',(select jsonb_agg(l||jsonb_build_object('fund_account_id',fund)) from jsonb_array_elements(payment->'lines') l)));
  perform public.fms_act_payable_settlement_secure(array[payment_id],'submit');perform public.fms_act_payable_settlement_secure(array[payment_id],'approve');
  perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'freeze','TMS联动冻结',1);
  blocked:=false;begin perform public.fms_act_payable_settlement_secure(array[payment_id],'confirm');exception when check_violation then blocked:=true;end;
  if not blocked then raise exception 'TMS source freeze was bypassed';end if;
  perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'unfreeze','TMS联动解冻');
  perform public.fms_act_payable_settlement_secure(array[payment_id],'confirm');
  if (select settled_amount from public.tms_carrier_statement where id=statement.id)<>old_settled+amount_value then raise exception 'TMS settlement was not updated exactly once';end if;
  select cash_transaction_id into cash from public.fms_payable_payment_execution where document_id=payment_id and status='posted' limit 1;
  if cash is null or not exists(select 1 from public.fms_fund_ledger_entry where source_id=cash and source_type='carrier_payment' and direction='outflow') then raise exception 'TMS payment bypassed legacy cash ledger';end if;
  preview:=public.fms_payable_settlement_voucher_secure(payment_id,'payment',true);
  perform public.fms_payable_settlement_voucher_secure(payment_id,'payment',false);
  if exists(select 1 from public.fms_posting_event where source_type='system' and source_id in(select id from public.fms_payable_payment_execution where document_id=payment_id)) then raise exception 'TMS payment created duplicate system voucher events';end if;
  perform public.fms_act_payable_settlement_secure(array[payment_id],'cancel_payment','TMS回归取消');
  if (select settled_amount from public.tms_carrier_statement where id=statement.id)<>old_settled then raise exception 'TMS cancellation failed to restore settlement';end if;
  if (select status from public.tms_cash_transaction where id=cash)<>'voided' then raise exception 'TMS cash cancellation did not preserve voided transaction';end if;
  count_test:=count_test+1;
 end loop;
 if count_test<>2 then raise exception 'Need two TMS payment scenarios, tested %',count_test;end if;
end $test$;
rollback;
