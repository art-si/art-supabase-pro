begin;

do $test$
declare
 actor uuid;statement record;finance jsonb;payment jsonb;payment_id uuid;payment_line_ident uuid;fund uuid;amount_value numeric;partial_amount numeric;
 cash uuid;allocation_id uuid;second_allocation uuid;prior_settled numeric;case_count integer:=0;blocked boolean;original_record uuid;fee_value numeric;period record;voucher_ident uuid;cash_detail jsonb;cash_list jsonb;
begin
 select auth_user_id into actor from public.sys_user where user_roles @>array['R_SUPER'] and auth_user_id is not null limit 1;
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers','{}',true);
 for statement in select statement_row.* from public.tms_carrier_statement statement_row
 where statement_row.status='confirmed'
 and exists(select 1 from public.fms_fund_account account join public.fms_currency currency on currency.id=account.currency_id where account.tenant_id=statement_row.tenant_id and account.status='active' and account.account_type<>'cash' and currency.currency_code='CNY' and account.account_set_id=app_private.resolve_fms_posting_account_set(statement_row.tenant_id))
 and (select bool_and(item.line_amount>0) and sum(item.line_amount)>1 from public.tms_carrier_statement_item item where item.statement_id=statement_row.id and item.is_active)
 and not exists(select 1 from public.fms_purchase_payable_document payable where payable.tms_statement_id=statement_row.id and payable.kind='financial')
 order by statement_row.id limit 2 loop
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',statement.tenant_id)::text,true);
  prior_settled:=statement.settled_amount;fee_value:=case when case_count=0 then 5 else 0 end;
  select account.id into fund from public.fms_fund_account account join public.fms_currency currency on currency.id=account.currency_id where account.tenant_id=statement.tenant_id and account.status='active' and account.account_type<>'cash' and currency.currency_code='CNY' and account.account_set_id=app_private.resolve_fms_posting_account_set(statement.tenant_id) order by account.id limit 1;
  finance:=public.fms_import_carrier_payable_secure('financial',statement.id);
  perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'submit');perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'approve');
  payment:=public.fms_push_payable_settlement_secure((finance->>'id')::uuid,'payment');payment_id:=(payment->>'id')::uuid;
  amount_value:=round((payment->>'amount')::numeric/2,2);
  payment:=public.fms_save_payable_settlement_secure(payment||jsonb_build_object('details',jsonb_build_object('fee',fee_value),'lines',(select jsonb_agg(line||jsonb_build_object('fund_account_id',fund,'amount',amount_value,'approved_amount',amount_value,'planned_amount',amount_value)) from jsonb_array_elements(payment->'lines') line)));
  payment_line_ident:=(payment->'lines'->0->>'id')::uuid;
  perform public.fms_act_payable_settlement_secure(array[payment_id],'submit');perform public.fms_act_payable_settlement_secure(array[payment_id],'approve');perform public.fms_act_payable_settlement_secure(array[payment_id],'confirm');
  select cash_transaction_id into cash from public.fms_payable_payment_execution where document_id=payment_id and status='posted';
  cash_detail:=public.tms_get_cash_transaction_secure(cash);
  if (cash_detail->>'principal_amount')::numeric is distinct from amount_value or (cash_detail->>'fee_amount')::numeric is distinct from fee_value or (cash_detail->>'allocatable_amount')::numeric is distinct from 0 then raise exception 'Cash detail includes fees in available principal';end if;
  cash_list:=public.tms_list_cash_transactions_secure(p_record_id=>cash)->'records'->0;
  if (cash_list->>'principal_amount')::numeric is distinct from amount_value or (cash_list->>'fee_amount')::numeric is distinct from fee_value or (cash_list->>'allocatable_amount')::numeric is distinct from 0 then raise exception 'Cash list differs from available principal';end if;
  select id into original_record from public.fms_payable_writeoff_record where payment_line_id=payment_line_ident and status='active';
  select id into allocation_id from public.tms_carrier_cash_allocation where transaction_id=cash and statement_id=statement.id and is_active;
  select * into period from public.fms_accounting_period where account_set_id=(finance->>'account_set_id')::uuid and status='open' order by start_date desc limit 1;
  if period.id is null then raise exception 'Open period needed for linked voucher guard';end if;
  insert into public.fms_voucher(tenant_id,account_set_id,accounting_period_id,voucher_no,voucher_date,fiscal_year,period_no,source_type,source_id,summary)
  values(statement.tenant_id,(finance->>'account_set_id')::uuid,period.id,'QA-TMS-'||upper(left(gen_random_uuid()::text,8)),period.start_date,period.fiscal_year,period.period_no,'system',original_record,'仅回滚事务内的核销凭证保护数据') returning id into voucher_ident;
  blocked:=false;begin perform public.reverse_tms_carrier_cash_allocation_secure(allocation_id,'已有凭证不能反核销');exception when check_violation then blocked:=true;end;
  if not blocked or not exists(select 1 from public.tms_carrier_cash_allocation where id=allocation_id and is_active) then raise exception 'Transport reversal bypassed the linked voucher guard';end if;
  update public.fms_voucher set status='voided' where id=voucher_ident;
  perform public.reverse_tms_carrier_cash_allocation_secure(allocation_id,'承运端反核销回归');
  if (public.tms_get_cash_transaction_secure(cash)->>'allocatable_amount')::numeric is distinct from amount_value then raise exception 'Reversal did not restore available principal';end if;
  if exists(select 1 from public.fms_payable_writeoff_record where id=original_record and status='active') then raise exception 'Transport reversal left the unified payable writeoff active';end if;
  if (select settled_amount from public.tms_carrier_statement where id=statement.id)<>prior_settled then raise exception 'Transport reversal did not restore source settlement';end if;
  if (select coalesce(sum(case direction when 'inflow' then amount else -amount end),0) from public.fms_fund_ledger_entry where source_type='carrier_payment' and source_id=cash)<>-(amount_value+fee_value) then raise exception 'Writeoff reversal changed the real cash ledger';end if;
  partial_amount:=round(amount_value/2,2);
  perform public.allocate_tms_carrier_payment_secure(cash,jsonb_build_array(jsonb_build_object('statementId',statement.id,'amount',partial_amount)));
  if (public.tms_get_cash_transaction_secure(cash)->>'allocatable_amount')::numeric is distinct from amount_value-partial_amount then raise exception 'Partial allocation lost available principal';end if;
  if (select coalesce(sum(amount),0) from public.fms_payable_writeoff_record where payment_line_id=payment_line_ident and status='active')<>partial_amount then raise exception 'Transport partial reallocation lost unified writeoff';end if;
  select id into allocation_id from public.tms_carrier_cash_allocation where transaction_id=cash and is_active;
  perform public.allocate_tms_carrier_payment_secure(cash,jsonb_build_array(jsonb_build_object('statement_id',statement.id,'amount',amount_value-partial_amount)));
  if (select count(*) from public.fms_payable_writeoff_record where payment_line_id=payment_line_ident and status='active')<>1 or (select coalesce(sum(amount),0) from public.fms_payable_writeoff_record where payment_line_id=payment_line_ident and status='active')<>amount_value then raise exception 'Transport reallocation duplicated or lost unified amount';end if;
  if fee_value>0 then
   blocked:=false;begin perform public.allocate_tms_carrier_payment_secure(cash,jsonb_build_array(jsonb_build_object('statement_id',statement.id,'amount',0.01)));exception when others then if sqlerrm like '%未核销余额%' then blocked:=true;else raise;end if;end;
   if not blocked then raise exception 'Payment fee became allocatable payable principal';end if;
  end if;
  select id into second_allocation from public.tms_carrier_cash_allocation where transaction_id=cash and is_active and id<>allocation_id;
  perform public.reverse_tms_carrier_cash_allocation_secure(allocation_id,'第一段反核销');
  if (select coalesce(sum(amount),0) from public.fms_payable_writeoff_record where payment_line_id=payment_line_ident and status='active')<>amount_value-partial_amount then raise exception 'Partial transport reversal left wrong unified amount';end if;
  perform public.reverse_tms_carrier_cash_allocation_secure(second_allocation,'第二段反核销');
  if exists(select 1 from public.fms_payable_writeoff_record where payment_line_id=payment_line_ident and status='active') then raise exception 'Full transport reversal left an active unified record';end if;
  perform public.fms_act_payable_settlement_secure(array[payment_id],'cancel_payment','核销与资金分别回滚');
  cash_detail:=public.tms_get_cash_transaction_secure(cash);
  if (cash_detail->>'allocatable_amount')::numeric is distinct from 0 or (cash_detail->>'principal_amount')::numeric is distinct from amount_value or (cash_detail->>'fee_amount')::numeric is distinct from fee_value then raise exception 'Voided cash lost original principal or permits allocation';end if;
  if (select settled_amount from public.tms_carrier_statement where id=statement.id)<>prior_settled then raise exception 'Cancellation duplicated source balance restoration';end if;
  case_count:=case_count+1;
 end loop;
 if case_count<>2 then raise exception 'Need two transport reallocation scenarios';end if;
end $test$;

rollback;
