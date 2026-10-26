begin;
set local jit=off;
set local statement_timeout='8s';

create function pg_temp.check_payable_writeoff_source_values(p_kind text) returns jsonb
language plpgsql as $test$
declare
 actor uuid;
 source record;
 original jsonb;
 compact jsonb;
 expected_match jsonb;
 actual_match jsonb;
 field_name text;
 checked integer:=0;
 started_at timestamptz:=clock_timestamp();
begin
 if p_kind not in('estimated','financial') then raise exception 'Unknown source kind';end if;
 select auth_user_id into actor from public.sys_user where auth_user_id is not null and user_roles @>array['R_SUPER'] order by id limit 1;
 if actor is null then raise exception 'Missing cross-tenant source equivalence actor';end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers','{}',true);
 if app_private.is_platform_super() is distinct from true then raise exception 'Source equivalence requires verified platform-all context';end if;
 for source in select id,document_no from public.fms_purchase_payable_document where kind=p_kind order by id loop
  original:=app_private.purchase_payable_json(source.id);
  compact:=app_private.payable_writeoff_source_values(source.id);
  foreach field_name in array array['id','tenant_id','kind','document_no','business_date','document_type_id','supplier_id','organization_id','project_id',
   'account_set_id','currency_code','base_currency_code','exchange_rate','source_document_no','total_amount','amount','tax_amount','base_total_amount','written_off_amount','unpaid_amount'] loop
   if compact->field_name is distinct from coalesce(original->field_name,'null'::jsonb) then
    raise exception 'Compact source changed % on %: % versus %',field_name,source.document_no,compact->field_name,original->field_name;
   end if;
  end loop;
  expected_match:=app_private.payable_primary_match_values(source.id,original);
  actual_match:=app_private.payable_writeoff_match_values(source.id,'primary');
  if actual_match is distinct from expected_match then raise exception 'Matching fields changed on %',source.document_no;end if;
  checked:=checked+1;
 end loop;
 if checked=0 then raise exception 'No source rows were compared';end if;
 if has_function_privilege('authenticated','app_private.payable_writeoff_source_values(uuid)','EXECUTE')
  or has_function_privilege('anon','app_private.payable_writeoff_source_values(uuid)','EXECUTE') then raise exception 'Internal financial source projection became client executable';end if;
 return jsonb_build_object('kind',p_kind,'checked',checked,'elapsed_ms',round(extract(epoch from clock_timestamp()-started_at)*1000,2));
end $test$;

select pg_temp.check_payable_writeoff_source_values('estimated');
select pg_temp.check_payable_writeoff_source_values('financial');
rollback;
