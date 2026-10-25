-- Run after fms-receivable-lifecycle.sql in a transaction and roll back all fixtures.
do $settlement$
declare actor uuid; t uuid; fin uuid; line_id uuid; org uuid; customer uuid; fund uuid; receipt uuid; refund uuid;
 doc jsonb; result jsonb; k text; c numeric; request_id uuid;
begin
 select u.auth_user_id into actor from public.sys_user u join public.sys_tenant tenant on tenant.id=u.tenant_id
 where u.system_protected and tenant.builtin_type='platform' and u.auth_user_id is not null limit 1;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.headers','{}',true);
 select id,tenant_id,settlement_organization_id,customer_id into fin,t,org,customer
 from public.fms_receivable_document where id=current_setting('test.ar_lifecycle_financial_first')::uuid;
 select id into line_id from public.fms_receivable_line where document_id=fin order by line_no limit 1;
 if fin is null then raise exception 'Missing lifecycle fixtures'; end if;
 foreach k in array array['estimate','financial','receipt','refund','revenue','writeoff','adjustment','condition'] loop
  result:=public.fms_receivable_workspace_secure(k,'{}');
  if jsonb_typeof(result->'records')<>'array' then raise exception 'Invalid workspace result for %',k; end if;
 end loop;
 result:=public.fms_receivable_workspace_secure('estimate','{"viewMode":"line"}');
 if (result->>'total')::int<1 then raise exception 'Line view lost estimate records'; end if;
 foreach k in array array['customer','organization','initialized_organization','project','unit','material','contract','condition','estimate_type','financial_type','fund','scheme','cash','wms_source','tms_source'] loop
  result:=public.fms_ar_options_secure(k,t,'');
  if jsonb_typeof(result)<>'array' then raise exception 'Invalid options result for %',k; end if;
 end loop;
 -- Draft reservation is authoritative even without a cash account.
 receipt:=public.fms_save_receipt_secure(jsonb_build_object('tenantId',t,'customerId',customer,
 'settlementOrganizationId',org,'businessDate',current_date,'currencyCode','CNY','paymentMethod','cash',
 'lines',jsonb_build_array(jsonb_build_object('financialLineId',line_id,'amount',10))));
 c:=app_private.ar_line_balance(line_id);
 if c<>(select total_amount-10 from public.fms_receivable_line where id=line_id) then raise exception 'Draft receipt did not reserve balance'; end if;
 begin
  perform public.fms_save_receipt_secure(jsonb_build_object('tenantId',t,'customerId',customer,'settlementOrganizationId',org,
  'businessDate',current_date,'currencyCode','CNY','lines',jsonb_build_array(jsonb_build_object('financialLineId',line_id,'amount',100000000))));
  raise exception 'Over-reservation accepted';
 exception when check_violation then null; end;
 perform public.fms_act_receipt_secure(receipt,'delete');
 if app_private.ar_line_balance(line_id)<>(select total_amount from public.fms_receivable_line where id=line_id) then raise exception 'Deleting draft did not release reservation'; end if;
 select f.id into fund from public.fms_fund_account f join public.fms_currency c on c.id=f.currency_id
 where f.tenant_id=t and f.status='active' and c.currency_code='CNY' and f.account_set_id=app_private.resolve_fms_posting_account_set(t) limit 1;
 if fund is null then raise exception 'Missing active CNY account: cash settlement must be exercised'; end if;
 if fund is not null then
  receipt:=public.fms_save_receipt_secure(jsonb_build_object('tenantId',t,'customerId',customer,'settlementOrganizationId',org,
   'businessDate',current_date,'currencyCode','CNY','paymentMethod','cash','fundAccountId',fund,
   'lines',jsonb_build_array(jsonb_build_object('financialLineId',line_id,'amount',10))));
  perform public.fms_act_receipt_secure(receipt,'submit');
  perform public.fms_act_receipt_secure(receipt,'approve');
  perform public.fms_act_receipt_secure(receipt,'confirm');
  perform public.fms_act_receipt_secure(receipt,'confirm');
  if (select count(*) from public.fms_fund_ledger_entry where source_id=receipt)<>1 then raise exception 'Receipt cash entry not idempotent'; end if;
  if app_private.ar_line_balance(line_id,false)<>(select total_amount-10 from public.fms_receivable_line where id=line_id) then raise exception 'Confirmed receipt did not apply balance'; end if;
  refund:=public.fms_save_receivable_refund_secure(jsonb_build_object('originalReceiptId',receipt,'amount',5,'businessDate',current_date,'remark','回滚验收退款'));
  perform public.fms_act_receivable_refund_secure(refund,'submit');
  perform public.fms_act_receivable_refund_secure(refund,'approve');
  request_id:=public.fms_act_receivable_refund_secure(refund,'request');
  begin perform public.fms_act_receivable_refund_secure(refund,'pay'); raise exception 'Unapproved payment request paid'; exception when check_violation then null; end;
  perform public.fms_act_receivable_payment_request_secure(request_id,'submit');
  perform public.fms_act_receivable_payment_request_secure(request_id,'approve');
  perform public.fms_act_receivable_refund_secure(refund,'pay');
  perform public.fms_act_receivable_refund_secure(refund,'pay');
  if (select count(*) from public.fms_fund_ledger_entry where source_id=refund)<>1 then raise exception 'Refund cash entry not idempotent'; end if;
  if app_private.ar_line_balance(line_id,false)<>(select total_amount-5 from public.fms_receivable_line where id=line_id) then raise exception 'Refund did not restore allocated balance'; end if;
 end if;
 result:=public.fms_ar_delete_dependencies_secure('financial',array[fin]);
 result:=public.fms_ar_voucher_secure('financial',fin,false);
end $settlement$;
