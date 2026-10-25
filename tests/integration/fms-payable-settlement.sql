begin;
do $test$
declare
 actor uuid; tenant uuid; supplier uuid; supplier_two uuid; material uuid; unit_id uuid; fund uuid;
 finance_type uuid; app_type uuid; payment_type uuid; purpose uuid; method uuid;
 finance jsonb; finance_two jsonb; application jsonb; payment jsonb; blocked boolean;
 application_id uuid; payment_id uuid; scheme uuid; line_id uuid; record_id uuid; before_count bigint;
begin
 select auth_user_id into actor from public.sys_user where user_roles @>array['R_SUPER'] and auth_user_id is not null limit 1;
 select f.tenant_id,f.id into tenant,fund from public.fms_fund_account f join public.fms_currency c on c.id=f.currency_id
 where f.status='active' and f.account_type<>'cash' and c.currency_code='CNY' and f.account_set_id=app_private.resolve_fms_posting_account_set(f.tenant_id) and (select count(*) from public.mdm_supplier where tenant_id=f.tenant_id)>=2 limit 1;
 select id into supplier from public.mdm_supplier where tenant_id=tenant order by id limit 1;
 select id into supplier_two from public.mdm_supplier where tenant_id=tenant and id<>supplier order by id limit 1;
 select id,inventory_unit_id into material,unit_id from public.mdm_material where tenant_id=tenant and inventory_unit_id is not null limit 1;
 if actor is null or tenant is null or material is null then raise exception 'Missing settlement fixtures'; end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.headers','{}',true);
 select id into finance_type from public.mdm_document_type where tenant_id=tenant and document_type_code='AP_FIN_STANDARD';
 select id into app_type from public.mdm_document_type where tenant_id=tenant and document_type_code='AP_APP_PURCHASE';
 select id into payment_type from public.mdm_document_type where tenant_id=tenant and document_type_code='AP_PAYMENT_PURCHASE';
 select id into purpose from public.mdm_payment_purpose where tenant_id=tenant and code='201';
 select id into method from public.mdm_settlement_method where tenant_id=tenant and code='JSFS04';
 finance:=public.fms_save_purchase_payable_secure(jsonb_build_object('kind','financial','tenant_id',tenant,'document_type_id',finance_type,'supplier_id',supplier,'business_date',current_date,
 'lines',jsonb_build_array(jsonb_build_object('material_id',material,'inventory_unit_id',unit_id,'quantity',1,'unit_price',100,'tax_rate',13))));
 finance_two:=public.fms_save_purchase_payable_secure(jsonb_build_object('kind','financial','tenant_id',tenant,'document_type_id',finance_type,'supplier_id',supplier_two,'business_date',current_date,
 'lines',jsonb_build_array(jsonb_build_object('material_id',material,'inventory_unit_id',unit_id,'quantity',2,'unit_price',100,'tax_rate',13))));
 perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid,(finance_two->>'id')::uuid],'submit');
 perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid,(finance_two->>'id')::uuid],'approve');
 application:=public.fms_save_payable_settlement_secure(jsonb_build_object('kind','application','tenant_id',tenant,'document_type_id',app_type,'business_date',current_date,'reason','双往来单位付款回归',
 'lines',jsonb_build_array(
 jsonb_build_object('purpose_id',purpose,'supplier_id',supplier,'payable_id',finance->>'id','amount',113,'approved_amount',113,'planned_amount',100,'settlement_method_id',method,'fund_account_id',fund),
 jsonb_build_object('purpose_id',purpose,'supplier_id',supplier_two,'payable_id',finance_two->>'id','amount',226,'approved_amount',226,'planned_amount',200,'settlement_method_id',method,'fund_account_id',fund))));
 application_id:=(application->>'id')::uuid;
 if not exists(select 1 from public.get_record_delete_dependency_details('mdm_supplier',array[supplier::text],null) dependency where dependency.target_id=application_id::text and dependency.source_table='fms_payable_settlement_document' and dependency.record_no=application->>'document_no') then raise exception 'Supplier deletion reference cannot identify parent payment application';end if;
 if jsonb_array_length(application->'lines')<>2 or (application->>'amount')::numeric<>339 then raise exception 'Multi-counterparty application lost lines or total'; end if;
 if app_private.payable_reserved_amount((finance->>'id')::uuid)<>113 then raise exception 'Draft application did not reserve payable'; end if;
 blocked:=false;
 begin perform public.fms_push_payable_settlement_secure((finance->>'id')::uuid,'payment'); exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Reserved payable accepted duplicate push'; end if;
 perform public.fms_act_payable_settlement_secure(array[application_id],'submit');
 perform public.fms_act_payable_settlement_secure(array[application_id],'approve');
 payment:=public.fms_push_payable_settlement_secure(application_id,'payment','application');payment_id:=(payment->>'id')::uuid;
 if jsonb_array_length(payment->'lines')<>2 or app_private.payable_reserved_amount((finance->>'id')::uuid)<>113 then raise exception 'Application push double reserved or lost a party'; end if;
 perform public.fms_act_payable_settlement_secure(array[application_id],'freeze','测试冻结');
 blocked:=false;
 begin perform public.fms_act_payable_settlement_secure(array[payment_id],'submit'); exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Frozen application permitted payment submission'; end if;
 perform public.fms_act_payable_settlement_secure(array[application_id],'unfreeze','测试解冻');
 perform public.fms_act_payable_settlement_secure(array[payment_id],'submit');
 perform public.fms_act_payable_settlement_secure(array[payment_id],'approve');
 perform public.fms_act_payable_settlement_secure(array[payment_id],'confirm');
 if (app_private.purchase_payable_json((finance->>'id')::uuid)->>'unpaid_amount')::numeric<>0 or (app_private.purchase_payable_json((finance_two->>'id')::uuid)->>'unpaid_amount')::numeric<>0 then raise exception 'Confirmed source payments failed automatic writeoff'; end if;
 if (select count(*) from public.fms_payable_payment_execution where document_id=payment_id and status='posted')<>2 then raise exception 'Expected one real fund entry per payment line'; end if;
 select count(*) into before_count from public.fms_fund_ledger_entry;
 perform public.fms_act_payable_settlement_secure(array[payment_id],'confirm');
 if (select count(*) from public.fms_fund_ledger_entry)<>before_count then raise exception 'Duplicate confirmation posted duplicate cash'; end if;
 perform public.fms_act_payable_settlement_secure(array[payment_id],'cancel_payment','回归取消并保留冲回');
 if (app_private.purchase_payable_json((finance->>'id')::uuid)->>'unpaid_amount')::numeric<>113 then raise exception 'Cancel failed to restore payable'; end if;
 if (select count(*) from public.fms_payable_payment_execution where document_id=payment_id and status='reversed')<>2 then raise exception 'Cancel destroyed payment execution history'; end if;
 if (select count(*) from public.fms_fund_ledger_entry)<>before_count+2 then raise exception 'Cancel failed to post reversing fund entries'; end if;
 perform public.fms_act_payable_settlement_secure(array[payment_id],'confirm');
 if (select count(*) from public.fms_payable_payment_execution where document_id=payment_id and status='posted')<>2 then raise exception 'Reconfirmation did not create new traceable executions'; end if;
 if jsonb_array_length(public.fms_payable_settlement_delete_dependencies_secure(array[application_id]))<2 then raise exception 'Application deletion guard lost child payment links'; end if;
 if has_table_privilege('authenticated','public.fms_payable_settlement_line','UPDATE') or has_table_privilege('anon','public.fms_payable_writeoff_record','SELECT') then raise exception 'Controlled payment tables expose direct mutation or anonymous reads'; end if;
 application:=public.fms_save_payable_settlement_secure(jsonb_build_object('kind','application','tenant_id',tenant,'document_type_id',app_type,'business_date',current_date,'reason','无应付来源申请额度测试','lines',jsonb_build_array(jsonb_build_object('purpose_id',purpose,'supplier_id',supplier,'amount',100,'approved_amount',100,'planned_amount',100,'settlement_method_id',method,'fund_account_id',fund))));
 application_id:=(application->>'id')::uuid;line_id:=(application->'lines'->0->>'id')::uuid;
 perform public.fms_act_payable_settlement_secure(array[application_id],'submit');perform public.fms_act_payable_settlement_secure(array[application_id],'approve');
 payment:=public.fms_push_payable_settlement_secure(application_id,'payment','application');payment_id:=(payment->>'id')::uuid;
 payment:=jsonb_set(payment,'{lines}',jsonb_build_array((payment->'lines'->0)||jsonb_build_object('amount',60,'approved_amount',60,'planned_amount',60)));
 payment:=public.fms_save_payable_settlement_secure(payment);
 if (app_private.payable_settlement_json(application_id)->'lines'->0->>'unassigned_amount')::numeric<>40 then raise exception 'Manual application child quota not reserved';end if;
 blocked:=false;
 begin
  perform public.fms_save_payable_settlement_secure(jsonb_build_object('kind','payment','tenant_id',tenant,'document_type_id',payment_type,'business_date',current_date,'lines',jsonb_build_array(jsonb_build_object('purpose_id',purpose,'supplier_id',supplier,'application_line_id',line_id,'amount',50,'settlement_method_id',method,'fund_account_id',fund))));
 exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Manual application accepted overlapping payments beyond approved quota';end if;
 perform public.fms_act_payable_settlement_secure(array[payment_id],'void','恢复未使用申请额度');
 payment:=public.fms_save_payable_settlement_secure(jsonb_build_object('kind','payment','tenant_id',tenant,'document_type_id',payment_type,'business_date',current_date,'lines',jsonb_build_array(jsonb_build_object('purpose_id',purpose,'supplier_id',supplier,'application_line_id',line_id,'amount',50,'settlement_method_id',method,'fund_account_id',fund))));
 if (app_private.payable_settlement_json(application_id)->'lines'->0->>'unassigned_amount')::numeric<>50 then raise exception 'Voided manual payment failed to restore application quota';end if;
end $test$;
rollback;
