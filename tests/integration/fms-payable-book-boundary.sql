begin;

do $test$
declare
 actor uuid;fund_actor uuid;account_set public.fms_account_set;posting_date date;other_book uuid;other_currency uuid;fund uuid;other_fund uuid;supplier uuid;material uuid;unit_id uuid;
 finance_type uuid;payment_type uuid;purpose uuid;prepayment_purpose uuid;method uuid;virtual_method uuid;scheme uuid;debit uuid;credit uuid;rule_id uuid;
 finance jsonb;payment jsonb;advance jsonb;virtual_payment jsonb;result jsonb;payment_line uuid;blocked boolean;index_value integer;ledger_count bigint;
begin
 select auth_user_id into actor from public.sys_user where user_roles @>array['R_SUPER'] and auth_user_id is not null limit 1;
 select book.* into account_set from public.fms_account_set book where book.is_default and book.status='active' and book.base_currency_code='CNY'
 and exists(select 1 from public.fms_fund_account account join public.fms_currency currency on currency.id=account.currency_id where account.account_set_id=book.id and account.status='active' and account.account_type='bank' and currency.currency_code='CNY')
 and exists(select 1 from public.mdm_material where tenant_id=book.tenant_id and inventory_unit_id is not null) limit 1;
 select start_date into posting_date from public.fms_accounting_period where account_set_id=account_set.id and status='open' order by start_date desc limit 1;
 if actor is null or posting_date is null then raise exception 'Missing book-boundary fixtures';end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers','{}',true);
 select account.id into fund from public.fms_fund_account account join public.fms_currency currency on currency.id=account.currency_id where account.account_set_id=account_set.id and account.status='active' and account.account_type='bank' and currency.currency_code='CNY' limit 1;
 select id into supplier from public.mdm_supplier where tenant_id=account_set.tenant_id limit 1;
 select id,inventory_unit_id into material,unit_id from public.mdm_material where tenant_id=account_set.tenant_id and inventory_unit_id is not null limit 1;
 select id into finance_type from public.mdm_document_type where tenant_id=account_set.tenant_id and document_type_code='AP_FIN_STANDARD';
 select id into payment_type from public.mdm_document_type where tenant_id=account_set.tenant_id and document_type_code='AP_PAYMENT_PURCHASE';
 select id into purpose from public.mdm_payment_purpose where tenant_id=account_set.tenant_id and code='201';
 select id into prepayment_purpose from public.mdm_payment_purpose where tenant_id=account_set.tenant_id and code='202';
 select id into method from public.mdm_settlement_method where tenant_id=account_set.tenant_id and code='JSFS04';
 select id into virtual_method from public.mdm_settlement_method where tenant_id=account_set.tenant_id and category='virtual' and enabled limit 1;
 select id into scheme from public.fms_payable_writeoff_scheme where tenant_id=account_set.tenant_id and code='AP-MANUAL';
 insert into public.fms_account_set(tenant_id,account_set_code,account_set_name,legal_entity_name,base_currency_code,enabled_on,status)
 values(account_set.tenant_id,'QA_BOOK_'||upper(left(gen_random_uuid()::text,8)),'第二账套回滚验收','虚构验收主体','CNY',posting_date,'active') returning id into other_book;
 insert into public.fms_currency(tenant_id,account_set_id,currency_code,currency_name,symbol,is_enabled,is_base) values(account_set.tenant_id,other_book,'CNY','人民币','¥',true,true) returning id into other_currency;
 select auth_user_id into fund_actor from public.sys_user where tenant_id=account_set.tenant_id and auth_user_id is not null and status='1' limit 1;
 if fund_actor is null then raise exception 'Missing tenant-owned fund creator fixture';end if;
 perform set_config('request.jwt.claim.sub',fund_actor::text,true);
 insert into public.fms_fund_account(tenant_id,account_set_id,currency_id,account_code,account_name,account_type,bank_name,account_no_masked,account_no_fingerprint,opening_balance)
 values(account_set.tenant_id,other_book,other_currency,'QA_FUND_'||upper(left(gen_random_uuid()::text,8)),'虚构第二账套账户','bank','虚构验收银行','**** QA',md5(gen_random_uuid()::text),10000) returning id into other_fund;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 for index_value in 1..2 loop
  update public.fms_account_set set is_default=false where id=account_set.id;
  update public.fms_account_set set is_default=true where id=other_book;
  finance:=public.fms_save_purchase_payable_secure(jsonb_build_object('kind','financial','tenant_id',account_set.tenant_id,'document_type_id',finance_type,'supplier_id',supplier,'business_date',posting_date,'lines',jsonb_build_array(jsonb_build_object('material_id',material,'inventory_unit_id',unit_id,'quantity',1,'unit_price',index_value*10,'tax_rate',0))));
  perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'submit');perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'approve');
  if (finance->>'account_set_id')::uuid<>other_book then raise exception 'Source did not retain its non-default book';end if;
  update public.fms_account_set set is_default=false where id=other_book;
  update public.fms_account_set set is_default=true where id=account_set.id;
  result:=public.fms_payable_settlement_options_secure('payment',account_set.tenant_id);
  if not exists(select 1 from jsonb_array_elements(result->'fund') item where item->>'id'=other_fund::text and item->>'account_set_id'=other_book::text and nullif(item->>'account_set_name','') is not null) or not exists(select 1 from jsonb_array_elements(result->'payable') item where item->>'id'=finance->>'id' and item->>'account_set_id'=other_book::text) then raise exception 'Reference options omitted source or bank book context';end if;
  blocked:=false;begin
   perform public.fms_save_payable_settlement_secure(jsonb_build_object('kind','payment','tenant_id',account_set.tenant_id,'document_type_id',payment_type,'business_date',posting_date,'lines',jsonb_build_array(jsonb_build_object('purpose_id',purpose,'supplier_id',supplier,'payable_id',finance->>'id','settlement_method_id',method,'fund_account_id',fund,'amount',index_value*10))));
  exception when check_violation then blocked:=true;end;
  if not blocked or exists(select 1 from public.fms_payable_settlement_line where payable_id=(finance->>'id')::uuid) then raise exception 'Cross-book source payment saved or retained a reservation';end if;
  advance:=public.fms_save_payable_settlement_secure(jsonb_build_object('kind','payment','tenant_id',account_set.tenant_id,'document_type_id',payment_type,'business_date',posting_date,'lines',jsonb_build_array(jsonb_build_object('purpose_id',prepayment_purpose,'supplier_id',supplier,'settlement_method_id',method,'fund_account_id',fund,'amount',index_value*10))));
  perform public.fms_act_payable_settlement_secure(array[(advance->>'id')::uuid],'submit');perform public.fms_act_payable_settlement_secure(array[(advance->>'id')::uuid],'approve');perform public.fms_act_payable_settlement_secure(array[(advance->>'id')::uuid],'confirm');
  payment_line:=(advance->'lines'->0->>'id')::uuid;
  if app_private.payable_scheme_matches(gen_random_uuid(),(finance->>'id')::uuid,payment_line) is distinct from false then raise exception 'Missing scheme returned a permissive NULL result';end if;
  if not exists(select 1 from public.fms_payable_payment_execution where line_id=payment_line and status='posted' and account_set_id=account_set.id) then raise exception 'Payment execution lost its actual book';end if;
  blocked:=false;begin perform public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('payable_id',finance->>'id','payment_line_id',payment_line,'amount',index_value*10)),scheme,posting_date,'禁止跨账套');exception when check_violation then blocked:=true;end;
  if not blocked or exists(select 1 from public.fms_payable_writeoff_record where payment_line_id=payment_line and status='active') or(app_private.purchase_payable_json((finance->>'id')::uuid)->>'unpaid_amount')::numeric<>index_value*10 then raise exception 'Cross-book writeoff changed accounting balances';end if;
  update public.fms_payable_writeoff_scheme set automatic=true where id=scheme;
  result:=public.fms_auto_payable_writeoff_secure(scheme,posting_date,jsonb_build_object('supplier_id',supplier),false);
  if jsonb_array_length(result->'items')<>0 then raise exception 'Cross-book automatic preview offered an unexecutable pair';end if;
  update public.fms_payable_writeoff_scheme set automatic=false where id=scheme;
  payment:=public.fms_save_payable_settlement_secure(jsonb_build_object('kind','payment','tenant_id',account_set.tenant_id,'document_type_id',payment_type,'business_date',posting_date,'lines',jsonb_build_array(jsonb_build_object('purpose_id',purpose,'supplier_id',supplier,'payable_id',finance->>'id','settlement_method_id',method,'fund_account_id',other_fund,'amount',index_value*10))));
  perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'submit');perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'approve');perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'confirm');
  if (app_private.purchase_payable_json((finance->>'id')::uuid)->>'unpaid_amount')::numeric<>0 or not exists(select 1 from public.fms_payable_payment_execution where document_id=(payment->>'id')::uuid and account_set_id=other_book and status='posted') then raise exception 'Correct same-book payment failed to settle the source';end if;
 end loop;
 blocked:=false;begin update public.fms_fund_account set account_set_id=other_book,currency_id=other_currency where id=fund;exception when foreign_key_violation then blocked:=true;end;
 if not blocked then raise exception 'Used fund account book could be rewritten';end if;
 payment:=public.fms_save_payable_settlement_secure(jsonb_build_object('kind','payment','tenant_id',account_set.tenant_id,'document_type_id',payment_type,'business_date',posting_date,'lines',jsonb_build_array(jsonb_build_object('purpose_id',prepayment_purpose,'supplier_id',supplier,'settlement_method_id',method,'fund_account_id',fund,'amount',1),jsonb_build_object('purpose_id',prepayment_purpose,'supplier_id',supplier,'settlement_method_id',method,'fund_account_id',other_fund,'amount',1))));
 blocked:=false;begin perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'submit');exception when check_violation then blocked:=true;end;
 if not blocked or(select status from public.fms_payable_settlement_document where id=(payment->>'id')::uuid)<>'draft' then raise exception 'Mixed-book submission did not preserve an editable draft';end if;
 payment:=public.fms_save_payable_settlement_secure(jsonb_set(payment,'{lines,1,fund_account_id}',to_jsonb(fund)));
 perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'submit');perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'approve');
 update public.fms_payable_settlement_line set fund_account_id=other_fund where id=(payment->'lines'->1->>'id')::uuid;
 select count(*) into ledger_count from public.fms_fund_ledger_entry;
 blocked:=false;begin perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'confirm');exception when check_violation then blocked:=true;end;
 if not blocked or exists(select 1 from public.fms_payable_payment_execution where document_id=(payment->>'id')::uuid) or(select count(*) from public.fms_fund_ledger_entry)<>ledger_count or(select status from public.fms_payable_settlement_document where id=(payment->>'id')::uuid)<>'approved' then raise exception 'Mixed-book confirmation was not atomic';end if;
 select id into debit from public.fms_subject subject where account_set_id=account_set.id and is_enabled and not cash_flow_required and not exists(select 1 from public.fms_subject child where child.parent_id=subject.id) and not exists(select 1 from public.fms_subject_auxiliary_type binding where binding.subject_id=subject.id and binding.is_required) order by subject_code limit 1;
 select id into credit from public.fms_subject subject where account_set_id=account_set.id and id<>debit and is_enabled and not cash_flow_required and not exists(select 1 from public.fms_subject child where child.parent_id=subject.id) and not exists(select 1 from public.fms_subject_auxiliary_type binding where binding.subject_id=subject.id and binding.is_required) order by subject_code limit 1;
 if credit is null or virtual_method is null then raise exception 'Missing virtual payment posting fixtures';end if;
 insert into public.fms_posting_rule(tenant_id,account_set_id,rule_code,rule_name,source_type,event_code,priority,submission_mode) values(account_set.tenant_id,account_set.id,'QA_PAY_'||upper(left(gen_random_uuid()::text,8)),'原付款账套回滚规则','system','ap_payment_confirmed',999999,'draft') returning id into rule_id;
 insert into public.fms_posting_rule_line(tenant_id,account_set_id,rule_id,line_no,subject_id,direction,amount_key) values(account_set.tenant_id,account_set.id,rule_id,1,debit,'debit','gross_amount'),(account_set.tenant_id,account_set.id,rule_id,2,credit,'credit','gross_amount');
 virtual_payment:=public.fms_save_payable_settlement_secure(jsonb_build_object('kind','payment','tenant_id',account_set.tenant_id,'document_type_id',payment_type,'business_date',posting_date,'lines',jsonb_build_array(jsonb_build_object('purpose_id',prepayment_purpose,'supplier_id',supplier,'settlement_method_id',virtual_method,'amount',1))));
 perform public.fms_act_payable_settlement_secure(array[(virtual_payment->>'id')::uuid],'submit');perform public.fms_act_payable_settlement_secure(array[(virtual_payment->>'id')::uuid],'approve');perform public.fms_act_payable_settlement_secure(array[(virtual_payment->>'id')::uuid],'confirm');
 update public.fms_account_set set is_default=false where id=account_set.id;update public.fms_account_set set is_default=true where id=other_book;
 perform public.fms_act_payable_settlement_secure(array[(virtual_payment->>'id')::uuid],'cancel_payment','切换默认账套后仍保留原账套');perform public.fms_act_payable_settlement_secure(array[(virtual_payment->>'id')::uuid],'confirm');
 if exists(select 1 from public.fms_payable_payment_execution where document_id=(virtual_payment->>'id')::uuid and account_set_id<>account_set.id) then raise exception 'Virtual payment was repriced into a new default book';end if;
 result:=public.fms_payable_settlement_voucher_secure((virtual_payment->>'id')::uuid,'payment',true);
 if jsonb_array_length(result->'lines')<>2 then raise exception 'Preview did not use original payment book: %',result;end if;
 result:=public.fms_payable_settlement_voucher_secure((virtual_payment->>'id')::uuid,'payment',false);
 if result->>'status'<>'generated' or not exists(select 1 from public.fms_voucher where id=(result->'voucher_ids'->>0)::uuid and account_set_id=account_set.id) then raise exception 'Voucher followed new default instead of original payment book: %',result;end if;
 if has_function_privilege('authenticated','app_private.payable_execution_book(uuid,uuid)','EXECUTE') or has_function_privilege('anon','app_private.assert_payable_source_book(uuid,uuid,uuid)','EXECUTE') then raise exception 'Private book guard exposed';end if;
end $test$;

rollback;
