-- Run with lifecycle and settlement fixtures in one transaction, then ROLLBACK.
do $writeoff$
declare f public.fms_receivable_document%rowtype; l uuid; org uuid; actor uuid; fund uuid;
 receipt uuid; w uuid; reversal uuid; prior numeric; other_customer uuid; payload jsonb; result jsonb;
 credit uuid; credit_line uuid; a uuid; estimate uuid; revenue uuid; invoice_ids jsonb;
begin
 select * into f from public.fms_receivable_document where id=current_setting('test.ar_lifecycle_financial_max')::uuid;
 select id into l from public.fms_receivable_line where document_id=f.id order by line_no limit 1;
 select u.auth_user_id into actor from public.sys_user u join public.sys_tenant t on t.id=u.tenant_id where u.system_protected and t.builtin_type='platform' limit 1;
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers','{}',true);
 org:=f.settlement_organization_id;
 insert into public.fms_opening_balance_control(tenant_id,account_set_id,fiscal_year,status,confirmed_at,confirmed_by)
 values(f.tenant_id,app_private.resolve_fms_posting_account_set(f.tenant_id),extract(year from current_date)::int,'confirmed',now(),'ar-regression')
 on conflict(account_set_id,fiscal_year) do update set status='confirmed',confirmed_at=now(),confirmed_by='ar-regression';
 if not app_private.ar_organization_ready(org,current_date) then raise exception 'Financial opening balance fixture is not confirmed'; end if;
 select fa.id into fund from public.fms_fund_account fa join public.fms_currency c on c.id=fa.currency_id where fa.tenant_id=f.tenant_id and fa.status='active' and c.currency_code='CNY' and fa.account_set_id=app_private.resolve_fms_posting_account_set(f.tenant_id) limit 1;
 if fund is null then raise exception 'Cash account fixture missing'; end if;
 receipt:=public.fms_save_receipt_secure(jsonb_build_object('tenantId',f.tenant_id,'customerId',f.customer_id,'settlementOrganizationId',org,
 'businessDate',current_date,'currencyCode','CNY','paymentMethod','cash','fundAccountId',fund,'lines',jsonb_build_array(jsonb_build_object('amount',20))));
 perform public.fms_act_receipt_secure(receipt,'submit');perform public.fms_act_receipt_secure(receipt,'approve');perform public.fms_act_receipt_secure(receipt,'confirm');
 prior:=app_private.ar_line_balance(l,false);
 payload:=jsonb_build_object('relationKind','receivable_receipt','writeoffDate',current_date,'organizationId',org,'reason','回滚验收核销',
 'sides',jsonb_build_array(jsonb_build_object('side','primary','sourceType','financial','id',l,'amount',10),jsonb_build_object('side','secondary','sourceType','receipt','id',receipt,'amount',10)));
 result:=public.fms_check_receivable_writeoff_secure(payload);
 w:=public.fms_execute_receivable_writeoff_secure(payload);
 if app_private.ar_line_balance(l,false)<>prior-10 or app_private.ar_receipt_available(receipt)<>10 then raise exception 'Manual writeoff balances mismatch'; end if;
 reversal:=public.fms_reverse_receivable_writeoff_secure(w,'回滚验收反核销');
 if reversal is null or app_private.ar_line_balance(l,false)<>prior or app_private.ar_receipt_available(receipt)<>20 then raise exception 'Reversal failed to restore balances'; end if;
 w:=public.fms_execute_receivable_writeoff_secure(payload);
 -- Refund after manual allocation must trace the same receipt, not only source-created receipt lines.
 a:=public.fms_save_receivable_refund_secure(jsonb_build_object('originalReceiptId',receipt,'amount',15,'businessDate',current_date,'remark','手工核销后退款'));
 perform public.fms_act_receivable_refund_secure(a,'submit');perform public.fms_act_receivable_refund_secure(a,'approve');perform public.fms_act_receivable_refund_secure(a,'pay');
 if app_private.ar_line_balance(l,false)<>prior-5 then raise exception 'Refund after manual writeoff failed to restore linked receivable'; end if;
 result:=public.fms_receivable_writeoff_candidates_secure(jsonb_build_object('organizationId',org,'counterpartyType','customer'));
 if jsonb_typeof(result->'records')<>'array' then raise exception 'Invalid workbench candidate response'; end if;
 result:=public.fms_ar_report_secure(jsonb_build_object('mode','detail','asOfDate',current_date));
 result:=public.fms_ar_report_secure(jsonb_build_object('mode','summary','asOfDate',current_date));
 -- Credit notes are separate, independently approved financial receivables.
 credit:=public.fms_save_receivable_document_secure(jsonb_build_object('kind','financial','tenantId',f.tenant_id,'documentTypeId',f.document_type_id,
 'customerId',f.customer_id,'settlementOrganizationId',org,'businessDate',current_date,'isCredit',true,'currencyCode','CNY','settlementMethod','cash',
 'lines',jsonb_build_array(jsonb_build_object('lineNo',10,'basis','amount','materialDescription','贷方应收验收','quantity',0,'enteredGrossAmount',10,'taxRate',0,'gift',false))));
 perform public.fms_act_receivable_document_secure(credit,'submit');perform public.fms_act_receivable_document_secure(credit,'approve');
 select id into credit_line from public.fms_receivable_line where document_id=credit;
 perform set_config('test.ar_lifecycle_credit_line',credit_line::text,true);
 payload:=jsonb_build_object('relationKind','receivable_red_blue','writeoffDate',current_date,'organizationId',org,'reason','红蓝对冲验收',
 'sides',jsonb_build_array(jsonb_build_object('side','primary','sourceType','financial','id',l,'amount',5),jsonb_build_object('side','secondary','sourceType','financial','id',credit_line,'amount',5)));
 w:=public.fms_execute_receivable_writeoff_secure(payload);
 if app_private.ar_line_balance(credit_line,false)<>5 then raise exception 'Credit writeoff failed'; end if;
 perform public.fms_reverse_receivable_writeoff_secure(w,'对冲反核销验收');
 payload:=jsonb_set(payload,'{relationKind}','"receivable_receivable"');w:=public.fms_execute_receivable_writeoff_secure(payload);
 -- Special writeoff cannot run without a reason.
 begin
  perform public.fms_execute_receivable_writeoff_secure(jsonb_build_object('relationKind','special','writeoffDate',current_date,'organizationId',org,
   'sides',jsonb_build_array(jsonb_build_object('side','primary','sourceType','financial','id',l,'amount',1))));
  raise exception 'Reasonless special writeoff accepted';
 exception when invalid_parameter_value then null; end;
 estimate:=current_setting('test.ar_lifecycle_estimate')::uuid;
 revenue:=public.fms_push_revenue_cost_secure(estimate);
 perform public.fms_act_revenue_cost_secure(revenue,'refresh');perform public.fms_act_revenue_cost_secure(revenue,'submit');
 begin perform public.fms_act_revenue_cost_secure(revenue,'approve');raise exception 'Missing actual cost was approved';exception when check_violation then null;end;
end $writeoff$;
