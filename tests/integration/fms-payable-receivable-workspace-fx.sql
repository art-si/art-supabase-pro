begin;
set local jit=off;
set local statement_timeout='8s';

create function pg_temp.check_ar_fx_workspace(p_case integer,p_phase text) returns jsonb
language plpgsql as $workspace$
declare context_value jsonb:=current_setting('qa.ap_ar_fx_'||p_case)::jsonb;query_value jsonb;workspace jsonb;candidate jsonb;history_value jsonb;fact jsonb;
 tenant uuid:=(context_value->>'tenant')::uuid;book uuid:=(context_value->>'book')::uuid;payable uuid:=(context_value->>'payable')::uuid;receivable_line uuid:=(context_value->>'line')::uuid;
 record_ident uuid;matched public.fms_payable_writeoff_record;original_roles text[];restored_roles text[];before_auth text;before_headers text;fixture_role uuid;blocked boolean;
begin
 if p_phase not in('before','after','restored') then raise exception 'Unknown receivable workspace phase';end if;
 if p_phase='restored' and not app_private.is_platform_super() then
  select user_roles into restored_roles from public.sys_user where id=(context_value->>'profile')::uuid;
  update public.sys_user set user_roles=restored_roles||array[context_value->>'fixture_role_code'] where id=(context_value->>'profile')::uuid;
 end if;
 query_value:=jsonb_build_object('relation','payable_receivable','document_ids',jsonb_build_array(payable,context_value->>'document'));
 if p_case=2 and p_phase='before' then
  update public.fms_account_set set is_default=false where id=book;
  update public.fms_account_set set is_default=true where id=(context_value->>'other_book')::uuid;
 end if;
 workspace:=public.fms_payable_writeoff_workspace_secure(query_value);
 if p_phase in('before','restored') then
  if jsonb_array_length(workspace->'primary')<>1 or jsonb_array_length(workspace->'secondary')<>2 or jsonb_array_length(workspace->'blocked_sources')<>0 then
   raise exception 'Eligible original-book foreign sources were hidden or reported as unavailable';end if;
  select value into strict candidate from jsonb_array_elements(workspace->'primary') where value->>'id'=payable::text;
  if(candidate->>'account_set_id')::uuid<>book or(candidate->>'exchange_rate')::numeric<>(context_value->>'primary_rate')::numeric
   or candidate->>'currency_code'<>context_value->>'primary_currency' or candidate->>'base_currency_code'<>'CNY'
   or nullif(candidate->>'account_set_name','') is null or(candidate->>'available_amount')::numeric<>(context_value->>'primary_amount')::numeric
   or(candidate->>'available_base_amount')::numeric<>round((context_value->>'primary_amount')::numeric*(context_value->>'primary_rate')::numeric,2) then
   raise exception 'AP projection lost actual source book, original currency/rate or carrying pool';end if;
  select value into strict candidate from jsonb_array_elements(workspace->'secondary') where value->>'id'=receivable_line::text;
  if(candidate->>'account_set_id')::uuid<>book or(candidate->>'exchange_rate')::numeric<>7.333333 or candidate->>'currency_code'<>'USD' or candidate->>'base_currency_code'<>'CNY'
   or(candidate->>'available_amount')::numeric<>0.03 or(candidate->>'unpaid_amount')::numeric<>0.03 or(candidate->>'available_base_amount')::numeric<>0.22
   or(candidate->'match_values'->>'account_set_id')::uuid<>book or(candidate->'match_values'->>'exchange_rate')::numeric<>7.333333 then
   raise exception 'AR projection used current default/current master rate rather than its original book and historical carrying pool';end if;
 elsif p_phase='after' then
  if jsonb_array_length(workspace->'primary')<>0 or exists(select 1 from jsonb_array_elements(workspace->'secondary') row_value where row_value->>'id'=receivable_line::text) then
   raise exception 'Settled source originals were still offered for another writeoff';end if;
  for record_ident in select value::uuid from jsonb_array_elements_text(context_value->'records') loop
   select * into matched from public.fms_payable_writeoff_record where id=record_ident;
   history_value:=public.fms_payable_writeoff_workspace_secure(jsonb_build_object('relation','payable_receivable','record_id',record_ident));
   if jsonb_array_length(history_value->'primary')<>0 or jsonb_array_length(history_value->'secondary')<>0 or jsonb_array_length(history_value->'blocked_sources')<>0
    or jsonb_array_length(history_value->'history')<>1 then raise exception 'Record drilldown recomputed unrelated candidates or exposed other history';end if;
   candidate:=history_value->'history'->0;
   if(candidate->>'payable_base_amount')::numeric<>matched.payable_base_amount or(candidate->>'receivable_base_amount')::numeric<>matched.receivable_base_amount
    or(candidate->>'receivable_amount')::numeric<>matched.receivable_amount or(candidate->>'exchange_difference')::numeric<>matched.payable_base_amount-matched.receivable_base_amount
    or(candidate->>'primary_exchange_rate')::numeric<>(context_value->>'primary_rate')::numeric or(candidate->>'secondary_exchange_rate')::numeric<>7.333333
    or candidate->>'currency_code'<>context_value->>'primary_currency' or candidate->>'secondary_currency_code'<>'USD' or candidate->>'base_currency_code'<>'CNY' then
    raise exception 'History lost its two original currencies, rates or exact booked allocations';end if;
   candidate:=public.fms_get_payable_writeoff_record_secure(record_ident);
   if(candidate->>'receivable_base_amount')::numeric<>matched.receivable_base_amount or candidate->>'secondary_currency_code'<>'USD'
    or(candidate->>'secondary_exchange_rate')::numeric<>7.333333 or(candidate->>'receivable_document_id')::uuid<>(context_value->>'document')::uuid then
    raise exception 'Record-detail API did not preserve source amounts or its authorized original-document link';end if;
  end loop;
 end if;
 select value into strict fact from app_private.payable_report_source_balances(jsonb_build_object('kind','financial','tenant_id',tenant,'party_type','supplier','party_id',context_value->>'supplier')) value
 where value->>'document_id'=payable::text;
 if fact->>'balance_state'<>'ready' or(fact->>'balance_amount')::numeric<>(case when p_phase='after' then 0 else(context_value->>'primary_amount')::numeric end)
  or(fact->>'base_balance_amount')::numeric<>(case when p_phase='after' then 0 else round((context_value->>'primary_amount')::numeric*(context_value->>'primary_rate')::numeric,2) end) then
  raise exception 'AP report recomputed partial AR offsets and lost an actual carrying-base cent';end if;
 if p_phase='before' then
  before_auth:=current_setting('request.jwt.claim.sub',true);before_headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}');
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',context_value->>'foreign_tenant')::text,true);
  workspace:=public.fms_payable_writeoff_workspace_secure(query_value);
  if app_private.is_platform_super() then
   if jsonb_array_length(workspace->'primary')<>0 or jsonb_array_length(workspace->'secondary')<>0 then raise exception 'Platform-selected foreign tenant leaked original sources';end if;
  elsif jsonb_array_length(workspace->'primary')<>1 then raise exception 'Forged ordinary header changed the authorized source tenant';end if;
  perform set_config('request.headers',before_headers,true);
  select user_roles into original_roles from public.sys_user where id=(context_value->>'profile')::uuid;
  select id into fixture_role from public.sys_role where tenant_id=tenant and role_code=context_value->>'fixture_role_code';
  insert into public.sys_role_menu(role_id,menu_id,tenant_id) select fixture_role,id,tenant from public.sys_menu where name in('FinancePayableWriteoff','FinancePayableWriteoff:View') on conflict do nothing;
  update public.sys_user set user_roles=array[context_value->>'fixture_role_code'] where id=(context_value->>'profile')::uuid;
  perform set_config('request.jwt.claim.sub',context_value->>'actor',true);perform set_config('request.headers','{}',true);
  perform public.fms_payable_writeoff_workspace_secure(query_value);
  update public.sys_role_field_permission set access_level='hidden' where role_id=fixture_role;
  blocked:=false;
  begin perform public.fms_payable_writeoff_workspace_secure(query_value);exception when insufficient_privilege then blocked:=true;end;
  if not blocked then raise exception 'Workspace exposed original AR amounts without native amount access';end if;
  update public.sys_role_field_permission set access_level='edit' where role_id=fixture_role;
  update public.sys_user set user_roles=original_roles where id=(context_value->>'profile')::uuid;
  perform set_config('request.jwt.claim.sub',before_auth,true);perform set_config('request.headers',before_headers,true);
 end if;
 if has_function_privilege('authenticated','app_private.payable_receivable_line_book_state(uuid,date)','EXECUTE')
  or has_function_privilege('anon','app_private.payable_organization_book_ready(uuid,uuid,date)','EXECUTE') then raise exception 'Private book projections became client executable';end if;
 if restored_roles is not null then update public.sys_user set user_roles=restored_roles where id=(context_value->>'profile')::uuid;end if;
 return jsonb_build_object('case',p_case,'phase',p_phase,'status','passed');
end $workspace$;

create function pg_temp.prepare_ar_fx_report_tail() returns jsonb
language plpgsql as $prepare$
declare context_value jsonb;tenant uuid;material uuid;unit_ident uuid;finance_type uuid;finance jsonb;commands jsonb;records jsonb;
begin
 context_value:=pg_temp.prepare_payable_receivable_fx(1);tenant:=(context_value->>'tenant')::uuid;
 select id,inventory_unit_id into material,unit_ident from public.mdm_material where tenant_id=tenant and inventory_unit_id is not null order by id limit 1;
 select id into finance_type from public.mdm_document_type where tenant_id=tenant and document_type_code='AP_FIN_STANDARD';
 finance:=public.fms_save_purchase_payable_secure(jsonb_build_object('tenant_id',tenant,'kind','financial','document_type_id',finance_type,'supplier_id',context_value->>'supplier',
  'business_date',app_private.payable_business_date(),'currency_code','USD','exchange_rate',7.333333,
  'lines',jsonb_build_array(jsonb_build_object('material_id',material,'inventory_unit_id',unit_ident,'quantity',1,'unit_price',0.03,'tax_rate',0))));
 perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'submit');
 perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'approve');
 context_value:=context_value||jsonb_build_object('case',5,'payable',finance->>'id','primary_rate',7.333333);
 perform set_config('qa.ap_ar_fx_5',context_value::text,true);
 return context_value;
end $prepare$;

create function pg_temp.check_ar_counterparty_report_balance(p_original numeric,p_base numeric) returns jsonb
language plpgsql as $balance$
declare context_value jsonb:=current_setting('qa.ap_ar_fx_5')::jsonb;actual numeric;expected numeric;source_original numeric;source_base numeric;
begin
 set constraints all immediate;
 set constraints all deferred;
 actual:=app_private.payable_counterparty_balance((context_value->>'tenant')::uuid,(context_value->>'supplier')::uuid,null);
 select sum((value->>'base_balance_amount')::numeric),
  max((value->>'balance_amount')::numeric) filter(where value->>'document_id'=context_value->>'payable'),
  max((value->>'base_balance_amount')::numeric) filter(where value->>'document_id'=context_value->>'payable')
 into expected,source_original,source_base
 from app_private.payable_report_source_balances(jsonb_build_object('tenant_id',context_value->>'tenant','kind','financial',
  'party_type','supplier','party_id',context_value->>'supplier')) value;
 if actual is distinct from expected or source_original is distinct from p_original or source_base is distinct from p_base then
  raise exception 'Counterparty/report carrying balance mismatch: difference %, original %, carrying %',actual-expected,source_original,source_base;
 end if;
 return jsonb_build_object('status','passed','original_remainder',source_original,'base_remainder',source_base);
end $balance$;

create function pg_temp.match_ar_counterparty_partial_tail() returns jsonb
language plpgsql as $partial$
declare context_value jsonb:=current_setting('qa.ap_ar_fx_5')::jsonb;commands jsonb;records jsonb;
begin
 select jsonb_agg(jsonb_build_object('relation','payable_receivable','payable_id',context_value->>'payable',
  'receivable_line_id',context_value->>'line','amount',0.01,'receivable_amount',0.01,'allow_cross_party',true))
 into commands from generate_series(1,2);
 records:=public.fms_payable_writeoff_secure(commands,(context_value->>'scheme')::uuid,app_private.payable_business_date(),'往来余额保留真实分摊尾差');
 perform set_config('qa.ap_ar_fx_5',(context_value||jsonb_build_object('records',records))::text,true);
 return jsonb_build_object('status','passed','records',records);
end $partial$;

create function pg_temp.check_ar_counterparty_visibility() returns jsonb
language plpgsql as $visibility$
declare context_value jsonb:=current_setting('qa.ap_ar_fx_5')::jsonb;roles_before text[];headers_before text;
 other_tenant uuid;before_value numeric;after_value numeric;
begin
 if app_private.is_platform_super() then raise exception 'Counterparty visibility requires ordinary QA identity';end if;
 select id into other_tenant from public.sys_tenant where id<>(context_value->>'tenant')::uuid order by id limit 1;
 headers_before:=current_setting('request.headers',true);
 before_value:=app_private.payable_counterparty_balance((context_value->>'tenant')::uuid,(context_value->>'supplier')::uuid,null);
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
 after_value:=app_private.payable_counterparty_balance((context_value->>'tenant')::uuid,(context_value->>'supplier')::uuid,null);
 if after_value is distinct from before_value or app_private.payable_counterparty_balance(other_tenant,gen_random_uuid(),null) is not null then
  raise exception 'Forged ordinary header changed balance scope or disclosed a foreign tenant balance';end if;
 perform set_config('request.headers',coalesce(headers_before,''),true);
 select user_roles into roles_before from public.sys_user where id=(context_value->>'profile')::uuid;
 update public.sys_user set user_roles='{}'::text[] where id=(context_value->>'profile')::uuid;
 if app_private.has_permission('FinancePurchasePayable:View') then raise exception 'Missing-permission fixture retained financial access';end if;
 if app_private.payable_counterparty_balance((context_value->>'tenant')::uuid,(context_value->>'supplier')::uuid,null) is not null then
  raise exception 'Missing financial permission disclosed a counterparty balance';end if;
 update public.sys_user set user_roles=roles_before where id=(context_value->>'profile')::uuid;
 return jsonb_build_object('status','passed','forged_header_denied',true,'missing_financial_permission_hidden',true);
end $visibility$;

create function pg_temp.match_ar_fx_report_tail() returns jsonb
language plpgsql as $match$
declare context_value jsonb:=current_setting('qa.ap_ar_fx_5')::jsonb;commands jsonb;records jsonb;
begin
 select jsonb_agg(jsonb_build_object('relation','payable_receivable','payable_id',context_value->>'payable','receivable_line_id',context_value->>'line','amount',0.01,'receivable_amount',0.01,'allow_cross_party',true))
 into commands from generate_series(1,3);
 records:=public.fms_payable_writeoff_secure(commands,(context_value->>'scheme')::uuid,app_private.payable_business_date(),'报表按真实本位币分摊读取');
 if not exists(select 1 from public.fms_payable_writeoff_record where id=(records->>2)::uuid and payable_base_amount=0.08 and receivable_base_amount=0.08) then
  raise exception 'Source tail fixture did not allocate the actual final cent';end if;
 perform set_config('qa.ap_ar_fx_5',(context_value||jsonb_build_object('records',records))::text,true);
 return jsonb_build_object('case',5,'status','passed','records',records);
end $match$;

create function pg_temp.restore_ar_fx_report_tail() returns jsonb
language plpgsql as $restore$
declare context_value jsonb:=current_setting('qa.ap_ar_fx_5')::jsonb;record_ident uuid;original_roles text[];
begin
 for record_ident in select value::uuid from jsonb_array_elements_text(context_value->'records') loop
  perform public.fms_reverse_payable_writeoff_secure(record_ident,'报表验证后按原分摊反核销');
 end loop;
 select array_agg(value) into original_roles from jsonb_array_elements_text(context_value->'original_roles');
 update public.sys_user set user_roles=original_roles where id=(context_value->>'profile')::uuid;
 return jsonb_build_object('case',5,'status','passed');
end $restore$;

create function pg_temp.check_ar_unverified_and_other_book() returns jsonb
language plpgsql as $books$
declare context_value jsonb;tenant uuid;book uuid;other_book uuid;financial_type uuid;customer uuid;document_ident uuid;line_ident uuid;other_document uuid;query_value jsonb;workspace jsonb;plan jsonb;original_roles text[];
begin
 context_value:=pg_temp.prepare_payable_receivable_fx(1);tenant:=(context_value->>'tenant')::uuid;book:=(context_value->>'book')::uuid;other_book:=(context_value->>'other_book')::uuid;
 select id into financial_type from public.mdm_document_type where tenant_id=tenant and document_type_code='AR_FIN_STANDARD';
 select customer_id into customer from public.fms_receivable_document where id=(context_value->>'document')::uuid;
 update public.fms_account_set set is_default=false where tenant_id=tenant and is_default;
 if app_private.resolve_fms_posting_account_set(tenant) is not null then raise exception 'Unconfigured-book fixture unexpectedly resolved a default book';end if;
 document_ident:=public.fms_save_receivable_document_secure(jsonb_build_object('kind','financial','tenantId',tenant,'documentTypeId',financial_type,'customerId',customer,
  'settlementOrganizationId',context_value->>'organization','businessDate',app_private.payable_business_date(),'currencyCode','CNY','settlementMethod','cash',
  'lines',jsonb_build_array(jsonb_build_object('lineNo',10,'basis','amount','materialDescription','账套未配置时原生登记的应收','enteredGrossAmount',1,
   'quantity',0,'unitPrice',0,'priceBasis','taxed','taxRate',0,'discountMethod','none'))));
 perform public.fms_act_receivable_document_secure(document_ident,'submit');
 perform public.fms_act_receivable_document_secure(document_ident,'approve');
 select id into line_ident from public.fms_receivable_line where document_id=document_ident;
 update public.fms_account_set set is_default=true where id=book;
 if(app_private.ar_financial_book_context(document_ident)->>'configured')::boolean is distinct from false
  or app_private.payable_receivable_source_ready(document_ident,app_private.payable_business_date()) is distinct from false
  or not exists(select 1 from public.fms_receivable_document where id=document_ident and account_set_id is null and book_snapshot_version is null) then
  raise exception 'Restoring a default book invented an approval snapshot for an unverified original';end if;
 select document_id into other_document from public.fms_receivable_line where id=(context_value->>'foreign_line')::uuid;
 query_value:=jsonb_build_object('relation','payable_receivable','document_ids',jsonb_build_array(context_value->>'payable',context_value->>'document',document_ident,other_document));
 workspace:=public.fms_payable_writeoff_workspace_secure(query_value);
 if exists(select 1 from jsonb_array_elements(workspace->'secondary') entry where entry->>'document_id' in(document_ident::text,other_document::text))
  or not exists(select 1 from jsonb_array_elements(workspace->'blocked_sources') entry where entry->>'id'=line_ident::text and entry->>'balance_state'='unverified_book' and nullif(entry->>'balance_message','') is not null)
  or not exists(select 1 from jsonb_array_elements(workspace->'blocked_sources') entry where entry->>'id'=context_value->>'foreign_line' and entry->>'balance_state'='uninitialized_book') then
  raise exception 'Unverified or uninitialized sources were silently guessed, hidden or offered for writeoff';end if;
 workspace:=public.fms_payable_writeoff_workspace_secure(query_value||jsonb_build_object('tenant_id',context_value->>'foreign_tenant'));
 if jsonb_array_length(workspace->'primary')<>0 or jsonb_array_length(workspace->'secondary')<>0 or jsonb_array_length(workspace->'blocked_sources')<>0 then
  raise exception 'Blocked-source diagnostics leaked across tenant filters';end if;
 insert into public.fms_opening_balance_control(tenant_id,account_set_id,fiscal_year,status,confirmed_at,confirmed_by)
 values(tenant,other_book,extract(year from app_private.payable_business_date())::integer,'confirmed',clock_timestamp(),context_value->>'actor')
 on conflict(account_set_id,fiscal_year) do update set status='confirmed';
 query_value:=jsonb_build_object('relation','payable_receivable','document_ids',jsonb_build_array(context_value->>'payable',other_document),'cross_currency_mode','full_pair','allow_cross_party',true);
 workspace:=public.fms_payable_writeoff_workspace_secure(query_value);
 if jsonb_array_length(workspace->'primary')<>1 or jsonb_array_length(workspace->'secondary')<>1
  or(workspace->'secondary'->0->>'account_set_id')::uuid<>other_book then raise exception 'Initialized secondary source was assigned to the current default rather than its own actual book';end if;
 update public.fms_payable_writeoff_scheme set automatic=true where id=(context_value->>'scheme')::uuid;
 plan:=public.fms_auto_payable_writeoff_secure((context_value->>'scheme')::uuid,app_private.payable_business_date(),query_value,false);
 if jsonb_array_length(plan->'items')<>0 then raise exception 'Automatic matching paired two initialized but different actual books';end if;
 select array_agg(value) into original_roles from jsonb_array_elements_text(context_value->'original_roles');
 update public.sys_user set user_roles=original_roles where id=(context_value->>'profile')::uuid;
 return jsonb_build_object('status','passed','unverified_book',true,'uninitialized_book',true,'actual_cross_book_rejected',true);
end $books$;

create function pg_temp.prepare_ar_workspace_boundary() returns jsonb
language plpgsql as $prepare$
declare context_value jsonb;tenant uuid;book uuid;financial_type uuid;customer uuid;document_ident uuid;payload_lines jsonb;fixture_role uuid;
begin
 context_value:=pg_temp.prepare_payable_receivable_fx(1);tenant:=(context_value->>'tenant')::uuid;book:=(context_value->>'book')::uuid;
 update public.fms_exchange_rate set direct_rate=7.333333 where account_set_id=book and rate_date=app_private.payable_business_date() and rate_type='spot'
  and currency_id in(select id from public.fms_currency where account_set_id=book and currency_code='USD');
 select id into financial_type from public.mdm_document_type where tenant_id=tenant and document_type_code='AR_FIN_STANDARD';
 select customer_id into customer from public.fms_receivable_document where id=(context_value->>'document')::uuid;
 select jsonb_agg(jsonb_build_object('lineNo',sequence_value*10,'basis','amount','materialDescription','核销来源边界行'||sequence_value,'enteredGrossAmount',0.01,
  'quantity',0,'unitPrice',0,'priceBasis','taxed','taxRate',0,'discountMethod','none')) into payload_lines from generate_series(1,201) sequence_value;
 document_ident:=public.fms_save_receivable_document_secure(jsonb_build_object('kind','financial','tenantId',tenant,'documentTypeId',financial_type,'customerId',customer,
  'settlementOrganizationId',context_value->>'organization','businessDate',app_private.payable_business_date(),'currencyCode','USD','settlementMethod','cash','lines',payload_lines));
 perform public.fms_act_receivable_document_secure(document_ident,'submit');
 perform public.fms_act_receivable_document_secure(document_ident,'approve');
 select id into fixture_role from public.sys_role where tenant_id=tenant and role_code=context_value->>'fixture_role_code';
 insert into public.sys_role_menu(role_id,menu_id,tenant_id) select fixture_role,id,tenant from public.sys_menu where name in('FinancePayableWriteoff','FinancePayableWriteoff:View','FinancePayableWriteoff:AutoWriteoff') on conflict do nothing;
 update public.fms_payable_writeoff_scheme set automatic=true where id=(context_value->>'scheme')::uuid;
 context_value:=context_value||jsonb_build_object('boundary_document',document_ident,'boundary_query',jsonb_build_object('relation','payable_receivable',
  'document_ids',jsonb_build_array(context_value->>'payable',document_ident),'allow_cross_party',true));
 perform set_config('qa.ar_workspace_boundary',context_value::text,true);
 return jsonb_build_object('status','prepared','lines',201);
end $prepare$;

create function pg_temp.check_ar_workspace_boundary(p_available integer) returns jsonb
language plpgsql as $boundary$
declare context_value jsonb:=current_setting('qa.ar_workspace_boundary')::jsonb;workspace jsonb;plan jsonb;blocked boolean;original_roles text[];
begin
 workspace:=public.fms_payable_writeoff_workspace_secure(context_value->'boundary_query');
 if jsonb_array_length(workspace->'secondary')<>200 then raise exception 'Foreign-source workspace did not enforce its 200-row read boundary';end if;
 if p_available=201 then
  blocked:=false;
  begin perform public.fms_auto_payable_writeoff_secure((context_value->>'scheme')::uuid,app_private.payable_business_date(),context_value->'boundary_query',false);
  exception when check_violation then blocked:=true;end;
  if not blocked then raise exception 'Automatic matching silently truncated a 201-source preview';end if;
 elsif p_available=200 then
  plan:=public.fms_auto_payable_writeoff_secure((context_value->>'scheme')::uuid,app_private.payable_business_date(),context_value->'boundary_query',false);
  if jsonb_array_length(plan->'items')<>3 then raise exception 'Automatic matching lost eligible sources at its supported 200-row boundary';end if;
  select array_agg(value) into original_roles from jsonb_array_elements_text(context_value->'original_roles');
  update public.sys_user set user_roles=original_roles where id=(context_value->>'profile')::uuid;
 else raise exception 'Unsupported source-boundary fixture';end if;
 return jsonb_build_object('status','passed','available_sources',p_available,'visible_sources',200);
end $boundary$;

create function pg_temp.close_ar_workspace_boundary_line() returns jsonb
language plpgsql as $close$
declare context_value jsonb:=current_setting('qa.ar_workspace_boundary')::jsonb;line_ident uuid;writeoff_ident uuid;
begin
 select id into line_ident from public.fms_receivable_line where document_id=(context_value->>'boundary_document')::uuid and line_no=2010;
 writeoff_ident:=public.fms_execute_receivable_writeoff_secure(jsonb_build_object('relationKind','special','writeoffDate',app_private.payable_business_date(),
  'organizationId',context_value->>'organization','reason','边界验收使用原生业务关闭一条来源','sides',jsonb_build_array(jsonb_build_object('side','primary','sourceType','financial','id',line_ident,'amount',0.01))));
 if app_private.ar_line_balance(line_ident,false)<>0 then raise exception 'Native close did not remove the final source from matchable originals';end if;
 return jsonb_build_object('status','passed','native_writeoff',writeoff_ident);
end $close$;

select pg_temp.prepare_payable_receivable_fx(1);
select pg_temp.check_ar_fx_workspace(1,'before');
select pg_temp.match_payable_receivable_fx(1);
select pg_temp.check_ar_fx_workspace(1,'after');
select pg_temp.reverse_payable_receivable_fx(1);
select pg_temp.check_ar_fx_workspace(1,'restored');
select pg_temp.prepare_payable_receivable_fx(2);
select pg_temp.check_ar_fx_workspace(2,'before');
select pg_temp.match_payable_receivable_fx(2);
select pg_temp.check_ar_fx_workspace(2,'after');
select pg_temp.reverse_payable_receivable_fx(2);
select pg_temp.check_ar_fx_workspace(2,'restored');
select pg_temp.prepare_payable_receivable_fx(3);
select pg_temp.check_ar_fx_workspace(3,'before');
select pg_temp.match_payable_receivable_fx(3);
select pg_temp.check_ar_fx_workspace(3,'after');
select pg_temp.reverse_payable_receivable_fx(3);
select pg_temp.check_ar_fx_workspace(3,'restored');
select pg_temp.prepare_payable_receivable_fx(4);
select pg_temp.check_ar_fx_workspace(4,'before');
select pg_temp.match_payable_receivable_fx(4);
select pg_temp.check_ar_fx_workspace(4,'after');
select pg_temp.reverse_payable_receivable_fx(4);
select pg_temp.check_ar_fx_workspace(4,'restored');
select pg_temp.prepare_ar_fx_report_tail();
select pg_temp.check_ar_counterparty_report_balance(0.03,0.22);
select pg_temp.match_ar_counterparty_partial_tail();
select pg_temp.check_ar_counterparty_report_balance(0.01,0.08);
select pg_temp.check_ar_counterparty_visibility();
select pg_temp.restore_ar_fx_report_tail();
select pg_temp.check_ar_counterparty_report_balance(0.03,0.22);
select pg_temp.prepare_ar_fx_report_tail();
select pg_temp.check_ar_fx_workspace(5,'before');
select pg_temp.match_ar_fx_report_tail();
select pg_temp.check_ar_fx_workspace(5,'after');
select pg_temp.restore_ar_fx_report_tail();
select pg_temp.check_ar_fx_workspace(5,'restored');
select pg_temp.check_ar_unverified_and_other_book();
select pg_temp.prepare_ar_workspace_boundary();
select pg_temp.check_ar_workspace_boundary(201);
select pg_temp.close_ar_workspace_boundary_line();
select pg_temp.check_ar_workspace_boundary(200);
rollback;
