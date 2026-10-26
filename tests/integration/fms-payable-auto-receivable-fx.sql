begin;
set local jit=off;
set local statement_timeout='8s';

create function pg_temp.prepare_auto_ar_fx(p_case integer) returns jsonb
language plpgsql as $prepare$
declare context_value jsonb;tenant uuid;fixture_role uuid;query_value jsonb;material uuid;unit_ident uuid;finance_type uuid;extra jsonb;document_ids jsonb;
 mode_value text:=case when p_case in(3,8) then 'full_pair' when p_case=5 then 'same_currency' else 'book_equivalent' end;
begin
 if p_case not between 1 and 8 then raise exception 'Unknown automatic AR FX case';end if;
 context_value:=pg_temp.prepare_payable_receivable_fx(case when p_case in(5,6) then 3 when p_case in(7,8) then 1 else p_case end);
 tenant:=(context_value->>'tenant')::uuid;
 select id into fixture_role from public.sys_role where tenant_id=tenant and role_code=context_value->>'fixture_role_code';
 document_ids:=jsonb_build_array(context_value->>'payable',context_value->>'document');
 update public.fms_payable_writeoff_scheme set automatic=true where id=(context_value->>'scheme')::uuid;
 if p_case=2 then
  update public.fms_account_set set is_default=false where id=(context_value->>'book')::uuid;
  update public.fms_account_set set is_default=true where id=(context_value->>'other_book')::uuid;
 end if;
 if p_case in(1,6) then
  insert into public.sys_role_menu(role_id,menu_id,tenant_id) select fixture_role,id,tenant from public.sys_menu
   where name in('FinancePayableWriteoff','FinancePayableWriteoff:View','FinancePayableWriteoff:AutoWriteoff','FinancePayableWriteoff:Reverse') on conflict do nothing;
  update public.sys_user set user_roles=array[context_value->>'fixture_role_code'] where id=(context_value->>'profile')::uuid;
  perform set_config('request.jwt.claim.sub',context_value->>'actor',true);perform set_config('request.headers','{}',true);
  if app_private.has_permission('FinancePayableWriteoff:Writeoff') then raise exception 'Automatic-only fixture unexpectedly has manual writeoff authority';end if;
  if p_case=6 then
   delete from public.sys_role_menu where role_id=fixture_role and menu_id=(select id from public.sys_menu where name='FinanceReceiptWriteoff:CrossCurrency');
   if app_private.can_execute_business_action('FinanceReceiptWriteoff','FinanceReceiptWriteoff:CrossCurrency',null,false) then raise exception 'Missing-currency-authority fixture still has native cross-currency permission';end if;
  end if;
 end if;
 if p_case=8 then
  select id,inventory_unit_id into material,unit_ident from public.mdm_material where tenant_id=tenant and inventory_unit_id is not null order by id limit 1;
  select id into finance_type from public.mdm_document_type where tenant_id=tenant and document_type_code='AP_FIN_STANDARD';
  extra:=public.fms_save_purchase_payable_secure(jsonb_build_object('tenant_id',tenant,'kind','financial','document_type_id',finance_type,'supplier_id',context_value->>'supplier',
   'business_date',app_private.payable_business_date()-1,'currency_code','CNY','exchange_rate',1,
   'lines',jsonb_build_array(jsonb_build_object('material_id',material,'inventory_unit_id',unit_ident,'quantity',1,'unit_price',0.24,'tax_rate',0))));
  perform public.fms_act_purchase_payable_secure(array[(extra->>'id')::uuid],'submit');
  perform public.fms_act_purchase_payable_secure(array[(extra->>'id')::uuid],'approve');
  document_ids:=document_ids||jsonb_build_array(extra->>'id');
  update public.fms_payable_writeoff_scheme set rules=jsonb_build_array(jsonb_build_object('primary_field','business_date','secondary_field','business_date','operator','lte','empty_matches',false))
   where id=(context_value->>'scheme')::uuid;
 end if;
 query_value:=jsonb_build_object('relation','payable_receivable','document_ids',document_ids,'allow_cross_party',p_case<>7,'cross_currency_mode',mode_value);
 context_value:=context_value||jsonb_build_object('auto_case',p_case,'query',query_value,'mode',mode_value,'extra_payable',extra->>'id',
  'expected_count',case when p_case in(5,6,7) then 0 when p_case=8 then 2 else 1 end);
 perform set_config('qa.auto_ar_fx_'||p_case,context_value::text,true);
 return context_value;
end $prepare$;

create function pg_temp.preview_auto_ar_fx(p_case integer) returns jsonb
language plpgsql as $preview$
declare context_value jsonb:=current_setting('qa.auto_ar_fx_'||p_case)::jsonb;query_value jsonb:=context_value->'query';plan jsonb;repeated jsonb;item jsonb;blocked boolean;reservation uuid;
 tenant uuid:=(context_value->>'tenant')::uuid;scheme uuid:=(context_value->>'scheme')::uuid;
begin
 if p_case=6 then
  blocked:=false;
  begin perform public.fms_auto_payable_writeoff_secure(scheme,app_private.payable_business_date(),query_value,false);exception when insufficient_privilege then blocked:=true;end;
  if not blocked then raise exception 'Automatic preview bypassed native AR cross-currency authority';end if;
  plan:=public.fms_auto_payable_writeoff_secure(scheme,app_private.payable_business_date(),query_value||jsonb_build_object('cross_currency_mode','same_currency'),false);
  if jsonb_array_length(plan->'items')<>0 then raise exception 'Same-currency mode allocated foreign originals without cross-currency authority';end if;
 else
  blocked:=false;
  begin perform public.fms_auto_payable_writeoff_secure(scheme,app_private.payable_business_date(),query_value||jsonb_build_object('cross_currency_mode','invalid'),false);exception when invalid_parameter_value then blocked:=true;end;
  if not blocked then raise exception 'AR automatic preview accepted an unsupported allocation mode';end if;
  plan:=public.fms_auto_payable_writeoff_secure(scheme,app_private.payable_business_date(),query_value,false);
  if jsonb_array_length(plan->'items')<>(context_value->>'expected_count')::integer then raise exception 'AR automatic preview selected an incorrect number of pairs: %',plan;end if;
  for item in select value from jsonb_array_elements(plan->'items') loop
   if item->>'relation'<>'payable_receivable' or(item->>'account_set_id')::uuid<>(context_value->>'book')::uuid or item->>'secondary_currency_code'<>'USD' or item->>'base_currency_code'<>'CNY'
    or(item->>'secondary_exchange_rate')::numeric<>7.333333 or(item->>'needs_voucher')::boolean is distinct from true
    or(item->>'receivable_amount')::numeric<=0 or(item->>'exchange_difference')::numeric<>(item->>'payable_base_amount')::numeric-(item->>'receivable_base_amount')::numeric then
    raise exception 'AR automatic plan lost explicit secondary originals, actual books or historical carrying amounts';end if;
  end loop;
  if p_case in(1,2) and not exists(select 1 from jsonb_array_elements(plan->'items') entry where(entry->>'amount')::numeric=0.03 and(entry->>'receivable_amount')::numeric=0.03
   and(entry->>'payable_base_amount')::numeric=0.21 and(entry->>'receivable_base_amount')::numeric=0.22) then raise exception 'Same-currency AR plan did not retain independent historical booking rates';end if;
  if p_case=3 and not exists(select 1 from jsonb_array_elements(plan->'items') entry where(entry->>'amount')::numeric=0.24 and(entry->>'receivable_amount')::numeric=0.03
   and(entry->>'payable_base_amount')::numeric=0.24 and(entry->>'receivable_base_amount')::numeric=0.22) then raise exception 'Full-pair mode substituted equal nominal amounts for two currencies';end if;
  if p_case=4 and not exists(select 1 from jsonb_array_elements(plan->'items') entry where(entry->>'amount')::numeric=0.22 and(entry->>'receivable_amount')::numeric=0.03
   and(entry->>'payable_base_amount')::numeric=0.22 and(entry->>'receivable_base_amount')::numeric=0.22) then raise exception 'Book-equivalent AR allocation did not preserve the unmatched primary original';end if;
  if p_case=8 and(plan->>'total_amount' is not null or jsonb_array_length(plan->'currency_totals')<>2
   or not exists(select 1 from jsonb_array_elements(plan->'currency_totals') entry where entry->>'currency_code'='CNY' and(entry->>'amount')::numeric=0.24)
   or not exists(select 1 from jsonb_array_elements(plan->'currency_totals') entry where entry->>'currency_code'='USD' and(entry->>'amount')::numeric=0.01)) then
   raise exception 'Mixed original currencies were added into a fictitious single-currency total';end if;
  update public.fms_exchange_rate set direct_rate=123 where account_set_id=(context_value->>'book')::uuid and rate_date=app_private.payable_business_date() and rate_type='spot'
   and currency_id in(select id from public.fms_currency where account_set_id=(context_value->>'book')::uuid and currency_code='USD');
  repeated:=public.fms_auto_payable_writeoff_secure(scheme,app_private.payable_business_date(),query_value,false);
  if repeated->>'plan_token'<>plan->>'plan_token' then raise exception 'Current exchange master revalued an approved-source AR allocation';end if;
  if jsonb_array_length(plan->'items')>0 then
   reservation:=gen_random_uuid();
   insert into public.fms_receivable_application(id,tenant_id,financial_line_id,event_kind,source_type,source_id,event_date,amount,status,created_by_auth_user_id)
   values(reservation,tenant,(context_value->>'line')::uuid,'payment_request','fixture',reservation,app_private.payable_business_date(),0.01,'draft',(context_value->>'actor')::uuid);
   blocked:=false;
   begin perform public.fms_auto_payable_writeoff_secure(scheme,app_private.payable_business_date(),query_value,true,plan->>'plan_token');exception when serialization_failure then blocked:=true;end;
   if not blocked or exists(select 1 from public.fms_payable_writeoff_record where tenant_id=tenant and status='active' and payable_id=(context_value->>'payable')::uuid) then
    raise exception 'Stale AR reservation plan wrote a partial batch';end if;
   update public.fms_receivable_application set status='voided' where id=reservation;
   plan:=public.fms_auto_payable_writeoff_secure(scheme,app_private.payable_business_date(),query_value,false);
  end if;
 end if;
 if(select count(*) from public.fms_fund_ledger_entry)<>(context_value->>'fund_count')::bigint then raise exception 'Automatic preview or stale rejection generated cash movement';end if;
 perform set_config('qa.auto_ar_fx_'||p_case,(context_value||jsonb_build_object('plan',plan))::text,true);
 return plan;
end $preview$;

create function pg_temp.execute_auto_ar_fx(p_case integer) returns jsonb
language plpgsql as $execute$
declare context_value jsonb:=current_setting('qa.auto_ar_fx_'||p_case)::jsonb;plan jsonb:=context_value->'plan';executed jsonb;item jsonb;actual public.fms_payable_writeoff_record;step integer:=0;blocked boolean;
begin
 if(context_value->>'expected_count')::integer=0 then
  if p_case<>6 then
   blocked:=false;
   begin perform public.fms_auto_payable_writeoff_secure((context_value->>'scheme')::uuid,app_private.payable_business_date(),context_value->'query',true,plan->>'plan_token');
   exception when check_violation then blocked:=true;end;
   if not blocked then raise exception 'Empty automatic AR plan was executed';end if;
  end if;
  return jsonb_build_object('case',p_case,'status','passed','executed',false);
 end if;
 if p_case=1 then
  blocked:=false;
  begin perform public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('relation','payable_receivable','payable_id',context_value->>'payable',
   'receivable_line_id',context_value->>'line','amount',0.01,'receivable_amount',0.01,'allow_cross_party',true)),(context_value->>'scheme')::uuid,app_private.payable_business_date(),'自动权限不能冒充手工核销');
  exception when insufficient_privilege then blocked:=true;end;
  if not blocked then raise exception 'Automatic-only foreign role bypassed the manual button permission';end if;
 end if;
 executed:=public.fms_auto_payable_writeoff_secure((context_value->>'scheme')::uuid,app_private.payable_business_date(),context_value->'query',true,plan->>'plan_token');
 if(executed->>'executed')::boolean is distinct from true or jsonb_array_length(executed->'record_ids')<>jsonb_array_length(plan->'items') then raise exception 'Authorized automatic AR plan did not execute atomically';end if;
 for item in select value from jsonb_array_elements(plan->'items') loop
  select * into actual from public.fms_payable_writeoff_record where id=(executed->'record_ids'->>step)::uuid;
  if actual.tenant_id<>(context_value->>'tenant')::uuid or actual.account_set_id<>(context_value->>'book')::uuid or actual.amount<>(item->>'amount')::numeric
   or actual.receivable_amount<>(item->>'receivable_amount')::numeric or actual.payable_base_amount<>(item->>'payable_base_amount')::numeric or actual.receivable_base_amount<>(item->>'receivable_base_amount')::numeric
   or actual.payment_amount<>0 or actual.cash_discount_amount<>0 or app_private.payable_receivable_writeoff_valid(actual.id) is distinct from true
   or not exists(select 1 from public.fms_receivable_application where payable_writeoff_id=actual.id and effect=1 and amount=actual.receivable_amount and ledger_base_amount=actual.receivable_base_amount) then
   raise exception 'Automatic AR execution diverged from its original/base preview or bypassed native AR applications';end if;
  step:=step+1;
 end loop;
 if p_case=4 and(app_private.payable_writeoff_source_values((context_value->>'payable')::uuid)->>'unpaid_amount')::numeric<>0.02 then
  raise exception 'Book-equivalent AR execution lost the unmatched original remainder';end if;
 if p_case=8 and((app_private.payable_writeoff_source_values((context_value->>'payable')::uuid)->>'unpaid_amount')::numeric<>0.02
  or(app_private.payable_writeoff_source_values((context_value->>'extra_payable')::uuid)->>'unpaid_amount')::numeric<>0) then raise exception 'Mixed-currency AR execution consumed the wrong primary originals';end if;
 if(select count(*) from public.fms_fund_ledger_entry)<>(context_value->>'fund_count')::bigint then raise exception 'Automatic book offset generated actual fund movement';end if;
 perform set_config('qa.auto_ar_fx_'||p_case,(context_value||jsonb_build_object('records',executed->'record_ids'))::text,true);
 return executed;
end $execute$;

create function pg_temp.reverse_auto_ar_fx(p_case integer) returns jsonb
language plpgsql as $reverse$
declare context_value jsonb:=current_setting('qa.auto_ar_fx_'||p_case)::jsonb;record_ident uuid;original_roles text[];
begin
 for record_ident in select value::uuid from jsonb_array_elements_text(coalesce(context_value->'records','[]')) loop
  perform public.fms_reverse_payable_writeoff_secure(record_ident,'自动核销验收后按原分摊反核销');
 end loop;
 set constraints payable_receivable_record_consistency,payable_receivable_application_consistency immediate;
 if(app_private.payable_writeoff_source_values((context_value->>'payable')::uuid)->>'unpaid_amount')::numeric<>(context_value->>'primary_amount')::numeric
  or(app_private.ar_line_book_balance((context_value->>'line')::uuid)->>'original_remaining')::numeric<>0.03
  or(app_private.ar_line_book_balance((context_value->>'line')::uuid)->>'base_remaining')::numeric<>0.22 then raise exception 'Automatic AR reversal did not restore both original and booked pools';end if;
 if p_case=2 then
  update public.fms_account_set set is_default=false where id=(context_value->>'other_book')::uuid;
  update public.fms_account_set set is_default=true where id=(context_value->>'book')::uuid;
 end if;
 select array_agg(value) into original_roles from jsonb_array_elements_text(context_value->'original_roles');
 update public.sys_user set user_roles=original_roles where id=(context_value->>'profile')::uuid;
 set constraints payable_receivable_record_consistency,payable_receivable_application_consistency deferred;
 return jsonb_build_object('case',p_case,'status','passed');
end $reverse$;

select pg_temp.prepare_auto_ar_fx(1);
select pg_temp.preview_auto_ar_fx(1);
select pg_temp.execute_auto_ar_fx(1);
select pg_temp.reverse_auto_ar_fx(1);
select pg_temp.prepare_auto_ar_fx(2);
select pg_temp.preview_auto_ar_fx(2);
select pg_temp.execute_auto_ar_fx(2);
select pg_temp.reverse_auto_ar_fx(2);
select pg_temp.prepare_auto_ar_fx(3);
select pg_temp.preview_auto_ar_fx(3);
select pg_temp.execute_auto_ar_fx(3);
select pg_temp.reverse_auto_ar_fx(3);
select pg_temp.prepare_auto_ar_fx(4);
select pg_temp.preview_auto_ar_fx(4);
select pg_temp.execute_auto_ar_fx(4);
select pg_temp.reverse_auto_ar_fx(4);
select pg_temp.prepare_auto_ar_fx(5);
select pg_temp.preview_auto_ar_fx(5);
select pg_temp.execute_auto_ar_fx(5);
select pg_temp.reverse_auto_ar_fx(5);
select pg_temp.prepare_auto_ar_fx(6);
select pg_temp.preview_auto_ar_fx(6);
select pg_temp.execute_auto_ar_fx(6);
select pg_temp.reverse_auto_ar_fx(6);
select pg_temp.prepare_auto_ar_fx(7);
select pg_temp.preview_auto_ar_fx(7);
select pg_temp.execute_auto_ar_fx(7);
select pg_temp.reverse_auto_ar_fx(7);
select pg_temp.prepare_auto_ar_fx(8);
select pg_temp.preview_auto_ar_fx(8);
select pg_temp.execute_auto_ar_fx(8);
select pg_temp.reverse_auto_ar_fx(8);
rollback;
