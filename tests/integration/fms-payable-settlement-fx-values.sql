begin;
set local jit=off;
set local statement_timeout='8s';

do $test$
declare
 source_document public.fms_payable_settlement_document;
 source_line public.fms_payable_settlement_line;
 source_execution public.fms_payable_payment_execution;
 original_book public.fms_account_set;
 document_record public.fms_payable_settlement_document;
 line_record public.fms_payable_settlement_line;
 execution_record public.fms_payable_payment_execution;
 ledger_record public.fms_fund_ledger_entry;
 actor uuid;
 document_ident uuid:=gen_random_uuid();
 line_ident uuid:=gen_random_uuid();
 execution_ident uuid:=gen_random_uuid();
 currency_ident uuid;
 fund_ident uuid:=gen_random_uuid();
 wrong_book uuid;
 field_name text;
 constraint_name text;
 blocked boolean;
 result jsonb;
 expected jsonb;
 initial_fingerprint text;
 final_fingerprint text;
begin
 select document.* into source_document
 from public.fms_payable_settlement_document document
 join public.fms_payable_settlement_line line on line.document_id=document.id and line.tenant_id=document.tenant_id
 join public.fms_payable_payment_execution execution on execution.line_id=line.id and execution.document_id=document.id and execution.tenant_id=line.tenant_id
 join public.fms_account_set book on book.id=execution.account_set_id and book.tenant_id=document.tenant_id
 where document.kind='payment' and document.status='confirmed' and execution.status='posted'
  and document.currency_code='CNY' and book.base_currency_code='CNY'
  and document.fx_snapshot_version is null and execution.fx_snapshot_version is null
 order by document.created_at desc,document.id limit 1;
 select line.* into source_line from public.fms_payable_settlement_line line
 join public.fms_payable_payment_execution execution on execution.line_id=line.id and execution.tenant_id=line.tenant_id
 where line.document_id=source_document.id and execution.status='posted' order by line.line_no,line.id limit 1;
 select * into source_execution from public.fms_payable_payment_execution where line_id=source_line.id and status='posted';
 select * into original_book from public.fms_account_set where id=source_execution.account_set_id and tenant_id=source_document.tenant_id;
 select auth_user_id into actor from public.sys_user where tenant_id=source_document.tenant_id and auth_user_id is not null and status='1' order by id limit 1;
 if actor is null or source_execution.id is null or original_book.id is null then
  raise exception 'Missing confirmed CNY payment and tenant-owned acceptance actor';
 end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.headers','{}',true);
 select md5(jsonb_build_array(to_jsonb(source_document),to_jsonb(source_line),to_jsonb(source_execution))::text) into initial_fingerprint;
 result:=app_private.payable_settlement_execution_values(source_line.id);
 if result->>'currency_code'<>'CNY' or result->>'base_currency_code'<>'CNY'
  or (result->>'exchange_rate')::numeric<>1 or (result->>'fx_snapshot_version')::integer<>0
  or (result->>'payment_base_amount')::numeric<>source_line.amount
  or (result->>'fee_base_amount')::numeric<>source_execution.amount-source_line.amount
  or (result->>'base_amount')::numeric<>source_execution.amount then
  raise exception 'Legacy CNY amount was not derived from its actual booked execution: %',result;
 end if;

 insert into public.fms_currency(tenant_id,account_set_id,currency_code,currency_name,is_enabled)
 values(source_document.tenant_id,original_book.id,'USD','美元',true)
 on conflict(account_set_id,currency_code) do update set is_enabled=true returning id into currency_ident;
 insert into public.fms_exchange_rate(tenant_id,account_set_id,currency_id,rate_date,rate_type,direct_rate)
 values(source_document.tenant_id,original_book.id,currency_ident,source_document.business_date,'spot',7.2)
 on conflict(account_set_id,currency_id,rate_date,rate_type) do update set direct_rate=7.2;
 insert into public.fms_fund_account(id,tenant_id,account_set_id,currency_id,account_code,account_name,account_type,account_no_masked,account_no_fingerprint,opening_balance,online_banking_enabled)
 values(fund_ident,source_document.tenant_id,original_book.id,currency_ident,'FX_TEST_'||upper(left(fund_ident::text,8)),'回滚专用虚构美元现金账户','cash','**** QA',md5(gen_random_uuid()::text),1000,false)
 returning id into fund_ident;

 document_record:=jsonb_populate_record(source_document,jsonb_build_object('id',document_ident,'document_no','FX-ROLLBACK-'||document_ident::text,
  'amount',100,'account_set_id',original_book.id,'currency_code','USD','currency_id',currency_ident,
  'base_currency_code','CNY','exchange_rate',7.2,'fx_snapshot_version',1,'details',jsonb_build_object('fee',1,'payment_type','active')));
 insert into public.fms_payable_settlement_document select document_record.*;
 line_record:=jsonb_populate_record(source_line,jsonb_build_object('id',line_ident,'document_id',document_ident,
  'amount',100,'approved_amount',100,'planned_amount',100,'cash_discount',2,'expired_discount_amount',0,
  'payable_id',null,'purchase_id',null,'application_line_id',null,'refund_payment_line_id',null,'contract_id',null,
  'fund_account_id',fund_ident,'details',jsonb_build_object('execution_category','cash')));
 insert into public.fms_payable_settlement_line(id,tenant_id,document_id,line_no,purpose_id,supplier_id,payee_supplier_id,carrier_id,
  project_id,fund_account_id,settlement_method_id,amount,approved_amount,planned_amount,cash_discount,details)
 values(line_record.id,line_record.tenant_id,line_record.document_id,line_record.line_no,line_record.purpose_id,
  line_record.supplier_id,line_record.payee_supplier_id,line_record.carrier_id,line_record.project_id,line_record.fund_account_id,
  line_record.settlement_method_id,line_record.amount,line_record.approved_amount,line_record.planned_amount,line_record.cash_discount,line_record.details);
 ledger_record:=app_private.post_fms_fund_ledger_entry(fund_ident,document_record.business_date,'outflow',101,
  'payable_payment',execution_ident,document_record.document_no,'外币本金及手续费回滚验收');
 execution_record:=jsonb_populate_record(source_execution,jsonb_build_object('id',execution_ident,'document_id',document_ident,
  'line_id',line_ident,'amount',101,'fund_ledger_id',ledger_record.id,'cash_transaction_id',null,'reversal_ledger_id',null,
  'actor',actor,'currency_code','USD','base_currency_code','CNY','exchange_rate',7.2,
  'cash_base_amount',720,'fee_base_amount',7.2,'discount_base_amount',14.4,'base_amount',727.2,'fx_snapshot_version',1));
 insert into public.fms_payable_payment_execution select execution_record.*;
 expected:=jsonb_build_object('account_set_id',original_book.id,'currency_code','USD','base_currency_code','CNY',
  'exchange_rate',7.2,'payment_amount',100,'discount_amount',2,'fee_amount',1,
  'payment_base_amount',720,'discount_base_amount',14.4,'fee_base_amount',7.2,'base_amount',727.2,'fx_snapshot_version',1);
 result:=app_private.payable_settlement_execution_values(line_ident);
 if not result @> expected then raise exception 'Foreign original and base amounts were mixed: %',result;end if;
 if ledger_record.amount<>101 or ledger_record.account_set_id<>original_book.id
  or ledger_record.fund_account_id<>fund_ident or ledger_record.source_id<>execution_ident then
  raise exception 'Foreign cash ledger was converted to base money or detached from its execution';
 end if;
 update public.fms_exchange_rate set direct_rate=9
 where account_set_id=original_book.id and currency_id=currency_ident and rate_date=document_record.business_date and rate_type='spot';
 if app_private.payable_settlement_execution_values(line_ident) is distinct from result then
  raise exception 'Current exchange rate repriced the historical payment execution';
 end if;

 foreach field_name in array array['currency_id','base_currency_code','exchange_rate','fx_snapshot_version','account_set_id'] loop
  blocked:=false;
  begin
   execute format('update public.fms_payable_settlement_document set %I=null where id=$1',field_name) using document_ident;
  exception when check_violation then
   get stacked diagnostics constraint_name=constraint_name;
   if constraint_name is distinct from 'fms_settlement_fx_snapshot' then raise;end if;
   blocked:=true;
  end;
  if not blocked then raise exception 'Incomplete document currency snapshot accepted: %',field_name;end if;
 end loop;
 foreach field_name in array array['currency_code','base_currency_code','exchange_rate','cash_base_amount','fee_base_amount','discount_base_amount','base_amount','fx_snapshot_version'] loop
  blocked:=false;
  begin
   execute format('update public.fms_payable_payment_execution set %I=null where id=$1',field_name) using execution_ident;
  exception when check_violation then
   get stacked diagnostics constraint_name=constraint_name;
   if constraint_name is distinct from 'fms_payment_execution_fx_snapshot' then raise;end if;
   blocked:=true;
  end;
  if not blocked then raise exception 'Incomplete execution currency snapshot accepted: %',field_name;end if;
 end loop;

 blocked:=false;
 begin
  update public.fms_payable_settlement_document set exchange_rate=8 where id=document_ident;
  perform app_private.payable_settlement_execution_values(line_ident);
 exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Document and execution historical rates could diverge';end if;
 blocked:=false;
 begin
  update public.fms_payable_payment_execution set cash_base_amount=721,base_amount=728.2 where id=execution_ident;
  perform app_private.payable_settlement_execution_values(line_ident);
 exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Stored execution local amounts could disagree with original money';end if;
 blocked:=false;
 begin
  update public.fms_payable_settlement_document set currency_id=null,base_currency_code=null,exchange_rate=null,fx_snapshot_version=null where id=document_ident;
  update public.fms_payable_payment_execution set currency_code=null,base_currency_code=null,exchange_rate=null,
   cash_base_amount=null,fee_base_amount=null,discount_base_amount=null,base_amount=null,fx_snapshot_version=null where id=execution_ident;
  perform app_private.payable_settlement_execution_values(line_ident);
 exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Unknown historical foreign payment guessed its rate or base amounts';end if;
 blocked:=false;
 begin
  update public.fms_payable_settlement_document set status='draft' where id=document_ident;
  perform app_private.payable_settlement_execution_values(line_ident);
 exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Unconfirmed payment exposed a posted money snapshot';end if;
 blocked:=false;
 begin
  update public.fms_payable_payment_execution set status='reversed' where id=execution_ident;
  perform app_private.payable_settlement_execution_values(line_ident);
 exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Cancelled execution was used for a new writeoff';end if;
 insert into public.fms_account_set(tenant_id,account_set_code,account_set_name,legal_entity_name,base_currency_code,enabled_on,status)
 values(source_document.tenant_id,'FX_BOOK_'||upper(left(gen_random_uuid()::text,8)),
  '外币执行跨账套回滚验收','虚构回滚验收主体','CNY',document_record.business_date,'active') returning id into wrong_book;
 blocked:=false;
 begin
  update public.fms_payable_settlement_document set account_set_id=wrong_book where id=document_ident;
  perform app_private.payable_settlement_execution_values(line_ident);
 exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Payment money projection silently changed accounting books';end if;
 blocked:=false;
 begin
  update public.fms_payable_settlement_document set exchange_rate='NaN'::numeric where id=document_ident;
 exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Nonfinite document rate was accepted';end if;
 blocked:=false;
 begin
  update public.fms_payable_payment_execution set discount_base_amount='NaN'::numeric where id=execution_ident;
 exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Nonfinite execution local amount was accepted';end if;
 if has_function_privilege('authenticated','app_private.payable_settlement_execution_values(uuid)','EXECUTE')
  or has_function_privilege('anon','app_private.payable_settlement_execution_values(uuid)','EXECUTE') then
  raise exception 'Private currency projection is directly callable by a client';
 end if;
 select md5(jsonb_build_array(to_jsonb(document),to_jsonb(line),to_jsonb(execution))::text) into final_fingerprint
 from public.fms_payable_settlement_document document
 join public.fms_payable_settlement_line line on line.id=source_line.id and line.document_id=document.id
 join public.fms_payable_payment_execution execution on execution.id=source_execution.id and execution.line_id=line.id
 where document.id=source_document.id;
 if final_fingerprint is distinct from initial_fingerprint then raise exception 'Existing CNY payment history changed';end if;
 if not app_private.payable_settlement_execution_values(line_ident) @> expected then
  raise exception 'Rejected snapshot writes left partial currency changes';
 end if;
end $test$;

rollback;
