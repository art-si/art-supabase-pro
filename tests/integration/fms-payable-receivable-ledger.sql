begin;

do $test$
declare
 actor uuid;ordinary uuid;tenant uuid;foreign_tenant uuid;book uuid;other_book uuid;organization uuid;supplier uuid;customer uuid;candidate uuid;
 material uuid;unit_id uuid;finance_type uuid;scheme uuid;fixture_role uuid;resource_id uuid;field_id uuid;fixture_code text:='QA_APAR_'||upper(left(gen_random_uuid()::text,8));
 payable jsonb;payables jsonb:='[]';receivable uuid;receivable_line uuid;receivable_lines uuid[]:='{}';offset_id uuid;offset_ids uuid[]:='{}';application_id uuid;
 primary_identity jsonb;secondary_identity jsonb;case_number integer;blocked boolean;before_funds bigint;test_amount numeric;payment_type uuid;purpose uuid;method uuid;application jsonb;orphan_id uuid;
 query jsonb;workspace jsonb;plan jsonb;stale_plan jsonb;public_records jsonb;public_record uuid;voucher_result jsonb;voucher_id uuid;debit uuid;credit uuid;posting_rule uuid;posting_event public.fms_posting_event;visible_records integer;
begin
 select auth_user_id into actor from public.sys_user where auth_user_id is not null and user_roles @>array['R_SUPER'] limit 1;
 select id into tenant from public.sys_tenant where tenant_code='qa-payable-20261022';
 select auth_user_id into ordinary from public.sys_user where tenant_id=tenant and auth_user_id is not null and status='1' and not user_roles @>array['R_SUPER'] order by id limit 1;
 select id into foreign_tenant from public.sys_tenant where id<>tenant and status='1' and builtin_type is distinct from 'platform'
  and(service_start_date is null or service_start_date<=app_private.payable_business_date()) and(service_end_date is null or service_end_date>=app_private.payable_business_date()) order by id limit 1;
 select id into book from public.fms_account_set where tenant_id=tenant and is_default and status='active' and base_currency_code='CNY';
 select id into organization from public.mdm_organization where tenant_id=tenant and organization_type='company' and status='1' order by id limit 1;
 if actor is null or ordinary is null or foreign_tenant is null or book is null or organization is null then raise exception 'Missing independent QA payable/receivable fixtures';end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',tenant)::text,true);
 perform set_config('request.jwt.claim.sub',ordinary::text,true);
 insert into public.mdm_supplier(tenant_id,supplier_code,supplier_name)
 values(tenant,fixture_code,'回滚核销主体'||fixture_code) returning id into supplier;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 select id,inventory_unit_id into material,unit_id from public.mdm_material where tenant_id=tenant and inventory_unit_id is not null order by id limit 1;
 select id into finance_type from public.mdm_document_type where tenant_id=tenant and document_type_code='AP_FIN_STANDARD';
 insert into public.fms_opening_balance_control(tenant_id,account_set_id,fiscal_year,status,confirmed_at,confirmed_by)
 values(tenant,book,extract(year from app_private.payable_business_date())::integer,'confirmed',now(),actor::text)
 on conflict(account_set_id,fiscal_year) do update set status='confirmed';
 perform set_config('request.jwt.claim.sub',ordinary::text,true);
 insert into public.mdm_customer(tenant_id,customer_code,customer_name) select tenant,fixture_code,supplier_name from public.mdm_supplier where id=supplier returning id into customer;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 insert into public.sys_role(role_code,role_name,tenant_id,enabled) values(fixture_code,'应付冲应收权限回滚角色',tenant,true) returning id into fixture_role;
 insert into public.sys_role_menu(role_id,menu_id,tenant_id) select fixture_role,id,tenant from public.sys_menu where name in('MdmGovernance','MdmGovernance:View','MdmGovernance:MergeRecord');
 update public.sys_user set user_roles=array[fixture_code] where auth_user_id=ordinary;
 scheme:=public.fms_save_payable_reference_secure('scheme',jsonb_build_object('tenant_id',tenant,'code',fixture_code,'name','应付冲应收回滚验收方案',
  'rules',jsonb_build_array(jsonb_build_object('primary_field','counterparty_id','secondary_field','counterparty_id','operator','eq','empty_matches',false),
  jsonb_build_object('field','currency_code','operator','eq','empty_matches',false))));
 for case_number in 1..2 loop
  payable:=public.fms_save_purchase_payable_secure(jsonb_build_object('tenant_id',tenant,'kind','financial','document_type_id',finance_type,'supplier_id',supplier,
   'organization_id',organization,'business_date',app_private.payable_business_date(),'lines',jsonb_build_array(jsonb_build_object('material_id',material,'inventory_unit_id',unit_id,'quantity',1,'unit_price',120*case_number,'tax_rate',0))));
  perform public.fms_act_purchase_payable_secure(array[(payable->>'id')::uuid],'submit');
  perform public.fms_act_purchase_payable_secure(array[(payable->>'id')::uuid],'approve');
  payables:=payables||jsonb_build_array(payable);
  insert into public.fms_receivable_document(tenant_id,document_no,kind,status,customer_id,settlement_organization_id,business_date,amount,total_amount,created_by_auth_user_id)
  values(tenant,fixture_code||'_'||case_number,'financial','approved',customer,organization,app_private.payable_business_date(),120*case_number+60,120*case_number+60,ordinary) returning id into receivable;
  insert into public.fms_receivable_line(tenant_id,document_id,line_no,basis,material_description,quantity,amount,total_amount,tax_rate)
  values(tenant,receivable,10,'amount','应付冲应收回滚夹具',1,120*case_number+60,120*case_number+60,0) returning id into receivable_line;
  receivable_lines:=array_append(receivable_lines,receivable_line);
 end loop;
 primary_identity:=app_private.payable_counterparty_identity(tenant,'mdm_supplier',supplier);
 secondary_identity:=app_private.payable_counterparty_identity(tenant,'mdm_customer',customer);
 if primary_identity->>'key' is not distinct from secondary_identity->>'key' then raise exception 'Identical names were treated as governed counterparty identity';end if;
 blocked:=false;begin
  perform app_private.apply_payable_receivable_writeoff((payables->0->>'id')::uuid,receivable_lines[1],40,app_private.payable_business_date(),scheme,'未确认统一往来单位');
 exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Unapproved same-name counterparties were offset';end if;
 insert into public.mdm_match_candidate(tenant_id,domain_key,source_type,left_record_id,right_record_id,match_score,match_basis)
 values(tenant,'partner','business_partner',least((primary_identity->>'partner_id')::uuid,(secondary_identity->>'partner_id')::uuid),greatest((primary_identity->>'partner_id')::uuid,(secondary_identity->>'partner_id')::uuid),1,jsonb_build_object('fixture',fixture_code)) returning id into candidate;
 perform set_config('request.jwt.claim.sub',ordinary::text,true);
 perform public.mdm_review_match_candidate_secure(candidate,'accept',(primary_identity->>'partner_id')::uuid,'独立验收夹具明确确认双方为同一往来单位，事务结束全部回滚');
 perform set_config('request.jwt.claim.sub',actor::text,true);
 if app_private.payable_counterparty_identity(tenant,'mdm_supplier',supplier)->>'key' is distinct from app_private.payable_counterparty_identity(tenant,'mdm_customer',customer)->>'key' then raise exception 'Approved native MDM merge was not reused';end if;
 select count(*) into before_funds from public.fms_fund_ledger_entry;
 for case_number in 1..2 loop
  test_amount:=case_number*40;
  offset_id:=app_private.apply_payable_receivable_writeoff((payables->(case_number-1)->>'id')::uuid,receivable_lines[case_number],test_amount,app_private.payable_business_date(),scheme,'两笔原子抵销');
  offset_ids:=array_append(offset_ids,offset_id);
  if(app_private.purchase_payable_json((payables->(case_number-1)->>'id')::uuid)->>'unpaid_amount')::numeric<>case_number*80
   or app_private.ar_line_balance(receivable_lines[case_number])<>case_number*80+60 then raise exception 'Offset failed to consume both canonical balances';end if;
  if not exists(select 1 from public.fms_payable_writeoff_record where id=offset_id and relation='payable_receivable' and account_set_id=book and needs_voucher and document_no is not null and payment_line_id is null and payment_amount=0 and cash_discount_amount=0)
   or not exists(select 1 from public.fms_receivable_application where payable_writeoff_id=offset_id and status='approved' and effect=1 and amount=test_amount)
   or not exists(select 1 from public.fms_receivable_debt_allocation allocation join public.fms_receivable_application event on event.id=allocation.applied_application_id where event.payable_writeoff_id=offset_id and allocation.amount=test_amount) then
   raise exception 'Offset bypassed native AR debt allocation or misrepresented cash';end if;
 end loop;
 set constraints payable_receivable_record_consistency,payable_receivable_application_consistency immediate;
 set constraints payable_receivable_record_consistency,payable_receivable_application_consistency deferred;
 if(select count(*) from public.fms_fund_ledger_entry)<>before_funds then raise exception 'Accounting offset created a cash movement';end if;
 orphan_id:=gen_random_uuid();
 blocked:=false;begin
  insert into public.fms_payable_writeoff_record(id,tenant_id,record_no,document_no,relation,payable_id,receivable_line_id,receivable_amount,scheme_id,account_set_id,amount,writeoff_date,needs_voucher,actor)
  values(orphan_id,tenant,fixture_code||'_ORPHAN',fixture_code||'_ORPHAN_DOC','payable_receivable',(payables->0->>'id')::uuid,receivable_lines[1],1,scheme,book,1,app_private.payable_business_date(),true,actor);
  set constraints payable_receivable_record_consistency,payable_receivable_application_consistency immediate;
 exception when check_violation then blocked:=true;end;
 if not blocked or exists(select 1 from public.fms_payable_writeoff_record where id=orphan_id) then raise exception 'Offset committed without its native AR ledger entry';end if;
 set constraints payable_receivable_record_consistency,payable_receivable_application_consistency deferred;
 update public.fms_purchase_payable_document set frozen_amount=1 where id=(payables->0->>'id')::uuid;
 blocked:=false;begin
  perform app_private.apply_payable_receivable_writeoff((payables->0->>'id')::uuid,receivable_lines[1],1,app_private.payable_business_date(),scheme,'冻结保护');
 exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Offset consumed a frozen payable';end if;
 update public.fms_purchase_payable_document set frozen_amount=0 where id=(payables->0->>'id')::uuid;
 update public.fms_receivable_document set is_credit=true where id=(select document_id from public.fms_receivable_line where id=receivable_lines[1]);
 blocked:=false;begin
  perform app_private.apply_payable_receivable_writeoff((payables->0->>'id')::uuid,receivable_lines[1],1,app_private.payable_business_date(),scheme,'红字应收不能冒作正向抵销');
 exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Credit AR was misused as positive receivable';end if;
 update public.fms_receivable_document set is_credit=false where id=(select document_id from public.fms_receivable_line where id=receivable_lines[1]);
 blocked:=false;begin
  perform app_private.apply_payable_receivable_writeoff((payables->0->>'id')::uuid,receivable_lines[1],1.001,app_private.payable_business_date(),scheme,'不允许隐式舍入核销输入');
 exception when invalid_parameter_value then blocked:=true;end;
 if not blocked then raise exception 'Offset silently rounded an invalid monetary input';end if;
 blocked:=false;begin
  update public.fms_receivable_application set status='voided' where payable_writeoff_id=offset_ids[1] and effect=1;
 exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Approved AR ledger was rewritten instead of reversed';end if;
 blocked:=false;begin
  perform app_private.apply_payable_receivable_writeoff((payables->0->>'id')::uuid,receivable_lines[1],81,app_private.payable_business_date(),scheme,'超额拒绝');
 exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Offset overspent AP balance';end if;
 application_id:=gen_random_uuid();
 insert into public.fms_receivable_application(id,tenant_id,financial_line_id,event_kind,source_type,source_id,event_date,amount,status,created_by_auth_user_id)
 values(application_id,tenant,receivable_lines[1],'payment_request','fixture',application_id,app_private.payable_business_date(),80,'draft',ordinary);
 blocked:=false;begin
  perform app_private.apply_payable_receivable_writeoff((payables->0->>'id')::uuid,receivable_lines[1],61,app_private.payable_business_date(),scheme,'应收预占保护');
 exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Offset consumed reserved AR credit';end if;
 update public.fms_receivable_application set status='voided' where id=application_id;
 select id into payment_type from public.mdm_document_type where tenant_id=tenant and document_type_code='AP_APP_PURCHASE';
 select id into purpose from public.mdm_payment_purpose where tenant_id=tenant and code='201';
 select id into method from public.mdm_settlement_method where tenant_id=tenant and enabled and category='virtual' limit 1;
 application:=public.fms_save_payable_settlement_secure(jsonb_build_object('tenant_id',tenant,'kind','application','document_type_id',payment_type,'business_date',app_private.payable_business_date(),
  'lines',jsonb_build_array(jsonb_build_object('purpose_id',purpose,'supplier_id',supplier,'payable_id',payables->0->>'id','settlement_method_id',method,'amount',30))));
 blocked:=false;begin
  perform app_private.apply_payable_receivable_writeoff((payables->0->>'id')::uuid,receivable_lines[1],51,app_private.payable_business_date(),scheme,'应付付款申请占用保护');
 exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Offset spent an existing payment application reservation';end if;
 perform set_config('request.jwt.claim.sub',ordinary::text,true);
 insert into public.fms_account_set(tenant_id,account_set_code,account_set_name,legal_entity_name,enabled_on,status)
 values(tenant,fixture_code,'跨账套回滚夹具','虚构验收主体',app_private.payable_business_date(),'active') returning id into other_book;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 update public.fms_account_set set is_default=false where id=book;
 update public.fms_account_set set is_default=true where id=other_book;
 blocked:=false;begin
  perform app_private.apply_payable_receivable_writeoff((payables->1->>'id')::uuid,receivable_lines[2],1,app_private.payable_business_date(),scheme,'跨账套拒绝');
 exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Cross-book offset was allowed';end if;
 select document_id into receivable from public.fms_receivable_line where id=receivable_lines[1];
 blocked:=false;begin perform app_private.ar_assert_financial_book(receivable);exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Native AR processing ignored an active offset in its original book';end if;
 update public.fms_account_set set is_default=false where id=other_book;
 update public.fms_account_set set is_default=true where id=book;
 perform set_config('request.headers','{}',true);
 offset_id:=app_private.apply_payable_receivable_writeoff((payables->1->>'id')::uuid,receivable_lines[2],1,app_private.payable_business_date(),scheme,'平台全部租户继承来源');
 perform app_private.reverse_payable_receivable_writeoff(offset_id,'平台全部租户反核销');
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',foreign_tenant)::text,true);
 blocked:=false;begin perform app_private.reverse_payable_receivable_writeoff(offset_ids[1],'跨租户拒绝');exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Platform-selected scope reversed another tenant offset';end if;
 blocked:=false;begin perform app_private.apply_payable_receivable_writeoff((payables->0->>'id')::uuid,receivable_lines[1],1,app_private.payable_business_date(),scheme,'跨租户拒绝');exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Platform-selected scope wrote another tenant offset';end if;
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',tenant)::text,true);
 delete from public.sys_role_menu where role_id=fixture_role;
 insert into public.sys_role_menu(role_id,menu_id,tenant_id) select fixture_role,id,tenant from public.sys_menu where name in('FinancePayableWriteoff','FinancePayableWriteoff:View','FinancePayableWriteoff:Writeoff','FinancePayableWriteoff:Reverse');
 update public.sys_user set user_roles=array[fixture_code] where auth_user_id=ordinary;
 perform set_config('request.jwt.claim.sub',ordinary::text,true);
 blocked:=false;begin perform app_private.apply_payable_receivable_writeoff((payables->0->>'id')::uuid,receivable_lines[1],1,app_private.payable_business_date(),scheme,'缺原应收权限');exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'AP authority bypassed native AR permission';end if;
 insert into public.sys_role_menu(role_id,menu_id,tenant_id) select fixture_role,id,tenant from public.sys_menu where name in('FinanceReceiptWriteoff','FinanceReceiptWriteoff:View','FinanceReceiptWriteoff:Writeoff','FinanceReceiptWriteoff:Reverse');
 select resource.id,field.id into resource_id,field_id from public.sys_permission_resource resource join public.sys_permission_field field on field.resource_id=resource.id and field.tenant_id=resource.tenant_id where resource.tenant_id=tenant and resource.resource_key='fms.receivable' and field.field_key='amounts';
 blocked:=false;begin perform app_private.apply_payable_receivable_writeoff((payables->0->>'id')::uuid,receivable_lines[1],1,app_private.payable_business_date(),scheme,'金额隐藏拒绝');exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Offset bypassed hidden AR amount';end if;
 insert into public.sys_role_field_permission(tenant_id,role_id,resource_id,field_id,access_level,create_by) values(tenant,fixture_role,resource_id,field_id,'read',actor::text);
 for case_number in 1..2 loop
  perform set_config('request.headers',case when case_number=1 then '{}' else jsonb_build_object('x-art-tenant-scope',foreign_tenant)::text end,true);
  offset_id:=app_private.apply_payable_receivable_writeoff((payables->1->>'id')::uuid,receivable_lines[2],1,app_private.payable_business_date(),scheme,'普通本租户及伪造租户头');
  if(select tenant_id from public.fms_payable_writeoff_record where id=offset_id)<>tenant then raise exception 'Ordinary forged header selected another tenant';end if;
  perform app_private.reverse_payable_receivable_writeoff(offset_id,'普通用户反核销');
 end loop;
 for case_number in 1..2 loop
  perform app_private.reverse_payable_receivable_writeoff(offset_ids[case_number],'保留原流水并追加反向记录');
  if(app_private.purchase_payable_json((payables->(case_number-1)->>'id')::uuid)->>'unpaid_amount')::numeric<>case_number*120
   or app_private.ar_line_balance(receivable_lines[case_number])<>case_number*120+60 then raise exception 'Reverse did not restore both original balances';end if;
  if(select count(*) from public.fms_receivable_application where payable_writeoff_id=offset_ids[case_number] and status='approved')<>2
   or exists(select 1 from public.fms_payable_writeoff_record where id=offset_ids[case_number] and document_no is not null) then raise exception 'Reverse removed accounting history or retained an unposted document';end if;
 end loop;
 set constraints payable_receivable_record_consistency,payable_receivable_application_consistency immediate;
 if(select count(*) from public.fms_fund_ledger_entry)<>before_funds then raise exception 'Offset or reversal created cash movement';end if;
 if has_function_privilege('authenticated','app_private.apply_payable_receivable_writeoff(uuid,uuid,numeric,date,uuid,text,boolean)','execute')
  or has_function_privilege('anon','app_private.payable_counterparty_identity(uuid,text,uuid)','execute') then raise exception 'Private offset functions exposed';end if;
 set constraints payable_receivable_record_consistency,payable_receivable_application_consistency deferred;
 insert into public.sys_role_menu(role_id,menu_id,tenant_id) select fixture_role,id,tenant from public.sys_menu where name in('FinancePayableWriteoff:AutoWriteoff','FinancePayableWriteoff:Voucher','FinanceVoucherCenter:View','FinanceVoucherCenter:Void') on conflict do nothing;
 select jsonb_build_object('relation','payable_receivable','document_ids',
  jsonb_build_array(payables->0->>'id',payables->1->>'id')||jsonb_agg(document_id order by line_no,id)) into query from public.fms_receivable_line where id=any(receivable_lines);
 workspace:=public.fms_payable_writeoff_workspace_secure(query);
 if jsonb_array_length(workspace->'primary')<>2 or jsonb_array_length(workspace->'secondary')<>2 then raise exception 'Public workspace lost eligible AP or native AR candidates';end if;
 for case_number in 1..2 loop
  public_records:=public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('relation','payable_receivable','payable_id',payables->(case_number-1)->>'id','receivable_line_id',receivable_lines[case_number],'amount',case_number*10)),scheme,app_private.payable_business_date(),'公开手工核销');
  if jsonb_array_length(public_records)<>1 then raise exception 'Public manual writeoff returned an invalid record list';end if;
  perform public.fms_reverse_payable_writeoff_secure((public_records->>0)::uuid,'公开反核销');
 end loop;
 delete from public.sys_role_menu where role_id=fixture_role and menu_id=(select id from public.sys_menu where name='FinancePayableWriteoff:Writeoff');
 blocked:=false;begin
  perform public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('relation','payable_receivable','payable_id',payables->0->>'id','receivable_line_id',receivable_lines[1],'amount',1)),scheme,app_private.payable_business_date(),'仅自动权限不得手工核销');
 exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Automatic authority bypassed the manual action boundary';end if;
 update public.fms_payable_writeoff_scheme set automatic=true where id=scheme;
 stale_plan:=public.fms_auto_payable_writeoff_secure(scheme,app_private.payable_business_date(),query,false);
 if jsonb_array_length(stale_plan->'items')<>3 or(stale_plan->>'total_amount')::numeric<>330 then raise exception 'Automatic preview ignored AR pairing or AP reservations: %',stale_plan;end if;
 application_id:=gen_random_uuid();
 insert into public.fms_receivable_application(id,tenant_id,financial_line_id,event_kind,source_type,source_id,event_date,amount,status,created_by_auth_user_id)
 values(application_id,tenant,receivable_lines[1],'payment_request','fixture',application_id,app_private.payable_business_date(),1,'draft',ordinary);
 blocked:=false;begin
  perform public.fms_auto_payable_writeoff_secure(scheme,app_private.payable_business_date(),query,true,stale_plan->>'plan_token');
 exception when serialization_failure then blocked:=true;end;
 if not blocked or exists(select 1 from public.fms_payable_writeoff_record where relation='payable_receivable' and status='active' and payable_id in((payables->0->>'id')::uuid,(payables->1->>'id')::uuid)) then raise exception 'Stale automatic plan wrote partial accounting offsets';end if;
 update public.fms_receivable_application set status='voided' where id=application_id;
 plan:=public.fms_auto_payable_writeoff_secure(scheme,app_private.payable_business_date(),query,false);
 plan:=public.fms_auto_payable_writeoff_secure(scheme,app_private.payable_business_date(),query,true,plan->>'plan_token');
 if(plan->>'executed')::boolean is distinct from true or jsonb_array_length(plan->'record_ids')<>3 then raise exception 'Auto-only role could not execute the authorized automatic flow';end if;
 public_records:=plan->'record_ids';
 update public.sys_role_field_permission set access_level='hidden' where role_id=fixture_role;
 set local role authenticated;
 select count(*) into visible_records from public.fms_payable_writeoff_record where id in(select value::uuid from jsonb_array_elements_text(public_records));
 reset role;
 if visible_records<>0 then raise exception 'Direct authenticated read bypassed native AR amount hiding';end if;
 blocked:=false;begin perform public.fms_payable_writeoff_workspace_secure(query);exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Public offset workspace exposed hidden AR amounts';end if;
 update public.sys_role_field_permission set access_level='read' where role_id=fixture_role;
 set local role authenticated;
 select count(*) into visible_records from public.fms_payable_writeoff_record where id in(select value::uuid from jsonb_array_elements_text(public_records));
 reset role;
 if visible_records<>3 then raise exception 'Authorized direct read lost offset records with no payment line';end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',tenant)::text,true);
 update public.fms_posting_rule set is_enabled=false where account_set_id=book and event_code='ap_receivable_offset_approved';
 perform set_config('request.jwt.claim.sub',ordinary::text,true);perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',foreign_tenant)::text,true);
 voucher_result:=public.fms_payable_settlement_voucher_secure((public_records->>0)::uuid,'writeoff',false);
 if voucher_result->>'status'<>'pending_configuration' or jsonb_array_length(voucher_result->'voucher_ids')<>0 then raise exception 'Missing AP/AR rule reused an unrelated posting rule';end if;
 select * into posting_event from public.fms_posting_event where source_id=(public_records->>0)::uuid and event_code='ap_receivable_offset_approved';
 if posting_event.id is null or posting_event.account_set_id<>book or posting_event.payload->>'paid_amount'<>'0' then raise exception 'Offset event did not retain its real book and noncash identity';end if;
 insert into public.fms_subject(tenant_id,account_set_id,subject_code,subject_name,category,balance_direction)
 select tenant,book,'1122','回滚验收应收账款','asset','debit' where not exists(select 1 from public.fms_subject where account_set_id=book and subject_code='1122');
 select id into debit from public.fms_subject where account_set_id=book and subject_code='2202' and is_enabled;
 select id into credit from public.fms_subject where account_set_id=book and subject_code='1122' and is_enabled;
 if debit is null or credit is null then raise exception 'Missing payable liability or receivable asset posting test subjects';end if;
 insert into public.fms_posting_rule(tenant_id,account_set_id,rule_code,rule_name,source_type,event_code,priority,submission_mode,voucher_type)
 values(tenant,book,fixture_code,'独立回滚凭证规则','system','ap_receivable_offset_approved',999,'draft','transfer') returning id into posting_rule;
 insert into public.fms_posting_rule_line(tenant_id,account_set_id,rule_id,line_no,direction,amount_key,subject_id,summary)
 values(tenant,book,posting_rule,10,'debit','payable_amount',debit,'回滚验收应付抵销'),(tenant,book,posting_rule,20,'credit','receivable_amount',credit,'回滚验收应收抵销');
 for case_number in 0..2 loop
  public_record:=(public_records->>case_number)::uuid;
  if case_number<2 then
   if case_number=1 then perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers','{}',true);end if;
   voucher_result:=public.fms_payable_settlement_voucher_secure(public_record,'writeoff',true);
   if jsonb_array_length(voucher_result->'lines')<>2 then raise exception 'Dedicated AP/AR voucher preview did not produce balanced rule lines';end if;
   voucher_result:=public.fms_payable_settlement_voucher_secure(public_record,'writeoff',false);
   if voucher_result->>'status'<>'generated' or jsonb_array_length(voucher_result->'voucher_ids')<>1 then raise exception 'Dedicated AP/AR voucher was not generated: %',voucher_result;end if;
   voucher_id:=(voucher_result->'voucher_ids'->>0)::uuid;
   if not exists(select 1 from public.fms_voucher where id=voucher_id and account_set_id=book and source_id=public_record and source_event_code='ap_receivable_offset_approved' and total_debit=total_credit) then raise exception 'AP/AR voucher source, book or balance mismatch';end if;
   if not exists(select 1 from public.fms_voucher_line entry where entry.voucher_id=(voucher_result->'voucher_ids'->>0)::uuid and entry.subject_id=debit and entry.debit_amount>0)
    or not exists(select 1 from public.fms_voucher_line entry where entry.voucher_id=(voucher_result->'voucher_ids'->>0)::uuid and entry.subject_id=credit and entry.credit_amount>0) then raise exception 'Offset voucher did not debit AP liability and credit AR asset';end if;
   blocked:=false;begin perform public.fms_reverse_payable_writeoff_secure(public_record,'未作废凭证不能反核销');exception when check_violation then blocked:=true;end;
   if not blocked then raise exception 'Posted-document guard did not block offset reversal';end if;
   perform public.transition_fms_voucher(voucher_id,'void','回滚验收先作废凭证',null);
  end if;
  perform public.fms_reverse_payable_writeoff_secure(public_record,'公开自动核销反核销');
  select * into posting_event from public.fms_posting_event where source_id=public_record and event_code='ap_receivable_offset_approved';
  if posting_event.id is not null then
   posting_event:=app_private.process_fms_posting_event(posting_event.id,true);
   if posting_event.status<>'ignored' then raise exception 'Forced posting retry revived a reversed AP/AR offset';end if;
  end if;
  perform set_config('request.jwt.claim.sub',ordinary::text,true);
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',foreign_tenant)::text,true);
 end loop;
 set constraints payable_receivable_record_consistency,payable_receivable_application_consistency immediate;
 if(app_private.purchase_payable_json((payables->0->>'id')::uuid)->>'unpaid_amount')::numeric<>120
  or(app_private.purchase_payable_json((payables->1->>'id')::uuid)->>'unpaid_amount')::numeric<>240
  or app_private.ar_line_balance(receivable_lines[1])<>180 or app_private.ar_line_balance(receivable_lines[2])<>300
  or(select count(*) from public.fms_fund_ledger_entry)<>before_funds then raise exception 'Public automatic or voucher flow left incorrect balances or fund movement';end if;
end $test$;

rollback;
