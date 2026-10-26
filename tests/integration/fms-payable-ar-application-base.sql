begin;
set local jit=off;
set local statement_timeout='8s';

create function pg_temp.prepare_ar_application_base(p_currency text) returns jsonb
language plpgsql as $test$
declare tenant uuid;actor uuid;profile uuid;original_roles text[];fixture_role uuid;fixture_code text:='QA_AR_BASE_'||upper(left(gen_random_uuid()::text,8));
 book uuid;currency_ident uuid;customer uuid;organization uuid;financial_type uuid;resource_ident uuid;field_ident uuid;document_ident uuid;line_ident uuid;payload jsonb;
 rate_value numeric:=case when p_currency='CNY' then 1 else 7.333333 end;context_value jsonb;
begin
 if p_currency not in('CNY','USD') then raise exception 'Unsupported application fixture currency';end if;
 select id into tenant from public.sys_tenant where tenant_code='qa-payable-20261022';
 select id,auth_user_id,user_roles into profile,actor,original_roles from public.sys_user where tenant_id=tenant and auth_user_id is not null and status='1' order by id limit 1;
 select id into book from public.fms_account_set where tenant_id=tenant and is_default and status='active' and base_currency_code='CNY';
 select id into customer from public.mdm_customer where tenant_id=tenant and enabled order by id limit 1;
 select id into organization from public.mdm_organization where tenant_id=tenant and organization_type='company' and status='1' order by id limit 1;
 select id into financial_type from public.mdm_document_type where tenant_id=tenant and document_type_code='AR_FIN_STANDARD';
 if actor is null or book is null or customer is null or organization is null then raise exception 'Missing isolated ordinary AR application fixtures';end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers','{}',true);
 if app_private.is_platform_super() then raise exception 'Application fixture must use an ordinary actor';end if;
 insert into public.sys_role(tenant_id,role_code,role_name,enabled) values(tenant,fixture_code,'应收本位币分摊回滚角色',true) returning id into fixture_role;
 insert into public.sys_role_menu(role_id,menu_id,tenant_id) select fixture_role,id,tenant from public.sys_menu where name in(
  'FinanceFinancialReceivable','FinanceFinancialReceivable:View','FinanceFinancialReceivable:Add','FinanceFinancialReceivable:Edit','FinanceFinancialReceivable:Submit','FinanceFinancialReceivable:Approve',
  'FinanceReceiptWriteoff','FinanceReceiptWriteoff:View','FinanceReceiptWriteoff:Check','FinanceReceiptWriteoff:Writeoff','FinanceReceiptWriteoff:Special');
 update public.sys_user set user_roles=array[fixture_code] where id=profile;
 select resource.id,field.id into resource_ident,field_ident from public.sys_permission_resource resource join public.sys_permission_field field on field.resource_id=resource.id and field.tenant_id=resource.tenant_id
  where resource.tenant_id=tenant and resource.resource_key='fms.receivable' and field.field_key='amounts';
 insert into public.sys_role_field_permission(tenant_id,role_id,resource_id,field_id,access_level,create_by)
 values(tenant,fixture_role,resource_ident,field_ident,'edit',actor::text);
 if p_currency='USD' then
  insert into public.fms_currency(tenant_id,account_set_id,currency_code,currency_name,is_enabled)
  values(tenant,book,'USD','美元',true) on conflict(account_set_id,currency_code) do update set is_enabled=true returning id into currency_ident;
  insert into public.fms_exchange_rate(tenant_id,account_set_id,currency_id,rate_date,rate_type,direct_rate)
  values(tenant,book,currency_ident,app_private.payable_business_date(),'spot',rate_value)
  on conflict(account_set_id,currency_id,rate_date,rate_type) do update set direct_rate=excluded.direct_rate;
 end if;
 payload:=jsonb_build_object('kind','financial','tenantId',tenant,'documentTypeId',financial_type,'customerId',customer,'settlementOrganizationId',organization,
  'businessDate',app_private.payable_business_date(),'currencyCode',p_currency,'settlementMethod','cash',
  'lines',jsonb_build_array(
   jsonb_build_object('lineNo',10,'basis','amount','materialDescription','本位币累计尾差首行','enteredGrossAmount',0.03,'quantity',0,'unitPrice',0,'priceBasis','taxed','taxRate',0,'discountMethod','none'),
   jsonb_build_object('lineNo',20,'basis','amount','materialDescription','本位币累计尾差次行','enteredGrossAmount',0.01,'quantity',0,'unitPrice',0,'priceBasis','taxed','taxRate',0,'discountMethod','none')));
 document_ident:=public.fms_save_receivable_document_secure(payload);
 perform public.fms_act_receivable_document_secure(document_ident,'submit');
 perform public.fms_act_receivable_document_secure(document_ident,'approve');
 select id into line_ident from public.fms_receivable_line where document_id=document_ident and line_no=10;
 context_value:=jsonb_build_object('tenant',tenant,'actor',actor,'book',book,'document',document_ident,'line',line_ident,'currency',p_currency,'rate',rate_value,
  'profile',profile,'original_roles',to_jsonb(original_roles),'fixture_role_code',fixture_code,'organization',organization);
 perform set_config('qa.ar_application_base_'||lower(p_currency),context_value::text,true);
 update public.sys_user set user_roles=original_roles where id=profile;
 return context_value;
end $test$;

create function pg_temp.check_ar_application_base(p_currency text) returns jsonb
language plpgsql as $test$
declare context_value jsonb:=current_setting('qa.ar_application_base_'||lower(p_currency))::jsonb;tenant uuid;actor uuid;line_ident uuid;document_ident uuid;application_ident uuid;
 originals uuid[]:='{}';balance_value jsonb;step integer;expected_base numeric;blocked boolean;origin public.fms_receivable_application;before_value jsonb;initial_total numeric;zero_ident uuid;currency_ident uuid;
begin
 tenant:=(context_value->>'tenant')::uuid;actor:=(context_value->>'actor')::uuid;line_ident:=(context_value->>'line')::uuid;document_ident:=(context_value->>'document')::uuid;
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers','{}',true);
 select sum((app_private.ar_line_book_balance(id)->>'initial_base_amount')::numeric) into initial_total from public.fms_receivable_line where document_id=document_ident;
 if initial_total<>round(0.04*(context_value->>'rate')::numeric,2) then raise exception 'Line bases do not sum to the booked document base';end if;
 insert into public.fms_receivable_application(tenant_id,financial_line_id,event_kind,source_type,source_id,event_date,amount,effect,status,created_by_auth_user_id)
 values(tenant,line_ident,'writeoff_bad_debt','writeoff',gen_random_uuid(),app_private.payable_business_date(),0,1,'approved',actor) returning id into zero_ident;
 if(app_private.ar_line_book_balance(line_ident)->>'original_remaining')::numeric<>0.03 then raise exception 'A zero-value audit event blocked or changed a real foreign carrying balance';end if;
 blocked:=false;
 begin update public.fms_receivable_application set amount=0.01 where id=zero_ident;exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'A zero-value approved audit row was repurposed into an unverified monetary application';end if;
 select currency_id into currency_ident from public.fms_receivable_document where id=document_ident;
 blocked:=false;
 begin
  insert into public.fms_receivable_application(tenant_id,financial_line_id,event_kind,source_type,source_id,event_date,amount,effect,status,created_by_auth_user_id,
   ledger_account_set_id,ledger_currency_id,ledger_currency_code,ledger_base_currency_code,ledger_exchange_rate,ledger_base_amount,ledger_snapshot_version)
  values(tenant,line_ident,'writeoff_bad_debt','writeoff',gen_random_uuid(),app_private.payable_business_date(),0,1,'approved',actor,
   (context_value->>'book')::uuid,currency_ident,p_currency,'CNY',(context_value->>'rate')::numeric,0,1);
 exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'A zero-value row bypassed the system-managed snapshot boundary';end if;
 for step in 1..3 loop
  insert into public.fms_receivable_application(tenant_id,financial_line_id,event_kind,source_type,source_id,event_date,amount,effect,status,created_by_auth_user_id,approved_at)
  values(tenant,line_ident,'writeoff_bad_debt','writeoff',gen_random_uuid(),app_private.payable_business_date(),0.01,1,'approved',actor,clock_timestamp()) returning id into application_ident;
  originals:=array_append(originals,application_ident);
  expected_base:=case when p_currency='CNY' then 0.01 when step=3 then 0.08 else 0.07 end;
  if not exists(select 1 from public.fms_receivable_application where id=application_ident and ledger_snapshot_version=1 and ledger_account_set_id=(context_value->>'book')::uuid
   and ledger_currency_code=p_currency and ledger_exchange_rate=(context_value->>'rate')::numeric and ledger_base_amount=expected_base) then raise exception 'Partial application did not use the historical booked base and final cent';end if;
  if not exists(select 1 from public.fms_receivable_debt_allocation where applied_application_id=application_ident and amount=0.01 and effect=1) then raise exception 'Base capture bypassed native nominal debt allocation';end if;
 end loop;
 balance_value:=app_private.ar_line_book_balance(line_ident);
 if(balance_value->>'original_remaining')::numeric<>0 or(balance_value->>'base_remaining')::numeric<>0 then raise exception 'Full nominal settlement left a carrying-base cent';end if;
 blocked:=false;
 begin
  insert into public.fms_receivable_application(tenant_id,financial_line_id,event_kind,source_type,source_id,event_date,amount,effect,status,created_by_auth_user_id)
  values(tenant,line_ident,'writeoff_bad_debt','writeoff',gen_random_uuid(),app_private.payable_business_date(),0.01,1,'approved',actor);
 exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Fully allocated source accepted another application';end if;
 blocked:=false;
 begin update public.fms_receivable_application set ledger_base_amount=ledger_base_amount+0.01 where id=originals[1];exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Confirmed local allocation could be rewritten';end if;
 blocked:=false;
 begin update public.fms_receivable_application set event_kind='payment_request',amount=0 where id=originals[1];exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Changing a confirmed monetary event type bypassed nominal immutability';end if;
 blocked:=false;
 begin delete from public.fms_receivable_application where id=originals[1];exception when foreign_key_violation then blocked:=true;end;
 if not blocked then raise exception 'Confirmed original/base history could be deleted';end if;
 if p_currency='USD' then
  update public.fms_exchange_rate set direct_rate=99 where tenant_id=tenant and account_set_id=(context_value->>'book')::uuid and rate_date=app_private.payable_business_date()
   and currency_id in(select id from public.fms_currency where account_set_id=(context_value->>'book')::uuid and currency_code='USD');
 end if;
 foreach application_ident in array originals loop
  select * into origin from public.fms_receivable_application where id=application_ident;
  before_value:=app_private.ar_line_book_balance(line_ident);
  insert into public.fms_receivable_application(tenant_id,financial_line_id,event_kind,source_type,source_id,event_date,amount,effect,status,created_by_auth_user_id,reversal_application_id,approved_at)
  values(tenant,line_ident,origin.event_kind,'writeoff',gen_random_uuid(),app_private.payable_business_date(),origin.amount,-1,'approved',actor,origin.id,clock_timestamp()) returning id into application_ident;
  if not exists(select 1 from public.fms_receivable_application where id=application_ident and ledger_base_amount=origin.ledger_base_amount and ledger_exchange_rate=origin.ledger_exchange_rate) then
   raise exception 'Reversal revalued the original application at the current master rate';end if;
  balance_value:=app_private.ar_line_book_balance(line_ident);
  if(balance_value->>'base_remaining')::numeric<>(before_value->>'base_remaining')::numeric+origin.ledger_base_amount then raise exception 'Reversal did not restore its exact local amount';end if;
 end loop;
 if app_private.ar_line_balance(line_ident,false)<>0.03 or(balance_value->>'original_remaining')::numeric<>0.03
  or(balance_value->>'base_remaining')::numeric<>(balance_value->>'initial_base_amount')::numeric then raise exception 'Reversal failed to restore both authoritative balances';end if;
 if has_function_privilege('authenticated','app_private.ar_line_book_balance(uuid,uuid)','EXECUTE') or has_function_privilege('anon','app_private.capture_ar_application_book()','EXECUTE') then
  raise exception 'Internal local-base controls became client executable';end if;
 return jsonb_build_object('currency',p_currency,'status','passed','applications',3,'reversals',3,'initial_document_base',initial_total);
end $test$;

create function pg_temp.check_native_ar_application_base(p_currency text) returns jsonb
language plpgsql as $test$
declare context_value jsonb:=current_setting('qa.ar_application_base_'||lower(p_currency))::jsonb;payload jsonb;writeoff_ident uuid;step integer;expected_base numeric;
 original_roles text[];tenant uuid:=(context_value->>'tenant')::uuid;book uuid:=(context_value->>'book')::uuid;line_ident uuid:=(context_value->>'line')::uuid;
begin
 perform set_config('request.jwt.claim.sub',context_value->>'actor',true);perform set_config('request.headers','{}',true);
 select array_agg(value) into original_roles from jsonb_array_elements_text(context_value->'original_roles');
 update public.sys_user set user_roles=array[context_value->>'fixture_role_code'] where id=(context_value->>'profile')::uuid;
 insert into public.fms_opening_balance_control(tenant_id,account_set_id,fiscal_year,status,confirmed_at,confirmed_by)
 values(tenant,book,extract(year from app_private.payable_business_date())::integer,'confirmed',clock_timestamp(),context_value->>'actor')
 on conflict(account_set_id,fiscal_year) do update set status='confirmed';
 for step in 1..3 loop
  payload:=jsonb_build_object('relationKind','special','writeoffDate',app_private.payable_business_date(),'organizationId',context_value->>'organization',
   'reason','回滚验收原生应收本位币尾差','sides',jsonb_build_array(jsonb_build_object('side','primary','sourceType','financial','id',line_ident,'amount',0.01)));
  perform public.fms_check_receivable_writeoff_secure(payload);
  writeoff_ident:=public.fms_execute_receivable_writeoff_secure(payload);
  expected_base:=case when p_currency='CNY' then 0.01 when step=3 then 0.08 else 0.07 end;
  if not exists(select 1 from public.fms_receivable_writeoff_side where writeoff_id=writeoff_ident and source_id=line_ident and base_amount=expected_base)
   or not exists(select 1 from public.fms_receivable_application where source_type='writeoff' and source_id=writeoff_ident and financial_line_id=line_ident and ledger_base_amount=expected_base) then
   raise exception 'Native AR side and authoritative application disagree on the historical final cent';end if;
 end loop;
 if(app_private.ar_line_book_balance(line_ident)->>'base_remaining')::numeric<>0 then raise exception 'Native AR settlement did not clear its source carrying base';end if;
 update public.sys_user set user_roles=original_roles where id=(context_value->>'profile')::uuid;
 return jsonb_build_object('currency',p_currency,'status','passed','native_operations',3);
end $test$;

create function pg_temp.check_ar_application_base_batch(p_currency text) returns jsonb
language plpgsql as $test$
declare context_value jsonb:=current_setting('qa.ar_application_base_'||lower(p_currency))::jsonb;tenant uuid:=(context_value->>'tenant')::uuid;
 actor uuid:=(context_value->>'actor')::uuid;line_ident uuid:=(context_value->>'line')::uuid;source_ident uuid:=gen_random_uuid();origin public.fms_receivable_application;
 increase_ident uuid;decrease_ident uuid;initial_base numeric;expected_increase numeric;blocked boolean;
begin
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers','{}',true);
 initial_base:=(app_private.ar_line_book_balance(line_ident)->>'initial_base_amount')::numeric;
 insert into public.fms_receivable_application(tenant_id,financial_line_id,event_kind,source_type,source_id,source_line_id,event_date,amount,effect,status,created_by_auth_user_id,approved_at)
 select tenant,line_ident,'writeoff_bad_debt','writeoff',source_ident,gen_random_uuid(),app_private.payable_business_date(),0.01,1,'approved',actor,clock_timestamp() from generate_series(1,3);
 if app_private.ar_line_balance(line_ident,false)<>0 or(app_private.ar_line_book_balance(line_ident)->>'base_remaining')::numeric<>0 then
  raise exception 'One multirow statement did not consume the final local cent exactly once';end if;
 for origin in select * from public.fms_receivable_application where source_id=source_ident order by id loop
  insert into public.fms_receivable_application(tenant_id,financial_line_id,event_kind,source_type,source_id,event_date,amount,effect,status,created_by_auth_user_id,reversal_application_id)
  values(tenant,line_ident,origin.event_kind,'writeoff',gen_random_uuid(),app_private.payable_business_date(),origin.amount,-1,'approved',actor,origin.id);
 end loop;
 expected_increase:=round(0.01*(context_value->>'rate')::numeric,2);
 insert into public.fms_receivable_application(tenant_id,financial_line_id,event_kind,source_type,source_id,event_date,amount,effect,status,created_by_auth_user_id)
 values(tenant,line_ident,'adjustment','adjustment',gen_random_uuid(),app_private.payable_business_date(),0.01,-1,'approved',actor) returning id into increase_ident;
 blocked:=false;
 begin delete from public.fms_receivable_application where id=increase_ident;exception when foreign_key_violation then blocked:=true;end;
 if not blocked then raise exception 'A confirmed debt-origin snapshot without child allocations could be deleted';end if;
 if(app_private.ar_line_book_balance(line_ident)->>'base_remaining')::numeric<>initial_base+expected_increase then
  raise exception 'New nominal debt origin used a current rather than original booking rate';end if;
 insert into public.fms_receivable_application(tenant_id,financial_line_id,event_kind,source_type,source_id,event_date,amount,effect,status,created_by_auth_user_id)
 values(tenant,line_ident,'writeoff_bad_debt','writeoff',gen_random_uuid(),app_private.payable_business_date(),0.04,1,'approved',actor) returning id into decrease_ident;
 if(app_private.ar_line_book_balance(line_ident)->>'base_remaining')::numeric<>0 then raise exception 'Increased debt could not be closed with its actual carrying base';end if;
 for origin in select * from public.fms_receivable_application where id=decrease_ident or id=increase_ident order by effect desc loop
  insert into public.fms_receivable_application(tenant_id,financial_line_id,event_kind,source_type,source_id,event_date,amount,effect,status,created_by_auth_user_id,reversal_application_id)
  values(tenant,line_ident,origin.event_kind,'writeoff',gen_random_uuid(),app_private.payable_business_date(),origin.amount,-origin.effect,'approved',actor,origin.id);
 end loop;
 if(app_private.ar_line_book_balance(line_ident)->>'original_remaining')::numeric<>0.03 or(app_private.ar_line_book_balance(line_ident)->>'base_remaining')::numeric<>initial_base then
  raise exception 'New debt origins and their native reverse allocations did not restore the original pool';end if;
 blocked:=false;
 begin
  insert into public.fms_receivable_application(tenant_id,financial_line_id,event_kind,source_type,source_id,event_date,amount,effect,status,created_by_auth_user_id,ledger_account_set_id,ledger_base_amount,ledger_snapshot_version)
  values(tenant,line_ident,'writeoff_bad_debt','writeoff',gen_random_uuid(),app_private.payable_business_date(),0.01,1,'approved',actor,(context_value->>'book')::uuid,0.01,1);
 exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Caller-supplied ledger snapshots were trusted';end if;
 return jsonb_build_object('currency',p_currency,'status','passed','batch_rows',3,'debt_origin_reversal',true);
end $test$;

select pg_temp.prepare_ar_application_base('CNY');
select pg_temp.prepare_ar_application_base('USD');
select pg_temp.check_ar_application_base('CNY');
select pg_temp.check_ar_application_base('USD');
select pg_temp.check_ar_application_base_batch('CNY');
select pg_temp.check_ar_application_base_batch('USD');
select pg_temp.check_native_ar_application_base('CNY');
select pg_temp.check_native_ar_application_base('USD');
rollback;
