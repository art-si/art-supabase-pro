begin;

do $test$
declare
 actor uuid;ordinary uuid;tenant uuid;foreign_tenant uuid;book uuid;supplier uuid;material uuid;unit_id uuid;type_id uuid;standard_type uuid;payment_type uuid;application_type uuid;purpose uuid;method uuid;
 invoice jsonb;updated jsonb;workspace jsonb;payload jsonb;result jsonb;credit_id uuid;line_id uuid;case_number integer;blocked boolean;posting_date date;balance_before numeric;credit_total numeric:=0;fixture text:='QA_CREDIT_'||upper(left(gen_random_uuid()::text,8));
 expense_subject uuid;tax_subject uuid;liability_subject uuid;rule_id uuid;generated_voucher_id uuid;forged jsonb;
begin
 select auth_user_id into actor from public.sys_user where user_roles @>array['R_SUPER'] and auth_user_id is not null limit 1;
 select id into tenant from public.sys_tenant where tenant_code='qa-payable-20261022';
 select auth_user_id into ordinary from public.sys_user where tenant_id=tenant and auth_user_id is not null and not system_protected and status='1' order by id limit 1;
 select id into foreign_tenant from public.sys_tenant where id<>tenant and builtin_type is distinct from 'platform' and status='1' order by id limit 1;
 select id into book from public.fms_account_set where tenant_id=tenant and is_default and status='active' and base_currency_code='CNY';
 posting_date:=app_private.payable_business_date();
 if actor is null or ordinary is null or foreign_tenant is null or book is null then raise exception 'Missing independent credit payable fixtures';end if;
 perform set_config('request.jwt.claim.sub',ordinary::text,true);perform set_config('request.headers','{}',true);
 insert into public.mdm_supplier(tenant_id,supplier_code,supplier_name) values(tenant,fixture,'红字应付回滚主体'||fixture) returning id into supplier;
 select id,inventory_unit_id into material,unit_id from public.mdm_material where tenant_id=tenant and inventory_unit_id is not null order by id limit 1;
 select id into type_id from public.mdm_document_type where tenant_id=tenant and document_type_code='AP_FIN_OTHER';
 select id into standard_type from public.mdm_document_type where tenant_id=tenant and document_type_code='AP_FIN_STANDARD';
 select id into payment_type from public.mdm_document_type where tenant_id=tenant and document_type_code='AP_PAYMENT_PURCHASE';
 select id into application_type from public.mdm_document_type where tenant_id=tenant and document_type_code='AP_APP_PURCHASE';
 select id into purpose from public.mdm_payment_purpose where tenant_id=tenant and code='201';
 select id into method from public.mdm_settlement_method where tenant_id=tenant and enabled and category='virtual' order by code limit 1;
 balance_before:=app_private.payable_counterparty_balance(tenant,supplier,null);
 insert into public.fms_subject(tenant_id,account_set_id,subject_code,subject_name,category,balance_direction)
 values(tenant,book,'993'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS'),'红字费用回滚科目','expense','debit') returning id into expense_subject;
 select id into tax_subject from public.fms_subject where account_set_id=book and subject_code='2221' and is_enabled;
 select id into liability_subject from public.fms_subject where account_set_id=book and subject_code='2241' and is_enabled;
 if tax_subject is null or liability_subject is null then raise exception 'Missing other payable and input-tax posting fixtures';end if;
 insert into public.fms_posting_rule(tenant_id,account_set_id,rule_code,rule_name,source_type,event_code,priority,submission_mode,match_conditions)
 values(tenant,book,fixture,'红字应付回滚凭证','financial_payable','approved',999999,'draft','{"is_credit":true}') returning id into rule_id;
 insert into public.fms_posting_rule_line(tenant_id,account_set_id,rule_id,line_no,direction,amount_key,subject_id)
 values(tenant,book,rule_id,10,'debit','net_amount',expense_subject),(tenant,book,rule_id,20,'debit','tax_amount',tax_subject),(tenant,book,rule_id,30,'credit','gross_amount',liability_subject);
 for case_number in 1..2 loop
  payload:=jsonb_build_object('kind','financial','tenant_id',tenant,'document_type_id',type_id,'supplier_id',supplier,'business_date',posting_date,'is_credit',true,
   'input_tax_inclusive_price',false,'lines',jsonb_build_array(jsonb_build_object('material_id',material,'inventory_unit_id',unit_id,'quantity',case_number,'unit_price',10,'tax_rate',13)));
  if case_number=2 then perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers','{}',true);end if;
  invoice:=public.fms_save_purchase_payable_secure(payload);credit_id:=(invoice->>'id')::uuid;line_id:=(invoice->'lines'->0->>'id')::uuid;
  if(invoice->>'is_credit')::boolean is distinct from true or(invoice->>'total_amount')::numeric<>-11.3*case_number
   or(invoice->>'face_total_amount')::numeric<>11.3*case_number or(invoice->>'base_total_amount')::numeric<>-11.3*case_number
   or(invoice->'lines'->0->>'quantity')::numeric<>case_number or(invoice->'lines'->0->>'unit_price')::numeric<>10
   or(invoice->'lines'->0->>'amount')::numeric<>-10*case_number then raise exception 'Credit sign was confused with price or physical quantity: %',invoice;end if;
  if not exists(select 1 from public.fms_purchase_payable_line where id=line_id and quantity=case_number and amount=10*case_number and total_amount=11.3*case_number) then raise exception 'Credit storage lost its absolute pricing basis';end if;
  invoice:=public.fms_save_purchase_payable_secure(invoice||jsonb_build_object('remark','红字编辑仍按独立计价口径'));
  if(invoice->>'total_amount')::numeric<>-11.3*case_number then raise exception 'Editing a credit invoice changed its economic direction';end if;
  perform public.fms_act_purchase_payable_secure(array[credit_id],'submit');perform public.fms_act_purchase_payable_secure(array[credit_id],'approve');
  credit_total:=credit_total+11.3*case_number;
  result:=app_private.payable_posting_payload(credit_id);
  if(result->>'gross_amount')::numeric<>-11.3*case_number or(result->>'net_amount')::numeric<>-10*case_number or(result->>'original_gross_amount')::numeric<>-11.3*case_number then raise exception 'Credit posting payload would increase the liability';end if;
  if(app_private.payable_line_book_values(line_id)->>'base_total_amount')::numeric<>-11.3*case_number then raise exception 'Line local-currency projection lost the credit direction';end if;
  result:=public.fms_payable_voucher_secure(credit_id);
  if result->>'status'<>'generated' then raise exception 'Credit invoice did not generate its correctly reversed accounting entry: %',result;end if;
  generated_voucher_id:=(result->>'voucher_id')::uuid;
  if not exists(select 1 from public.fms_voucher_line entry where entry.voucher_id=generated_voucher_id and entry.subject_id=liability_subject and entry.debit_amount=11.3*case_number)
   or not exists(select 1 from public.fms_voucher_line entry where entry.voucher_id=generated_voucher_id and entry.subject_id=expense_subject and entry.credit_amount=10*case_number)
   or not exists(select 1 from public.fms_voucher_line entry where entry.voucher_id=generated_voucher_id and entry.subject_id=tax_subject and entry.credit_amount=1.3*case_number) then raise exception 'Credit posting increased debt or failed to reverse cost and input tax';end if;
  result:=public.fms_purchase_payable_list_secure('financial','',credit_id,1,0,'{}');
  if(result->'data'->0->>'total_amount')::numeric<>-11.3*case_number or(result->'data'->0->'lines'->0->>'base_total_amount')::numeric<>-11.3*case_number then raise exception 'Paged credit projection contradicted the invoice';end if;
  if exists(select 1 from public.fms_purchase_payable_document where reversal_source_id=credit_id) then raise exception 'Credit note was mistaken for an estimate reversal';end if;
  perform public.fms_act_purchase_payable_secure(array[credit_id],'freeze','冻结红字处理',1);
  if(select frozen_amount from public.fms_purchase_payable_document where id=credit_id)<>1 then raise exception 'Credit freeze lost its positive control amount';end if;
  perform public.fms_act_purchase_payable_secure(array[credit_id],'unfreeze','解除红字处理冻结');
  for updated in select jsonb_build_object('kind','application','document_type_id',application_type) union all select jsonb_build_object('kind','payment','document_type_id',payment_type) loop
   blocked:=false;begin
    perform public.fms_save_payable_settlement_secure(updated||jsonb_build_object('tenant_id',tenant,'business_date',posting_date,
     'lines',jsonb_build_array(jsonb_build_object('purpose_id',purpose,'supplier_id',supplier,'payable_id',credit_id,'settlement_method_id',method,'amount',1))));
   exception when check_violation then blocked:=true;end;
   if not blocked then raise exception 'Credit invoice was accepted as an outflow source';end if;
  end loop;
  blocked:=false;begin perform public.fms_push_payable_settlement_secure(credit_id,'payment');exception when check_violation then blocked:=true;end;
  if not blocked then raise exception 'Credit invoice pushed a cash payment';end if;
  blocked:=false;begin update public.fms_purchase_payable_document set is_credit=false where id=credit_id;exception when check_violation then blocked:=true;end;
  if not blocked then raise exception 'Approved invoice direction could be rewritten';end if;
  blocked:=false;begin update public.fms_purchase_payable_line set quantity=-quantity where id=line_id;exception when check_violation then blocked:=true;end;
  if not blocked then raise exception 'Credit flag was mixed with negative physical quantity';end if;
  if case_number=2 then
   perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',foreign_tenant)::text,true);
   blocked:=false;begin perform public.fms_act_purchase_payable_secure(array[credit_id],'freeze','越范围冻结',1);exception when insufficient_privilege then blocked:=true;end;
   if not blocked then raise exception 'Platform-selected scope mutated another tenant credit';end if;
   perform set_config('request.jwt.claim.sub',ordinary::text,true);
  end if;
 end loop;
 if app_private.payable_counterparty_balance(tenant,supplier,null)<>balance_before-credit_total then raise exception 'Supplier balance treated a credit as extra debt';end if;
 forged:=public.fms_save_purchase_payable_secure(payload);
 if(forged->>'tenant_id')::uuid<>tenant then raise exception 'Ordinary forged tenant header redirected credit creation';end if;
 blocked:=false;begin perform public.fms_save_purchase_payable_secure(payload||jsonb_build_object('tenant_id',foreign_tenant));exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Ordinary credit creation accepted an explicit foreign tenant';end if;
 workspace:=public.fms_payable_writeoff_workspace_secure('{"relation":"payable_payment"}');
 if exists(select 1 from jsonb_array_elements(workspace->'primary') row_data where row_data->>'supplier_id'=supplier::text) then raise exception 'Positive cash writeoff workspace offered credit notes';end if;
 result:=public.fms_payable_settlement_options_secure('payment',tenant);
 if exists(select 1 from jsonb_array_elements(result->'payable') row_data where row_data->>'supplier_id'=supplier::text) then raise exception 'Outflow reference options offered credit notes';end if;
 blocked:=false;begin perform public.fms_save_purchase_payable_secure(payload||jsonb_build_object('kind','estimated'));exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Estimated reversal and financial credit were conflated';end if;
 blocked:=false;begin perform public.fms_save_purchase_payable_secure(payload||jsonb_build_object('document_type_id',standard_type));exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Manual credit bypassed standard purchase return lineage';end if;
 blocked:=false;begin perform public.fms_save_purchase_payable_secure(payload||jsonb_build_object('payment_plans',jsonb_build_array(jsonb_build_object('due_date',posting_date,'amount',22.6))));exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Credit note created an outflow payment schedule';end if;
 if exists(select 1 from public.fms_payable_settlement_line where payable_id in(select id from public.fms_purchase_payable_document where supplier_id=supplier)) then raise exception 'Failed credit outflows retained reservations';end if;
 if has_function_privilege('authenticated','app_private.payable_apply_credit_sign(jsonb,boolean)','execute') or has_function_privilege('anon','app_private.assert_payable_outflow_direction(uuid,uuid)','execute') then raise exception 'Private credit policy exposed';end if;
end $test$;

rollback;
