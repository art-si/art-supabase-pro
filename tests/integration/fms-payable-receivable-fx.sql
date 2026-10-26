begin;
set local jit=off;
set local statement_timeout='8s';

create function pg_temp.prepare_payable_receivable_fx(p_case integer) returns jsonb
language plpgsql as $prepare$
declare context_value jsonb;tenant uuid;actor uuid;book uuid;other_book uuid;platform_actor uuid;foreign_tenant uuid;supplier uuid;material uuid;unit_ident uuid;
 finance_type uuid;scheme_ident uuid;finance jsonb;original_roles text[];foreign_document uuid;foreign_line uuid;customer uuid;
 primary_currency text:=case when p_case<=2 then 'USD' else 'CNY' end;primary_rate numeric:=case when p_case<=2 then 7 else 1 end;
 original_amount numeric:=case when p_case<=2 then 0.03 else 0.24 end;
begin
 if p_case not between 1 and 4 then raise exception 'Unknown AP/AR FX case';end if;
 if has_function_privilege('authenticated','app_private.apply_payable_receivable_writeoff(uuid,uuid,numeric,date,uuid,text,boolean,numeric)','EXECUTE')
  or has_function_privilege('anon','app_private.apply_payable_receivable_writeoff(uuid,uuid,numeric,date,uuid,text,boolean,numeric)','EXECUTE') then
  raise exception 'Private FX offset kernel became client executable';end if;
 context_value:=pg_temp.prepare_ar_application_base('USD');
 tenant:=(context_value->>'tenant')::uuid;actor:=(context_value->>'actor')::uuid;book:=(context_value->>'book')::uuid;
 select array_agg(value) into original_roles from jsonb_array_elements_text(context_value->'original_roles');
 insert into public.sys_role_menu(role_id,menu_id,tenant_id)
 select role.id,menu.id,tenant from public.sys_role role cross join public.sys_menu menu where role.tenant_id=tenant and role.role_code=context_value->>'fixture_role_code'
  and menu.name in('FinanceReceiptWriteoff:Writeoff','FinanceReceiptWriteoff:Reverse','FinanceReceiptWriteoff:CrossCustomer','FinanceReceiptWriteoff:CrossCurrency') on conflict do nothing;
 update public.sys_user set user_roles=original_roles||array[context_value->>'fixture_role_code'] where id=(context_value->>'profile')::uuid;
 insert into public.mdm_supplier(tenant_id,supplier_code,supplier_name)
 values(tenant,'AP_AR_FX_'||upper(left(gen_random_uuid()::text,8)),'原账套外币抵销回滚主体'||upper(left(gen_random_uuid()::text,8))) returning id into supplier;
 select id,inventory_unit_id into material,unit_ident from public.mdm_material where tenant_id=tenant and inventory_unit_id is not null order by id limit 1;
 select id into finance_type from public.mdm_document_type where tenant_id=tenant and document_type_code='AP_FIN_STANDARD';
 finance:=public.fms_save_purchase_payable_secure(jsonb_build_object('tenant_id',tenant,'kind','financial','document_type_id',finance_type,'supplier_id',supplier,
  'business_date',app_private.payable_business_date(),'currency_code',primary_currency,'exchange_rate',primary_rate,
  'lines',jsonb_build_array(jsonb_build_object('material_id',material,'inventory_unit_id',unit_ident,'quantity',1,'unit_price',original_amount,'tax_rate',0))));
 perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'submit');
 perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'approve');
 insert into public.fms_payable_writeoff_scheme(tenant_id,code,name,rules)
 values(tenant,'AP_AR_FX_'||upper(left(gen_random_uuid()::text,8)),'原账套异币抵销回滚方案',
  jsonb_build_array(jsonb_build_object('primary_field','business_date','secondary_field','business_date','operator','eq','empty_matches',false))) returning id into scheme_ident;
 insert into public.fms_opening_balance_control(tenant_id,account_set_id,fiscal_year,status,confirmed_at,confirmed_by)
 values(tenant,book,extract(year from app_private.payable_business_date())::integer,'confirmed',clock_timestamp(),actor::text)
 on conflict(account_set_id,fiscal_year) do update set status='confirmed';
 insert into public.fms_account_set(tenant_id,account_set_code,account_set_name,legal_entity_name,enabled_on,status)
 values(tenant,'AR_FX_BOOK_'||upper(left(gen_random_uuid()::text,8)),'异币抵销真实第二账套回滚夹具','虚构回滚主体',app_private.payable_business_date(),'active') returning id into other_book;
 update public.fms_account_set set is_default=false where id=book;
 update public.fms_account_set set is_default=true where id=other_book;
 select customer_id into customer from public.fms_receivable_document where id=(context_value->>'document')::uuid;
 insert into public.fms_receivable_document(tenant_id,document_no,kind,status,customer_id,settlement_organization_id,business_date,amount,total_amount,created_by_auth_user_id)
 values(tenant,'AR_FX_OTHER_'||upper(left(gen_random_uuid()::text,8)),'financial','approved',customer,(context_value->>'organization')::uuid,app_private.payable_business_date(),1,1,actor) returning id into foreign_document;
 insert into public.fms_receivable_line(tenant_id,document_id,line_no,basis,material_description,quantity,amount,total_amount,tax_rate)
 values(tenant,foreign_document,10,'amount','真实第二账套抵销拒绝来源',1,1,1,0) returning id into foreign_line;
 update public.fms_account_set set is_default=false where id=other_book;
 update public.fms_account_set set is_default=true where id=book;
 update public.fms_exchange_rate set direct_rate=99 where account_set_id=book and rate_date=app_private.payable_business_date()
  and currency_id in(select id from public.fms_currency where account_set_id=book and currency_code='USD');
 select id into foreign_tenant from public.sys_tenant where id<>tenant and status='1' and builtin_type is distinct from 'platform' order by id limit 1;
 if foreign_tenant is null then raise exception 'Missing foreign scope fixture';end if;
 if p_case=2 then perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',foreign_tenant)::text,true);end if;
 if p_case>=3 then
  select auth_user_id into platform_actor from public.sys_user where auth_user_id is not null and status='1' and user_roles @>array['R_SUPER'] order by id limit 1;
  perform set_config('request.jwt.claim.sub',platform_actor::text,true);
  if app_private.is_platform_super() is distinct from true then raise exception 'Missing platform AP/AR actor';end if;
  if p_case=4 then perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',tenant)::text,true);end if;
 end if;
 context_value:=context_value||jsonb_build_object('case',p_case,'payable',finance->>'id','supplier',supplier,'primary_currency',primary_currency,'primary_rate',primary_rate,
  'primary_amount',original_amount,'other_book',other_book,'foreign_line',foreign_line,'foreign_tenant',foreign_tenant,'scheme',scheme_ident,
  'fund_count',(select count(*) from public.fms_fund_ledger_entry));
 perform set_config('qa.ap_ar_fx_'||p_case,context_value::text,true);
 return context_value;
end $prepare$;

create function pg_temp.match_payable_receivable_fx(p_case integer) returns jsonb
language plpgsql as $match$
declare context_value jsonb:=current_setting('qa.ap_ar_fx_'||p_case)::jsonb;tenant uuid:=(context_value->>'tenant')::uuid;payable uuid:=(context_value->>'payable')::uuid;
 receivable_line uuid:=(context_value->>'line')::uuid;scheme uuid:=(context_value->>'scheme')::uuid;item jsonb;records jsonb:='[]';result jsonb;record_ident uuid;
 application_ident uuid;step integer;primary_amount numeric:=case when p_case<=2 then 0.01 else 0.08 end;primary_local numeric:=case when p_case<=2 then 0.07 else 0.08 end;
 receivable_local numeric;blocked boolean;
begin
 item:=jsonb_build_object('relation','payable_receivable','payable_id',payable,'receivable_line_id',receivable_line,'amount',primary_amount,'receivable_amount',0.01,'allow_cross_party',true);
 blocked:=false;
 begin perform public.fms_payable_writeoff_secure(jsonb_build_array(item||jsonb_build_object('allow_cross_party',false)),scheme,app_private.payable_business_date(),'禁止静默跨往来');
 exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'FX offset bypassed explicit cross-counterparty confirmation';end if;
 blocked:=false;
 begin perform public.fms_payable_writeoff_secure(jsonb_build_array(item||jsonb_build_object('receivable_line_id',context_value->>'foreign_line')),scheme,app_private.payable_business_date(),'真实跨账套拒绝');
 exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'FX offset accepted sources from different actual books';end if;
 blocked:=false;
 begin perform public.fms_payable_writeoff_secure(jsonb_build_array(case when p_case<=2 then item||jsonb_build_object('receivable_amount',0.02) else item-'receivable_amount' end),scheme,app_private.payable_business_date(),'原币金额明确校验');
 exception when check_violation or invalid_parameter_value then blocked:=true;end;
 if not blocked then raise exception 'FX offset silently inferred a cross-currency original or accepted unequal same-currency originals';end if;
 application_ident:=gen_random_uuid();
 insert into public.fms_receivable_application(id,tenant_id,financial_line_id,event_kind,source_type,source_id,event_date,amount,status,created_by_auth_user_id)
 values(application_ident,tenant,receivable_line,'payment_request','fixture',application_ident,app_private.payable_business_date(),0.03,'draft',(context_value->>'actor')::uuid);
 blocked:=false;
 begin perform public.fms_payable_writeoff_secure(jsonb_build_array(item),scheme,app_private.payable_business_date(),'原应收预留保护');exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'FX offset consumed a reserved native AR line';end if;
 update public.fms_receivable_application set status='voided' where id=application_ident;
 if p_case=2 then
  update public.fms_account_set set is_default=false where id=(context_value->>'book')::uuid;
  update public.fms_account_set set is_default=true where id=(context_value->>'other_book')::uuid;
 end if;
 for step in 1..3 loop
  result:=public.fms_payable_writeoff_secure(jsonb_build_array(item),scheme,app_private.payable_business_date(),'双方原汇率抵销及分摊尾差');
  record_ident:=(result->>0)::uuid;records:=records||to_jsonb(record_ident);receivable_local:=case when step=3 then 0.08 else 0.07 end;
  if not exists(select 1 from public.fms_payable_writeoff_record where id=record_ident and tenant_id=tenant and amount=primary_amount and receivable_amount=0.01
   and payable_base_amount=primary_local and receivable_base_amount=receivable_local and fx_snapshot_version=1 and payment_amount=0 and cash_discount_amount=0 and account_set_id=(context_value->>'book')::uuid)
   or not exists(select 1 from public.fms_receivable_application where payable_writeoff_id=record_ident and amount=0.01 and effect=1 and ledger_base_amount=receivable_local)
   or app_private.payable_receivable_writeoff_valid(record_ident) is distinct from true then raise exception 'FX offset lost original amounts, historical carrying bases or native AR allocation';end if;
  if not exists(select 1 from public.fms_receivable_debt_allocation allocation join public.fms_receivable_application application on application.id=allocation.applied_application_id
   where application.payable_writeoff_id=record_ident and allocation.amount=0.01 and allocation.effect=1) then raise exception 'FX offset bypassed native AR debt ownership';end if;
 end loop;
 set constraints payable_receivable_record_consistency,payable_receivable_application_consistency immediate;
 if(app_private.payable_writeoff_source_values(payable)->>'unpaid_amount')::numeric<>0 or app_private.payable_unwritten_base_amount(payable)<>0
  or app_private.ar_line_balance(receivable_line,false)<>0 or(app_private.ar_line_book_balance(receivable_line)->>'base_remaining')::numeric<>0 then
  raise exception 'FX offset did not close both original and local base pools';end if;
 blocked:=false;
 begin update public.fms_payable_writeoff_record set receivable_base_amount=receivable_base_amount+0.01 where id=record_ident;exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Confirmed AR carrying snapshot could be rewritten';end if;
 if(select count(*) from public.fms_fund_ledger_entry)<>(context_value->>'fund_count')::bigint then raise exception 'Book offset created actual cash movement';end if;
 perform set_config('qa.ap_ar_fx_'||p_case,(context_value||jsonb_build_object('records',records))::text,true);
 set constraints payable_receivable_record_consistency,payable_receivable_application_consistency deferred;
 return jsonb_build_object('case',p_case,'status','passed','records',records,'primary_currency',context_value->>'primary_currency','secondary_currency','USD');
end $match$;

create function pg_temp.reverse_payable_receivable_fx(p_case integer) returns jsonb
language plpgsql as $reverse$
declare context_value jsonb:=current_setting('qa.ap_ar_fx_'||p_case)::jsonb;record_ident uuid;original_roles text[];blocked boolean;
begin
 if p_case=4 then
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',context_value->>'foreign_tenant')::text,true);
  blocked:=false;
  begin perform public.fms_reverse_payable_writeoff_secure((context_value->'records'->>0)::uuid,'跨租户反核销拒绝');exception when insufficient_privilege then blocked:=true;end;
  if not blocked then raise exception 'Platform selected a foreign tenant and reversed an original tenant record';end if;
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',context_value->>'tenant')::text,true);
 end if;
 for record_ident in select value::uuid from jsonb_array_elements_text(context_value->'records') loop
  perform public.fms_reverse_payable_writeoff_secure(record_ident,'按原币及原本位币分摊完整反核销');
  if not exists(select 1 from public.fms_receivable_application reverse_row join public.fms_receivable_application original on original.id=reverse_row.reversal_application_id
   where reverse_row.payable_writeoff_id=record_ident and reverse_row.effect=-1 and reverse_row.amount=original.amount and reverse_row.ledger_base_amount=original.ledger_base_amount
    and reverse_row.ledger_exchange_rate=original.ledger_exchange_rate and reverse_row.ledger_account_set_id=original.ledger_account_set_id) then
   raise exception 'FX reversal did not append an exact native AR original/base counterentry';end if;
 end loop;
 set constraints payable_receivable_record_consistency,payable_receivable_application_consistency immediate;
 if(app_private.payable_writeoff_source_values((context_value->>'payable')::uuid)->>'unpaid_amount')::numeric<>(context_value->>'primary_amount')::numeric
  or app_private.payable_unwritten_base_amount((context_value->>'payable')::uuid)<>round((context_value->>'primary_amount')::numeric*(context_value->>'primary_rate')::numeric,2)
  or app_private.ar_line_balance((context_value->>'line')::uuid,false)<>0.03 or(app_private.ar_line_book_balance((context_value->>'line')::uuid)->>'base_remaining')::numeric<>0.22 then
  raise exception 'FX reverse failed to restore both original and local pools';end if;
 if p_case=2 then
  update public.fms_account_set set is_default=false where id=(context_value->>'other_book')::uuid;
  update public.fms_account_set set is_default=true where id=(context_value->>'book')::uuid;
 end if;
 if(select count(*) from public.fms_fund_ledger_entry)<>(context_value->>'fund_count')::bigint then raise exception 'FX reverse created cash movement';end if;
 select array_agg(value) into original_roles from jsonb_array_elements_text(context_value->'original_roles');
 update public.sys_user set user_roles=original_roles where id=(context_value->>'profile')::uuid;
 set constraints payable_receivable_record_consistency,payable_receivable_application_consistency deferred;
 return jsonb_build_object('case',p_case,'status','passed','reversed',jsonb_array_length(context_value->'records'));
end $reverse$;

select pg_temp.prepare_payable_receivable_fx(1);
select pg_temp.match_payable_receivable_fx(1);
select pg_temp.reverse_payable_receivable_fx(1);
select pg_temp.prepare_payable_receivable_fx(2);
select pg_temp.match_payable_receivable_fx(2);
select pg_temp.reverse_payable_receivable_fx(2);
select pg_temp.prepare_payable_receivable_fx(3);
select pg_temp.match_payable_receivable_fx(3);
select pg_temp.reverse_payable_receivable_fx(3);
select pg_temp.prepare_payable_receivable_fx(4);
select pg_temp.match_payable_receivable_fx(4);
select pg_temp.reverse_payable_receivable_fx(4);
rollback;
