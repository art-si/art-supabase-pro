begin;

do $test$
declare
 actor uuid;ordinary uuid;tenant uuid;platform uuid;foreign_tenant uuid;book uuid;currency_id uuid;other_book uuid;other_currency uuid;
 fund uuid;receiving_one uuid;receiving_two uuid;wrong_fund uuid;supplier uuid;purpose uuid;refund_purpose uuid;method uuid;payment_type uuid;refund_type uuid;refund_menu uuid;
 fixture_role uuid;fixture_code text:='QA_RF_SAVE_'||upper(left(gen_random_uuid()::text,8));source_documents jsonb:='[]';source_document jsonb;
 source_line uuid;other_source_line uuid;payload jsonb;document jsonb;stale jsonb;result jsonb;state jsonb;total_value numeric;expiry_value numeric;
 case_number integer;blocked boolean;before_count bigint;refund_id uuid;match_scheme uuid;first_match uuid;first_half numeric;second_half numeric;manual_scheme uuid;auxiliary jsonb;other_purpose uuid;auxiliary_match uuid;auto_request jsonb;auto_plan jsonb;stale_plan jsonb;active_match record;
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

 insert into public.sys_role(role_code,role_name,tenant_id,enabled) values(fixture_code,'付款冲退款权限回归角色',tenant,true) returning id into fixture_role;
 insert into public.sys_role_menu(role_id,menu_id,tenant_id) select fixture_role,id,tenant from public.sys_menu where name in('FinancePayablePayment:View','FinancePayableRefund:View');
 update public.sys_user set user_roles=array[fixture_code] where auth_user_id=ordinary;
 for case_number in 1..2 loop
  source_document:=source_documents->(case_number-1);source_line:=(source_document->'lines'->0->>'id')::uuid;
  total_value:=case when case_number=1 then 45 else 90 end;expiry_value:=case when case_number=1 then 5 else 10 end;
  payload:=jsonb_build_object('kind','refund','tenant_id',tenant,'document_type_id',refund_type,'business_date',app_private.payable_business_date(),'currency_code','CNY',
   'lines',jsonb_build_array(jsonb_build_object('refund_payment_line_id',source_line,'purpose_id',refund_purpose,'settlement_method_id',method,'fund_account_id',receiving_one,'amount',case when case_number=1 then 30 else 30.01 end,'expired_discount_amount',case when case_number=1 then 3 else 0 end),
    jsonb_build_object('refund_payment_line_id',source_line,'purpose_id',refund_purpose,'settlement_method_id',method,'fund_account_id',receiving_two,'amount',case when case_number=1 then 15 else 59.99 end,'expired_discount_amount',case when case_number=1 then 2 else 0 end)));

  document:=public.fms_save_payable_settlement_secure(payload);
  refund_id:=(document->>'id')::uuid;
  perform public.fms_act_payable_settlement_secure(array[refund_id],'submit');
  perform public.fms_act_payable_settlement_secure(array[refund_id],'approve');
  perform public.fms_act_payable_settlement_secure(array[refund_id],'confirm');
  if app_private.payable_refund_match_values((document->'lines'->0->>'id')::uuid)->>'source_document_no' is distinct from source_document->>'document_no' then raise exception 'Refund matching source number did not identify the real original payment';end if;
  select id into match_scheme from public.fms_payable_writeoff_scheme where tenant_id=tenant and code='AP-SAME-SOURCE' and enabled;
  if match_scheme is null then raise exception 'Missing same-source scheme for refund matching regression';end if;

  perform set_config('request.headers','{}',true);
  result:=public.fms_payable_writeoff_workspace_secure(jsonb_build_object('relation','payment_refund','document_ids',jsonb_build_array(source_document->>'id',refund_id)));
  if not exists(select 1 from jsonb_array_elements(result->'secondary') candidate where candidate->>'id'=document->'lines'->0->>'id') then raise exception 'Platform-all refund read lost inherited tenant data';end if;
  result:=public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('relation','payment_refund','payment_line_id',source_line,'refund_line_id',document->'lines'->0->>'id','amount',0.01)),match_scheme,app_private.payable_business_date(),'平台全部租户继承来源核销');
  first_match:=(result->>0)::uuid;
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',foreign_tenant)::text,true);
  blocked:=false;begin perform public.fms_reverse_payable_writeoff_secure(first_match,'选定其他租户不得反核销');exception when insufficient_privilege then blocked:=true;end;
  if not blocked then raise exception 'Platform-selected scope allowed foreign refund unmatching';end if;
  blocked:=false;begin perform public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('relation','payment_refund','payment_line_id',source_line,'refund_line_id',document->'lines'->0->>'id','amount',0.01)),match_scheme,app_private.payable_business_date(),'选定其他租户不得核销');exception when insufficient_privilege then blocked:=true;end;
  if not blocked then raise exception 'Platform-selected scope allowed foreign refund matching';end if;
  blocked:=false;begin perform public.fms_auto_payable_writeoff_secure(match_scheme,app_private.payable_business_date(),jsonb_build_object('relation','payment_refund'),false);exception when insufficient_privilege then blocked:=true;end;
  if not blocked then raise exception 'Platform-selected scope allowed foreign refund automatic preview';end if;
  result:=public.fms_payable_writeoff_workspace_secure(jsonb_build_object('relation','payment_refund','document_ids',jsonb_build_array(source_document->>'id',refund_id)));
  if jsonb_array_length(result->'primary')<>0 or jsonb_array_length(result->'secondary')<>0 or jsonb_array_length(result->'history')<>0 then raise exception 'Platform-selected refund workbench exposed foreign tenant data';end if;
  perform set_config('request.headers','{}',true);
  perform public.fms_reverse_payable_writeoff_secure(first_match,'平台全部租户按来源反核销');
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',tenant)::text,true);
  perform set_config('request.jwt.claim.sub',ordinary::text,true);perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',platform)::text,true);
  blocked:=false;begin perform public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('relation','payment_refund','payment_line_id',source_line,'refund_line_id',document->'lines'->0->>'id','amount',1)),match_scheme,app_private.payable_business_date(),'未授权付款冲退款');exception when insufficient_privilege then blocked:=true;end;
  if not blocked then raise exception 'Refund matching bypassed exact Writeoff permission';end if;
  insert into public.sys_role_menu(role_id,menu_id,tenant_id) select fixture_role,menu.id,tenant from public.sys_menu menu where menu.name in('FinancePayableWriteoff:View','FinancePayableWriteoff:Writeoff')
   and not exists(select 1 from public.sys_role_menu existing where existing.role_id=fixture_role and existing.menu_id=menu.id);

  select id into manual_scheme from public.fms_payable_writeoff_scheme where tenant_id=tenant and code='AP-MANUAL' and enabled;
  blocked:=false;begin perform public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('relation','payment_refund','payment_line_id',source_line,'refund_line_id',document->'lines'->0->>'id','amount',1)),match_scheme,app_private.payable_business_date()-1,'核销日期阻断');exception when check_violation then blocked:=true;end;
  if not blocked then raise exception 'Refund matched before its actual receipt business date';end if;
  if case_number=1 then
   other_source_line:=(source_documents->1->'lines'->0->>'id')::uuid;
   blocked:=false;begin perform public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('relation','payment_refund','payment_line_id',other_source_line,'refund_line_id',document->'lines'->0->>'id','amount',1)),match_scheme,app_private.payable_business_date(),'不同来源不符合规则');exception when check_violation then blocked:=true;end;
   if not blocked then raise exception 'Same-source refund matching ignored the configured source rule';end if;
   result:=public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('relation','payment_refund','payment_line_id',other_source_line,'refund_line_id',document->'lines'->0->>'id','amount',1)),manual_scheme,app_private.payable_business_date(),'方案允许的跨来源退款核销');
   perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',tenant)::text,true);
   perform public.fms_reverse_payable_writeoff_secure((result->>0)::uuid,'恢复跨来源核销验收');
   auxiliary:=public.fms_save_payable_settlement_secure(jsonb_build_object('kind','payment','tenant_id',tenant,'document_type_id',payment_type,'currency_code','CNY','lines',jsonb_build_array(jsonb_build_object('purpose_id',purpose,'supplier_id',supplier,'settlement_method_id',method,'fund_account_id',wrong_fund,'amount',10))));
   perform public.fms_act_payable_settlement_secure(array[(auxiliary->>'id')::uuid],'submit');perform public.fms_act_payable_settlement_secure(array[(auxiliary->>'id')::uuid],'approve');perform public.fms_act_payable_settlement_secure(array[(auxiliary->>'id')::uuid],'confirm');
   blocked:=false;begin perform public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('relation','payment_refund','payment_line_id',auxiliary->'lines'->0->>'id','refund_line_id',document->'lines'->0->>'id','amount',1)),manual_scheme,app_private.payable_business_date(),'跨账套退款核销阻断');exception when check_violation then blocked:=true;end;
   if not blocked then raise exception 'Payment-refund matching crossed the original cash accounting book';end if;
   perform public.fms_act_payable_settlement_secure(array[(auxiliary->>'id')::uuid],'cancel_payment','跨账套阻断测试资金冲回');
   other_purpose:=public.fms_save_payable_reference_secure('purpose',jsonb_build_object('tenant_id',tenant,'code',fixture_code||'_OTHER','name','其他付款核销测试用途','business_type','other','payable_writeoff',true));
   auxiliary:=public.fms_save_payable_settlement_secure(jsonb_build_object('kind','payment','tenant_id',tenant,'document_type_id',payment_type,'currency_code','CNY','lines',jsonb_build_array(jsonb_build_object('purpose_id',other_purpose,'supplier_id',supplier,'settlement_method_id',method,'fund_account_id',fund,'amount',10))));
   perform public.fms_act_payable_settlement_secure(array[(auxiliary->>'id')::uuid],'submit');perform public.fms_act_payable_settlement_secure(array[(auxiliary->>'id')::uuid],'approve');perform public.fms_act_payable_settlement_secure(array[(auxiliary->>'id')::uuid],'confirm');
   result:=public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('relation','payment_refund','payment_line_id',auxiliary->'lines'->0->>'id','refund_line_id',document->'lines'->0->>'id','amount',1.23)),manual_scheme,app_private.payable_business_date(),'非对称付款业务生成核销单');
   auxiliary_match:=(result->>0)::uuid;
   if not exists(select 1 from public.fms_payable_writeoff_record where id=auxiliary_match and needs_voucher and document_no like 'APHXD-%' and cash_discount_amount=0 and match_snapshot->>'refund_business_type'='advance_refund') then raise exception 'Asymmetric payment-refund business did not create the required writeoff document';end if;
   result:=public.fms_payable_settlement_voucher_secure(auxiliary_match,'writeoff',true);
   if result->>'status' not in('pending_configuration','generated') then raise exception 'Refund writeoff voucher preview failed to use the real payment/refund endpoints';end if;
   result:=public.fms_payable_settlement_voucher_secure(auxiliary_match,'writeoff',false);
   if result->>'status'<>'pending_configuration' or not exists(select 1 from public.fms_posting_event where source_type='system' and source_id=auxiliary_match and event_code='ap_payment_refund_writeoff_approved' and account_set_id=book and voucher_id is null)
    or exists(select 1 from public.fms_posting_event where source_type='system' and source_id=auxiliary_match and event_code='ap_writeoff_approved') then raise exception 'Refund matching reused ordinary AP posting rules or lost its actual execution book';end if;
   perform public.fms_reverse_payable_writeoff_secure(auxiliary_match,'未制证退款核销单反核销');
   if exists(select 1 from public.fms_posting_event where source_type='system' and source_id=auxiliary_match and status<>'ignored') then raise exception 'Unmatched refund posting event remained eligible for retry';end if;
   if (select document_no from public.fms_payable_writeoff_record where id=auxiliary_match) is not null then raise exception 'Unmatching did not remove the unvouchered refund writeoff document';end if;
   perform public.fms_act_payable_settlement_secure(array[(auxiliary->>'id')::uuid],'cancel_payment','非对称退款核销测试资金冲回');
   perform set_config('request.jwt.claim.sub',ordinary::text,true);perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',platform)::text,true);
  end if;

  first_half:=(document->'lines'->0->>'amount')::numeric;second_half:=(document->'lines'->1->>'amount')::numeric;
  blocked:=false;begin perform public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('relation','payment_refund','payment_line_id',source_line,'refund_line_id',document->'lines'->0->>'id','amount',first_half+0.01)),match_scheme,app_private.payable_business_date(),'退款超额阻断');exception when check_violation then blocked:=true;end;
  if not blocked then raise exception 'Refund matching exceeded the refund line cash balance';end if;
  blocked:=false;begin perform public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('relation','payment_refund','payment_line_id',source_line,'refund_line_id',document->'lines'->0->>'id','amount',first_half),jsonb_build_object('relation','payable_payment','payment_line_id',source_line,'refund_line_id',document->'lines'->1->>'id','amount',second_half)),match_scheme,app_private.payable_business_date(),'混合关系阻断');exception when invalid_parameter_value then blocked:=true;end;
  if not blocked or exists(select 1 from public.fms_payable_writeoff_record where refund_line_id in(select id from public.fms_payable_settlement_line where document_id=refund_id) and status='active') then raise exception 'Mixed relation batch committed a partial refund match';end if;
  result:=public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('relation','payment_refund','payment_line_id',source_line,'refund_line_id',document->'lines'->0->>'id','amount',first_half),jsonb_build_object('relation','payment_refund','payment_line_id',source_line,'refund_line_id',document->'lines'->1->>'id','amount',second_half)),match_scheme,app_private.payable_business_date(),'普通用户伪造租户头仍仅核销自身租户');
  if jsonb_array_length(result)<>2 then raise exception 'Split refund did not generate both public matching records';end if;
  first_match:=(result->>0)::uuid;
  if exists(select 1 from public.fms_payable_writeoff_record where id in((result->>0)::uuid,(result->>1)::uuid) and(tenant_id<>tenant or needs_voucher or document_no is not null or cash_discount_amount<>0 or refund_amount<>payment_amount))
   or(app_private.payable_payment_line_state(source_line)->>'refund_written_cash')::numeric<>total_value then raise exception 'Refund matching invented a voucher, cash discount or lost original cash principal';end if;
  blocked:=false;begin perform public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('relation','payment_refund','payment_line_id',source_line,'refund_line_id',document->'lines'->0->>'id','amount',0.01)),match_scheme,app_private.payable_business_date(),'重复退款核销阻断');exception when check_violation then blocked:=true;end;
  if not blocked then raise exception 'Fully matched refund was matched a second time';end if;
  perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',tenant)::text,true);
  perform public.fms_reverse_payable_writeoff_secure(first_match,'付款冲退款反核销回归');
  if (select status from public.fms_payable_writeoff_record where id=first_match)<>'reversed' or(app_private.payable_payment_line_state(source_line)->>'refund_written_cash')::numeric<>second_half then raise exception 'Refund unmatching did not restore the exact cash principal';end if;
  perform public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('relation','payment_refund','payment_line_id',source_line,'refund_line_id',document->'lines'->0->>'id','amount',first_half)),match_scheme,app_private.payable_business_date(),'付款冲退款恢复');

  for active_match in select id from public.fms_payable_writeoff_record where relation='payment_refund' and status='active' and refund_line_id in(select id from public.fms_payable_settlement_line where document_id=refund_id) order by id loop
   perform public.fms_reverse_payable_writeoff_secure(active_match.id,'准备付款冲退款自动核销验收');
  end loop;
  auto_request:=jsonb_build_object('relation','payment_refund','document_ids',jsonb_build_array(source_document->>'id',refund_id));
  result:=public.fms_payable_writeoff_workspace_secure(auto_request);
  if not exists(select 1 from jsonb_array_elements(result->'primary') candidate where candidate->>'id'=source_line::text and(candidate->>'available_amount')::numeric=90)
   or(select sum((candidate->>'available_amount')::numeric) from jsonb_array_elements(result->'secondary') candidate)<>total_value then raise exception 'Refund workbench did not separate physical principal from lost discount and own confirmed refund hold';end if;
  perform set_config('request.jwt.claim.sub',ordinary::text,true);perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',platform)::text,true);
  blocked:=false;begin perform public.fms_auto_payable_writeoff_secure(match_scheme,app_private.payable_business_date(),auto_request,false);exception when insufficient_privilege then blocked:=true;end;
  if not blocked then raise exception 'Automatic refund matching bypassed exact AutoWriteoff permission';end if;
  insert into public.sys_role_menu(role_id,menu_id,tenant_id) select fixture_role,menu.id,tenant from public.sys_menu menu where menu.name='FinancePayableWriteoff:AutoWriteoff'
   and not exists(select 1 from public.sys_role_menu existing where existing.role_id=fixture_role and existing.menu_id=menu.id);
  stale_plan:=public.fms_auto_payable_writeoff_secure(match_scheme,app_private.payable_business_date(),auto_request,false);
  if(stale_plan->>'total_amount')::numeric<>total_value or jsonb_array_length(stale_plan->'items')<>2 then raise exception 'Automatic refund preview included lost discount or omitted split receipt accounts';end if;
  result:=public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('relation','payment_refund','payment_line_id',source_line,'refund_line_id',document->'lines'->0->>'id','amount',0.01)),match_scheme,app_private.payable_business_date(),'自动核销预览失效测试');
  first_match:=(result->>0)::uuid;
  blocked:=false;begin perform public.fms_auto_payable_writeoff_secure(match_scheme,app_private.payable_business_date(),auto_request,true,stale_plan->>'plan_token');exception when serialization_failure then blocked:=true;end;
  if not blocked then raise exception 'Automatic refund confirmation reused a stale cash-balance preview';end if;
  perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',tenant)::text,true);
  perform public.fms_reverse_payable_writeoff_secure(first_match,'恢复预览金额');
  perform set_config('request.jwt.claim.sub',ordinary::text,true);perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',platform)::text,true);
  delete from public.sys_role_menu where role_id=fixture_role and menu_id=(select id from public.sys_menu where name='FinancePayableWriteoff:Writeoff');
  auto_plan:=public.fms_auto_payable_writeoff_secure(match_scheme,app_private.payable_business_date(),auto_request,false);
  result:=public.fms_auto_payable_writeoff_secure(match_scheme,app_private.payable_business_date(),auto_request,true,auto_plan->>'plan_token');
  if(result->>'executed')::boolean is distinct from true or jsonb_array_length(result->'record_ids')<>2 or(app_private.payable_payment_line_state(source_line)->>'refund_written_cash')::numeric<>total_value then raise exception 'Automatic-only permission could not execute the exact refund principal plan';end if;
  result:=public.fms_payable_writeoff_workspace_secure(auto_request);
  if jsonb_array_length(result->'secondary')<>0 or not exists(select 1 from jsonb_array_elements(result->'history') history where history->>'relation'='payment_refund' and history->>'status'='active' and history->>'payable_no'=source_document->>'document_no' and history->>'payment_no'=document->>'document_no') then raise exception 'Refund history or remaining receipt cash was not synchronized after matching';end if;
  perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',tenant)::text,true);

  delete from public.sys_role_menu where role_id=fixture_role and menu_id in(select id from public.sys_menu where name in('FinancePayableWriteoff:View','FinancePayableWriteoff:Writeoff','FinancePayableWriteoff:AutoWriteoff'));
  perform public.fms_act_payable_settlement_secure(array[refund_id],'cancel_payment','核销完成后的退款到账冲回验收');
  if exists(select 1 from public.fms_payable_writeoff_record where relation='payment_refund' and status='active' and refund_line_id in(select id from public.fms_payable_settlement_line where document_id=refund_id)) then raise exception 'Receipt cancellation left active refund matching records';end if;
  perform public.fms_act_payable_settlement_secure(array[refund_id],'void','退款核销验收作废');
  perform public.fms_act_payable_settlement_secure(array[(source_document->>'id')::uuid],'cancel_payment','退款核销验收原付款资金冲回');
 end loop;
 if has_function_privilege('authenticated','app_private.apply_payable_refund_writeoff(uuid,uuid,numeric,date,uuid,text)','execute') or has_function_privilege('anon','app_private.apply_payable_refund_writeoff(uuid,uuid,numeric,date,uuid,text)','execute') then raise exception 'Private refund matching became client executable';end if;
end $test$;
rollback;
