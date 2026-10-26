BEGIN;

do $plans$
declare result jsonb;total numeric;item jsonb;amount_value numeric;blocked boolean;
begin
 select jsonb_agg(to_jsonb(row)) into result from app_private.payable_report_plan_balances(300,150,
 '[{"due_date":"2026-09-01","amount":100},{"due_date":"2026-12-01","amount":200}]','2026-09-01','due','oldest_due') row;
 if(result->0->>'balance_amount')::numeric<>0 or(result->1->>'balance_amount')::numeric<>150 then raise exception 'Oldest due allocation mismatch';end if;
 select jsonb_agg(to_jsonb(row)) into result from app_private.payable_report_plan_balances(300,150,
 '[{"due_date":"2026-09-01","amount":100},{"due_date":"2026-12-01","amount":200}]','2026-09-01','due','proportional') row;
 if(result->0->>'balance_amount')::numeric<>50 or(result->1->>'balance_amount')::numeric<>100 then raise exception 'Proportional allocation mismatch';end if;
 for amount_value in select generate_series(0,3)/100.0 loop
  select sum(balance_amount),jsonb_agg(to_jsonb(row)) into total,result from app_private.payable_report_plan_balances(0.03,amount_value,
   '[{"due_date":"2026-11-01","amount":0.01},{"due_date":"2026-11-01","amount":0.01},{"due_date":"2026-12-01","amount":0.01}]','2026-10-01','due','proportional') row;
  if total<>amount_value or exists(select 1 from jsonb_array_elements(result) value where(value->>'balance_amount')::numeric<0) then raise exception 'Cent allocation lost balance';end if;
 end loop;
 foreach item in array array[
  '[{"due_date":"2026-02-30","amount":300}]'::jsonb,
  '[{"due_date":"today","amount":300}]'::jsonb,
  '[{"due_date":"2026-11-01","amount":299}]'::jsonb,
  '[{"due_date":"2026-11-01","amount":-300}]'::jsonb,
  '[{"due_date":"2026-11-01","amount":"NaN"}]'::jsonb,
  '{}'::jsonb] loop
  select jsonb_agg(to_jsonb(row)) into result from app_private.payable_report_plan_balances(300,150,item,'2026-10-01') row;
  if result->0->>'plan_status'<>'invalid_plan' or(result->0->>'balance_amount')::numeric<>150 then raise exception 'Invalid legacy plan changed money: %',result;end if;
 end loop;
 select jsonb_agg(to_jsonb(row)) into result from app_private.payable_report_plan_balances(300,150,'[]','2026-10-01','business') row;
 if result->0->>'plan_status'<>'business_date' or result->0->>'due_date'<>'2026-10-01' then raise exception 'Business aging basis ignored';end if;
 blocked:=false;begin perform app_private.payable_report_plan_balances(300,150,'[]','2026-10-01','due',null);exception when invalid_parameter_value then blocked:=true;end;
 if not blocked then raise exception 'Null allocation silently accepted';end if;
end $plans$;

do $facts$
declare ordinary uuid:='a9eeb9b7-e474-43e3-9cc2-c2f46c0f0ec3';tenant uuid:='111e83d3-190e-4405-84c8-440d484d13a6';root_actor uuid;foreign_tenant uuid;
 source record;payload jsonb;canonical jsonb;checked integer:=0;blocked boolean;foreign_book uuid;foreign_document uuid;foreign_supplier uuid;
begin
 select auth_user_id into root_actor from public.sys_user where system_protected and user_roles @>array['R_SUPER'] and auth_user_id is not null order by id limit 1;
 select id into foreign_tenant from public.sys_tenant where id<>tenant and builtin_type is distinct from 'platform' order by id limit 1;
 perform set_config('request.jwt.claim.sub',root_actor::text,true);perform set_config('request.headers','{}',true);
 select id,tenant_id into foreign_book,foreign_tenant from public.fms_account_set where tenant_id<>tenant and status='active' and base_currency_code='CNY' order by id limit 1;
 if foreign_book is null then raise exception 'Foreign account-set fixture required';end if;
 insert into public.mdm_supplier(tenant_id,supplier_code,supplier_name) values(foreign_tenant,'RPT_'||upper(left(gen_random_uuid()::text,8)),'报表范围回滚主体'||gen_random_uuid()) returning id into foreign_supplier;
 insert into public.fms_purchase_payable_document(tenant_id,kind,document_no,business_date,created_by_user_id,source_type,account_set_id,currency_code,base_currency_code,exchange_rate,supplier_id)
 values(foreign_tenant,'financial','REPORT-SCOPE-'||gen_random_uuid(),app_private.payable_business_date(),root_actor,'manual',foreign_book,'CNY','CNY',1,foreign_supplier) returning id into foreign_document;
 insert into public.fms_purchase_payable_line(tenant_id,document_id,kind,line_no,line_snapshot,quantity,unit_price,amount,tax_amount,total_amount)
 values(foreign_tenant,foreign_document,'financial',10,'{}',1,1,1,0,1);
 update public.fms_purchase_payable_document set status='approved' where id=foreign_document;
 perform set_config('request.jwt.claim.sub',ordinary::text,true);perform set_config('request.headers','{}',true);
 for payload in select value from app_private.payable_report_source_balances('{}') value loop
  if payload->>'tenant_id'<>tenant::text then raise exception 'Ordinary report escaped authenticated tenant';end if;
  select * into source from public.fms_purchase_payable_document where id=(payload->>'document_id')::uuid;
  canonical:=app_private.purchase_payable_json(source.id);
  if payload->>'balance_state'<>'ready' then raise exception 'Existing acceptance source unexpectedly unreadable: %',payload;end if;
  if (payload->>'occurrence_amount')::numeric<>(canonical->>'total_amount')::numeric then raise exception 'Occurrence differs from canonical payable';end if;
  if source.kind='financial' then
   if (payload->>'balance_amount')::numeric<>(canonical->>'unpaid_amount')::numeric then raise exception 'Report current balance differs from canonical payable';end if;
   if (payload->>'base_balance_amount')::numeric<>(case when source.is_credit then -1 else 1 end)*app_private.payable_unwritten_base_amount(source.id) then raise exception 'Book balance differs from native base writeoff';end if;
   if (payload->>'balance_amount')::numeric<>coalesce((payload->>'current_amount')::numeric,0)+coalesce((payload->>'age1_to30')::numeric,0)+coalesce((payload->>'age31_to60')::numeric,0)+coalesce((payload->>'age61_to90')::numeric,0)+coalesce((payload->>'age91_to180')::numeric,0)+coalesce((payload->>'age_over180')::numeric,0)+coalesce((payload->>'credit_balance')::numeric,0) then raise exception 'Aging buckets do not preserve financial balance';end if;
  elsif (payload->>'balance_amount')::numeric<>(canonical->>'unreversed_amount')::numeric then raise exception 'Estimated balance duplicates reversed liability';end if;
  checked:=checked+1;
 end loop;
 if checked<2 then raise exception 'Need two independent acceptance sources';end if;
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',foreign_tenant)::text,true);
 if exists(select 1 from app_private.payable_report_source_balances('{}') value where value->>'tenant_id'<>tenant::text) then raise exception 'Forged ordinary header changed report scope';end if;
 blocked:=false;begin perform app_private.payable_report_source_balances(jsonb_build_object('tenant_id',foreign_tenant));exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Explicit foreign tenant filter accepted';end if;
 blocked:=false;begin perform app_private.payable_report_source_balances(jsonb_build_object('as_of_date',app_private.payable_business_date()+1));exception when invalid_parameter_value then blocked:=true;end;
 if not blocked then raise exception 'Future report cutoff accepted';end if;
 perform set_config('request.jwt.claim.sub',root_actor::text,true);perform set_config('request.headers','{}',true);
 if not exists(select 1 from app_private.payable_report_source_balances('{}') value where value->>'tenant_id'<>tenant::text) then raise exception 'Platform-all report omitted other tenants';end if;
 if not exists(select 1 from jsonb_array_elements(public.fms_payable_report_secure('{"size":200}')->'records') value where value->>'tenant_id'=foreign_tenant::text) then raise exception 'Platform-all public report omitted foreign source';end if;
 if not exists(select 1 from jsonb_array_elements(public.fms_payable_report_options_secure()->'books') value where value->>'tenant_id'=foreign_tenant::text) then raise exception 'Platform-all report options omitted foreign source book';end if;
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',tenant)::text,true);
 if exists(select 1 from app_private.payable_report_source_balances('{}') value where value->>'tenant_id'<>tenant::text) then raise exception 'Platform-selected report escaped scope';end if;
 if exists(select 1 from jsonb_array_elements(public.fms_payable_report_secure('{"size":200}')->'records') value where value->>'tenant_id'<>tenant::text) then raise exception 'Platform-selected public report escaped scope';end if;
 if exists(select 1 from jsonb_array_elements(public.fms_payable_report_options_secure()->'books') value where value->>'tenant_id'<>tenant::text) then raise exception 'Platform-selected report options escaped scope';end if;
 if has_function_privilege('authenticated','app_private.payable_report_source_balances(jsonb)','execute')
 or has_function_privilege('anon','app_private.payable_report_source_balances(jsonb)','execute') then raise exception 'Report internal facts exposed to clients';end if;
end $facts$;


do $historical$
declare actor uuid:='a9eeb9b7-e474-43e3-9cc2-c2f46c0f0ec3';tenant uuid:='111e83d3-190e-4405-84c8-440d484d13a6';
 book uuid;start_value date;business_day date:=app_private.payable_business_date();supplier uuid;material uuid;unit_id uuid;organization uuid;expense_type uuid;other_type uuid;
 blue jsonb;credit_note jsonb;payload jsonb;blue_id uuid;credit_id uuid;scheme uuid;created_ids jsonb;writeoff_id uuid;fact jsonb;before_funds bigint;
begin
 select id into book from public.fms_account_set where tenant_id=tenant and is_default and status='active';
 select start_date into start_value from public.fms_accounting_period where account_set_id=book and status='open' and start_date<=business_day-3 order by start_date desc limit 1;
 if start_value is null then raise exception 'Need an open period with historical dates for report acceptance';end if;
 select id,inventory_unit_id into material,unit_id from public.mdm_material where tenant_id=tenant and inventory_unit_id is not null order by id limit 1;
 select id into organization from public.mdm_organization where tenant_id=tenant order by id limit 1;
 select id into expense_type from public.mdm_document_type where tenant_id=tenant and document_type_code='AP_FIN_EXPENSE';
 select id into other_type from public.mdm_document_type where tenant_id=tenant and document_type_code='AP_FIN_OTHER';
 insert into public.mdm_supplier(tenant_id,supplier_code,supplier_name) values(tenant,'RPT_H_'||upper(left(gen_random_uuid()::text,8)),'报表历史回滚主体'||gen_random_uuid()) returning id into supplier;
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers','{}',true);
 select count(*) into before_funds from public.fms_fund_ledger_entry where tenant_id=tenant;
 payload:=jsonb_build_object('kind','financial','document_type_id',expense_type,'supplier_id',supplier,'organization_id',organization,'account_set_id',book,
  'currency_code','CNY','exchange_rate',1,'business_date',start_value,'input_tax_inclusive_price',false,
  'plans_by_ratio',false,'payment_plans',jsonb_build_array(jsonb_build_object('due_date',start_value+2,'amount',100,'ratio',33.3333),jsonb_build_object('due_date',business_day+30,'amount',200,'ratio',66.6667)),
  'lines',jsonb_build_array(jsonb_build_object('material_id',material,'inventory_unit_id',unit_id,'quantity',1,'unit_price',300,'tax_rate',0)));
 blue:=public.fms_save_purchase_payable_secure(payload);blue_id:=(blue->>'id')::uuid;
 perform public.fms_act_purchase_payable_secure(array[blue_id],'submit');perform public.fms_act_purchase_payable_secure(array[blue_id],'approve');
 payload:=payload||jsonb_build_object('is_credit',true,'document_type_id',other_type,'payment_plans','[]'::jsonb,
  'lines',jsonb_build_array(jsonb_build_object('material_id',material,'inventory_unit_id',unit_id,'quantity',1,'unit_price',150,'tax_rate',0)));
 credit_note:=public.fms_save_purchase_payable_secure(payload);credit_id:=(credit_note->>'id')::uuid;
 perform public.fms_act_purchase_payable_secure(array[credit_id],'submit');perform public.fms_act_purchase_payable_secure(array[credit_id],'approve');
 scheme:=public.fms_save_payable_reference_secure('scheme',jsonb_build_object('configuration_version',2,'code','RPT_H_'||upper(left(gen_random_uuid()::text,8)),
  'name','报表历史回滚方案','enabled',true,'automatic',false,
  'rules',jsonb_build_array(jsonb_build_object('primary_field','supplier_id','secondary_field','supplier_id','operator','eq','empty_matches',false))));
 created_ids:=public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('relation','payable_red_blue','payable_id',blue_id,'credit_payable_id',credit_id,'amount',150)),scheme,start_value+1,'报表历史余额回滚核验');
 writeoff_id:=(created_ids->>0)::uuid;
 select value into fact from app_private.payable_report_source_balances(jsonb_build_object('as_of_date',start_value,'kind','financial','party_type','supplier','party_id',supplier)) value where value->>'document_id'=blue_id::text;
 if(fact->>'balance_amount')::numeric<>300 then raise exception 'Historical report deducted a later writeoff';end if;
 select value into fact from app_private.payable_report_source_balances(jsonb_build_object('as_of_date',start_value+1,'kind','financial','party_type','supplier','party_id',supplier)) value where value->>'document_id'=blue_id::text;
 if(fact->>'balance_amount')::numeric<>150 then raise exception 'Historical report omitted a business-dated writeoff';end if;
 select value into fact from app_private.payable_report_source_balances(jsonb_build_object('kind','financial','party_type','supplier','party_id',supplier,'allocation_mode','oldest_due')) value where value->>'document_id'=blue_id::text;
 if(fact->>'current_amount')::numeric<>150 or(fact->>'age1_to30')::numeric<>0 then raise exception 'FIFO aging did not clear the earliest installment: %',fact;end if;
 select value into fact from app_private.payable_report_source_balances(jsonb_build_object('kind','financial','party_type','supplier','party_id',supplier,'allocation_mode','proportional')) value where value->>'document_id'=blue_id::text;
 if(fact->>'current_amount')::numeric<>100 or(fact->>'age1_to30')::numeric<>50 then raise exception 'Proportional aging did not distribute the balance: %',fact;end if;
 perform public.fms_reverse_payable_writeoff_secure(writeoff_id,'报表历史余额回滚反核销');
 select value into fact from app_private.payable_report_source_balances(jsonb_build_object('as_of_date',start_value+1,'kind','financial','party_type','supplier','party_id',supplier)) value where value->>'document_id'=blue_id::text;
 if(fact->>'balance_amount')::numeric<>150 then raise exception 'Current reversal rewrote a prior business-day balance';end if;
 select value into fact from app_private.payable_report_source_balances(jsonb_build_object('kind','financial','party_type','supplier','party_id',supplier)) value where value->>'document_id'=blue_id::text;
 if(fact->>'balance_amount')::numeric<>300 then raise exception 'Current report failed to restore reversed balance';end if;
 select value into fact from app_private.payable_report_source_balances(jsonb_build_object('kind','financial','party_type','supplier','party_id',supplier)) value where value->>'document_id'=credit_id::text;
 if(fact->>'credit_balance')::numeric<>-150 or(fact->>'balance_amount')::numeric<>-150 then raise exception 'Unallocated credit was incorrectly aged as positive debt';end if;
 if(select count(*) from public.fms_fund_ledger_entry where tenant_id=tenant)<>before_funds then raise exception 'Read-only report or noncash fixture moved funds';end if;
end $historical$;

ROLLBACK;

