begin;

do $test$
declare
 actor uuid;ordinary uuid;tenant uuid;platform uuid;foreign_tenant uuid;book uuid;currency_id uuid;other_book uuid;other_currency uuid;
 fund uuid;receiving_one uuid;receiving_two uuid;wrong_fund uuid;supplier uuid;purpose uuid;refund_purpose uuid;method uuid;payment_type uuid;refund_type uuid;refund_menu uuid;
 fixture_role uuid;fixture_code text:='QA_RF_SAVE_'||upper(left(gen_random_uuid()::text,8));source_documents jsonb:='[]';source_document jsonb;
 source_line uuid;other_source_line uuid;payload jsonb;document jsonb;stale jsonb;result jsonb;state jsonb;total_value numeric;expiry_value numeric;
 case_number integer;blocked boolean;before_count bigint;refund_id uuid;
begin
 select auth_user_id,tenant_id into actor,platform from public.sys_user where auth_user_id is not null and user_roles @>array['R_SUPER'] limit 1;
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers','{}',true);
 select account_set.tenant_id,account_set.id,currency.id into tenant,book,currency_id
 from public.fms_account_set account_set join public.fms_currency currency on currency.account_set_id=account_set.id and currency.tenant_id=account_set.tenant_id and currency.currency_code='CNY'
 join public.sys_tenant tenant_record on tenant_record.id=account_set.tenant_id
 where account_set.status='active' and account_set.is_default
 and exists(select 1 from public.mdm_supplier where tenant_id=account_set.tenant_id)
 and exists(select 1 from public.mdm_payment_purpose where tenant_id=account_set.tenant_id and enabled and business_type='advance' and payable_writeoff)
 and exists(select 1 from public.mdm_settlement_method where tenant_id=account_set.tenant_id and enabled and category='cash')
 and exists(select 1 from public.sys_user where tenant_id=account_set.tenant_id and auth_user_id is not null and status='1' and not user_roles @>array['R_SUPER'])
 order by (tenant_record.tenant_code='qa-payable-20261022') desc,account_set.id limit 1;
 if tenant is null then raise exception 'Refund save regression needs ordinary tenant accounting and payment masters';end if;
 select auth_user_id into ordinary from public.sys_user where tenant_id=tenant and auth_user_id is not null and status='1' and not user_roles @>array['R_SUPER'] order by id limit 1;
 select id into foreign_tenant from public.sys_tenant where id<>tenant and status='1' and builtin_type is distinct from 'platform'
  and(service_start_date is null or service_start_date<=app_private.payable_business_date()) and(service_end_date is null or service_end_date>=app_private.payable_business_date()) order by id limit 1;
 if foreign_tenant is null then raise exception 'Refund scope regression needs a second active business tenant';end if;
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',tenant)::text,true);
 perform set_config('request.jwt.claim.sub',ordinary::text,true);
 insert into public.fms_account_set(tenant_id,account_set_code,account_set_name,legal_entity_name,base_currency_code,enabled_on,status)
 values(tenant,fixture_code,'退款跨账套阻断夹具','虚构验收主体','CNY',app_private.payable_business_date(),'active') returning id into other_book;
 insert into public.fms_currency(tenant_id,account_set_id,currency_code,currency_name,symbol,is_enabled,is_base)
 values(tenant,other_book,'CNY','人民币','¥',true,true) returning id into other_currency;
 perform set_config('request.jwt.claim.sub',ordinary::text,true);
 insert into public.fms_fund_account(tenant_id,account_set_id,currency_id,account_code,account_name,account_type,bank_name,account_no_masked,account_no_fingerprint,opening_balance)
 values(tenant,book,currency_id,fixture_code||'_PAY','退款原付款现金户','cash','','**** QA',md5(gen_random_uuid()::text),2000) returning id into fund;
 insert into public.fms_fund_account(tenant_id,account_set_id,currency_id,account_code,account_name,account_type,bank_name,account_no_masked,account_no_fingerprint,opening_balance)
 values(tenant,book,currency_id,fixture_code||'_IN1','退款收款现金户一','cash','','**** QA',md5(gen_random_uuid()::text),0) returning id into receiving_one;
 insert into public.fms_fund_account(tenant_id,account_set_id,currency_id,account_code,account_name,account_type,bank_name,account_no_masked,account_no_fingerprint,opening_balance)
 values(tenant,book,currency_id,fixture_code||'_IN2','退款收款现金户二','cash','','**** QA',md5(gen_random_uuid()::text),0) returning id into receiving_two;
 insert into public.fms_fund_account(tenant_id,account_set_id,currency_id,account_code,account_name,account_type,bank_name,account_no_masked,account_no_fingerprint,opening_balance)
 values(tenant,other_book,other_currency,fixture_code||'_BAD','退款其他账套现金户','cash','','**** QA',md5(gen_random_uuid()::text),0) returning id into wrong_fund;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 select id into supplier from public.mdm_supplier where tenant_id=tenant order by id limit 1;
 select id into purpose from public.mdm_payment_purpose where tenant_id=tenant and enabled and business_type='advance' and payable_writeoff limit 1;
 select id into method from public.mdm_settlement_method where tenant_id=tenant and enabled and category='cash' limit 1;
 select id into payment_type from public.mdm_document_type where tenant_id=tenant and enabled and document_type_code='AP_PAYMENT_PURCHASE';
 refund_purpose:=public.fms_save_payable_reference_secure('purpose',jsonb_build_object('tenant_id',tenant,'code',fixture_code,'name','退预付款回归用途','business_type','advance_refund','payable_writeoff',true));
 select id into refund_menu from public.sys_menu where name='FinancePayableRefund';
 if refund_menu is null then
  insert into public.sys_menu(name,path,component,parent_id,type,app_code,meta,sort)
  select 'FinancePayableRefund','payment-refund','/fms/accounts-payable/payment-refund',parent_id,'menu','fms',jsonb_build_object('title','付款退款','is_enable',true,'is_hide',true),sort+1
  from public.sys_menu where name='FinancePayablePayment' returning id into refund_menu;
 end if;
 insert into public.sys_menu(name,path,component,parent_id,type,app_code,meta)
 select 'FinancePayableRefund:'||action,'','',refund_menu,'button','fms',jsonb_build_object('title',action,'is_enable',true)
 from unnest(array['View','Add','Edit','Submit','Approve','Confirm','Void','Delete','Voucher']) action where not exists(select 1 from public.sys_menu where name='FinancePayableRefund:'||action);
 insert into public.mdm_document_type(tenant_id,menu_id,document_type_code,document_type_name,enabled,is_default,sort_order)
 values(tenant,refund_menu,fixture_code,'付款退款回归类型',true,true,1) returning id into refund_type;
 insert into public.sys_document_number_scene(rule_key,rule_name,field_label,category,menu_id,target_table,target_column,default_template,default_reset_cycle,manual_required,enabled,tenant_id)
 select 'fms.payable_refund','付款退款编号','付款退款单号',category,refund_menu,target_table,target_column,'FKTK-{YYYYMM}-{SEQ:3}','month',true,true,tenant_id
 from public.sys_document_number_scene where rule_key='fms.payable_payment' on conflict(rule_key) do nothing;
 insert into public.sys_document_number_rule(tenant_id,rule_key,rule_name,category,target_table,target_column,auto_enabled,template,reset_cycle,sequence_start,timezone,manual_required,builtin,enabled)
 select tenant,'fms.payable_refund','付款退款编号',category,target_table,target_column,true,'FKTK-{YYYYMM}-{SEQ:3}','month',1,'Asia/Shanghai',true,true,true
 from public.sys_document_number_rule where tenant_id=tenant and rule_key='fms.payable_payment' on conflict(tenant_id,rule_key) do nothing;
 for case_number in 1..2 loop
  source_document:=public.fms_save_payable_settlement_secure(jsonb_build_object('kind','payment','tenant_id',tenant,'document_type_id',payment_type,'business_date',app_private.payable_business_date(),
   'currency_code','CNY','details',jsonb_build_object('fee',case when case_number=1 then 5 else 0 end),'lines',jsonb_build_array(jsonb_build_object('purpose_id',purpose,'supplier_id',supplier,'settlement_method_id',method,'fund_account_id',fund,'amount',90,'cash_discount',10))));
  perform public.fms_act_payable_settlement_secure(array[(source_document->>'id')::uuid],'submit');
  perform public.fms_act_payable_settlement_secure(array[(source_document->>'id')::uuid],'approve');
  perform public.fms_act_payable_settlement_secure(array[(source_document->>'id')::uuid],'confirm');
  source_documents:=source_documents||jsonb_build_array(source_document);
 end loop;
 if exists(select 1 from jsonb_array_elements(public.fms_payable_settlement_options_secure('payment',tenant)->'purpose') item where item->>'id'=refund_purpose::text) then raise exception 'Refund purpose appeared as an ordinary outgoing payment purpose';end if;
 blocked:=false;
 begin perform public.fms_save_payable_settlement_secure(jsonb_build_object('kind','payment','tenant_id',tenant,'document_type_id',payment_type,'business_date',app_private.payable_business_date(),
  'lines',jsonb_build_array(jsonb_build_object('purpose_id',refund_purpose,'supplier_id',supplier,'settlement_method_id',method,'fund_account_id',fund,'amount',1))));
 exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Refund purpose was accepted for outgoing procurement cash';end if;
 insert into public.sys_role(role_code,role_name,tenant_id,enabled) values(fixture_code,'退款保存权限回归角色',tenant,true) returning id into fixture_role;
 insert into public.sys_role_menu(role_id,menu_id,tenant_id) select fixture_role,id,tenant from public.sys_menu where name in('FinancePayablePayment:View','FinancePayableRefund:View','FinancePayableRefund:Add','FinancePayableRefund:Edit');
 update public.sys_user set user_roles=array[fixture_code] where auth_user_id=ordinary;
 for case_number in 1..2 loop
  source_document:=source_documents->(case_number-1);source_line:=(source_document->'lines'->0->>'id')::uuid;
  total_value:=case when case_number=1 then 45 else 90 end;expiry_value:=case when case_number=1 then 5 else 10 end;
  payload:=jsonb_build_object('kind','refund','tenant_id',tenant,'document_type_id',refund_type,'business_date',app_private.payable_business_date(),'currency_code','CNY',
   'lines',jsonb_build_array(jsonb_build_object('refund_payment_line_id',source_line,'purpose_id',refund_purpose,'settlement_method_id',method,'fund_account_id',receiving_one,'amount',case when case_number=1 then 30 else 30.01 end,'expired_discount_amount',case when case_number=1 then 3 else 0 end),
    jsonb_build_object('refund_payment_line_id',source_line,'purpose_id',refund_purpose,'settlement_method_id',method,'fund_account_id',receiving_two,'amount',case when case_number=1 then 15 else 59.99 end,'expired_discount_amount',case when case_number=1 then 2 else 0 end)));
  perform set_config('request.jwt.claim.sub',ordinary::text,true);perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',platform)::text,true);
  select count(*) into before_count from public.fms_payable_settlement_document where kind='refund';
  blocked:=false;
  begin perform public.fms_save_payable_settlement_secure(jsonb_set(payload,'{lines,0,amount}','90.01'));exception when check_violation then blocked:=true;end;
  if not blocked then raise exception 'Split account lines bypassed the original payment cash cap';end if;
  blocked:=false;
  begin perform public.fms_save_payable_settlement_secure(jsonb_set(payload,'{lines,0,expired_discount_amount}','11'));exception when check_violation then blocked:=true;end;
  if not blocked then raise exception 'Split account lines bypassed the original discount cap';end if;
  blocked:=false;
  begin perform public.fms_save_payable_settlement_secure(jsonb_set(payload,'{lines,0,fund_account_id}',to_jsonb(wrong_fund)));exception when check_violation then blocked:=true;end;
  if not blocked then raise exception 'Refund receiving account crossed the original accounting book';end if;
  blocked:=false;
  begin perform public.fms_save_payable_settlement_secure(payload||jsonb_build_object('tenant_id',platform));exception when insufficient_privilege then blocked:=true;end;
  if not blocked then raise exception 'Refund save accepted a forged explicit target tenant';end if;
  blocked:=false;
  begin perform public.fms_save_payable_settlement_secure(payload||jsonb_build_object('details',jsonb_build_object('fee',5)));exception when check_violation then blocked:=true;end;
  if not blocked or (select count(*) from public.fms_payable_settlement_document where kind='refund')<>before_count then raise exception 'Rejected refund saved a fee or leaked a partial document';end if;
  delete from public.sys_role_menu where role_id=fixture_role and menu_id=(select id from public.sys_menu where name='FinancePayableRefund:Add');
  blocked:=false;begin perform public.fms_save_payable_settlement_secure(payload);exception when insufficient_privilege then blocked:=true;end;
  if not blocked then raise exception 'Missing refund Add permission was accepted';end if;
  insert into public.sys_role_menu(role_id,menu_id,tenant_id) select fixture_role,id,tenant from public.sys_menu where name='FinancePayableRefund:Add';
  if case_number=2 then
   perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',foreign_tenant)::text,true);
   blocked:=false;begin perform public.fms_save_payable_settlement_secure(payload);exception when insufficient_privilege then blocked:=true;end;
   if not blocked then raise exception 'Platform-selected scope accepted a foreign refund source';end if;
   perform set_config('request.headers','{}',true);document:=public.fms_save_payable_settlement_secure(payload-'tenant_id');
  else document:=public.fms_save_payable_settlement_secure(payload);end if;
  refund_id:=(document->>'id')::uuid;stale:=document;
  if (document->>'tenant_id')::uuid<>tenant or (document->>'account_set_id')::uuid<>book or (document->>'amount')::numeric<>total_value
   or document->>'document_no' !~ '^FKTK-[0-9]{6}-[0-9]{3}$' or jsonb_array_length(document->'lines')<>2 then raise exception 'Refund save lost parent tenant, accounting book, number rule or split rows';end if;
  if (select sum((item->>'expired_discount_amount')::numeric) from jsonb_array_elements(document->'lines') item)<>expiry_value
   or exists(select 1 from jsonb_array_elements(document->'lines') item where item->>'source_document_no' is distinct from source_document->>'document_no') then raise exception 'Refund projection lost automatic discount expiry or original payment identity';end if;
  if case_number=2 and ((document->'lines'->0->>'expired_discount_amount')::numeric<>3.33 or (document->'lines'->1->>'expired_discount_amount')::numeric<>6.67) then raise exception 'Full refund did not allocate the entire unused discount and final cent across the receiving accounts';end if;
  perform set_config('request.jwt.claim.sub',ordinary::text,true);perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',platform)::text,true);
  delete from public.sys_role_menu where role_id=fixture_role and menu_id=(select id from public.sys_menu where name='FinancePayableRefund:Edit');
  blocked:=false;begin perform public.fms_save_payable_settlement_secure(document);exception when insufficient_privilege then blocked:=true;end;
  if not blocked then raise exception 'Missing refund Edit permission was accepted';end if;
  insert into public.sys_role_menu(role_id,menu_id,tenant_id) select fixture_role,id,tenant from public.sys_menu where name='FinancePayableRefund:Edit';
  document:=public.fms_save_payable_settlement_secure(document||jsonb_build_object('reason','普通用户跨伪造租户头编辑退款'));
  blocked:=false;begin perform public.fms_save_payable_settlement_secure(stale);exception when serialization_failure then blocked:=true;end;
  if not blocked then raise exception 'Stale refund version overwrote the current split rows';end if;
  blocked:=false;
  begin perform public.fms_save_payable_settlement_secure(document||jsonb_build_object('lines',jsonb_build_array(document->'lines'->0,document->'lines'->0)));exception when invalid_parameter_value then blocked:=true;end;
  if not blocked then raise exception 'Duplicate refund row identifiers were accepted';end if;
  if case_number=1 then
   other_source_line:=(source_documents->1->'lines'->0->>'id')::uuid;blocked:=false;
   begin perform public.fms_save_payable_settlement_secure(jsonb_set(document,'{lines,0,refund_payment_line_id}',to_jsonb(other_source_line)));exception when check_violation then blocked:=true;end;
   if not blocked then raise exception 'Existing refund row changed its original payment source';end if;
  end if;
  perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',tenant)::text,true);
  perform public.fms_act_payable_settlement_secure(array[refund_id],'submit');
  perform public.fms_act_payable_settlement_secure(array[refund_id],'approve');
  perform public.fms_act_payable_settlement_secure(array[refund_id],'confirm');
  result:=public.fms_payable_settlement_list_secure('refund',jsonb_build_object('id',refund_id));
  if jsonb_array_length(result->'data')<>1 then raise exception 'Refund public list did not return the confirmed refund';end if;
  result:=public.fms_payable_settlement_voucher_secure(refund_id,'refund',true);
  if result->>'status' not in('pending_configuration','generated') then raise exception 'Refund voucher preview did not return a truthful posting result';end if;
  result:=public.fms_payable_settlement_voucher_secure(refund_id,'refund',false);
  if exists(select 1 from public.fms_posting_event event join public.fms_payable_payment_execution execution on execution.id=event.source_id where execution.document_id=refund_id and event.source_type='system' and event.event_code='ap_payment_refund_received' and event.account_set_id is distinct from book)
   or(select count(*) from public.fms_posting_event event join public.fms_payable_payment_execution execution on execution.id=event.source_id where execution.document_id=refund_id and event.source_type='system' and event.event_code='ap_payment_refund_received')<>2 then raise exception 'Refund voucher event lost the actual receipt accounting book or split executions';end if;
  result:=app_private.payable_settlement_json(refund_id);
  if result->>'payment_status'<>'full' or (result->>'paid_amount')::numeric<>total_value
   or (select count(*) from public.fms_payable_payment_execution where document_id=refund_id and status='posted')<>2
   or (select sum(amount) from public.fms_payable_payment_execution where document_id=refund_id and status='posted')<>total_value then raise exception 'Split refund receipt did not post exactly the principal cash to both accounts';end if;
  state:=app_private.payable_payment_line_state(source_line);
  if (state->>'confirmed_refund_cash')::numeric<>total_value or (state->>'expired_discount')::numeric<>expiry_value then raise exception 'Split receipt double-counted source cash or discount expiry';end if;
  if case_number=2 and ((state->>'available_settlement_discount')::numeric<>0 or (state->>'written_off_amount')::numeric<>0) then raise exception 'Full refund treated expired unearned discount as reusable credit or realized writeoff';end if;
  perform public.fms_act_payable_settlement_secure(array[refund_id],'cancel_payment','拆分账户退款收回冲回验收');
  for result in select to_jsonb(event) from public.fms_posting_event event join public.fms_payable_payment_execution execution on execution.id=event.source_id where execution.document_id=refund_id and event.event_code='ap_payment_refund_received' loop
   if (app_private.process_fms_posting_event((result->>'id')::uuid,true)).status<>'ignored' then raise exception 'Cancelled refund receipt was reposted by force';end if;
  end loop;
  perform public.fms_act_payable_settlement_secure(array[refund_id],'void','已取消到账，作废退款占用');
  result:=public.fms_payable_settlement_options_secure('refund',tenant);
  if exists(select 1 from jsonb_array_elements(result->'purpose') item where item->>'business_type' not in('purchase_refund','advance_refund','other_refund'))
   or exists(select 1 from jsonb_array_elements(result->'method') item where item->>'category' in('virtual','bill'))
   or not exists(select 1 from jsonb_array_elements(result->'refund_source') item where item->>'refund_payment_line_id'=source_line::text) then raise exception 'Refund options exposed outgoing purposes, noncash methods or lost refundable source';end if;
  result:=public.fms_push_payable_settlement_secure((source_document->>'id')::uuid,'refund','payment');
  if result->>'kind'<>'refund' or(result->>'amount')::numeric<>90 or(result->'lines'->0->>'expired_discount_amount')::numeric<>10 then raise exception 'Public payment push did not preserve cash principal and full discount expiry';end if;
  blocked:=false;begin perform public.fms_push_payable_settlement_secure((source_document->>'id')::uuid,'refund','payment');exception when check_violation then blocked:=true;end;
  if not blocked then raise exception 'Repeated payment push duplicated the reserved refundable principal';end if;
  if jsonb_array_length(public.fms_payable_settlement_delete_dependencies_secure(array[(result->>'id')::uuid]))<>0 then raise exception 'Unexecuted refund draft cannot be deleted';end if;
  perform public.fms_act_payable_settlement_secure(array[(result->>'id')::uuid],'delete');
  perform public.fms_act_payable_settlement_secure(array[(source_document->>'id')::uuid],'cancel_payment','退款已作废后取消原付款');
 end loop;
 if has_function_privilege('authenticated','app_private.save_payable_refund(jsonb)','execute') or has_function_privilege('anon','app_private.save_payable_refund(jsonb)','execute') then raise exception 'Private refund save became directly callable by clients';end if;
end $test$;

rollback;
