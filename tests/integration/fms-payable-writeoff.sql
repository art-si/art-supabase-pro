begin;
do $test$
declare actor uuid;account_set public.fms_account_set;posting_date date;fund uuid;supplier uuid;material uuid;unit_id uuid;finance_type uuid;payment_type uuid;purpose uuid;method uuid;scheme uuid;rule_ident uuid;payment_rule uuid;debit uuid;credit uuid;
 finance jsonb;payment jsonb;record_ident uuid;pending_event uuid;result jsonb;repeated jsonb;blocked boolean;index_value integer;amount_value numeric;workspace jsonb;
begin
 select auth_user_id into actor from public.sys_user where user_roles @>array['R_SUPER'] and auth_user_id is not null limit 1;
 select a.* into account_set from public.fms_account_set a where a.is_default and a.status='active' and exists(select 1 from public.fms_fund_account account join public.fms_currency currency on currency.id=account.currency_id where account.account_set_id=a.id and account.status='active' and account.account_type<>'cash' and currency.currency_code='CNY') and exists(select 1 from public.mdm_material where tenant_id=a.tenant_id and inventory_unit_id is not null)
 and(nullif(current_setting('test.ar_tenant_code',true),'') is null or exists(select 1 from public.sys_tenant tenant where tenant.id=a.tenant_id and tenant.tenant_code=current_setting('test.ar_tenant_code',true))) limit 1;
 select start_date into posting_date from public.fms_accounting_period where account_set_id=account_set.id and status='open' order by start_date desc limit 1;
 select account.id into fund from public.fms_fund_account account join public.fms_currency currency on currency.id=account.currency_id where account.account_set_id=account_set.id and account.status='active' and account.account_type<>'cash' and currency.currency_code='CNY' limit 1;
 select id into debit from public.fms_subject s where account_set_id=account_set.id and is_enabled and not cash_flow_required and not exists(select 1 from public.fms_subject child where child.parent_id=s.id) and not exists(select 1 from public.fms_subject_auxiliary_type binding where binding.subject_id=s.id and is_required) order by subject_code limit 1;
 select id into credit from public.fms_subject s where account_set_id=account_set.id and id<>debit and is_enabled and not cash_flow_required and not exists(select 1 from public.fms_subject child where child.parent_id=s.id) and not exists(select 1 from public.fms_subject_auxiliary_type binding where binding.subject_id=s.id and is_required) order by subject_code limit 1;
 if actor is null or credit is null or posting_date is null then raise exception 'Missing writeoff voucher fixtures';end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers','{}',true);
 select id into supplier from public.mdm_supplier where tenant_id=account_set.tenant_id limit 1;
 select id,inventory_unit_id into material,unit_id from public.mdm_material where tenant_id=account_set.tenant_id and inventory_unit_id is not null limit 1;
 select id into finance_type from public.mdm_document_type where tenant_id=account_set.tenant_id and document_type_code='AP_FIN_STANDARD';
 select id into payment_type from public.mdm_document_type where tenant_id=account_set.tenant_id and document_type_code='AP_PAYMENT_PURCHASE';
 select id into purpose from public.mdm_payment_purpose where tenant_id=account_set.tenant_id and code='202';
 select id into method from public.mdm_settlement_method where tenant_id=account_set.tenant_id and code='JSFS04';
 select id into scheme from public.fms_payable_writeoff_scheme where tenant_id=account_set.tenant_id and code='AP-MANUAL';
 update public.fms_posting_rule set is_enabled=false where tenant_id=account_set.tenant_id and source_type='system' and event_code='ap_writeoff_approved';
 insert into public.fms_posting_rule(tenant_id,account_set_id,rule_code,rule_name,source_type,event_code,priority,submission_mode,is_enabled)
 values(account_set.tenant_id,account_set.id,'APW_'||upper(left(gen_random_uuid()::text,8)),'应付核销凭证回滚测试','system','ap_writeoff_approved',999999,'draft',false) returning id into rule_ident;
 insert into public.fms_posting_rule_line(tenant_id,account_set_id,rule_id,line_no,subject_id,direction,amount_key)
 values(account_set.tenant_id,account_set.id,rule_ident,1,debit,'debit','gross_amount'),(account_set.tenant_id,account_set.id,rule_ident,2,credit,'credit','gross_amount');
 insert into public.fms_posting_rule(tenant_id,account_set_id,rule_code,rule_name,source_type,event_code,priority,submission_mode)
 values(account_set.tenant_id,account_set.id,'APP_'||upper(left(gen_random_uuid()::text,8)),'应付付款凭证回滚测试','system','ap_payment_confirmed',999999,'draft') returning id into payment_rule;
 insert into public.fms_posting_rule_line(tenant_id,account_set_id,rule_id,line_no,subject_id,direction,amount_key)
 values(account_set.tenant_id,account_set.id,payment_rule,1,debit,'debit','gross_amount'),(account_set.tenant_id,account_set.id,payment_rule,2,credit,'credit','gross_amount');
 for index_value in 1..2 loop
  amount_value:=40+index_value*10;
  finance:=public.fms_save_purchase_payable_secure(jsonb_build_object('kind','financial','tenant_id',account_set.tenant_id,'document_type_id',finance_type,'supplier_id',supplier,'business_date',posting_date,'lines',jsonb_build_array(jsonb_build_object('material_id',material,'inventory_unit_id',unit_id,'quantity',1,'unit_price',100,'tax_rate',13))));
  perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'submit');perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'approve');
  payment:=public.fms_save_payable_settlement_secure(jsonb_build_object('kind','payment','tenant_id',account_set.tenant_id,'document_type_id',payment_type,'business_date',posting_date,'reason','预付款手工核销回滚测试','lines',jsonb_build_array(jsonb_build_object('purpose_id',purpose,'supplier_id',supplier,'settlement_method_id',method,'fund_account_id',fund,'amount',amount_value))));
  perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'submit');perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'approve');perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'confirm');
  result:=public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('payable_id',finance->>'id','payment_line_id',payment->'lines'->0->>'id','amount',amount_value)),scheme,posting_date,'手工预付款核销');record_ident:=(result->>0)::uuid;
  if not exists(select 1 from public.fms_payable_writeoff_record where id=record_ident and needs_voucher and document_no is not null) then raise exception 'Advance writeoff failed to create accounting document';end if;
  if index_value=1 then
   result:=public.fms_payable_settlement_voucher_secure(record_ident,'writeoff',false);
   if result->>'status'<>'pending_configuration' then raise exception 'Missing accounting rules did not remain pending';end if;
   select id into pending_event from public.fms_posting_event where source_id=record_ident and event_code='ap_writeoff_approved';
   perform public.fms_reverse_payable_writeoff_secure(record_ident,'未制证反核销');
   if exists(select 1 from public.fms_payable_writeoff_record where id=record_ident and document_no is not null) then raise exception 'Reverse did not remove unvouchered writeoff document';end if;
   perform app_private.process_fms_posting_event(pending_event,true);
   if (select status from public.fms_posting_event where id=pending_event)<>'ignored' then raise exception 'Reversed writeoff could be posted later';end if;
   if (app_private.purchase_payable_json((finance->>'id')::uuid)->>'unpaid_amount')::numeric<>113 then raise exception 'Reverse failed to restore payable balance';end if;
   result:=public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('payable_id',finance->>'id','payment_line_id',payment->'lines'->0->>'id','amount',amount_value)),scheme,posting_date,'再次核销');record_ident:=(result->>0)::uuid;
   update public.fms_posting_rule set is_enabled=true where id=rule_ident;
  end if;
  result:=public.fms_payable_settlement_voucher_secure(record_ident,'writeoff',true);
  if jsonb_array_length(result->'lines')<>2 then raise exception 'Writeoff voucher preview missing genuine rule lines';end if;
  result:=public.fms_payable_settlement_voucher_secure(record_ident,'writeoff',false);
  if result->>'status'<>'generated' or jsonb_array_length(result->'voucher_ids')<>1 then raise exception 'Writeoff voucher failed: %',result;end if;
  repeated:=public.fms_payable_settlement_voucher_secure(record_ident,'writeoff',false);
  if repeated->'voucher_ids' is distinct from result->'voucher_ids' then raise exception 'Duplicate writeoff voucher generated';end if;
  blocked:=false;begin perform public.fms_reverse_payable_writeoff_secure(record_ident,'非法反核销');exception when check_violation then blocked:=true;end;
  if not blocked then raise exception 'Vouchered writeoff allowed reversal';end if;
  result:=public.fms_payable_settlement_voucher_secure((payment->>'id')::uuid,'payment',false);
  if result->>'status'<>'generated' then raise exception 'Payment voucher failed: %',result;end if;
  blocked:=false;begin perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'cancel_payment','非法取消已制证付款');exception when check_violation then blocked:=true;end;
  if not blocked then raise exception 'Payment cancellation bypassed generated voucher';end if;
 end loop;
 workspace:=public.fms_payable_writeoff_workspace_secure('{}');
 if (select count(*) from jsonb_array_elements(workspace->'history') r where r->>'status'='active' and (r->>'needs_voucher')::boolean)<2 then raise exception 'Writeoff workspace did not expose two accounting documents';end if;
end $test$;
rollback;
