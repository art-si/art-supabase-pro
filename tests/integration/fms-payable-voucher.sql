begin;
do $test$
declare
  actor uuid;
  account_set public.fms_account_set%rowtype;
  posting_date date;
  debit_subject uuid;
  credit_subject uuid;
  supplier uuid;
  material uuid;
  inventory_unit uuid;
  document_type uuid;
  rule_id uuid;
  source_kind text;
  estimate jsonb;
  finance jsonb;
  result jsonb;
  repeated jsonb;
  preview jsonb;
  estimate_id uuid;
  finance_id uuid;
  reversal_id uuid;
  generated_voucher_id uuid;
  n int;
  vouchers uuid[]:=array[]::uuid[];
begin
  select auth_user_id into actor from public.sys_user where user_roles @>array['R_SUPER'] and auth_user_id is not null limit 1;
  select * into account_set from public.fms_account_set where is_default and status='active' and exists(select 1 from public.mdm_material where tenant_id=fms_account_set.tenant_id and status='enabled') and exists(select 1 from public.mdm_supplier where tenant_id=fms_account_set.tenant_id)
  and(nullif(current_setting('test.ar_tenant_code',true),'') is null or exists(select 1 from public.sys_tenant tenant where tenant.id=fms_account_set.tenant_id and tenant.tenant_code=current_setting('test.ar_tenant_code',true))) limit 1;
  select start_date into posting_date from public.fms_accounting_period where account_set_id=account_set.id and status='open' order by start_date desc limit 1;
  select id into debit_subject from public.fms_subject subject where account_set_id=account_set.id and is_enabled and not cash_flow_required and not exists(select 1 from public.fms_subject child where child.parent_id=subject.id) and not exists(select 1 from public.fms_subject_auxiliary_type binding where binding.subject_id=subject.id and binding.is_required) order by subject_code limit 1;
  select id into credit_subject from public.fms_subject subject where account_set_id=account_set.id and id<>debit_subject and is_enabled and not cash_flow_required and not exists(select 1 from public.fms_subject child where child.parent_id=subject.id) and not exists(select 1 from public.fms_subject_auxiliary_type binding where binding.subject_id=subject.id and binding.is_required) order by subject_code limit 1;
  if actor is null or posting_date is null or credit_subject is null then raise exception 'Missing voucher regression fixtures'; end if;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.headers','{}',true);
  foreach source_kind in array array['estimated_payable','financial_payable'] loop
    insert into public.fms_posting_rule(tenant_id,account_set_id,rule_code,rule_name,source_type,event_code,priority,submission_mode) values(account_set.tenant_id,account_set.id,'TEST_'||upper(left(gen_random_uuid()::text,8)),'应付凭证回滚验证',source_kind,'approved',999999,'draft') returning id into rule_id;
    insert into public.fms_posting_rule_line(tenant_id,account_set_id,rule_id,line_no,subject_id,direction,amount_key) values(account_set.tenant_id,account_set.id,rule_id,1,debit_subject,'debit','gross_amount'),(account_set.tenant_id,account_set.id,rule_id,2,credit_subject,'credit','gross_amount');
  end loop;
  select id,inventory_unit_id into material,inventory_unit from public.mdm_material where tenant_id=account_set.tenant_id and status='enabled' and inventory_unit_id is not null limit 1;
  select id into supplier from public.mdm_supplier where tenant_id=account_set.tenant_id limit 1;
  select id into document_type from public.mdm_document_type where tenant_id=account_set.tenant_id and document_type_code='AP_EST_OTHER';
  for n in 1..2 loop
  estimate:=public.fms_save_purchase_payable_secure(jsonb_build_object('kind','estimated','tenant_id',account_set.tenant_id,'supplier_id',supplier,'document_type_id',document_type,'business_date',posting_date,'lines',jsonb_build_array(jsonb_build_object('material_id',material,'inventory_unit_id',inventory_unit,'quantity',n,'unit_price',100,'tax_rate',13))));
  estimate_id:=(estimate->>'id')::uuid;
  perform public.fms_act_purchase_payable_secure(array[estimate_id],'submit');
  perform public.fms_act_purchase_payable_secure(array[estimate_id],'approve');
  preview:=public.fms_preview_payable_voucher_secure(estimate_id);
  if jsonb_array_length(preview->'lines')<>2 then raise exception 'Positive payable preview is empty'; end if;
  result:=public.fms_payable_voucher_secure(estimate_id);
  if result->>'status'<>'generated' then raise exception 'Estimated voucher failed: %',result; end if;
  vouchers:=array_append(vouchers,(result->>'voucher_id')::uuid);
  repeated:=public.fms_payable_voucher_secure(estimate_id);
  if repeated->>'voucher_id' is distinct from result->>'voucher_id' then raise exception 'Repeated generation duplicated a voucher'; end if;
  finance:=public.fms_push_estimated_payable_secure(estimate_id);
  finance_id:=(finance->>'id')::uuid;
  perform public.fms_act_purchase_payable_secure(array[finance_id],'submit');
  perform public.fms_act_purchase_payable_secure(array[finance_id],'approve');
  result:=public.fms_payable_voucher_secure(finance_id);
  if result->>'status'<>'generated' then raise exception 'Financial voucher failed: %',result; end if;
  vouchers:=array_append(vouchers,(result->>'voucher_id')::uuid);
  select id into reversal_id from public.fms_purchase_payable_document where reversal_source_id=finance_id and reversal_of=estimate_id;
  preview:=public.fms_preview_payable_voucher_secure(reversal_id);
  if (preview->'lines'->0->>'credit_amount')::numeric<>113*n or (preview->'lines'->1->>'debit_amount')::numeric<>113*n then raise exception 'Reversal preview did not invert debit/credit'; end if;
  result:=public.fms_payable_voucher_secure(reversal_id);
  if result->>'status'<>'generated' then raise exception 'Reversal voucher failed: %',result; end if;
  generated_voucher_id:=(result->>'voucher_id')::uuid;
  vouchers:=array_append(vouchers,generated_voucher_id);
  if not exists(select 1 from public.fms_voucher_line where voucher_id=generated_voucher_id and subject_id=debit_subject and credit_amount=113*n) then raise exception 'Reversal voucher did not credit original debit subject'; end if;
  if not exists(select 1 from public.fms_voucher where id=generated_voucher_id and total_debit=113*n and total_credit=113*n) then raise exception 'Reversal voucher is unbalanced'; end if;
  end loop;
  if (select count(distinct id) from unnest(vouchers) id)<>6
   or (select count(*) from public.fms_voucher where id=any(vouchers) and tenant_id=account_set.tenant_id and account_set_id=account_set.id and total_debit=total_credit)<>6
   or (select sum(total_debit) from public.fms_voucher where id=any(vouchers))<>1017
   then raise exception 'Two payable chains require six distinct scoped balanced vouchers';end if;
end $test$;
rollback;
