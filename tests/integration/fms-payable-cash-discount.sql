begin;
do $test$
declare
 actor uuid; account_set public.fms_account_set; posting_date date; fund uuid; supplier uuid; material uuid; unit_id uuid;
 finance_type uuid; payment_type uuid; purpose uuid; method uuid; scheme uuid; debit uuid; credit uuid; rule_id uuid;
 finance jsonb; application jsonb; payment jsonb; result jsonb; record_id uuid; line_id uuid; blocked boolean; index_value integer;
begin
 select auth_user_id into actor from public.sys_user where user_roles @>array['R_SUPER'] and auth_user_id is not null limit 1;
 select a.* into account_set from public.fms_account_set a where a.is_default and a.status='active'
 and exists(select 1 from public.fms_fund_account f join public.fms_currency c on c.id=f.currency_id where f.account_set_id=a.id and f.status='active' and c.currency_code='CNY' and f.account_type<>'cash')
 and exists(select 1 from public.mdm_material where tenant_id=a.tenant_id and inventory_unit_id is not null) limit 1;
 select start_date into posting_date from public.fms_accounting_period where account_set_id=account_set.id and status='open' order by start_date desc limit 1;
 select f.id into fund from public.fms_fund_account f join public.fms_currency c on c.id=f.currency_id where f.account_set_id=account_set.id and f.status='active' and c.currency_code='CNY' and f.account_type<>'cash' limit 1;
 select id into supplier from public.mdm_supplier where tenant_id=account_set.tenant_id limit 1;
 select id,inventory_unit_id into material,unit_id from public.mdm_material where tenant_id=account_set.tenant_id and inventory_unit_id is not null limit 1;
 select id into debit from public.fms_subject s where account_set_id=account_set.id and is_enabled and not cash_flow_required and not exists(select 1 from public.fms_subject child where child.parent_id=s.id) and not exists(select 1 from public.fms_subject_auxiliary_type binding where binding.subject_id=s.id and is_required) order by subject_code limit 1;
 select id into credit from public.fms_subject s where account_set_id=account_set.id and id<>debit and is_enabled and not cash_flow_required and not exists(select 1 from public.fms_subject child where child.parent_id=s.id) and not exists(select 1 from public.fms_subject_auxiliary_type binding where binding.subject_id=s.id and is_required) order by subject_code limit 1;
 if actor is null or fund is null or credit is null or posting_date is null then raise exception 'Missing cash discount fixtures';end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers','{}',true);
 select id into finance_type from public.mdm_document_type where tenant_id=account_set.tenant_id and document_type_code='AP_FIN_STANDARD';
 select id into payment_type from public.mdm_document_type where tenant_id=account_set.tenant_id and document_type_code='AP_PAYMENT_PURCHASE';
 select id into purpose from public.mdm_payment_purpose where tenant_id=account_set.tenant_id and code='201';
 select id into method from public.mdm_settlement_method where tenant_id=account_set.tenant_id and code='JSFS04';
 select id into scheme from public.fms_payable_writeoff_scheme where tenant_id=account_set.tenant_id and code='AP-MANUAL';
 finance:=public.fms_save_purchase_payable_secure(jsonb_build_object('kind','financial','tenant_id',account_set.tenant_id,'document_type_id',finance_type,'supplier_id',supplier,'business_date',posting_date,'lines',jsonb_build_array(jsonb_build_object('material_id',material,'inventory_unit_id',unit_id,'quantity',1,'unit_price',100,'tax_rate',0))));
 perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'submit');perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'approve');
 application:=public.fms_push_payable_settlement_secure((finance->>'id')::uuid,'application');
 perform public.fms_act_payable_settlement_secure(array[(application->>'id')::uuid],'submit');perform public.fms_act_payable_settlement_secure(array[(application->>'id')::uuid],'approve');
 payment:=public.fms_push_payable_settlement_secure((application->>'id')::uuid,'payment','application');
 payment:=jsonb_set(payment,'{lines}',jsonb_build_array((payment->'lines'->0)||jsonb_build_object('amount',90,'approved_amount',90,'planned_amount',90,'cash_discount',10,'settlement_method_id',method,'fund_account_id',fund)));
 payment:=public.fms_save_payable_settlement_secure(payment);line_id:=(payment->'lines'->0->>'id')::uuid;
 perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'submit');perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'approve');perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'confirm');
 application:=app_private.payable_settlement_json((application->>'id')::uuid);
 if application->>'payment_status'<>'full' or (application->>'paid_amount')::numeric<>90 then raise exception 'Discount changed actual cash or left approved application partly payable';end if;
 if (app_private.payable_settlement_json((payment->>'id')::uuid)->'lines'->0->>'paid_amount')::numeric<>90 then raise exception 'Confirmed payment detail still shows unpaid cash';end if;
 if (app_private.purchase_payable_json((finance->>'id')::uuid)->>'unpaid_amount')::numeric<>0 then raise exception 'Discount failed to clear full payable face amount';end if;
 if not exists(select 1 from public.fms_payable_writeoff_record where payment_line_id=line_id and status='active' and amount=100 and payment_amount=90 and cash_discount_amount=10 and needs_voucher) then raise exception 'Discount writeoff allocations do not match actual cash and face amount';end if;
 blocked:=false;begin perform public.fms_act_payable_settlement_secure(array[(application->>'id')::uuid],'freeze','不得冻结已全部结清申请');exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Discount fully settled application still allowed freezing';end if;
 update public.fms_posting_rule set is_enabled=false where tenant_id=account_set.tenant_id and source_type='system' and event_code='ap_writeoff_approved';
 insert into public.fms_posting_rule(tenant_id,account_set_id,rule_code,rule_name,source_type,event_code,priority,submission_mode)
 values(account_set.tenant_id,account_set.id,'APD_'||upper(left(gen_random_uuid()::text,8)),'现金折扣核销回滚测试','system','ap_writeoff_approved',999999,'draft') returning id into rule_id;
 insert into public.fms_posting_rule_line(tenant_id,account_set_id,rule_id,line_no,subject_id,direction,amount_key)
 values(account_set.tenant_id,account_set.id,rule_id,1,debit,'debit','gross_amount'),(account_set.tenant_id,account_set.id,rule_id,2,credit,'credit','paid_amount'),(account_set.tenant_id,account_set.id,rule_id,3,credit,'credit','discount_amount');
 select id into record_id from public.fms_payable_writeoff_record where payment_line_id=line_id and status='active';
 result:=public.fms_payable_settlement_voucher_secure(record_id,'writeoff',true);
 if jsonb_array_length(result->'lines')<>3 then raise exception 'Discount voucher preview lost three real posting-rule lines: %',result;end if;
 result:=public.fms_payable_settlement_voucher_secure(record_id,'writeoff',false);
 if result->>'status'<>'generated' then raise exception 'Cash discount voucher is not balanced: %',result;end if;
 finance:=public.fms_save_purchase_payable_secure(jsonb_build_object('kind','financial','tenant_id',account_set.tenant_id,'document_type_id',finance_type,'supplier_id',supplier,'business_date',posting_date,'lines',jsonb_build_array(jsonb_build_object('material_id',material,'inventory_unit_id',unit_id,'quantity',1,'unit_price',3,'tax_rate',0))));
 perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'submit');perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'approve');
 payment:=public.fms_save_payable_settlement_secure(jsonb_build_object('kind','payment','tenant_id',account_set.tenant_id,'document_type_id',payment_type,'business_date',posting_date,'reason','三次部分核销现金折扣尾差','lines',jsonb_build_array(jsonb_build_object('purpose_id',purpose,'supplier_id',supplier,'settlement_method_id',method,'fund_account_id',fund,'amount',2,'cash_discount',1))));
 perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'submit');perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'approve');perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'confirm');
 line_id:=(payment->'lines'->0->>'id')::uuid;
 for index_value in 1..3 loop
  result:=public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('payable_id',finance->>'id','payment_line_id',line_id,'amount',1)),scheme,posting_date,'部分折扣尾差测试');record_id:=(result->>0)::uuid;
  if (select cash_discount_amount from public.fms_payable_writeoff_record where id=record_id)<>(case when index_value=3 then 0.34 else 0.33 end) then raise exception 'Discount partial allocation did not absorb final cent residual';end if;
 end loop;
 if (select sum(payment_amount) from public.fms_payable_writeoff_record where payment_line_id=line_id and status='active')<>2 or (select sum(cash_discount_amount) from public.fms_payable_writeoff_record where payment_line_id=line_id and status='active')<>1 then raise exception 'Partial allocations lost cash or discount cents';end if;
 perform public.fms_reverse_payable_writeoff_secure(record_id,'尾笔反核销再核销');
 result:=public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('payable_id',finance->>'id','payment_line_id',line_id,'amount',1)),scheme,posting_date,'恢复尾差');record_id:=(result->>0)::uuid;
 if (select cash_discount_amount from public.fms_payable_writeoff_record where id=record_id)<>0.34 then raise exception 'Reversed allocation was incorrectly consumed again';end if;
end $test$;
rollback;
