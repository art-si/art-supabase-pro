-- Append inside fms-receivable-acceptance.sql before its final ROLLBACK.
-- Uses only that transaction's synthetic tenant, account set and documents.
do $isolated_writeoff$
declare
 tenant uuid; sample public.fms_receivable_document%rowtype;
 line uuid; credit_line uuid; fund uuid; receipt uuid; writeoff uuid; reversal uuid;
 before_balance numeric; before_credit numeric; payload jsonb; checked jsonb; groups int:=0;
begin
 select id into strict tenant from public.sys_tenant
 where tenant_code=current_setting('test.ar_tenant_code');
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',tenant)::text,true);
 select id into strict fund from public.fms_fund_account where tenant_id=tenant;
 for sample in select * from public.fms_receivable_document
  where tenant_id=tenant and kind='financial' and not is_credit and status='approved'
  order by id loop
  groups:=groups+1;
  select id into strict line from public.fms_receivable_line where document_id=sample.id;
  select l.id into strict credit_line from public.fms_receivable_line l
  join public.fms_receivable_document d on d.id=l.document_id
  where d.tenant_id=tenant and d.customer_id=sample.customer_id and d.kind='financial' and d.is_credit;
  before_balance:=app_private.ar_line_balance(line,false);
  before_credit:=app_private.ar_line_balance(credit_line,false);
  receipt:=public.fms_save_receipt_secure(jsonb_build_object(
   'tenantId',tenant,'customerId',sample.customer_id,
   'settlementOrganizationId',sample.settlement_organization_id,
   'businessDate',current_date,'currencyCode','CNY','paymentMethod','cash','fundAccountId',fund,
   'lines',jsonb_build_array(jsonb_build_object('amount',20))));
  perform public.fms_act_receipt_secure(receipt,'submit');
  perform public.fms_act_receipt_secure(receipt,'approve');
  perform public.fms_act_receipt_secure(receipt,'confirm');
  payload:=jsonb_build_object('requestId',gen_random_uuid(),'relationKind','receivable_receipt',
   'writeoffDate',current_date,'organizationId',sample.settlement_organization_id,'reason','隔离手工核销',
   'sides',jsonb_build_array(
    jsonb_build_object('side','primary','sourceType','financial','id',line,'amount',10),
    jsonb_build_object('side','secondary','sourceType','receipt','id',receipt,'amount',10)));
  -- Failed validations must leave both source balances unchanged.
  begin
   perform public.fms_execute_receivable_writeoff_secure(jsonb_set(payload,'{sides,1,amount}','9'));
   raise exception 'Unequal writeoff accepted';
  exception when check_violation then null; end;
  begin
   perform public.fms_execute_receivable_writeoff_secure(jsonb_set(payload,'{sides,0,amount}','0'));
   raise exception 'Zero writeoff accepted';
  exception when check_violation then null; end;
  if app_private.ar_line_balance(line,false)<>before_balance
   or app_private.ar_receipt_available(receipt)<>20 then raise exception 'Rejected writeoff changed balances';end if;
  checked:=public.fms_check_receivable_writeoff_secure(payload);
  writeoff:=public.fms_execute_receivable_writeoff_secure(payload);
  if public.fms_execute_receivable_writeoff_secure(payload)<>writeoff
   or app_private.ar_line_balance(line,false)<>before_balance-10
   or app_private.ar_receipt_available(receipt)<>10 then raise exception 'Manual writeoff or retry balance mismatch';end if;
  begin
   perform public.fms_reverse_receivable_writeoff_secure(writeoff,'');
   raise exception 'Reasonless reversal accepted';
  exception when invalid_parameter_value then null;end;
  reversal:=public.fms_reverse_receivable_writeoff_secure(writeoff,'隔离反核销');
  if public.fms_reverse_receivable_writeoff_secure(writeoff,'重复请求')<>reversal
   or app_private.ar_line_balance(line,false)<>before_balance
   or app_private.ar_receipt_available(receipt)<>20 then raise exception 'Reversal or retry did not restore balances exactly once';end if;
  if not exists(select 1 from public.fms_receivable_writeoff where id=writeoff and status='reversed')
   or not exists(select 1 from public.fms_receivable_writeoff where id=reversal and reversal_of_id=writeoff)
   then raise exception 'Reversal audit relationship missing';end if;
  payload:=jsonb_build_object('relationKind','receivable_red_blue','writeoffDate',current_date,
   'organizationId',sample.settlement_organization_id,'reason','隔离红蓝对冲',
   'sides',jsonb_build_array(
    jsonb_build_object('side','primary','sourceType','financial','id',line,'amount',5),
    jsonb_build_object('side','secondary','sourceType','financial','id',credit_line,'amount',5)));
  writeoff:=public.fms_execute_receivable_writeoff_secure(payload);
  if app_private.ar_line_balance(line,false)<>before_balance-5
   or app_private.ar_line_balance(credit_line,false)<>before_credit-5 then raise exception 'Red-blue balances mismatch';end if;
  perform public.fms_reverse_receivable_writeoff_secure(writeoff,'隔离对冲还原');
  payload:=jsonb_build_object('relationKind','special','writeoffDate',current_date,
   'organizationId',sample.settlement_organization_id,
   'sides',jsonb_build_array(jsonb_build_object('side','primary','sourceType','financial','id',line,'amount',1)));
  begin
   perform public.fms_execute_receivable_writeoff_secure(payload);
   raise exception 'Reasonless special writeoff accepted';
  exception when invalid_parameter_value then null;end;
  writeoff:=public.fms_execute_receivable_writeoff_secure(payload||jsonb_build_object('reason','隔离特殊核销'));
  if app_private.ar_line_balance(line,false)<>before_balance-1 then raise exception 'Special writeoff balance mismatch';end if;
  perform public.fms_reverse_receivable_writeoff_secure(writeoff,'隔离特殊核销还原');
  if app_private.ar_line_balance(line,false)<>before_balance
   or app_private.ar_line_balance(credit_line,false)<>before_credit then raise exception 'Final original balances not restored';end if;
 end loop;
 if groups<>2 then raise exception 'Two isolated writeoff groups required';end if;
end $isolated_writeoff$;
