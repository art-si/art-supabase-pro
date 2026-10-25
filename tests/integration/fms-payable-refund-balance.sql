begin;

do $test$
declare
 actor uuid;
 tenant uuid;
 options jsonb;
 source_document jsonb;
 source_line uuid;
 second_document jsonb;
 second_line uuid;
 purpose uuid;
 supplier uuid;
 method uuid;
 fund uuid;
 account_book uuid;
 refund_document uuid;
 refund_line uuid;
 writeoff_record uuid;
 original_ledger uuid;
 original_execution uuid;
 changed_execution uuid;
 receipt_execution uuid;
 receipt_ledger uuid;
 blocked boolean;
 state jsonb;
begin
 select auth_user_id into actor from public.sys_user where user_roles @>array['R_SUPER'] and auth_user_id is not null limit 1;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 select account.tenant_id into tenant from public.fms_fund_account account
 join public.fms_currency currency on currency.id=account.currency_id and currency.tenant_id=account.tenant_id
 join public.sys_tenant tenant_record on tenant_record.id=account.tenant_id
 where account.status='active' and account.account_type='cash' and currency.currency_code='CNY'
 and account.opening_balance+coalesce((select sum(case ledger.direction when 'inflow' then ledger.amount else -ledger.amount end) from public.fms_fund_ledger_entry ledger where ledger.fund_account_id=account.id),0)>=185
 and exists(select 1 from public.mdm_payment_purpose purpose where purpose.tenant_id=account.tenant_id and purpose.enabled and purpose.business_type='advance')
 and exists(select 1 from public.mdm_settlement_method method where method.tenant_id=account.tenant_id and method.enabled and method.category='cash')
 and exists(select 1 from public.mdm_supplier supplier where supplier.tenant_id=account.tenant_id)
 and exists(select 1 from public.mdm_document_type document_type join public.sys_menu menu on menu.id=document_type.menu_id where document_type.tenant_id=account.tenant_id and document_type.enabled and menu.name='FinancePayablePayment')
 order by (tenant_record.tenant_code='qa-payable-20261022') desc,account.id limit 1;
 if tenant is null then raise exception 'Refund balance regression needs a tenant with valid masters and sufficient synthetic cash balance';end if;
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',tenant)::text,true);
 options:=public.fms_payable_settlement_options_secure('payment',tenant);
 select (value->>'id')::uuid into purpose from jsonb_array_elements(options->'purpose') where value->>'business_type'='advance' limit 1;
 select (value->>'id')::uuid into supplier from jsonb_array_elements(options->'supplier') limit 1;
 select (value->>'id')::uuid into method from jsonb_array_elements(options->'method') where value->>'category'='cash' limit 1;
 select account.id,account.account_set_id into fund,account_book from public.fms_fund_account account join public.fms_currency currency on currency.id=account.currency_id and currency.tenant_id=account.tenant_id where account.tenant_id=tenant and account.status='active' and account.account_type='cash' and currency.currency_code='CNY' order by account.id limit 1;
 source_document:=public.fms_save_payable_settlement_secure(jsonb_build_object('kind','payment','tenant_id',tenant,'document_type_id',options->'document_type'->0->>'id','business_date',app_private.payable_business_date(),'currency_code','CNY','details',jsonb_build_object('fee',5),'lines',jsonb_build_array(jsonb_build_object('purpose_id',purpose,'supplier_id',supplier,'payee_supplier_id',supplier,'settlement_method_id',method,'fund_account_id',fund,'amount',90,'approved_amount',90,'planned_amount',90,'cash_discount',10))));
 source_line:=(source_document->'lines'->0->>'id')::uuid;
 perform public.fms_act_payable_settlement_secure(array[(source_document->>'id')::uuid],'submit');
 perform public.fms_act_payable_settlement_secure(array[(source_document->>'id')::uuid],'approve');
 perform public.fms_act_payable_settlement_secure(array[(source_document->>'id')::uuid],'confirm');
 state:=app_private.payable_payment_line_state(source_line);
 if (state->>'available_cash')::numeric<>90 or (state->>'available_discount')::numeric<>10 or (state->>'principal_amount')::numeric<>90 or (state->>'available_face')::numeric<>100 then raise exception 'Original cash, fee and offered discount were combined';end if;
 select id,fund_ledger_id into original_execution,original_ledger from public.fms_payable_payment_execution where line_id=source_line and status='posted';
 update public.fms_payable_payment_execution set fund_ledger_id=null where line_id=source_line and status='posted';
 state:=app_private.payable_payment_line_state(source_line);
 if (state->>'source_valid')::boolean is distinct from false or (state->>'available_cash')::numeric<>0 then raise exception 'A payment without a valid real cash execution became refundable';end if;
 update public.fms_payable_payment_execution set fund_ledger_id=original_ledger where line_id=source_line and status='posted';
 changed_execution:=gen_random_uuid();
 update public.fms_payable_payment_execution set id=changed_execution where id=original_execution;
 state:=app_private.payable_payment_line_state(source_line);
 if (state->>'source_valid')::boolean is distinct from false or (state->>'available_cash')::numeric<>0 then raise exception 'An unrelated ledger source became refundable cash';end if;
 update public.fms_payable_payment_execution set id=original_execution where id=changed_execution;
 insert into public.fms_payable_settlement_document(tenant_id,kind,document_no,business_date,amount,created_by_user_id,account_set_id)
 values(tenant,'refund','QA-RF-'||upper(left(gen_random_uuid()::text,8)),app_private.payable_business_date(),45,auth.uid(),account_book) returning id into refund_document;
 insert into public.fms_payable_settlement_line(tenant_id,document_id,line_no,purpose_id,supplier_id,payee_supplier_id,settlement_method_id,fund_account_id,amount,approved_amount,planned_amount,refund_payment_line_id,expired_discount_amount)
 values(tenant,refund_document,10,purpose,supplier,supplier,method,fund,45,45,45,source_line,5) returning id into refund_line;
 state:=app_private.payable_payment_line_state(source_line);
 if (state->>'available_cash')::numeric<>45 or (state->>'available_discount')::numeric<>5 or (state->>'unwritten_face')::numeric<>100 or (state->>'reserved_payable_face')::numeric<>100 then raise exception 'Draft refund released a payment or payable quota prematurely';end if;
 blocked:=false;
 begin
  perform public.fms_act_payable_settlement_secure(array[(source_document->>'id')::uuid],'cancel_payment','退款尚未处理');
 exception when foreign_key_violation then blocked:=true;
 end;
 if not blocked then raise exception 'Original payment cancellation ignored an active refund';end if;
 if (state->>'committed_face')::numeric is distinct from 100 or (state->>'committed_cash')::numeric is distinct from 90 then raise exception 'Pending refund released an application or procurement commitment';end if;
 state:=app_private.payable_payment_line_state(source_line,refund_document);
 if (state->>'available_cash')::numeric<>90 or (state->>'available_discount')::numeric<>10 then raise exception 'Draft refund cannot retain its own reservation during edit';end if;
 update public.fms_payable_settlement_document set status='confirmed' where id=refund_document;
 state:=app_private.payable_payment_line_state(source_line);
 if app_private.payable_refund_receipt_valid(refund_line) or (state->>'committed_face')::numeric is distinct from 100 or (state->>'expired_discount')::numeric<>0 then raise exception 'A confirmed label without actual refund cash released a financial commitment';end if;
 update public.fms_payable_settlement_document set status='approved' where id=refund_document;
 receipt_execution:=gen_random_uuid();
 select id into receipt_ledger from app_private.post_fms_fund_ledger_entry(fund,app_private.payable_business_date(),'inflow',45,'payable_refund',receipt_execution,'QA-RF-RECEIPT','退款余额回归',null,null,null);
 insert into public.fms_payable_payment_execution(id,tenant_id,line_id,document_id,amount,fund_ledger_id,status,actor)
 values(receipt_execution,tenant,refund_line,refund_document,45,receipt_ledger,'posted',auth.uid());
 update public.fms_payable_settlement_document set status='confirmed' where id=refund_document;
 state:=app_private.payable_payment_line_state(source_line);
 if (state->>'available_cash')::numeric<>45 or (state->>'available_discount')::numeric<>5 or (state->>'unwritten_face')::numeric<>95 or (state->>'reserved_payable_face')::numeric<>50 or (state->>'expired_discount')::numeric<>5 then raise exception 'Confirmed refund lost original cash or expired offered discount';end if;
 if (state->>'committed_face')::numeric<>50 or (state->>'committed_cash')::numeric<>45 or not app_private.payable_refund_receipt_valid(refund_line) then raise exception 'Real refund cash did not reduce the commitment exactly once';end if;
 insert into public.fms_payable_writeoff_record(tenant_id,record_no,payment_line_id,refund_line_id,relation,amount,payment_amount,refund_amount,cash_discount_amount,writeoff_date,actor)
 values(tenant,'QA-RF-HX-'||upper(left(gen_random_uuid()::text,8)),source_line,refund_line,'payment_refund',45,45,45,0,app_private.payable_business_date(),auth.uid()) returning id into writeoff_record;
 state:=app_private.payable_payment_line_state(source_line);
 if (state->>'available_cash')::numeric<>45 or (state->>'available_discount')::numeric<>5 or (state->>'unwritten_face')::numeric<>50 or (state->>'written_off_amount')::numeric<>45 or (state->>'expired_discount')::numeric<>5 then raise exception 'Refund writeoff double-counted returned cash or realized an unearned discount';end if;
 second_document:=public.fms_save_payable_settlement_secure(jsonb_build_object('kind','payment','tenant_id',tenant,'document_type_id',options->'document_type'->0->>'id','business_date',app_private.payable_business_date(),'currency_code','CNY','lines',jsonb_build_array(jsonb_build_object('purpose_id',purpose,'supplier_id',supplier,'payee_supplier_id',supplier,'settlement_method_id',method,'fund_account_id',fund,'amount',90,'approved_amount',90,'planned_amount',90))));
 second_line:=(second_document->'lines'->0->>'id')::uuid;
 perform public.fms_act_payable_settlement_secure(array[(second_document->>'id')::uuid],'submit');
 perform public.fms_act_payable_settlement_secure(array[(second_document->>'id')::uuid],'approve');
 perform public.fms_act_payable_settlement_secure(array[(second_document->>'id')::uuid],'confirm');
 update public.fms_payable_writeoff_record set payment_line_id=second_line where id=writeoff_record;
 state:=app_private.payable_payment_line_state(source_line);
 if (state->>'available_cash')::numeric<>90 or (state->>'available_discount')::numeric<>5 or (state->>'reserved_payable_face')::numeric<>95 then raise exception 'Cross-source refund match lost original payment credit';end if;
 state:=app_private.payable_payment_line_state(second_line);
 if (state->>'available_cash')::numeric<>45 or (state->>'reserved_payable_face')::numeric<>45 then raise exception 'Cross-source refund match did not consume the selected payment credit';end if;
 update public.fms_payable_writeoff_record set status='reversed' where id=writeoff_record;
 state:=app_private.payable_payment_line_state(source_line);
 if (state->>'available_cash')::numeric<>45 or (state->>'available_discount')::numeric<>5 or (state->>'reserved_payable_face')::numeric<>50 then raise exception 'Reversing writeoff made already returned cash spendable';end if;
 update public.fms_payable_settlement_document set status='approved' where id=refund_document;
 perform app_private.post_fms_fund_ledger_entry(fund,app_private.payable_business_date(),'outflow',45,'payable_refund',gen_random_uuid(),'QA-RF-CANCEL','撤销退款余额回归',null,null,receipt_ledger);
 update public.fms_payable_payment_execution set status='reversed',reversed_at=now(),reason='撤销退款收回' where id=receipt_execution;
 state:=app_private.payable_payment_line_state(source_line);
 if (state->>'available_cash')::numeric<>45 or (state->>'available_discount')::numeric<>5 or (state->>'unwritten_face')::numeric<>100 or (state->>'reserved_payable_face')::numeric<>100 then raise exception 'Cancelling receipt lost pending refund reservation or payable quota';end if;
 update public.fms_payable_settlement_document set status='cancelled' where id=refund_document;
 state:=app_private.payable_payment_line_state(source_line);
 if (state->>'available_cash')::numeric<>90 or (state->>'available_discount')::numeric<>10 or (state->>'available_face')::numeric<>100 then raise exception 'Voided refund retained a live cash or discount reservation';end if;
 if has_function_privilege('authenticated','app_private.payable_payment_line_state(uuid,uuid)','EXECUTE') then raise exception 'Private payment state helper is client-executable';end if;
end $test$;

rollback;

