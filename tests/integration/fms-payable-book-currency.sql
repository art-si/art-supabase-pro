begin;
do $test$
declare
 actor uuid;subject_actor uuid;subject_suffix text:=to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS');account_set public.fms_account_set;posting_date date;supplier uuid;material uuid;unit_id uuid;document_type uuid;currency_ident uuid;debit_subject uuid;credit_subject uuid;rule_id uuid;source_kind text;
 estimate jsonb;finance jsonb;result jsonb;reversal jsonb;context jsonb;estimate_id uuid;finance_id uuid;reversal_id uuid;generated_voucher_id uuid;blocked boolean;index_value integer;estimate_rate numeric;finance_rate numeric;estimate_price numeric;finance_price numeric;original_total numeric;expected_cost numeric;
begin
 select auth_user_id into actor from public.sys_user where user_roles @>array['R_SUPER'] and auth_user_id is not null limit 1;
 select * into account_set from public.fms_account_set book where book.is_default and book.status='active' and book.base_currency_code='CNY' and exists(select 1 from public.mdm_material where tenant_id=book.tenant_id and inventory_unit_id is not null) limit 1;
 select start_date into posting_date from public.fms_accounting_period where account_set_id=account_set.id and status='open' order by start_date desc limit 1;
 if actor is null or posting_date is null then raise exception 'Missing foreign payable fixtures';end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers','{}',true);
 select id into supplier from public.mdm_supplier where tenant_id=account_set.tenant_id limit 1;
 select id,inventory_unit_id into material,unit_id from public.mdm_material where tenant_id=account_set.tenant_id and inventory_unit_id is not null limit 1;
 select id into document_type from public.mdm_document_type where tenant_id=account_set.tenant_id and document_type_code='AP_EST_OTHER';
 insert into public.fms_currency(tenant_id,account_set_id,currency_code,currency_name,symbol,is_enabled) values(account_set.tenant_id,account_set.id,'USD','美元','$',true) on conflict(account_set_id,currency_code) do update set is_enabled=true returning id into currency_ident;
 insert into public.fms_exchange_rate(tenant_id,account_set_id,currency_id,rate_date,rate_type,direct_rate) values(account_set.tenant_id,account_set.id,currency_ident,posting_date,'spot',7) on conflict(account_set_id,currency_id,rate_date,rate_type) do update set direct_rate=7;
 select auth_user_id into subject_actor from public.sys_user where tenant_id=account_set.tenant_id and auth_user_id is not null and status='1' order by (id=account_set.created_by_user_id) desc,id limit 1;
 if subject_actor is null then raise exception 'Missing tenant-owned accounting fixture actor';end if;
 perform set_config('request.jwt.claim.sub',subject_actor::text,true);
 insert into public.fms_subject(tenant_id,account_set_id,subject_code,subject_name,category,balance_direction,allow_foreign_currency)
 values(account_set.tenant_id,account_set.id,'991'||subject_suffix,'外币采购成本回滚科目','asset','debit',false) returning id into debit_subject;
 insert into public.fms_subject(tenant_id,account_set_id,subject_code,subject_name,category,balance_direction,allow_foreign_currency)
 values(account_set.tenant_id,account_set.id,'992'||subject_suffix,'外币采购应付回滚科目','liability','credit',true) returning id into credit_subject;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 foreach source_kind in array array['estimated_payable','financial_payable'] loop
  insert into public.fms_posting_rule(tenant_id,account_set_id,rule_code,rule_name,source_type,event_code,priority,submission_mode) values(account_set.tenant_id,account_set.id,'FX_'||upper(left(gen_random_uuid()::text,8)),'外币应付回滚规则',source_kind,'approved',999999,'draft') returning id into rule_id;
  insert into public.fms_posting_rule_line(tenant_id,account_set_id,rule_id,line_no,subject_id,direction,amount_key) values(account_set.tenant_id,account_set.id,rule_id,1,debit_subject,'debit','gross_amount'),(account_set.tenant_id,account_set.id,rule_id,2,credit_subject,'credit','gross_amount');
 end loop;
 for index_value in 1..3 loop
  estimate_rate:=case when index_value=2 then 7.5 else 7 end;finance_rate:=case when index_value=1 then 7.2 when index_value=2 then 7.6 else 7 end;estimate_price:=index_value*100;finance_price:=case when index_value=1 then 110 else estimate_price end;
  original_total:=round(estimate_price*(case when index_value>=2 then 1.13 else 1 end),2);
  estimate:=public.fms_save_purchase_payable_secure(jsonb_build_object('kind','estimated','tenant_id',account_set.tenant_id,'document_type_id',document_type,'supplier_id',supplier,'business_date',posting_date,'currency_code','USD','exchange_rate',case when index_value=1 then null else estimate_rate end,'input_tax_inclusive_price',false,'tax_excluded_from_cost',index_value=1,'lines',jsonb_build_array(jsonb_build_object('material_id',material,'inventory_unit_id',unit_id,'quantity',1,'unit_price',estimate_price,'tax_rate',case when index_value>=2 then 13 else 0 end))));estimate_id:=(estimate->>'id')::uuid;
  if estimate->>'currency_code'<>'USD' or(estimate->>'exchange_rate')::numeric<>estimate_rate or(estimate->>'base_total_amount')::numeric<>original_total*estimate_rate then raise exception 'Foreign payable lost recorded currency or local value: %',estimate;end if;
  blocked:=false;begin perform public.fms_save_purchase_payable_secure(estimate||jsonb_build_object('account_set_id','00000000-0000-4000-8000-000000000001'));exception when check_violation then blocked:=true;end;
  if not blocked then raise exception 'Readonly book could be overridden by the client';end if;
  perform public.fms_act_purchase_payable_secure(array[estimate_id],'submit');perform public.fms_act_purchase_payable_secure(array[estimate_id],'approve');
  finance:=public.fms_push_estimated_payable_secure(estimate_id);finance_id:=(finance->>'id')::uuid;
  blocked:=false;begin perform public.fms_save_purchase_payable_secure(finance||jsonb_build_object('currency_code','CNY','exchange_rate',1));exception when check_violation then blocked:=true;end;
  if not blocked then raise exception 'Invoice changed currency of the linked estimate';end if;
  finance:=finance||jsonb_build_object('exchange_rate',finance_rate,'tax_excluded_from_cost',index_value<>3,'lines',jsonb_build_array((finance->'lines'->0)||jsonb_build_object('unit_price',finance_price,'tax_rate',case when index_value=2 then 13 when index_value=3 then 9 else 0 end,'tax_inclusive_unit_price',round(finance_price*(case when index_value=2 then 1.13 when index_value=3 then 1.09 else 1 end),4))));
  finance:=public.fms_save_purchase_payable_secure(finance);
  if (app_private.purchase_payable_json(estimate_id)->>'exchange_rate')::numeric<>estimate_rate then raise exception 'Invoice repriced original estimate rate';end if;
  perform public.fms_act_purchase_payable_secure(array[finance_id],'submit');perform public.fms_act_purchase_payable_secure(array[finance_id],'approve');
  blocked:=false;begin perform public.fms_push_payable_settlement_secure(finance_id,'payment');exception when check_violation then blocked:=true;end;
  if not blocked or exists(select 1 from public.fms_payable_settlement_line where payable_id=finance_id) then raise exception 'Foreign debt could be paid using an unconverted CNY amount';end if;
  select id into reversal_id from public.fms_purchase_payable_document where reversal_of=estimate_id and reversal_source_id=finance_id;
  reversal:=app_private.purchase_payable_json(reversal_id);expected_cost:=round(finance_price*(case when index_value=3 then 1.09 else 1 end)*finance_rate,2)-round((case when index_value>=2 then original_total else estimate_price end)*estimate_rate,2);
  if reversal->>'currency_code'<>'USD' or(reversal->>'exchange_rate')::numeric<>estimate_rate or(reversal->>'base_total_amount')::numeric<>-original_total*estimate_rate or(reversal->'lines'->0->>'cost_difference')::numeric<>expected_cost then raise exception 'Foreign reversal did not preserve original rate or local cost: %',reversal;end if;
  update public.fms_exchange_rate set direct_rate=9 where account_set_id=account_set.id and currency_id=currency_ident and rate_date=posting_date and rate_type='spot';
  context:=public.fms_payable_currency_context_secure('estimated',posting_date,'USD',account_set.tenant_id,estimate_id);
  if (context->>'exchange_rate')::numeric<>9 or(app_private.purchase_payable_json(estimate_id)->>'exchange_rate')::numeric<>estimate_rate then raise exception 'Date rate overwrote stored book rate';end if;
  result:=public.fms_payable_voucher_secure(estimate_id);
  if result->>'status'<>'generated' then raise exception 'Foreign estimate voucher failed: %',result;end if;generated_voucher_id:=(result->>'voucher_id')::uuid;
  if not exists(select 1 from public.fms_voucher_line where voucher_id=generated_voucher_id and subject_id=credit_subject and original_amount=original_total and exchange_rate=estimate_rate and credit_amount=original_total*estimate_rate) then raise exception 'Foreign ledger omitted original amount or used current rate';end if;
  result:=public.fms_payable_voucher_secure(finance_id);if result->>'status'<>'generated' then raise exception 'Foreign invoice voucher failed: %',result;end if;
  result:=public.fms_payable_voucher_secure(reversal_id);if result->>'status'<>'generated' then raise exception 'Foreign reversal voucher failed: %',result;end if;
  if not exists(select 1 from public.fms_voucher_line where voucher_id=(result->>'voucher_id')::uuid and subject_id=credit_subject and original_amount=original_total and exchange_rate=estimate_rate and debit_amount=original_total*estimate_rate) then raise exception 'Foreign reversal ledger did not offset original debt';end if;
 end loop;
 if not exists(select 1 from public.get_record_delete_dependency_details('fms_currency',array[currency_ident::text],null) dependency where dependency.source_table='fms_purchase_payable_document' and dependency.record_no=estimate->>'document_no') then raise exception 'Currency reference guard cannot identify the estimated payable';end if;
 blocked:=false;begin update public.fms_currency set currency_code='XQA' where id=currency_ident;exception when foreign_key_violation or check_violation then blocked:=true;end;
 if not blocked then raise exception 'Referenced currency code could be renamed';end if;
 estimate:=public.fms_save_purchase_payable_secure(jsonb_build_object('kind','estimated','tenant_id',account_set.tenant_id,'document_type_id',document_type,'supplier_id',supplier,'business_date',posting_date,'currency_code','USD','exchange_rate',1.4,'lines',jsonb_build_array(jsonb_build_object('material_id',material,'inventory_unit_id',unit_id,'quantity',1,'unit_price',0.01,'tax_rate',0),jsonb_build_object('material_id',material,'inventory_unit_id',unit_id,'quantity',1,'unit_price',0.01,'tax_rate',0))));estimate_id:=(estimate->>'id')::uuid;
 perform public.fms_act_purchase_payable_secure(array[estimate_id],'submit');perform public.fms_act_purchase_payable_secure(array[estimate_id],'approve');
 finance:=public.fms_push_estimated_payable_secure(estimate_id);finance_id:=(finance->>'id')::uuid;
 finance:=public.fms_save_purchase_payable_secure(finance||jsonb_build_object('exchange_rate',1.5));
 perform public.fms_act_purchase_payable_secure(array[finance_id],'submit');perform public.fms_act_purchase_payable_secure(array[finance_id],'approve');
 if (select sum(cost_difference) from public.fms_purchase_payable_line where document_id in(select id from public.fms_purchase_payable_document where reversal_source_id=finance_id))<>0 then raise exception 'Per-line exchange rounding manufactured an inventory cost variance';end if;
 blocked:=false;begin perform app_private.resolve_fms_book_currency(account_set.tenant_id,account_set.id,'USD',posting_date,'NaN'::numeric,true);exception when check_violation then blocked:=true;end;if not blocked then raise exception 'Nonfinite rate was accepted';end if;
 if has_function_privilege('anon','public.fms_payable_currency_context_secure(text,date,text,uuid,uuid)','EXECUTE') then raise exception 'Anonymous currency context exposed';end if;
end $test$;
rollback;
