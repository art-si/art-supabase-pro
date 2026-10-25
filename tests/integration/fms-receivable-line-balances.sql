-- Run after the lifecycle fixture, inside the same BEGIN/ROLLBACK transaction.
do $line_balances$
declare
 actor uuid; sample public.fms_receivable_document%rowtype;
 estimate uuid; financial uuid; first_line uuid; second_line uuid; receipt uuid; invoice uuid;
 result jsonb; item jsonb; document_result jsonb; total numeric; outstanding numeric; reserved numeric;
begin
 select u.auth_user_id into actor from public.sys_user u join public.sys_tenant t on t.id=u.tenant_id
 where u.system_protected and t.builtin_type='platform' and u.auth_user_id is not null limit 1;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.headers','{}',true);
 select * into sample from public.fms_receivable_document where id=current_setting('test.ar_lifecycle_estimate')::uuid;
 if sample.id is null then raise exception 'Lifecycle fixture required'; end if;
 estimate:=public.fms_save_receivable_document_secure(jsonb_build_object(
  'kind','estimate','tenantId',sample.tenant_id,'documentTypeId',sample.document_type_id,
  'customerId',sample.customer_id,'settlementOrganizationId',sample.settlement_organization_id,
  'businessDate',current_date,'currencyCode','CNY','settlementMethod','cash',
  'lines',jsonb_build_array(
   jsonb_build_object('lineNo',10,'basis','amount','materialDescription','多行余额测试一','quantity',0,
    'priceBasis','taxed','unitPrice',0,'taxInclusiveUnitPrice',0,'taxRate',13,'discountMethod','none',
    'discountRate',0,'discountAmount',0,'enteredGrossAmount',113,'gift',false),
   jsonb_build_object('lineNo',20,'basis','amount','materialDescription','多行余额测试二','quantity',0,
    'priceBasis','taxed','unitPrice',0,'taxInclusiveUnitPrice',0,'taxRate',13,'discountMethod','none',
    'discountRate',0,'discountAmount',0,'enteredGrossAmount',226,'gift',false))));
 perform public.fms_act_receivable_document_secure(estimate,'submit');
 perform public.fms_act_receivable_document_secure(estimate,'approve');
 financial:=public.fms_push_financial_receivable_secure(estimate);
 perform public.fms_act_receivable_document_secure(financial,'submit');
 perform public.fms_act_receivable_document_secure(financial,'approve');
 select id into first_line from public.fms_receivable_line where document_id=financial and line_no=10;
 select id into second_line from public.fms_receivable_line where document_id=financial and line_no=20;
 receipt:=public.fms_save_receipt_secure(jsonb_build_object('tenantId',sample.tenant_id,
  'customerId',sample.customer_id,'settlementOrganizationId',sample.settlement_organization_id,
  'businessDate',current_date,'currencyCode','CNY','paymentMethod','cash',
  'lines',jsonb_build_array(jsonb_build_object('financialLineId',first_line,'amount',30),
   jsonb_build_object('financialLineId',second_line,'amount',60))));
 result:=public.fms_receivable_workspace_secure('financial',jsonb_build_object('id',financial,'viewMode','line'));
 if (result->>'total')::int<>2 then raise exception 'Line view must return both lines'; end if;
 select sum((value->>'total_amount')::numeric),sum((value->>'outstanding_amount')::numeric),
  sum((value->>'reserved_amount')::numeric) into total,outstanding,reserved
 from jsonb_array_elements(result->'records');
 if total<>339 or outstanding<>339 or reserved<>90 then
  raise exception 'Line amounts repeated document totals: %, %, %',total,outstanding,reserved;
 end if;
 for item in select value from jsonb_array_elements(result->'records') loop
  if (item->>'amount')::numeric<>(item->'lines'->0->>'amount')::numeric
   or (item->>'available_amount')::numeric<>(item->>'total_amount')::numeric-(item->>'reserved_amount')::numeric then
   raise exception 'Line amount and balance projection mismatch';
  end if;
 end loop;
 result:=public.fms_receivable_workspace_secure('estimate',jsonb_build_object('id',estimate,'viewMode','line'));
 select sum((value->>'linked_financial_amount')::numeric),sum((value->>'unreversed_amount')::numeric)
 into total,outstanding from jsonb_array_elements(result->'records');
 if total<>339 or outstanding<>0 then raise exception 'Estimate line linkage/reversal duplicated'; end if;
 -- A draft invoice reserves association but does not complete invoice matching.
 result:=public.fms_push_receivable_invoice_secure(financial,'ordinary'); invoice:=(result->>0)::uuid;
 result:=public.fms_receivable_workspace_secure('financial',jsonb_build_object('id',financial));
 document_result:=result->'records'->0;
 if (document_result->>'unlinked_invoice_amount')::numeric<>0 or (document_result->>'unmatched_amount')::numeric<>300
  or (document_result->>'uninvoiced_amount')::numeric<>339 then raise exception 'Draft invoice balance semantics mismatch'; end if;
 perform set_config('app.workflow_engine','on',true);
 update public.tms_invoice set invoice_no='ARLINES123456',status='pending_review' where id=invoice;
 update public.tms_invoice set status='issued' where id=invoice;
 result:=public.fms_receivable_workspace_secure('financial',jsonb_build_object('id',financial,'viewMode','line'));
 select sum((value->>'invoiced_amount')::numeric),sum((value->>'unmatched_amount')::numeric)
 into total,outstanding from jsonb_array_elements(result->'records');
 if total<>339 or outstanding<>0 then raise exception 'Issued invoice line totals mismatch'; end if;
 update public.tms_invoice set status='voided' where id=invoice;
 result:=public.fms_receivable_workspace_secure('financial',jsonb_build_object('id',financial,'viewMode','line','current',2,'size',1));
 if (result->>'total')::int<>2 or jsonb_array_length(result->'records')<>1
  or (result->'records'->0->>'total_amount')::numeric<>226
  or (result->'records'->0->>'unlinked_invoice_amount')::numeric<>226
  or (result->'records'->0->>'unmatched_amount')::numeric<>200 then raise exception 'Line paging or voided invoice release mismatch'; end if;
 perform set_config('app.workflow_engine','off',true);
 perform public.fms_act_receipt_secure(receipt,'delete');
end $line_balances$;
