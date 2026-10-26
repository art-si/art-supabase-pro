begin;
set local jit=off;
set local statement_timeout='8s';

create function pg_temp.use_tms_receivable_actor(p_case integer,p_native boolean) returns void
language plpgsql as $actor$
declare context_value jsonb:=current_setting('qa.tms_ar_'||p_case)::jsonb;actor uuid;headers text;
begin
 actor:=(context_value->>case when p_native then 'actor' else 'caller_actor' end)::uuid;
 headers:=case when p_native then '{}' else context_value->>'caller_headers' end;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 perform set_config('request.headers',coalesce(headers,'{}'),true);
end $actor$;

create function pg_temp.prepare_tms_receivable_case(p_case integer) returns jsonb
language plpgsql as $prepare$
declare context_value jsonb;tenant uuid;caller_actor uuid;caller_headers text;fixture_role uuid;source record;
 root_actor uuid;workflow_ident uuid;saved jsonb;original_roles text[];other_book uuid;foreign_line uuid;foreign_document uuid;
 foreign_tenant uuid;customer uuid;scheme_ident uuid;
begin
 if p_case not between 1 and 4 then raise exception 'Unsupported transport/AR case';end if;
 context_value:=current_setting('qa.ar_application_base_usd')::jsonb;
 tenant:=(context_value->>'tenant')::uuid;caller_actor:=auth.uid();caller_headers:=current_setting('request.headers',true);
 select array_agg(value) into original_roles from jsonb_array_elements_text(context_value->'original_roles');
 update public.sys_user set user_roles=original_roles||array[context_value->>'fixture_role_code'] where id=(context_value->>'profile')::uuid;
 select id into fixture_role from public.sys_role where tenant_id=tenant and role_code=context_value->>'fixture_role_code';
 if fixture_role is null then raise exception 'Missing transport fixture authority';end if;
 select * into source from(
  select distinct on(cost.carrier_id) cost.carrier_id,cost.waybill_id,cost.expense_item_id,cost.occurred_on,carrier.company_name
  from public.tms_waybill_cost cost join public.mdm_carrier carrier on carrier.id=cost.carrier_id and carrier.tenant_id=cost.tenant_id
  where cost.tenant_id=tenant and cost.audit_status='approved' and cost.expense_item_id is not null
  order by cost.carrier_id,cost.id
 ) source_row order by carrier_id offset((p_case-1)%2) limit 1;
 if source.carrier_id is null then raise exception 'Need two existing isolated transport sources';end if;
 insert into public.sys_role_menu(tenant_id,role_id,menu_id)
 select tenant,fixture_role,id from public.sys_menu where name in(
  'FinanceCashTransaction','FinanceCashTransaction:View','FinanceCashTransaction:Add','FinanceCashTransaction:CreatePayment','FinanceCashTransaction:Allocate',
  'FinanceCarrierPaymentApplication','FinanceCarrierPaymentApplication:View','FinanceCarrierPaymentApplication:Add',
  'FinanceCarrierPaymentApplication:Submit','FinanceCarrierPaymentApplication:Execute',
  'FinanceReceiptWriteoff:Writeoff','FinanceReceiptWriteoff:Reverse','FinanceReceiptWriteoff:CrossCustomer','FinanceReceiptWriteoff:CrossCurrency',
  'FinanceWaybillCost','FinanceWaybillCost:View','FinanceWaybillCost:Add','FinanceWaybillCost:Submit',
  'FinanceCarrierSettlement','FinanceCarrierSettlement:View','FinanceCarrierSettlement:Add','FinanceCarrierSettlement:Submit','FinanceCarrierSettlement:Approve') on conflict do nothing;
 insert into public.sys_role_field_permission(tenant_id,role_id,resource_id,field_id,access_level)
 select tenant,fixture_role,resource.id,field.id,'edit' from public.sys_permission_resource resource
 join public.sys_permission_field field on field.resource_id=resource.id and field.tenant_id=resource.tenant_id
 where resource.tenant_id=tenant and resource.resource_key='tms.carrier_statement' and field.field_key in('statementAmounts','settlementAmounts');
 select id into workflow_ident from public.wf_definition where tenant_id=tenant
  and business_type='tms_carrier_payment_application' and status='published';
 if workflow_ident is null then
  select auth_user_id into root_actor from public.sys_user where system_protected and status='1'
   and user_roles @>array['R_SUPER'] order by id limit 1;
  if root_actor is null then raise exception 'Missing authorized workflow configuration fixture actor';end if;
  perform set_config('request.jwt.claim.sub',root_actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',root_actor,'role','authenticated')::text,true);
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',tenant)::text,true);
  saved:=public.save_workflow_definition(jsonb_build_object('tenantId',tenant,
   'code','QA_TMS_AR_PAY_'||upper(left(gen_random_uuid()::text,8)),'name','运输应收抵销回滚专用付款申请审批',
   'businessType','tms_carrier_payment_application','description','仅事务回滚夹具，不修改现有审批策略',
   'config',jsonb_build_object('allowAutoApprove',false,'nodes',jsonb_build_array(jsonb_build_object(
    'key','qa_transport_payment_review','name','隔离付款申请复核','order',1,
    'assignee',jsonb_build_object('type','users','userIds',jsonb_build_array(context_value->>'profile'),'roleCodes','[]'::jsonb),
    'dueHours',24,'condition',jsonb_build_object('operator','always'),'approvalMode','any',
    'allowSelfApproval',true,'rejectVetoEnabled',true,'approvalThresholdPercent',100)))));
  perform public.publish_workflow_definition((saved->>'definitionId')::uuid);
  perform set_config('request.jwt.claim.sub',caller_actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',caller_actor,'role','authenticated')::text,true);
  perform set_config('request.headers',coalesce(caller_headers,'{}'),true);
 end if;
 insert into public.fms_payable_writeoff_scheme(tenant_id,code,name,rules)
 values(tenant,'TMS_AR_'||upper(left(gen_random_uuid()::text,8)),'运输应收抵销回滚方案',jsonb_build_array(jsonb_build_object(
  'primary_field','business_date','secondary_field','business_date','operator','lte','empty_matches',false))) returning id into scheme_ident;
 insert into public.fms_opening_balance_control(tenant_id,account_set_id,fiscal_year,status,confirmed_at,confirmed_by)
 values(tenant,(context_value->>'book')::uuid,extract(year from app_private.payable_business_date())::integer,'confirmed',clock_timestamp(),caller_actor::text)
 on conflict(account_set_id,fiscal_year) do update set status='confirmed';
 insert into public.fms_account_set(tenant_id,account_set_code,account_set_name,legal_entity_name,enabled_on,status)
 values(tenant,'TMS_AR_BOOK_'||upper(left(gen_random_uuid()::text,8)),'运输抵销第二账套回滚夹具','虚构回滚主体',app_private.payable_business_date(),'active') returning id into other_book;
 update public.fms_account_set set is_default=false where id=(context_value->>'book')::uuid;
 update public.fms_account_set set is_default=true where id=other_book;
 select customer_id into customer from public.fms_receivable_document where id=(context_value->>'document')::uuid;
 insert into public.fms_receivable_document(tenant_id,document_no,kind,status,customer_id,settlement_organization_id,business_date,amount,total_amount,created_by_auth_user_id)
 values(tenant,'TMS_AR_OTHER_'||upper(left(gen_random_uuid()::text,8)),'financial','approved',customer,
  (context_value->>'organization')::uuid,app_private.payable_business_date(),1,1,caller_actor) returning id into foreign_document;
 insert into public.fms_receivable_line(tenant_id,document_id,line_no,basis,material_description,quantity,amount,total_amount,tax_rate)
 values(tenant,foreign_document,10,'amount','运输抵销真实跨账套拒绝来源',1,1,1,0) returning id into foreign_line;
 update public.fms_account_set set is_default=false where id=other_book;
 update public.fms_account_set set is_default=true where id=(context_value->>'book')::uuid;
 select id into foreign_tenant from public.sys_tenant where id<>tenant and status='1' and builtin_type is distinct from 'platform' order by id limit 1;
 if foreign_tenant is null then raise exception 'Missing foreign tenant scope fixture';end if;
 if p_case=2 then caller_headers:=jsonb_build_object('x-art-tenant-scope',foreign_tenant)::text;end if;
 if p_case>=3 then
  select auth_user_id into caller_actor from public.sys_user where system_protected and status='1' and user_roles @>array['R_SUPER'] order by id limit 1;
  caller_headers:=case when p_case=4 then jsonb_build_object('x-art-tenant-scope',tenant)::text else '{}' end;
 end if;
 context_value:=context_value||jsonb_build_object('caller_actor',caller_actor,'caller_headers',caller_headers,'fixture_role',fixture_role,
  'scheme',scheme_ident,'other_book',other_book,'foreign_line',foreign_line,'foreign_tenant',foreign_tenant,'case',p_case,
  'carrier',source.carrier_id,'waybill',source.waybill_id,'expense',source.expense_item_id,'carrier_name',source.company_name,
  'cost_date',source.occurred_on,'marker','QA_TMS_AR_'||p_case||'_'||upper(left(gen_random_uuid()::text,8)));
 perform set_config('qa.tms_ar_'||p_case,context_value::text,true);
 perform pg_temp.use_tms_receivable_actor(p_case,false);
 return jsonb_build_object('case',p_case,'status','prepared');
end $prepare$;

create function pg_temp.create_tms_receivable_cost(p_case integer) returns jsonb
language plpgsql as $cost$
declare context_value jsonb:=current_setting('qa.tms_ar_'||p_case)::jsonb;result jsonb;cost_ident uuid;status_value text;
begin
 perform pg_temp.use_tms_receivable_actor(p_case,true);
 result:=public.tms_save_waybill_cost_secure(null,jsonb_build_object('waybill_id',context_value->>'waybill','expense_item_id',context_value->>'expense',
  'carrier_id',context_value->>'carrier','amount',3,'occurred_on',context_value->>'cost_date','payee_name',context_value->>'carrier_name',
  'reporter_user_id',context_value->>'profile','remark',context_value->>'marker'));
 cost_ident:=(result->>'id')::uuid;
 if cost_ident is null then raise exception 'Native transport cost was not created';end if;
 perform public.start_workflow('tms_waybill_cost',cost_ident,context_value->>'marker','{}',gen_random_uuid()::text);
 select audit_status into status_value from public.tms_waybill_cost where id=cost_ident;
 if status_value='pending_review' then
  perform set_config('request.jwt.claim.sub',context_value->>'actor',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',context_value->>'actor','role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  perform public.act_workflow_by_business('tms_waybill_cost',cost_ident,'approve','独立回滚运输抵销来源审批',gen_random_uuid()::text);
 end if;
 if(select audit_status from public.tms_waybill_cost where id=cost_ident) is distinct from 'approved' then raise exception 'Native transport cost was not approved';end if;
 perform set_config('qa.tms_ar_'||p_case,(context_value||jsonb_build_object('cost',cost_ident))::text,true);
 perform pg_temp.use_tms_receivable_actor(p_case,false);
 return jsonb_build_object('case',p_case,'status','cost_approved');
end $cost$;

create function pg_temp.create_tms_receivable_statement(p_case integer) returns jsonb
language plpgsql as $statement$
declare context_value jsonb:=current_setting('qa.tms_ar_'||p_case)::jsonb;statement_ident uuid;status_value text;
begin
 perform pg_temp.use_tms_receivable_actor(p_case,true);
 statement_ident:=public.tms_create_carrier_statement_secure((context_value->>'carrier')::uuid,(context_value->>'cost_date')::date,
  (context_value->>'cost_date')::date,array[(context_value->>'cost')::uuid],context_value->>'marker',null);
 perform public.start_workflow('tms_carrier_statement',statement_ident,context_value->>'marker','{}',gen_random_uuid()::text);
 select status into status_value from public.tms_carrier_statement where id=statement_ident;
 if status_value='pending_review' then
  perform set_config('request.jwt.claim.sub',context_value->>'actor',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',context_value->>'actor','role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  perform public.act_workflow_by_business('tms_carrier_statement',statement_ident,'approve','独立回滚原运输结算确认',gen_random_uuid()::text);
 end if;
 if(select status from public.tms_carrier_statement where id=statement_ident) is distinct from 'confirmed' then raise exception 'Native carrier statement was not confirmed';end if;
 perform set_config('qa.tms_ar_'||p_case,(context_value||jsonb_build_object('statement',statement_ident))::text,true);
 perform pg_temp.use_tms_receivable_actor(p_case,false);
 return jsonb_build_object('case',p_case,'status','statement_confirmed');
end $statement$;

create function pg_temp.create_tms_receivable_documents(p_case integer) returns jsonb
language plpgsql as $documents$
declare context_value jsonb:=current_setting('qa.tms_ar_'||p_case)::jsonb;tenant uuid:=(context_value->>'tenant')::uuid;
 finance jsonb;customer uuid;ar_type uuid;receivable uuid;line_ident uuid;
begin
 perform set_config('request.jwt.claim.sub',context_value->>'actor',true);
 perform set_config('request.headers','{}',true);
 finance:=public.fms_import_carrier_payable_secure('financial',(context_value->>'statement')::uuid);
 perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'submit');
 perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'approve');
 if(finance->>'account_set_id')::uuid is distinct from(context_value->>'book')::uuid then raise exception 'Transport import moved the original book';end if;
 select customer_id into customer from public.fms_receivable_document where id=(context_value->>'document')::uuid;
 select id into ar_type from public.mdm_document_type where tenant_id=tenant and document_type_code='AR_FIN_STANDARD';
 update public.fms_exchange_rate set direct_rate=7.333333 where account_set_id=(context_value->>'book')::uuid
  and rate_date=app_private.payable_business_date() and currency_id in(select id from public.fms_currency where account_set_id=(context_value->>'book')::uuid and currency_code='USD');
 receivable:=public.fms_save_receivable_document_secure(jsonb_build_object('kind','financial','tenantId',tenant,'documentTypeId',ar_type,'customerId',customer,
  'settlementOrganizationId',context_value->>'organization','businessDate',app_private.payable_business_date(),'currencyCode','USD','settlementMethod','cash',
  'lines',jsonb_build_array(jsonb_build_object('lineNo',10,'basis','amount','materialDescription','运输应付抵销实际应收来源','enteredGrossAmount',0.03,
   'quantity',0,'unitPrice',0,'priceBasis','taxed','taxRate',0,'discountMethod','none'))));
 perform public.fms_act_receivable_document_secure(receivable,'submit');
 perform public.fms_act_receivable_document_secure(receivable,'approve');
 select id into line_ident from public.fms_receivable_line where document_id=receivable;
 update public.fms_exchange_rate set direct_rate=99 where account_set_id=(context_value->>'book')::uuid
  and rate_date=app_private.payable_business_date() and currency_id in(select id from public.fms_currency where account_set_id=(context_value->>'book')::uuid and currency_code='USD');
 context_value:=context_value||jsonb_build_object('payable',finance->>'id','document',receivable,'line',line_ident,
  'primary_currency','CNY','primary_rate',1,'primary_amount',3,'offset_amount',case when p_case%2=1 then 0.10 else 0.06 end);
 perform set_config('qa.tms_ar_'||p_case,context_value::text,true);
 perform pg_temp.use_tms_receivable_actor(p_case,false);
 return jsonb_build_object('case',p_case,'status','documents_approved');
end $documents$;

create function pg_temp.create_tms_receivable_native_application(p_case integer) returns jsonb
language plpgsql as $application$
declare context_value jsonb:=current_setting('qa.tms_ar_'||p_case)::jsonb;application_ident uuid;status_value text;
begin
 perform pg_temp.use_tms_receivable_actor(p_case,true);
 application_ident:=public.save_tms_carrier_payment_application_secure(null,(context_value->>'carrier')::uuid,
  app_private.payable_business_date(),0.02,'bank_transfer','[]','与运输应收抵销并存的原生付款申请',
  jsonb_build_array(jsonb_build_object('statement_id',context_value->>'statement','amount',0.02)),null);
 perform public.validate_tms_carrier_payment_application_submission_secure(application_ident);
 perform public.start_workflow('tms_carrier_payment_application',application_ident,context_value->>'marker',
  jsonb_build_object('amount',0.02,'carrierId',context_value->>'carrier','statementCount',1),gen_random_uuid()::text);
 select status into status_value from public.tms_carrier_payment_application where id=application_ident;
 if status_value='pending_review' then
  perform public.act_workflow_by_business('tms_carrier_payment_application',application_ident,'approve','独立回滚原生付款申请审批',gen_random_uuid()::text);
 end if;
 if(select status from public.tms_carrier_payment_application where id=application_ident) is distinct from 'approved' then
  raise exception 'Native carrier payment application was not approved';end if;
 perform set_config('qa.tms_ar_'||p_case,(context_value||jsonb_build_object('native_application',application_ident))::text,true);
 perform pg_temp.use_tms_receivable_actor(p_case,false);
 return jsonb_build_object('case',p_case,'status','native_application_approved');
end $application$;

create function pg_temp.create_tms_receivable_native_cash(p_case integer) returns jsonb
language plpgsql as $cash$
declare context_value jsonb:=current_setting('qa.tms_ar_'||p_case)::jsonb;tenant uuid:=(context_value->>'tenant')::uuid;
 fund_ident uuid;currency_ident uuid;cash_ident uuid;
begin
 perform pg_temp.use_tms_receivable_actor(p_case,true);
 select id into currency_ident from public.fms_currency where account_set_id=(context_value->>'book')::uuid and tenant_id=tenant and currency_code='CNY';
 insert into public.fms_fund_account(tenant_id,account_set_id,currency_id,account_code,account_name,account_type,bank_name,account_no_masked,account_no_fingerprint,opening_balance,online_banking_enabled)
 values(tenant,(context_value->>'book')::uuid,currency_ident,'QA_TMS_AR_'||upper(left(gen_random_uuid()::text,8)),
  '运输抵销回滚专用虚构账户','bank','虚构回滚银行','**** QA',md5(gen_random_uuid()::text),100,false) returning id into fund_ident;
 cash_ident:=public.execute_fms_carrier_payment_application_secure((context_value->>'native_application')::uuid,
  fund_ident,app_private.payable_business_date(),'QA_ROLLBACK_'||(context_value->>'marker'),'[]',null);
 context_value:=context_value||jsonb_build_object('native_cash',cash_ident,'native_fund',fund_ident,'initial_settled',0.02,
  'fund_count',(select count(*) from public.fms_fund_ledger_entry),'cash_count',(select count(*) from public.tms_cash_transaction));
 perform set_config('qa.tms_ar_'||p_case,context_value::text,true);
 perform pg_temp.use_tms_receivable_actor(p_case,false);
 return jsonb_build_object('case',p_case,'status','native_cash_posted');
end $cash$;

create function pg_temp.match_tms_receivable_case(p_case integer) returns jsonb
language plpgsql as $match$
declare context_value jsonb:=current_setting('qa.tms_ar_'||p_case)::jsonb;command jsonb;records jsonb;blocked boolean;
begin
 command:=jsonb_build_object('relation','payable_receivable','payable_id',context_value->>'payable','receivable_line_id',context_value->>'line',
  'amount',context_value->'offset_amount','receivable_amount',0.01,'allow_cross_party',true);
 blocked:=false;
 begin perform public.fms_payable_writeoff_secure(jsonb_build_array(command||jsonb_build_object('receivable_line_id',context_value->>'foreign_line')),
  (context_value->>'scheme')::uuid,app_private.payable_business_date(),'运输真实跨账套拒绝');exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Transport offset accepted another original account set';end if;
 blocked:=false;
 begin perform public.fms_payable_writeoff_secure(jsonb_build_array(command||jsonb_build_object('allow_cross_party',false)),
  (context_value->>'scheme')::uuid,app_private.payable_business_date(),'运输跨往来需明确确认');exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Transport offset silently crossed business partners';end if;
 records:=public.fms_payable_writeoff_secure(jsonb_build_array(command),(context_value->>'scheme')::uuid,app_private.payable_business_date(),'原运输余额与原应收同步抵销');
 if jsonb_array_length(records)<>1 then raise exception 'Transport offset returned an incomplete command result';end if;
 perform set_config('qa.tms_ar_'||p_case,(context_value||jsonb_build_object('records',records))::text,true);
 return jsonb_build_object('case',p_case,'status','matched');
end $match$;

create function pg_temp.check_tms_receivable_case(p_case integer,p_phase text) returns jsonb
language plpgsql as $check$
declare context_value jsonb:=current_setting('qa.tms_ar_'||p_case)::jsonb;matched public.fms_payable_writeoff_record;projection jsonb;fact jsonb;workspace jsonb;
 offset_value numeric:=case when p_phase='after' then(context_value->>'offset_amount')::numeric else 0 end;
 expected_original numeric:=case when p_phase='after' then 0.02 else 0.03 end;expected_base numeric:=case when p_phase='after' then 0.15 else 0.22 end;
 initial_settled numeric:=coalesce((context_value->>'initial_settled')::numeric,0.02);
begin
 if p_phase not in('before','after','restored') then raise exception 'Unsupported transport phase';end if;
 set constraints all immediate;
 set constraints all deferred;
 if(select settled_amount from public.tms_carrier_statement where id=(context_value->>'statement')::uuid) is distinct from initial_settled+offset_value then
  raise exception 'Transport statement did not retain native cash plus exactly one active noncash offset';end if;
 projection:=app_private.purchase_payable_json((context_value->>'payable')::uuid);
 if(projection->>'unpaid_amount')::numeric is distinct from 3-initial_settled-offset_value
  or app_private.payable_unwritten_base_amount((context_value->>'payable')::uuid) is distinct from 3-initial_settled-offset_value then
  raise exception 'Transport original/local remainder ignored native cash or counted the offset twice';end if;
 if(app_private.ar_line_book_balance((context_value->>'line')::uuid)->>'original_remaining')::numeric is distinct from expected_original
  or(app_private.ar_line_book_balance((context_value->>'line')::uuid)->>'base_remaining')::numeric is distinct from expected_base then
  raise exception 'Transport offset did not consume or restore the native AR original/base allocation';end if;
 if(select count(*) from public.fms_fund_ledger_entry) is distinct from(context_value->>'fund_count')::bigint
  or(select count(*) from public.tms_cash_transaction) is distinct from(context_value->>'cash_count')::bigint then
  raise exception 'Transport receivable offset manufactured an actual cash movement';end if;
 select value into fact from app_private.payable_report_source_balances(jsonb_build_object('tenant_id',context_value->>'tenant','kind','financial')) value
 where value->>'document_id'=context_value->>'payable';
 if fact->>'balance_state' is distinct from 'ready' or(fact->>'balance_amount')::numeric is distinct from 3-initial_settled-offset_value then
  raise exception 'Transport report disagreed with the actual native statement';end if;
 workspace:=public.fms_payable_writeoff_workspace_secure(jsonb_build_object('relation','payable_receivable','document_ids',
  jsonb_build_array(context_value->>'payable',context_value->>'document')));
 if not exists(select 1 from jsonb_array_elements(workspace->'primary') value where value->>'id'=context_value->>'payable'
  and value->>'carrier_id'=context_value->>'carrier' and nullif(value->>'supplier_name','') is not null
  and(value->>'available_base_amount')::numeric=3-initial_settled-offset_value) then raise exception 'Transport source was missing from the payable/receivable workspace';end if;
 if p_phase='after' then
  select * into matched from public.fms_payable_writeoff_record where id=(context_value->'records'->>0)::uuid;
  if matched.match_snapshot->'transport_receivable'->>'statement_id' is distinct from context_value->>'statement'
   or app_private.payable_receivable_writeoff_valid(matched.id) is distinct from true
   or matched.payable_base_amount is distinct from offset_value or matched.receivable_base_amount is distinct from 0.07 then
   raise exception 'Transport offset lost original statement proof or actual carrying amounts';end if;
  if(select count(*) from app_private.carrier_statement_noncash_writeoffs where record_id=matched.id and current_active)<>1 then
   raise exception 'Transport offset was not projected exactly once as noncash';end if;
 end if;
 return jsonb_build_object('case',p_case,'phase',p_phase,'status','passed');
end $check$;

create function pg_temp.reverse_tms_receivable_case(p_case integer) returns jsonb
language plpgsql as $reverse$
declare context_value jsonb:=current_setting('qa.tms_ar_'||p_case)::jsonb;record_ident uuid:=(context_value->'records'->>0)::uuid;blocked boolean;
begin
 blocked:=false;
 begin update public.fms_payable_writeoff_record set amount=amount+1 where id=record_ident;exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Transport offset source amount could be rewritten';end if;
 blocked:=false;
 begin delete from public.fms_payable_writeoff_record where id=record_ident;exception when foreign_key_violation then blocked:=true;end;
 if not blocked then raise exception 'Transport offset history could be erased';end if;
 perform public.fms_reverse_payable_writeoff_secure(record_ident,'恢复原运输应付与原生应收余量，保留现金');
 return jsonb_build_object('case',p_case,'status','reversed');
end $reverse$;

create function pg_temp.check_tms_receivable_permissions(p_case integer) returns jsonb
language plpgsql as $permissions$
declare context_value jsonb:=current_setting('qa.tms_ar_'||p_case)::jsonb;original_roles text[];mode_value text;blocked boolean;
 fixture_role uuid:=(context_value->>'fixture_role')::uuid;tenant uuid:=(context_value->>'tenant')::uuid;
 record_ident uuid:=(context_value->'records'->>0)::uuid;command jsonb;workspace jsonb;state jsonb;owner_flags jsonb;
begin
 perform pg_temp.use_tms_receivable_actor(p_case,true);
 select user_roles into original_roles from public.sys_user where id=(context_value->>'profile')::uuid;
 insert into public.sys_role_menu(tenant_id,role_id,menu_id)
 select tenant,fixture_role,id from public.sys_menu where name in(
  'FinancePurchasePayable','FinancePurchasePayable:View','FinancePayableWriteoff','FinancePayableWriteoff:View',
  'FinancePayableWriteoff:Writeoff','FinancePayableWriteoff:Reverse','FinancePayableWriteoff:Voucher') on conflict do nothing;
 update public.sys_user set user_roles=array[context_value->>'fixture_role_code'] where id=(context_value->>'profile')::uuid;
 select jsonb_agg(jsonb_build_object('id',field.id,'enabled',field.owner_override_enabled)) into owner_flags
 from public.sys_permission_field field join public.sys_permission_resource resource on resource.id=field.resource_id
 where resource.tenant_id=tenant and resource.resource_key='tms.carrier_statement' and field.field_key in('statementAmounts','settlementAmounts');
 update public.sys_permission_field field set owner_override_enabled=false from public.sys_permission_resource resource
 where field.resource_id=resource.id and resource.tenant_id=tenant and resource.resource_key='tms.carrier_statement'
  and field.field_key in('statementAmounts','settlementAmounts');
 if app_private.is_platform_super() then raise exception 'Transport permission fixture acquired platform authority';end if;
 command:=jsonb_build_object('relation','payable_receivable','payable_id',context_value->>'payable','receivable_line_id',context_value->>'line',
  'amount',0.01,'receivable_amount',0.01,'allow_cross_party',true);
 foreach mode_value in array array['allocation_missing','statement_hidden','settlement_hidden','settlement_read','normal'] loop
  insert into public.sys_role_menu(tenant_id,role_id,menu_id) select tenant,fixture_role,id from public.sys_menu
   where name='FinanceCashTransaction:Allocate' on conflict do nothing;
  update public.sys_role_field_permission access set access_level=case
   when mode_value='statement_hidden' and field.field_key='statementAmounts' then 'hidden'
   when mode_value='settlement_hidden' and field.field_key='settlementAmounts' then 'hidden'
   when mode_value='settlement_read' and field.field_key='settlementAmounts' then 'read' else 'edit' end
  from public.sys_permission_field field,public.sys_permission_resource resource where access.role_id=fixture_role
   and access.field_id=field.id and access.resource_id=resource.id and field.resource_id=resource.id
   and resource.resource_key='tms.carrier_statement' and field.field_key in('statementAmounts','settlementAmounts');
  if mode_value='allocation_missing' then delete from public.sys_role_menu access using public.sys_menu menu
   where access.role_id=fixture_role and access.menu_id=menu.id and menu.name='FinanceCashTransaction:Allocate';end if;
  state:=app_private.payable_carrier_receivable_state((context_value->>'payable')::uuid);
  if(state->>'ready')::boolean is distinct from(mode_value='normal') then
   raise exception 'Transport readiness did not enforce exact native capability and field rights: %',mode_value;end if;
  workspace:=public.fms_payable_writeoff_workspace_secure(jsonb_build_object('relation','payable_receivable',
   'document_ids',jsonb_build_array(context_value->>'payable',context_value->>'document')));
  if mode_value<>'normal' and exists(select 1 from jsonb_array_elements(workspace->'primary') item where item->>'id'=context_value->>'payable') then
   raise exception 'Ineligible transport source remained selectable: %',mode_value;end if;
  if mode_value in('statement_hidden','settlement_hidden') then
   if exists(select 1 from jsonb_array_elements(workspace->'history') item where item->>'payable_id'=context_value->>'payable') then
    raise exception 'Hidden original transport amounts leaked through writeoff history';end if;
   blocked:=false;
   begin perform public.fms_payable_settlement_voucher_secure(record_ident,'writeoff',true);exception when insufficient_privilege then blocked:=true;end;
   if not blocked then raise exception 'Hidden transport amounts could be read through voucher preview';end if;
  else
   perform public.fms_payable_settlement_voucher_secure(record_ident,'writeoff',true);
  end if;
  if mode_value<>'normal' then
   blocked:=false;
   begin perform public.fms_payable_writeoff_secure(jsonb_build_array(command),(context_value->>'scheme')::uuid,
    app_private.payable_business_date(),'原生权限不足不得抵销');exception when insufficient_privilege then blocked:=true;end;
   if not blocked then raise exception 'Transport offset bypassed native source rights: %',mode_value;end if;
   blocked:=false;
   begin perform public.fms_reverse_payable_writeoff_secure(record_ident,'原生权限不足不得反核销');exception when insufficient_privilege then blocked:=true;end;
   if not blocked then raise exception 'Transport reversal bypassed native source rights: %',mode_value;end if;
  end if;
 end loop;
 if has_table_privilege('authenticated','app_private.carrier_statement_noncash_writeoffs','SELECT')
  or has_function_privilege('authenticated','app_private.sync_carrier_receivable_application()','EXECUTE')
  or has_function_privilege('anon','app_private.payable_carrier_receivable_state(uuid)','EXECUTE') then
  raise exception 'Private native transport projection or updater was exposed to a client';end if;
 update public.sys_user set user_roles=original_roles where id=(context_value->>'profile')::uuid;
 update public.sys_permission_field field set owner_override_enabled=(item->>'enabled')::boolean
 from jsonb_array_elements(owner_flags) item where field.id=(item->>'id')::uuid;
 perform pg_temp.use_tms_receivable_actor(p_case,false);
 return jsonb_build_object('case',p_case,'status','permission_matrix_passed');
end $permissions$;

select pg_temp.prepare_ar_application_base('USD');
select pg_temp.prepare_tms_receivable_case(1);
select pg_temp.create_tms_receivable_cost(1);
select pg_temp.create_tms_receivable_statement(1);
select pg_temp.create_tms_receivable_documents(1);
select pg_temp.create_tms_receivable_native_application(1);
select pg_temp.create_tms_receivable_native_cash(1);
select pg_temp.check_tms_receivable_case(1,'before');
select pg_temp.match_tms_receivable_case(1);
select pg_temp.check_tms_receivable_case(1,'after');
select pg_temp.check_tms_receivable_permissions(1);
select pg_temp.reverse_tms_receivable_case(1);
select pg_temp.check_tms_receivable_case(1,'restored');
select pg_temp.prepare_ar_application_base('USD');
select pg_temp.prepare_tms_receivable_case(2);
select pg_temp.create_tms_receivable_cost(2);
select pg_temp.create_tms_receivable_statement(2);
select pg_temp.create_tms_receivable_documents(2);
select pg_temp.create_tms_receivable_native_application(2);
select pg_temp.create_tms_receivable_native_cash(2);
select pg_temp.check_tms_receivable_case(2,'before');
select pg_temp.match_tms_receivable_case(2);
select pg_temp.check_tms_receivable_case(2,'after');
select pg_temp.reverse_tms_receivable_case(2);
select pg_temp.check_tms_receivable_case(2,'restored');
select pg_temp.prepare_ar_application_base('USD');
select pg_temp.prepare_tms_receivable_case(3);
select pg_temp.create_tms_receivable_cost(3);
select pg_temp.create_tms_receivable_statement(3);
select pg_temp.create_tms_receivable_documents(3);
select pg_temp.create_tms_receivable_native_application(3);
select pg_temp.create_tms_receivable_native_cash(3);
select pg_temp.check_tms_receivable_case(3,'before');
select pg_temp.match_tms_receivable_case(3);
select pg_temp.check_tms_receivable_case(3,'after');
select pg_temp.reverse_tms_receivable_case(3);
select pg_temp.check_tms_receivable_case(3,'restored');
select pg_temp.prepare_ar_application_base('USD');
select pg_temp.prepare_tms_receivable_case(4);
select pg_temp.create_tms_receivable_cost(4);
select pg_temp.create_tms_receivable_statement(4);
select pg_temp.create_tms_receivable_documents(4);
select pg_temp.create_tms_receivable_native_application(4);
select pg_temp.create_tms_receivable_native_cash(4);
select pg_temp.check_tms_receivable_case(4,'before');
select pg_temp.match_tms_receivable_case(4);
select pg_temp.check_tms_receivable_case(4,'after');
select pg_temp.reverse_tms_receivable_case(4);
select pg_temp.check_tms_receivable_case(4,'restored');
rollback;
