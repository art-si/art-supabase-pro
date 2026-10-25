-- All six relations, origin tracking, cross-currency settlement and credit payments.
-- Run after the other receivable fixtures inside BEGIN/ROLLBACK.
do $advanced$
declare f public.fms_receivable_document%rowtype; line_id uuid; credit_line uuid; credit uuid; fund uuid; receipt uuid; refund uuid;
 payload jsonb; w uuid; loss uuid; prior numeric; currency uuid; fx_fund uuid; fx_receipt uuid; account_id uuid; request uuid; request_again uuid; count_before int;
begin
 select * into f from public.fms_receivable_document where id=current_setting('test.ar_lifecycle_financial_max')::uuid;
 select id into line_id from public.fms_receivable_line where document_id=f.id order by line_no limit 1;
 account_id:=app_private.resolve_fms_posting_account_set(f.tenant_id);
 select fa.id into fund from public.fms_fund_account fa join public.fms_currency c on c.id=fa.currency_id
 where fa.tenant_id=f.tenant_id and fa.account_set_id=account_id and fa.status='active' and c.currency_code='CNY' limit 1;
 credit_line:=current_setting('test.ar_lifecycle_credit_line')::uuid;
 select id into refund from public.fms_receipt_refund where remark='手工核销后退款';
 if app_private.ar_refund_available(refund)<>5 then raise exception 'Unallocated refund portion was not automatically reconciled';end if;
 receipt:=public.fms_save_receipt_secure(jsonb_build_object('tenantId',f.tenant_id,'customerId',f.customer_id,'settlementOrganizationId',f.settlement_organization_id,
 'businessDate',current_date,'currencyCode','CNY','fundAccountId',fund,'paymentMethod','cash','lines',jsonb_build_array(jsonb_build_object('amount',5))));
 perform public.fms_act_receipt_secure(receipt,'submit');perform public.fms_act_receipt_secure(receipt,'approve');perform public.fms_act_receipt_secure(receipt,'confirm');
 prior:=app_private.ar_line_balance(line_id,false);
 payload:=jsonb_build_object('requestId',gen_random_uuid(),'relationKind','receipt_refund','writeoffDate',current_date,'organizationId',f.settlement_organization_id,'reason','收款冲退款验收',
 'sides',jsonb_build_array(jsonb_build_object('side','primary','sourceType','receipt','id',receipt,'amount',5),jsonb_build_object('side','secondary','sourceType','refund','id',refund,'amount',5)));
  if jsonb_array_length(public.fms_check_receivable_writeoff_secure(payload))<>2 then raise exception 'Writeoff check missed a side';end if;
  begin perform public.fms_check_receivable_writeoff_secure(jsonb_set(payload,'{sides,1,amount}','6'));raise exception 'Unbalanced writeoff passed read-only check';exception when check_violation then null;end;
  w:=public.fms_execute_receivable_writeoff_secure(payload);
 if app_private.ar_line_balance(line_id,false)<>prior-5 or app_private.ar_refund_available(refund)<>0 then raise exception 'Receipt/refund did not close the reopened receivable';end if;
 if public.fms_execute_receivable_writeoff_secure(payload)<>w then raise exception 'Writeoff retry created a duplicate';end if;
 perform public.fms_reverse_receivable_writeoff_secure(w,'收款退款反核销验收');
 if app_private.ar_line_balance(line_id,false)<>prior or app_private.ar_refund_available(refund)<>5 then raise exception 'Receipt/refund reversal did not restore the original debt layer';end if;
 payload:=jsonb_build_object('relationKind','receivable_refund','writeoffDate',current_date,'organizationId',f.settlement_organization_id,'reason','应收退款核销验收',
 'sides',jsonb_build_array(jsonb_build_object('side','primary','sourceType','financial','id',credit_line,'amount',5),jsonb_build_object('side','secondary','sourceType','refund','id',refund,'amount',5)));
 w:=public.fms_execute_receivable_writeoff_secure(payload);
 if app_private.ar_line_balance(line_id,false)<>prior-5 or app_private.ar_line_balance(credit_line,false)<>0 then raise exception 'Credit/refund left a duplicate receivable';end if;
 loss:=public.fms_save_receivable_adjustment_secure(jsonb_build_object('financialLineId',line_id,'kind','bad_debt','amount',5,'businessDate',current_date,'reason','坏账收回验收'));
 perform public.fms_act_receivable_adjustment_secure(loss,'submit');perform public.fms_act_receivable_adjustment_secure(loss,'approve');
 payload:=jsonb_build_object('relationKind','bad_debt_recovery','writeoffDate',current_date,'organizationId',f.settlement_organization_id,'reason','坏账收回验收',
 'sides',jsonb_build_array(jsonb_build_object('side','primary','sourceType','bad_debt','id',loss,'amount',5),jsonb_build_object('side','secondary','sourceType','receipt','id',receipt,'amount',5)));
 w:=public.fms_execute_receivable_writeoff_secure(payload);
 if app_private.ar_receipt_available(receipt)<>0 then raise exception 'Bad-debt recovery did not consume the receipt';end if;
 perform public.fms_reverse_receivable_writeoff_secure(w,'坏账收回反核销验收');
 if app_private.ar_receipt_available(receipt)<>5 then raise exception 'Bad-debt recovery reversal lost the receipt';end if;
 prior:=app_private.ar_line_balance(line_id,false);
 payload:=jsonb_build_object('relationKind','special','writeoffDate',current_date,'organizationId',f.settlement_organization_id,'reason','受控特殊核销验收',
 'sides',jsonb_build_array(jsonb_build_object('side','primary','sourceType','financial','id',line_id,'amount',1)));
 w:=public.fms_execute_receivable_writeoff_secure(payload);perform public.fms_reverse_receivable_writeoff_secure(w,'特殊核销反核销验收');
 if app_private.ar_line_balance(line_id,false)<>prior then raise exception 'Special writeoff reversal lost principal';end if;
 select id into currency from public.fms_currency where account_set_id=account_id and currency_code='USD' limit 1;
 if currency is null then insert into public.fms_currency(tenant_id,account_set_id,currency_code,currency_name,symbol,is_base,is_enabled) values(f.tenant_id,account_id,'USD','美元','$',false,true) returning id into currency;end if;
 insert into public.fms_exchange_rate(tenant_id,account_set_id,currency_id,rate_date,rate_type,direct_rate,source) values(f.tenant_id,account_id,currency,current_date,'spot',6.8,'manual')
 on conflict(account_set_id,currency_id,rate_date,rate_type) do update set direct_rate=6.8;
 insert into public.fms_fund_account(tenant_id,account_set_id,currency_id,account_code,account_name,account_type,bank_name,status,account_no_masked,account_no_fingerprint,created_by_user_id)
 values(f.tenant_id,account_id,currency,'ARFXTEST','应收汇率回滚验收账户','bank','回滚验收银行','active','********0000',md5('ar-fx-regression'),(select id from public.sys_user where tenant_id=f.tenant_id and auth_user_id is not null limit 1)) returning id into fx_fund;
 fx_receipt:=public.fms_save_receipt_secure(jsonb_build_object('tenantId',f.tenant_id,'customerId',f.customer_id,'settlementOrganizationId',f.settlement_organization_id,
 'businessDate',current_date,'currencyCode','USD','fundAccountId',fx_fund,'paymentMethod','bank_transfer','lines',jsonb_build_array(jsonb_build_object('amount',10))));
 perform public.fms_act_receipt_secure(fx_receipt,'submit');perform public.fms_act_receipt_secure(fx_receipt,'approve');perform public.fms_act_receipt_secure(fx_receipt,'confirm');
 update public.fms_exchange_rate set direct_rate=7 where account_set_id=account_id and currency_id=currency and rate_date=current_date and rate_type='spot';
 payload:=jsonb_build_object('relationKind','receivable_receipt','writeoffDate',current_date,'organizationId',f.settlement_organization_id,'crossCurrency',true,'reason','异币核销验收',
 'sides',jsonb_build_array(jsonb_build_object('side','primary','sourceType','financial','id',line_id,'amount',70),jsonb_build_object('side','secondary','sourceType','receipt','id',fx_receipt,'amount',10)));
 w:=public.fms_execute_receivable_writeoff_secure(payload);
 if (select exchange_gain_loss from public.fms_receivable_writeoff where id=w)<>2 then raise exception 'Cross-currency book-value difference was not recorded';end if;
 perform public.fms_reverse_receivable_writeoff_secure(w,'异币反核销验收');
 credit:=public.fms_save_receivable_document_secure(jsonb_build_object('kind','financial','tenantId',f.tenant_id,'documentTypeId',f.document_type_id,'isCredit',true,
 'customerId',f.customer_id,'settlementOrganizationId',f.settlement_organization_id,'businessDate',current_date,'currencyCode','CNY','settlementMethod','cash',
 'lines',jsonb_build_array(jsonb_build_object('lineNo',10,'basis','amount','materialDescription','贷方付款验收','quantity',0,'enteredGrossAmount',20,'taxRate',0,'gift',false))));
 perform public.fms_act_receivable_document_secure(credit,'submit');perform public.fms_act_receivable_document_secure(credit,'approve');
 select id into credit_line from public.fms_receivable_line where document_id=credit;
 payload:=jsonb_build_object('requestId',gen_random_uuid(),'amount',10,'businessDate',current_date,'fundAccountId',fund,'paymentMethod','bank_transfer','remark','贷方余额付款验收');
 request:=public.fms_create_credit_payment_request_secure(credit,payload);
 request_again:=public.fms_create_credit_payment_request_secure(credit,payload);
 if request<>request_again or app_private.ar_line_balance(credit_line)<>10 or app_private.ar_line_balance(credit_line,false)<>20 then raise exception 'Credit request did not reserve funds exactly once';end if;
 begin perform public.fms_act_receivable_payment_request_secure(request,'pay');raise exception 'Unapproved credit request paid';exception when check_violation then null;end;
 perform public.fms_act_receivable_payment_request_secure(request,'submit');perform public.fms_act_receivable_payment_request_secure(request,'approve');
 perform public.fms_act_receivable_payment_request_secure(request,'pay');perform public.fms_act_receivable_payment_request_secure(request,'pay');
 if app_private.ar_line_balance(credit_line,false)<>10 or(select count(*) from public.fms_fund_ledger_entry where source_id=request and source_type='receivable_credit_payment')<>1 then raise exception 'Credit payment did not settle exactly once';end if;
end $advanced$;
