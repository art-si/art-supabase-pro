begin;

do $test$
declare
 actor uuid;ordinary uuid;tenant uuid;foreign_tenant uuid;book uuid;other_book uuid;supplier uuid;other_supplier uuid;material uuid;unit_id uuid;other_type uuid;expense_type uuid;scheme uuid;currency_ident uuid;application_type uuid;purpose uuid;method uuid;
 blue jsonb;credit_note jsonb;payload jsonb;result jsonb;primary_payload jsonb;credit_payload jsonb;reservation jsonb;blue_id uuid;credit_id uuid;extra_credit_id uuid;record_id uuid;second_record uuid;case_number integer;blocked boolean;posting_date date;
 fixture text:='QA_RB_'||upper(left(gen_random_uuid()::text,8));primary_price numeric;credit_price numeric;primary_currency text;credit_currency text;primary_rate numeric;credit_rate numeric;
 rule_id uuid;debit_subject uuid;credit_subject uuid;exchange_subject uuid;generated_voucher_id uuid;posting_event public.fms_posting_event;fund_count bigint;record_count bigint;visible_count integer;original_roles text[];limited_role uuid;
 workspace jsonb;query jsonb;plan jsonb;executed jsonb;document_ids jsonb:='[]';auto_record_id uuid;before_auto bigint;
begin
 select auth_user_id into actor from public.sys_user where user_roles @>array['R_SUPER'] and auth_user_id is not null limit 1;
 select id into tenant from public.sys_tenant where tenant_code='qa-payable-20261022';
 select auth_user_id,user_roles into ordinary,original_roles from public.sys_user where tenant_id=tenant and auth_user_id is not null and status='1' and not system_protected order by id limit 1;
 select id into foreign_tenant from public.sys_tenant where id<>tenant and builtin_type is distinct from 'platform' and status='1' order by id limit 1;
 select id into book from public.fms_account_set where tenant_id=tenant and is_default and status='active' and base_currency_code='CNY';
 posting_date:=app_private.payable_business_date();
 if actor is null or ordinary is null or foreign_tenant is null or book is null then raise exception 'Missing independent red/blue acceptance fixtures';end if;
 perform set_config('request.jwt.claim.sub',ordinary::text,true);perform set_config('request.headers','{}',true);
 workspace:=public.fms_payable_writeoff_workspace_secure('{}');
 if not exists(select 1 from jsonb_array_elements(workspace->'relations') relation where relation->>'value'='payable_red_blue') then raise exception 'Ordinary acceptance workspace did not expose its dictionary-backed preview relation';end if;
 insert into public.mdm_supplier(tenant_id,supplier_code,supplier_name) values(tenant,fixture,'红蓝对冲回滚主体'||fixture) returning id into supplier;
 insert into public.mdm_supplier(tenant_id,supplier_code,supplier_name) values(tenant,fixture||'_OTHER','红蓝对冲另一主体'||fixture) returning id into other_supplier;
 select id,inventory_unit_id into material,unit_id from public.mdm_material where tenant_id=tenant and inventory_unit_id is not null order by id limit 1;
 select id into other_type from public.mdm_document_type where tenant_id=tenant and document_type_code='AP_FIN_OTHER';
 select id into expense_type from public.mdm_document_type where tenant_id=tenant and document_type_code='AP_FIN_EXPENSE';
 select id into application_type from public.mdm_document_type where tenant_id=tenant and document_type_code='AP_APP_PURCHASE';
 select id into purpose from public.mdm_payment_purpose where tenant_id=tenant and code='201';
 select id into method from public.mdm_settlement_method where tenant_id=tenant and enabled and category='virtual' order by code limit 1;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 scheme:=public.fms_save_payable_reference_secure('scheme',jsonb_build_object('tenant_id',tenant,'code',fixture,'name','红蓝对冲回滚方案',
  'rules',jsonb_build_array(jsonb_build_object('primary_field','supplier_id','secondary_field','supplier_id','operator','eq','empty_matches',false))));
 insert into public.fms_currency(tenant_id,account_set_id,currency_code,currency_name,symbol,is_enabled)
 values(tenant,book,'USD','美元','$',true) on conflict(account_set_id,currency_code) do update set is_enabled=true returning id into currency_ident;
 insert into public.fms_exchange_rate(tenant_id,account_set_id,currency_id,rate_date,rate_type,direct_rate)
 values(tenant,book,currency_ident,posting_date,'spot',7) on conflict(account_set_id,currency_id,rate_date,rate_type) do update set direct_rate=7;
 insert into public.fms_currency(tenant_id,account_set_id,currency_code,currency_name,symbol,is_enabled)
 values(tenant,book,'EUR','欧元','€',true) on conflict(account_set_id,currency_code) do update set is_enabled=true returning id into currency_ident;
 insert into public.fms_exchange_rate(tenant_id,account_set_id,currency_id,rate_date,rate_type,direct_rate)
 values(tenant,book,currency_ident,posting_date,'spot',8) on conflict(account_set_id,currency_id,rate_date,rate_type) do update set direct_rate=8;
 perform set_config('request.jwt.claim.sub',ordinary::text,true);
 insert into public.fms_account_set(tenant_id,account_set_code,account_set_name,legal_entity_name,base_currency_code,enabled_on,status)
 values(tenant,fixture,'红蓝对冲第二回滚账套','虚构回滚主体','CNY',posting_date,'active') returning id into other_book;
 insert into public.fms_currency(tenant_id,account_set_id,currency_code,currency_name,symbol,is_enabled,is_base) values(tenant,other_book,'CNY','人民币','¥',true,true);
 insert into public.fms_subject(tenant_id,account_set_id,subject_code,subject_name,category,balance_direction,allow_foreign_currency)
 values(tenant,book,'991'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS'),'外币蓝字应付回滚科目','liability','credit',true) returning id into debit_subject;
 insert into public.fms_subject(tenant_id,account_set_id,subject_code,subject_name,category,balance_direction,allow_foreign_currency)
 values(tenant,book,'992'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS'),'外币红字应付回滚科目','liability','credit',true) returning id into credit_subject;
 insert into public.fms_subject(tenant_id,account_set_id,subject_code,subject_name,category,balance_direction)
 values(tenant,book,'993'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS'),'汇兑损益回滚科目','expense','debit') returning id into exchange_subject;
 insert into public.fms_posting_rule(tenant_id,account_set_id,rule_code,rule_name,source_type,event_code,priority,submission_mode,voucher_type)
 values(tenant,book,fixture,'红蓝对冲独立制证回滚规则','system','ap_red_blue_offset_approved',999999,'draft','transfer') returning id into rule_id;
 insert into public.fms_posting_rule_line(tenant_id,account_set_id,rule_id,line_no,direction,amount_key,subject_id)
 values(tenant,book,rule_id,10,'debit','payable_base_amount',debit_subject),(tenant,book,rule_id,20,'credit','credit_base_amount',credit_subject),
 (tenant,book,rule_id,30,'debit','exchange_gain_loss',exchange_subject);
 select count(*) into fund_count from public.fms_fund_ledger_entry;
 for case_number in 1..4 loop
  primary_price:=100;credit_price:=case when case_number=1 then 80 when case_number=4 then 90 else 100 end;
  primary_currency:=case when case_number>=3 then 'USD' else 'CNY' end;credit_currency:=case when case_number=4 then 'EUR' else primary_currency end;
  primary_rate:=case when case_number=3 then 7.2 when case_number=4 then 7 else 1 end;credit_rate:=case when case_number=3 then 7.1 when case_number=4 then 8 else 1 end;
  payload:=jsonb_build_object('tenant_id',tenant,'kind','financial','supplier_id',supplier,'document_type_id',case when case_number=2 then expense_type else other_type end,
   'business_date',posting_date,'currency_code',primary_currency,'exchange_rate',primary_rate,'input_tax_inclusive_price',false,
   'lines',jsonb_build_array(jsonb_build_object('material_id',material,'inventory_unit_id',unit_id,'quantity',1,'unit_price',primary_price,'tax_rate',0)));
  blue:=public.fms_save_purchase_payable_secure(payload);blue_id:=(blue->>'id')::uuid;
  perform public.fms_act_purchase_payable_secure(array[blue_id],'submit');perform public.fms_act_purchase_payable_secure(array[blue_id],'approve');
  payload:=payload||jsonb_build_object('document_type_id',other_type,'is_credit',true,'currency_code',credit_currency,'exchange_rate',credit_rate,
   'lines',jsonb_build_array(jsonb_build_object('material_id',material,'inventory_unit_id',unit_id,'quantity',1,'unit_price',credit_price,'tax_rate',0)));
  credit_note:=public.fms_save_purchase_payable_secure(payload);credit_id:=(credit_note->>'id')::uuid;
  perform public.fms_act_purchase_payable_secure(array[credit_id],'submit');perform public.fms_act_purchase_payable_secure(array[credit_id],'approve');
  document_ids:=document_ids||jsonb_build_array(blue_id,credit_id);
  query:=jsonb_build_object('relation','payable_red_blue','document_ids',jsonb_build_array(blue_id,credit_id),'as_of_date',posting_date);
  workspace:=public.fms_payable_writeoff_workspace_secure(query);
  if jsonb_array_length(workspace->'primary')<>1 or jsonb_array_length(workspace->'secondary')<>1
   or(workspace->'secondary'->0->>'amount')::numeric<>-credit_price or(workspace->'secondary'->0->>'available_amount')::numeric<>credit_price
   or(workspace->'primary'->0->>'exchange_rate')::numeric<>primary_rate then raise exception 'Red/blue workspace lost signed amount, positive availability or original rate';end if;
  if case_number=1 then
   perform public.fms_act_purchase_payable_secure(array[credit_id],'freeze','冻结红字来源',1);
   blocked:=false;begin perform public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('relation','payable_red_blue','payable_id',blue_id,'credit_payable_id',credit_id,'amount',30)),scheme,posting_date,'冻结不能核销');exception when check_violation then blocked:=true;end;
   if not blocked then raise exception 'Frozen credit note could be consumed';end if;
   perform public.fms_act_purchase_payable_secure(array[credit_id],'unfreeze','解除红字冻结');
   blocked:=false;begin perform public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('relation','payable_red_blue','payable_id',credit_id,'credit_payable_id',blue_id,'amount',1)),scheme,posting_date,'不能颠倒红蓝方向');exception when check_violation then blocked:=true;end;
   if not blocked then raise exception 'Credit direction could be swapped to increase debt';end if;
   blocked:=false;begin perform public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('relation','payable_red_blue','payable_id',blue_id,'credit_payable_id',credit_id,'amount',1,'credit_amount',2)),scheme,posting_date,'同币种不等额');exception when check_violation then blocked:=true;end;
   if not blocked then raise exception 'Same-currency amounts were allowed to differ';end if;
   blocked:=false;begin perform public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('relation','payable_red_blue','payable_id',blue_id,'credit_payable_id',credit_id,'amount','NaN')),scheme,posting_date,'非有限金额');exception when invalid_parameter_value then blocked:=true;end;
   if not blocked then raise exception 'Nonfinite original amount was accepted';end if;
   reservation:=public.fms_save_payable_settlement_secure(jsonb_build_object('tenant_id',tenant,'kind','application','business_date',posting_date,'document_type_id',application_type,
    'lines',jsonb_build_array(jsonb_build_object('purpose_id',purpose,'supplier_id',supplier,'payable_id',blue_id,'settlement_method_id',method,'amount',50))));
   blocked:=false;begin perform public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('relation','payable_red_blue','payable_id',blue_id,'credit_payable_id',credit_id,'amount',75)),scheme,posting_date,'付款申请占用不可被对冲覆盖');exception when check_violation then blocked:=true;end;
   if not blocked then raise exception 'Red/blue writeoff consumed reserved payment liability';end if;
   perform public.fms_act_payable_settlement_secure(array[(reservation->>'id')::uuid],'delete');
   result:=public.fms_save_purchase_payable_secure(payload||jsonb_build_object('supplier_id',other_supplier));extra_credit_id:=(result->>'id')::uuid;
   perform public.fms_act_purchase_payable_secure(array[extra_credit_id],'submit');perform public.fms_act_purchase_payable_secure(array[extra_credit_id],'approve');
   blocked:=false;begin perform public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('relation','payable_red_blue','payable_id',blue_id,'credit_payable_id',extra_credit_id,'amount',1)),scheme,posting_date,'跨往来须明确启用');exception when insufficient_privilege then blocked:=true;end;
   if not blocked then raise exception 'Cross-counterparty writeoff was silently enabled';end if;
   blocked:=false;begin perform public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('relation','payable_red_blue','payable_id',blue_id,'credit_payable_id',extra_credit_id,'amount',1,'allow_cross_party',true)),scheme,posting_date,'启用跨往来也须符合方案');exception when check_violation then blocked:=true;end;
   if not blocked then raise exception 'Explicit cross-party flag bypassed the matching scheme';end if;
   update public.fms_account_set set is_default=false where id=book;update public.fms_account_set set is_default=true where id=other_book;
   result:=public.fms_save_purchase_payable_secure(payload);extra_credit_id:=(result->>'id')::uuid;
   perform public.fms_act_purchase_payable_secure(array[extra_credit_id],'submit');perform public.fms_act_purchase_payable_secure(array[extra_credit_id],'approve');
   update public.fms_account_set set is_default=false where id=other_book;update public.fms_account_set set is_default=true where id=book;
   blocked:=false;begin perform public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('relation','payable_red_blue','payable_id',blue_id,'credit_payable_id',extra_credit_id,'amount',1)),scheme,posting_date,'禁止跨账套');exception when check_violation then blocked:=true;end;
   if not blocked then raise exception 'Red/blue writeoff crossed accounting books';end if;
   perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',foreign_tenant)::text,true);
  end if;
  if case_number=2 then perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers','{}',true);end if;
  if case_number=4 then
   blocked:=false;begin perform public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('relation','payable_red_blue','payable_id',blue_id,'credit_payable_id',credit_id,'amount',100)),scheme,posting_date,'异币必须明确辅方金额');exception when invalid_parameter_value then blocked:=true;end;
   if not blocked then raise exception 'Foreign amounts were silently treated as equivalent';end if;
  end if;
  result:=public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('relation','payable_red_blue','payable_id',blue_id,'credit_payable_id',credit_id,
   'amount',case when case_number=1 then 30 when case_number=3 then 33.33 else 100 end,'credit_amount',case when case_number=1 then 30 when case_number=3 then 33.33 when case_number=4 then 90 else 100 end)),scheme,posting_date,'原币余额与记账汇率对冲');
  record_id:=(result->>0)::uuid;
  if not app_private.payable_red_blue_writeoff_valid(record_id) or not exists(select 1 from public.fms_payable_writeoff_record where id=record_id and payment_amount=0 and cash_discount_amount=0 and payment_line_id is null and account_set_id=book) then raise exception 'Red/blue writeoff lost source, book or noncash identity';end if;
  workspace:=public.fms_payable_writeoff_workspace_secure(query);
  if jsonb_array_length(workspace->'history')<>1 or workspace->'history'->0->>'payment_no'<>credit_note->>'document_no'
   or workspace->'history'->0->>'secondary_currency_code'<>credit_currency then raise exception 'Red/blue history lost the actual secondary document and currency';end if;
  primary_payload:=app_private.purchase_payable_json(blue_id);credit_payload:=app_private.purchase_payable_json(credit_id);
  if(primary_payload->>'unpaid_amount')::numeric<>(case when case_number=1 then 70 when case_number=3 then 66.67 else 0 end)
   or(credit_payload->>'unpaid_amount')::numeric<>(case when case_number=1 then -50 when case_number=3 then -66.67 else 0 end)
   or(credit_payload->'lines'->0->>'unpaid_amount')::numeric<>(credit_payload->>'unpaid_amount')::numeric then raise exception 'Writeoff failed to consume both signed header and line balances';end if;
  if case_number=1 then
   if exists(select 1 from public.fms_payable_writeoff_record where id=record_id and(needs_voucher or document_no is not null)) then raise exception 'Symmetric same-party same-currency writeoff generated an unnecessary accounting document';end if;
   blocked:=false;begin perform public.fms_payable_settlement_voucher_secure(record_id,'writeoff',false);exception when check_violation then blocked:=true;end;
   if not blocked then raise exception 'Symmetric record could generate an accounting voucher';end if;
   select count(*) into record_count from public.fms_payable_writeoff_record;
   blocked:=false;begin perform public.fms_payable_writeoff_secure(jsonb_build_array(
    jsonb_build_object('relation','payable_red_blue','payable_id',blue_id,'credit_payable_id',credit_id,'amount',10),
    jsonb_build_object('relation','payable_red_blue','payable_id',blue_id,'credit_payable_id',credit_id,'amount',100)),scheme,posting_date,'批量整体回滚');exception when check_violation then blocked:=true;end;
   if not blocked or(select count(*) from public.fms_payable_writeoff_record)<>record_count or(app_private.purchase_payable_json(blue_id)->>'unpaid_amount')::numeric<>70 then raise exception 'Failed batch retained a partial red/blue settlement';end if;
   blocked:=false;begin update public.fms_payable_writeoff_record set amount=1 where id=record_id;exception when check_violation then blocked:=true;end;
   if not blocked then raise exception 'Approved writeoff history could be repriced';end if;
   result:=public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('relation','payable_red_blue','payable_id',blue_id,'credit_payable_id',credit_id,'amount',50)),scheme,posting_date,'完全核销红字余量');
   second_record:=(result->>0)::uuid;
   if(app_private.purchase_payable_json(credit_id)->>'face_unpaid_amount')::numeric<>0 or(app_private.purchase_payable_json(blue_id)->>'unpaid_amount')::numeric<>20 then raise exception 'Final credit amount did not extinguish the secondary balance';end if;
   blocked:=false;begin perform public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('relation','payable_red_blue','payable_id',blue_id,'credit_payable_id',credit_id,'amount',1)),scheme,posting_date,'红字余额不可重复核销');exception when check_violation then blocked:=true;end;
   if not blocked then raise exception 'Exhausted credit source was consumed twice';end if;
   perform public.fms_reverse_payable_writeoff_secure(second_record,'恢复部分核销状态');
   set local role authenticated;
   select count(*) into visible_count from public.fms_payable_writeoff_record where id=record_id;
   reset role;
   if visible_count<>1 then raise exception 'Ordinary authorized amount read lost noncash writeoff';end if;
   perform set_config('request.jwt.claim.sub',actor::text,true);
   perform set_config('request.headers','{}',true);
   insert into public.sys_role(role_code,role_name,tenant_id,enabled) values(fixture,'红蓝金额权限回滚角色',tenant,true) returning id into limited_role;
   insert into public.sys_role_menu(role_id,menu_id,tenant_id) select limited_role,id,tenant from public.sys_menu where name='FinancePayableWriteoff:View';
   update public.sys_user set user_roles=array[fixture] where auth_user_id=ordinary;
   perform set_config('request.jwt.claim.sub',ordinary::text,true);
   set local role authenticated;
   select count(*) into visible_count from public.fms_payable_writeoff_record where id=record_id;
   reset role;
   if visible_count<>0 then raise exception 'Writeoff read leaked amounts without financial-payable View permission';end if;
   blocked:=false;begin perform public.fms_payable_writeoff_workspace_secure(query);exception when insufficient_privilege then blocked:=true;end;
   if not blocked then raise exception 'Workspace exposed source amounts without financial-payable View permission';end if;
   perform set_config('request.jwt.claim.sub',actor::text,true);update public.sys_user set user_roles=original_roles where auth_user_id=ordinary;
   perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',foreign_tenant)::text,true);
   workspace:=public.fms_payable_writeoff_workspace_secure(query);
   if jsonb_array_length(workspace->'primary')<>0 or jsonb_array_length(workspace->'secondary')<>0 or jsonb_array_length(workspace->'history')<>0 then raise exception 'Selected tenant scope leaked another tenant red/blue balances';end if;
   blocked:=false;begin perform public.fms_reverse_payable_writeoff_secure(record_id,'平台选定其他租户不能反核销');exception when insufficient_privilege then blocked:=true;end;
   if not blocked then raise exception 'Platform-selected scope reversed another tenant record';end if;
   perform set_config('request.jwt.claim.sub',ordinary::text,true);perform set_config('request.headers','{}',true);
  else
   if case_number=2 then update public.fms_account_set set is_default=false where id=book;update public.fms_account_set set is_default=true where id=other_book;end if;
   result:=app_private.payable_red_blue_posting_payload(record_id);
   if(result->>'exchange_difference')::numeric<>(case when case_number=3 then 3.34 when case_number=4 then -20 else 0 end) then raise exception 'Original bookkeeping rates or FX sign were lost: %',result;end if;
   result:=public.fms_payable_settlement_voucher_secure(record_id,'writeoff',true);
   if jsonb_array_length(result->'lines')<>(case when case_number=2 then 2 else 3 end) then raise exception 'Dedicated red/blue preview did not include the required liability and FX lines: %',result;end if;
   if exists(select 1 from jsonb_array_elements(result->'lines') entry where(entry->>'debit_amount')::numeric<0 or(entry->>'credit_amount')::numeric<0) then raise exception 'Signed exchange preview showed negative debits or credits';end if;
   result:=public.fms_payable_settlement_voucher_secure(record_id,'writeoff',false);
   if result->>'status'<>'generated' or jsonb_array_length(result->'voucher_ids')<>1 then raise exception 'Dedicated red/blue voucher case % was not generated: %, error %',case_number,result,(select last_error from public.fms_posting_event where source_id=record_id and event_code='ap_red_blue_offset_approved');end if;
   generated_voucher_id:=(result->'voucher_ids'->>0)::uuid;
   if not exists(select 1 from public.fms_voucher where id=generated_voucher_id and account_set_id=book and source_id=record_id and source_event_code='ap_red_blue_offset_approved' and total_debit=total_credit)
    or not exists(select 1 from public.fms_voucher_line where voucher_id=generated_voucher_id and subject_id=debit_subject and debit_amount>0)
    or not exists(select 1 from public.fms_voucher_line where voucher_id=generated_voucher_id and subject_id=credit_subject and credit_amount>0) then raise exception 'Red/blue voucher has the wrong liability direction or original book';end if;
   if case_number=3 and not exists(select 1 from public.fms_voucher_line where voucher_id=generated_voucher_id and subject_id=exchange_subject and credit_amount=3.34) then raise exception 'Realized exchange gain was not credited';end if;
   if case_number=4 and not exists(select 1 from public.fms_voucher_line where voucher_id=generated_voucher_id and subject_id=exchange_subject and debit_amount=20) then raise exception 'Realized exchange loss was not debited';end if;
   if case_number>=3 and(not exists(select 1 from public.fms_voucher_line entry join public.fms_currency currency on currency.id=entry.currency_id
    where entry.voucher_id=generated_voucher_id and entry.subject_id=debit_subject and currency.currency_code=primary_currency and entry.exchange_rate=primary_rate
    and entry.original_amount=(case when case_number=3 then 33.33 else 100 end))
    or not exists(select 1 from public.fms_voucher_line entry join public.fms_currency currency on currency.id=entry.currency_id
    where entry.voucher_id=generated_voucher_id and entry.subject_id=credit_subject and currency.currency_code=credit_currency and entry.exchange_rate=credit_rate
    and entry.original_amount=(case when case_number=3 then 33.33 else 90 end))) then raise exception 'FX voucher failed to reduce original-currency balances at the original booked rates';end if;
   blocked:=false;begin perform public.fms_reverse_payable_writeoff_secure(record_id,'有效凭证不能反核销');exception when check_violation then blocked:=true;end;
   if not blocked then raise exception 'Active voucher did not block reversal';end if;
   if case_number=3 then
    result:=public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('relation','payable_red_blue','payable_id',blue_id,'credit_payable_id',credit_id,'amount',66.67)),scheme,posting_date,'最后一笔吸收本位币舍入尾差');
    second_record:=(result->>0)::uuid;
    if(select sum(payable_base_amount) from public.fms_payable_writeoff_record where payable_id=blue_id and status='active')<>720
     or(select sum(credit_base_amount) from public.fms_payable_writeoff_record where credit_payable_id=credit_id and status='active')<>710
     or(app_private.purchase_payable_json(credit_id)->>'face_unpaid_amount')::numeric<>0 then raise exception 'Final partial settlement left local or original-currency rounding residuals';end if;
    perform public.fms_reverse_payable_writeoff_secure(second_record,'恢复尾差分配');
   end if;
   perform public.transition_fms_voucher(generated_voucher_id,'void','回滚验收先作废凭证',null);
   if case_number=2 then update public.fms_account_set set is_default=false where id=other_book;update public.fms_account_set set is_default=true where id=book;end if;
  end if;
  perform public.fms_reverse_payable_writeoff_secure(record_id,'原子恢复红蓝双方余额');
  if(app_private.purchase_payable_json(blue_id)->>'unpaid_amount')::numeric<>primary_price or(app_private.purchase_payable_json(credit_id)->>'unpaid_amount')::numeric<>-credit_price
   or exists(select 1 from public.fms_payable_writeoff_record where id=record_id and(status<>'reversed' or document_no is not null)) then raise exception 'Reversal did not restore both balances and remove only the accounting document';end if;
  select * into posting_event from public.fms_posting_event where source_id=record_id and event_code='ap_red_blue_offset_approved';
  if posting_event.id is not null then posting_event:=app_private.process_fms_posting_event(posting_event.id,true);if posting_event.status<>'ignored' then raise exception 'Forced posting retry revived reversed red/blue history';end if;end if;
  perform set_config('request.jwt.claim.sub',ordinary::text,true);
  update public.fms_payable_writeoff_scheme set automatic=true where id=scheme;
  plan:=public.fms_auto_payable_writeoff_secure(scheme,posting_date,query,false);
  if jsonb_array_length(plan->'items')<>1 or(plan->'items'->0->>'amount')::numeric<>(case when case_number=1 then 80 else 100 end)
   or(plan->'items'->0->>'credit_amount')::numeric<>(case when case_number=1 then 80 when case_number=4 then 87.5 else 100 end)
   or(plan->'items'->0->>'needs_voucher')::boolean<>(case_number<>1) then raise exception 'Automatic quote lost currency, amount allocation or posting decision: %',plan;end if;
  perform public.fms_act_purchase_payable_secure(array[credit_id],'freeze','旧清单不得越过冻结',1);
  blocked:=false;begin perform public.fms_auto_payable_writeoff_secure(scheme,posting_date,query,true,plan->>'plan_token');exception when serialization_failure then blocked:=true;end;
  if not blocked then raise exception 'Stale automatic plan bypassed freeze';end if;
  perform public.fms_act_purchase_payable_secure(array[credit_id],'unfreeze','恢复自动核销来源');
  plan:=public.fms_auto_payable_writeoff_secure(scheme,posting_date,query,false);
  if case_number=2 then perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers','{}',true);end if;
  executed:=public.fms_auto_payable_writeoff_secure(scheme,posting_date,query,true,plan->>'plan_token');
  auto_record_id:=(executed->'record_ids'->>0)::uuid;
  if(executed->>'executed')::boolean is distinct from true or jsonb_array_length(executed->'record_ids')<>1
   or not exists(select 1 from public.fms_payable_writeoff_record where id=auto_record_id and payable_base_amount=(plan->'items'->0->>'payable_base_amount')::numeric
    and credit_base_amount=(plan->'items'->0->>'credit_base_amount')::numeric and needs_voucher=(plan->'items'->0->>'needs_voucher')::boolean) then raise exception 'Automatic execution differed from its authoritative quote';end if;
  if case_number=4 and(app_private.purchase_payable_json(credit_id)->>'face_unpaid_amount')::numeric<>2.5 then raise exception 'Book-equivalent FX allocation misclassified unmatched principal as exchange loss';end if;
  perform public.fms_reverse_payable_writeoff_secure(auto_record_id,'恢复自动对冲双方');
  if case_number=4 then
   plan:=public.fms_auto_payable_writeoff_secure(scheme,posting_date,query||'{"cross_currency_mode":"same_currency"}',false);
   if jsonb_array_length(plan->'items')<>0 then raise exception 'Same-currency-only mode matched different currencies';end if;
   plan:=public.fms_auto_payable_writeoff_secure(scheme,posting_date,query||'{"cross_currency_mode":"full_pair"}',false);
   if(plan->'items'->0->>'credit_amount')::numeric<>90 or(plan->'items'->0->>'exchange_difference')::numeric<>-20 then raise exception 'Explicit full-pair FX mode ignored original rates or secondary principal';end if;
   executed:=public.fms_auto_payable_writeoff_secure(scheme,posting_date,query||'{"cross_currency_mode":"full_pair"}',true,plan->>'plan_token');
   perform public.fms_reverse_payable_writeoff_secure((executed->'record_ids'->>0)::uuid,'恢复全额异币对冲');
  end if;
  perform set_config('request.jwt.claim.sub',ordinary::text,true);
 end loop;
 query:=jsonb_build_object('relation','payable_red_blue','document_ids',document_ids,'cross_currency_mode','same_currency');
 plan:=public.fms_auto_payable_writeoff_secure(scheme,posting_date,query,false);
 if plan->'total_amount'<>'null'::jsonb or jsonb_array_length(plan->'currency_totals')<>2
  or not exists(select 1 from jsonb_array_elements(plan->'currency_totals') total where total->>'currency_code'='CNY' and(total->>'amount')::numeric=180)
  or not exists(select 1 from jsonb_array_elements(plan->'currency_totals') total where total->>'currency_code'='USD' and(total->>'amount')::numeric=100) then raise exception 'Mixed currencies were added into an invalid yuan total: %',plan;end if;
 select count(*) into before_auto from public.fms_payable_writeoff_record where status='active';
 perform set_config('request.jwt.claim.sub',actor::text,true);
 insert into public.sys_role(role_code,role_name,tenant_id,enabled) values(fixture||'_AUTO','红蓝自动专用回滚角色',tenant,true) returning id into limited_role;
 insert into public.sys_role_menu(role_id,menu_id,tenant_id) select limited_role,id,tenant from public.sys_menu where name in('FinancePayableWriteoff:View','FinancePayableWriteoff:AutoWriteoff','FinancePayableWriteoff:Reverse','FinancePurchasePayable:View');
 update public.sys_user set user_roles=array[fixture||'_AUTO'] where auth_user_id=ordinary;
 perform set_config('request.jwt.claim.sub',ordinary::text,true);
 blocked:=false;begin perform public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('relation','payable_red_blue','payable_id',document_ids->>0,'credit_payable_id',document_ids->>1,'amount',1)),scheme,posting_date,'只有自动权限不能手工核销');exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Auto-only role called the manual writeoff API';end if;
 executed:=public.fms_auto_payable_writeoff_secure(scheme,posting_date,query,true,plan->>'plan_token');
 blocked:=false;begin perform public.fms_auto_payable_writeoff_secure(scheme,posting_date,query,true,plan->>'plan_token');exception when serialization_failure then blocked:=true;end;
 if not blocked or(select count(*) from public.fms_payable_writeoff_record where status='active')<>before_auto+jsonb_array_length(executed->'record_ids') then raise exception 'Automatic replay duplicated an accounting offset';end if;
 for auto_record_id in select value::uuid from jsonb_array_elements_text(executed->'record_ids') loop perform public.fms_reverse_payable_writeoff_secure(auto_record_id,'恢复多币种自动批次');end loop;
 perform set_config('request.jwt.claim.sub',actor::text,true);update public.sys_user set user_roles=original_roles where auth_user_id=ordinary;perform set_config('request.jwt.claim.sub',ordinary::text,true);
 if(select count(*) from public.fms_fund_ledger_entry)<>fund_count then raise exception 'Red/blue accounting settlement created a cash movement';end if;
 if has_function_privilege('authenticated','app_private.apply_payable_red_blue_writeoff(uuid,uuid,numeric,numeric,date,uuid,text,boolean)','execute')
  or has_function_privilege('anon','app_private.payable_red_blue_posting_payload(uuid)','execute') then raise exception 'Private red/blue policy was exposed to clients';end if;
end $test$;

rollback;
