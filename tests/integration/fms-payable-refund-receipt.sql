begin;

do $test$
declare
 actor uuid;ordinary uuid;ordinary_profile uuid;fixture_role uuid;fixture_code text;refund_purpose uuid;match_scheme uuid;matching jsonb;foreign_tenant uuid;statement record;finance jsonb;payment jsonb;source_line public.fms_payable_settlement_line;
 fund uuid;cash uuid;allocation uuid;amount_value numeric;refund_amount numeric;remaining_amount numeric;fee_value numeric;
 refund_document uuid;refund_line uuid;receipt_execution uuid;receipt_ledger uuid;refund_match uuid;voucher uuid;period record;
 detail jsonb;listing jsonb;blocked boolean;case_count integer:=0;cash_count bigint;
begin
 select auth_user_id into actor from public.sys_user where user_roles @>array['R_SUPER'] and auth_user_id is not null limit 1;
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers','{}',true);
 for statement in select statement_row.* from public.tms_carrier_statement statement_row
 where statement_row.status='confirmed'
 and exists(select 1 from public.fms_fund_account account join public.fms_currency currency on currency.id=account.currency_id where account.tenant_id=statement_row.tenant_id and account.status='active' and account.account_type<>'cash' and currency.currency_code='CNY' and account.account_set_id=app_private.resolve_fms_posting_account_set(statement_row.tenant_id))
 and (select bool_and(item.line_amount>0) and sum(item.line_amount)>4 from public.tms_carrier_statement_item item where item.statement_id=statement_row.id and item.is_active)
 and not exists(select 1 from public.fms_purchase_payable_document payable where payable.tms_statement_id=statement_row.id and payable.kind='financial')
 order by statement_row.id limit 2 loop
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',statement.tenant_id)::text,true);
  select account.id into fund from public.fms_fund_account account join public.fms_currency currency on currency.id=account.currency_id
   where account.tenant_id=statement.tenant_id and account.status='active' and account.account_type<>'cash' and currency.currency_code='CNY'
    and account.account_set_id=app_private.resolve_fms_posting_account_set(statement.tenant_id) order by account.id limit 1;
  finance:=public.fms_import_carrier_payable_secure('financial',statement.id);
  perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'submit');perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'approve');
  payment:=public.fms_push_payable_settlement_secure((finance->>'id')::uuid,'payment');
  amount_value:=round((payment->>'amount')::numeric/2,2);fee_value:=case when case_count=0 then 5 else 0 end;
  payment:=public.fms_save_payable_settlement_secure(payment||jsonb_build_object('details',jsonb_build_object('fee',fee_value),'lines',
   (select jsonb_agg(item||jsonb_build_object('fund_account_id',fund,'amount',amount_value,'approved_amount',amount_value,'planned_amount',amount_value)) from jsonb_array_elements(payment->'lines') item)));
  select * into source_line from public.fms_payable_settlement_line where id=(payment->'lines'->0->>'id')::uuid;
  perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'submit');perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'approve');perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'confirm');
  select cash_transaction_id into cash from public.fms_payable_payment_execution where document_id=(payment->>'id')::uuid and status='posted';
  select id into allocation from public.tms_carrier_cash_allocation where transaction_id=cash and statement_id=statement.id and is_active;
  perform public.reverse_tms_carrier_cash_allocation_secure(allocation,'释放原核销以验证待退占用');
  refund_amount:=round(amount_value/2,2);remaining_amount:=amount_value-refund_amount;
  insert into public.fms_payable_settlement_document(tenant_id,kind,document_no,business_date,amount,created_by_user_id,account_set_id)
  values(statement.tenant_id,'refund','QA-RFR-'||upper(left(gen_random_uuid()::text,8)),app_private.payable_business_date(),refund_amount,actor,(finance->>'account_set_id')::uuid) returning id into refund_document;
  select id into refund_purpose from public.mdm_payment_purpose where tenant_id=statement.tenant_id and business_type='purchase_refund' and payable_writeoff and enabled order by code limit 1;
  if refund_purpose is null then raise exception 'Transport refund needs a symmetric refund purpose';end if;
  insert into public.fms_payable_settlement_line(tenant_id,document_id,line_no,purpose_id,carrier_id,payable_id,settlement_method_id,fund_account_id,amount,approved_amount,planned_amount,refund_payment_line_id)
  values(statement.tenant_id,refund_document,10,refund_purpose,source_line.carrier_id,source_line.payable_id,source_line.settlement_method_id,fund,refund_amount,refund_amount,refund_amount,source_line.id) returning id into refund_line;
  blocked:=false;
  begin perform public.allocate_tms_carrier_payment_secure(cash,jsonb_build_array(jsonb_build_object('statement_id',statement.id,'amount',amount_value)));
  exception when others then if sqlerrm like '%未核销余额%' then blocked:=true;else raise;end if;end;
  if not blocked then raise exception 'Native transport allocation spent a pending refund reservation';end if;
  detail:=public.tms_get_cash_transaction_secure(cash);listing:=public.tms_list_cash_transactions_secure(p_record_id=>cash)->'records'->0;
  if (detail->>'allocatable_amount')::numeric is distinct from remaining_amount or (listing->>'allocatable_amount')::numeric is distinct from remaining_amount
   or (detail->>'refund_reserved_amount')::numeric is distinct from refund_amount or (detail->>'fee_amount')::numeric is distinct from fee_value then raise exception 'Native cash reads disagree with refund or fee reservations';end if;
  perform public.allocate_tms_carrier_payment_secure(cash,jsonb_build_array(jsonb_build_object('statement_id',statement.id,'amount',remaining_amount)));
  if (public.tms_get_cash_transaction_secure(cash)->>'allocatable_amount')::numeric<>0 then raise exception 'Native allocation left reusable reserved cash';end if;
  update public.fms_payable_settlement_document set status='approved' where id=refund_document;
  select count(*) into cash_count from public.tms_cash_transaction;
  select id into foreign_tenant from public.sys_tenant where id<>statement.tenant_id and status='1' and builtin_type is distinct from 'platform'
   and(service_start_date is null or service_start_date<=app_private.payable_business_date()) and(service_end_date is null or service_end_date>=app_private.payable_business_date()) order by id limit 1;
  if foreign_tenant is null then raise exception 'Refund receipt tenant isolation needs a second tenant';end if;
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',foreign_tenant)::text,true);blocked:=false;
  begin perform app_private.act_payable_refund_receipt(refund_document,'confirm');exception when insufficient_privilege then blocked:=true;end;
  if not blocked then raise exception 'Selected tenant scope was ignored during refund receipt';end if;
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',statement.tenant_id)::text,true);
  perform set_config('request.jwt.claim.sub','',true);blocked:=false;
  begin perform app_private.act_payable_refund_receipt(refund_document,'confirm');exception when insufficient_privilege then blocked:=true;end;
  if not blocked then raise exception 'Anonymous actor confirmed a refund receipt';end if;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform app_private.act_payable_refund_receipt(refund_document,'confirm');
  perform app_private.act_payable_refund_receipt(refund_document,'confirm');
  if (select count(*) from public.fms_payable_payment_execution where document_id=refund_document and status='posted')<>1 then raise exception 'Repeated confirmation duplicated the refund execution';end if;
  if (select count(*) from public.tms_cash_transaction)<>cash_count then raise exception 'Refund receipt created a duplicate transport cash transaction';end if;
  select id,fund_ledger_id into receipt_execution,receipt_ledger from public.fms_payable_payment_execution where document_id=refund_document and status='posted';
  if not app_private.payable_refund_receipt_valid(refund_line) or (public.tms_get_cash_transaction_secure(cash)->>'allocatable_amount')::numeric<>0 then raise exception 'Actual receipt released already returned transport cash';end if;
  insert into public.fms_payable_writeoff_record(tenant_id,record_no,payment_line_id,refund_line_id,relation,amount,payment_amount,refund_amount,cash_discount_amount,writeoff_date,actor)
  values(statement.tenant_id,'QA-RFR-HX-'||upper(left(gen_random_uuid()::text,8)),source_line.id,refund_line,'payment_refund',refund_amount,refund_amount,refund_amount,0,app_private.payable_business_date(),actor) returning id into refund_match;

  select auth_user_id,id into ordinary,ordinary_profile from public.sys_user where tenant_id=statement.tenant_id and auth_user_id is not null and status='1' and not user_roles @>array['R_SUPER'] order by id limit 1;
  if ordinary is null then raise exception 'Transport refund permission regression needs an ordinary user';end if;
  fixture_code:='QA_RRF_ACCESS_'||upper(left(gen_random_uuid()::text,8));
  insert into public.sys_role(tenant_id,role_code,role_name,enabled) values(statement.tenant_id,fixture_code,'运输退款核销金额权限回归',true) returning id into fixture_role;
  insert into public.sys_role_menu(role_id,menu_id,tenant_id) select fixture_role,id,statement.tenant_id from public.sys_menu where name in('FinancePayableWriteoff:View','FinancePayableWriteoff:Writeoff','FinancePayableWriteoff:Reverse','FinancePayableWriteoff:AutoWriteoff','FinancePayableWriteoff:Voucher');
  update public.sys_user set user_roles=array[fixture_code] where id=ordinary_profile;
  insert into public.sys_user_field_permission(tenant_id,user_id,resource_id,field_id,access_level)
  select statement.tenant_id,ordinary_profile,resource.id,field.id,'hidden' from public.sys_permission_resource resource join public.sys_permission_field field on field.resource_id=resource.id and field.tenant_id=resource.tenant_id
   where resource.tenant_id=statement.tenant_id and((resource.resource_key='tms.cash_transaction' and field.field_key='transactionAmounts') or(resource.resource_key='tms.carrier_statement' and field.field_key='settlementAmounts'))
  on conflict(tenant_id,user_id,resource_id,field_id) do update set access_level=excluded.access_level;
  perform set_config('request.jwt.claim.sub',ordinary::text,true);perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',foreign_tenant)::text,true);
  if app_private.payable_settlement_line_amount_access(source_line.id,false) or app_private.payable_settlement_line_amount_access(source_line.id,true) then raise exception 'Hidden transport cash field became readable or writable through refund matching';end if;
  matching:=public.fms_payable_writeoff_workspace_secure(jsonb_build_object('relation','payment_refund','document_ids',jsonb_build_array(payment->>'id',refund_document)));
  if exists(select 1 from jsonb_array_elements(matching->'primary') candidate where candidate->>'id'=source_line.id::text)
   or exists(select 1 from jsonb_array_elements(matching->'secondary') candidate where candidate->>'id'=refund_line::text)
   or exists(select 1 from jsonb_array_elements(matching->'history') candidate where candidate->>'id'=refund_match::text) then raise exception 'Refund workbench exposed hidden transport principal';end if;
  blocked:=false;begin perform public.fms_reverse_payable_writeoff_secure(refund_match,'无运输金额权限的反核销阻断');exception when insufficient_privilege then blocked:=true;end;
  if not blocked then raise exception 'Refund unmatching bypassed transport allocation or field edit permissions';end if;
  execute 'set local role authenticated';
  if exists(select 1 from public.fms_payable_writeoff_record where id=refund_match) then raise exception 'Direct writeoff RLS exposed hidden transport amounts';end if;
  execute 'reset role';
  update public.sys_user_field_permission set access_level='read' where tenant_id=statement.tenant_id and user_id=ordinary_profile and field_id in(select field.id from public.sys_permission_field field join public.sys_permission_resource resource on resource.id=field.resource_id where resource.tenant_id=statement.tenant_id and resource.resource_key in('tms.cash_transaction','tms.carrier_statement'));
  if app_private.payable_settlement_line_amount_access(source_line.id,false) is distinct from true or app_private.payable_settlement_line_amount_access(source_line.id,true) then raise exception 'Read-only transport permission did not remain read-only';end if;
  execute 'set local role authenticated';
  if not exists(select 1 from public.fms_payable_writeoff_record where id=refund_match) then raise exception 'Authorized direct transport writeoff read lost its own record';end if;
  execute 'reset role';
  insert into public.sys_role_menu(role_id,menu_id,tenant_id) select fixture_role,id,statement.tenant_id from public.sys_menu where name='FinanceCashTransaction:Allocate';
  if app_private.payable_settlement_line_amount_access(source_line.id,true) then raise exception 'Allocate permission bypassed a read-only transport field';end if;
  update public.sys_user_field_permission set access_level='edit' where tenant_id=statement.tenant_id and user_id=ordinary_profile and field_id in(select field.id from public.sys_permission_field field join public.sys_permission_resource resource on resource.id=field.resource_id where resource.tenant_id=statement.tenant_id and resource.resource_key in('tms.cash_transaction','tms.carrier_statement'));
  if app_private.payable_settlement_line_amount_access(source_line.id,true) is distinct from true then raise exception 'Authorized ordinary transport refund matching remained blocked';end if;
  perform public.fms_reverse_payable_writeoff_secure(refund_match,'合法运输退款核销回归');
  select id into match_scheme from public.fms_payable_writeoff_scheme where tenant_id=statement.tenant_id and code='AP-SAME-SOURCE' and enabled;
  matching:=public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('relation','payment_refund','payment_line_id',source_line.id,'refund_line_id',refund_line,'amount',refund_amount)),match_scheme,app_private.payable_business_date(),'普通用户合法运输付款冲退款');
  refund_match:=(matching->>0)::uuid;
  if not exists(select 1 from public.fms_payable_writeoff_record where id=refund_match and relation='payment_refund' and status='active' and amount=round(amount_value/2,2)) then raise exception 'Ordinary transport refund matching did not persist its exact principal';end if;
  perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',statement.tenant_id)::text,true);

  select * into period from public.fms_accounting_period where account_set_id=(finance->>'account_set_id')::uuid and status='open' order by start_date desc limit 1;
  if period.id is null then raise exception 'Refund receipt test needs an open accounting period';end if;
  insert into public.fms_voucher(tenant_id,account_set_id,accounting_period_id,voucher_no,voucher_date,fiscal_year,period_no,source_type,source_id,summary)
  values(statement.tenant_id,(finance->>'account_set_id')::uuid,period.id,'QA-RFR-V-'||upper(left(gen_random_uuid()::text,8)),period.start_date,period.fiscal_year,period.period_no,'system',receipt_execution,'退款收回凭证阻断回归') returning id into voucher;
  blocked:=false;
  begin perform app_private.act_payable_refund_receipt(refund_document,'cancel_receipt','已有凭证不得撤销');exception when check_violation then blocked:=true;end;
  if not blocked or not exists(select 1 from public.fms_payable_payment_execution where id=receipt_execution and status='posted') then raise exception 'Refund cancellation bypassed its voucher guard';end if;
  update public.fms_voucher set status='voided' where id=voucher;
  perform app_private.act_payable_refund_receipt(refund_document,'cancel_receipt','验证真实资金冲回与退款反核销');
  if exists(select 1 from public.fms_payable_writeoff_record where id=refund_match and status='active') then raise exception 'Cancelling refund receipt kept its matching record active';end if;
  if not exists(select 1 from public.fms_payable_payment_execution where id=receipt_execution and status='reversed' and reversal_ledger_id is not null)
   or (select status from public.fms_fund_ledger_entry where id=receipt_ledger)<>'reversed'
   or (select status from public.fms_payable_settlement_document where id=refund_document)<>'approved' then raise exception 'Refund cancellation did not atomically reverse actual cash';end if;
  if (public.tms_get_cash_transaction_secure(cash)->>'allocatable_amount')::numeric<>0 then raise exception 'Cancelling receipt lost the pending refund hold';end if;
  update public.fms_payable_settlement_document set status='cancelled' where id=refund_document;
  if (public.tms_get_cash_transaction_secure(cash)->>'allocatable_amount')::numeric<>refund_amount then raise exception 'Voiding refund did not release its native allocation hold';end if;
  select id into allocation from public.tms_carrier_cash_allocation where transaction_id=cash and is_active;
  perform public.reverse_tms_carrier_cash_allocation_secure(allocation,'释放本轮原付款核销');
  perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'cancel_payment','完成退款资金往返后取消原付款');
  if (select coalesce(sum(case direction when 'inflow' then amount else -amount end),0) from public.fms_fund_ledger_entry where source_type='payable_refund' and source_no=(select document_no from public.fms_payable_settlement_document where id=refund_document))<>0 then raise exception 'Refund cancellation left a leaked real cash movement';end if;
  case_count:=case_count+1;
 end loop;
 if case_count<>2 then raise exception 'Need two transport refund receipt cases';end if;
 if has_function_privilege('authenticated','app_private.act_payable_refund_receipt(uuid,text,text)','EXECUTE') or has_function_privilege('anon','app_private.managed_carrier_payment_available(uuid)','EXECUTE') then raise exception 'Private refund receipt helpers became client-executable';end if;
end $test$;

rollback;
