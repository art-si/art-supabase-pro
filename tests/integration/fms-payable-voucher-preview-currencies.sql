begin;
set local jit=off;
set local statement_timeout='8s';

create function pg_temp.check_payable_preview_currency(p_base text) returns jsonb
language plpgsql as $preview$
declare tenant uuid;actor uuid;book uuid;foreign_ident uuid;debit_subject uuid;credit_subject uuid;rule_ident uuid;payload jsonb;result jsonb;entry jsonb;kind text;
 foreign_code text:=case when p_base='CNY' then 'USD' else 'CNY' end;rate_value numeric:=case when p_base='CNY' then 7 else 0.98 end;local_amount numeric;
 suffix text:=to_char(clock_timestamp(),'YYYYMMDDHH24MISSUS');
begin
 if p_base not in('CNY','USD') then raise exception 'Unsupported preview book currency';end if;
 select id into tenant from public.sys_tenant where tenant_code='qa-payable-20261022';
 select auth_user_id into actor from public.sys_user where tenant_id=tenant and auth_user_id is not null and status='1' order by id limit 1;
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers','{}',true);
 insert into public.fms_account_set(tenant_id,account_set_code,account_set_name,legal_entity_name,base_currency_code,enabled_on,status)
 values(tenant,'PREVIEW_'||upper(left(gen_random_uuid()::text,8)),'本位币预览回滚账套','虚构预览主体',p_base,app_private.payable_business_date(),'active') returning id into book;
 insert into public.fms_currency(tenant_id,account_set_id,currency_code,currency_name,is_enabled)
 values(tenant,book,foreign_code,'回滚外币',true) returning id into foreign_ident;
 insert into public.fms_subject(tenant_id,account_set_id,subject_code,subject_name,category,balance_direction,allow_foreign_currency)
 values(tenant,book,'991'||suffix,'原币预览回滚科目','asset','debit',true) returning id into debit_subject;
 insert into public.fms_subject(tenant_id,account_set_id,subject_code,subject_name,category,balance_direction,allow_foreign_currency)
 values(tenant,book,'992'||suffix,'对方预览回滚科目','liability','credit',true) returning id into credit_subject;
 local_amount:=round(100*rate_value,2);
 payload:=jsonb_build_object('account_set_id',book,'base_currency_code',p_base,'currency_code',p_base,'currency_id',foreign_ident,'exchange_rate',rate_value,'fx_snapshot_version',1,
  'gross_amount',local_amount,'net_amount',local_amount,'payable_amount',local_amount,'paid_amount',local_amount,
  'original_gross_amount',100,'original_net_amount',100,'original_payable_amount',100,'original_paid_amount',local_amount,
  'primary_currency_id',foreign_ident,'secondary_currency_id',null,'primary_currency_code',foreign_code,'secondary_currency_code',p_base,'primary_exchange_rate',rate_value,'secondary_exchange_rate',1);
 foreach kind in array array['payment','financial'] loop
  insert into public.fms_posting_rule(tenant_id,account_set_id,rule_code,rule_name,source_type,event_code,priority,submission_mode)
  values(tenant,book,'PREVIEW_'||upper(left(gen_random_uuid()::text,8)),'预览原币信息回滚规则',case when kind='payment' then 'system' else 'financial_payable' end,
   case when kind='payment' then 'ap_writeoff_approved' else 'approved' end,999,'draft') returning id into rule_ident;
  insert into public.fms_posting_rule_line(tenant_id,account_set_id,rule_id,line_no,subject_id,direction,amount_key)
  values(tenant,book,rule_ident,10,debit_subject,'debit',case when kind='payment' then 'payable_amount' else 'gross_amount' end),
   (tenant,book,rule_ident,20,credit_subject,'credit',case when kind='payment' then 'paid_amount' else 'gross_amount' end);
  result:=app_private.preview_payable_posting(tenant,case when kind='payment' then 'ap_writeoff_approved' else 'approved' end,
   app_private.payable_business_date(),payload,'回滚预览',case when kind='payment' then 'system' else 'financial_payable' end);
  if jsonb_array_length(result->'lines')<>2 or exists(select 1 from jsonb_array_elements(result->'lines') row_value where row_value->>'base_currency_code' is distinct from p_base) then
   raise exception 'Preview used an implicit CNY label rather than the actual accounting-book currency';end if;
  entry:=result->'lines'->0;
  if entry->>'currency_code'<>foreign_code or(entry->>'original_amount')::numeric<>100 or(entry->>'exchange_rate')::numeric<>rate_value
   or(entry->>'debit_amount')::numeric<>local_amount then raise exception 'Preview changed source original amounts or historical exchange rate';end if;
 end loop;
 return jsonb_build_object('base_currency',p_base,'status','passed','actual_posting',false);
end $preview$;

select pg_temp.check_payable_preview_currency('CNY');
select pg_temp.check_payable_preview_currency('USD');
rollback;
