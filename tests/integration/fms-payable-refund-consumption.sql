begin;

do $test$
declare
 actor uuid;fund_actor uuid;tenant uuid;book uuid;currency_id uuid;fund uuid;purpose uuid;method uuid;virtual_method uuid;
 supplier uuid;material uuid;unit_id uuid;finance_type uuid;payment_type uuid;scheme uuid;
 source_document jsonb;finance jsonb;source_line uuid;refund_document uuid;refund_line uuid;receipt_execution uuid;receipt_ledger uuid;
 refund_cash numeric;expired_discount numeric;available numeric;first_amount numeric;last_amount numeric;state jsonb;workspace jsonb;plan jsonb;
 result jsonb;record_id uuid;blocked boolean;case_number integer;method_category text;projection jsonb;
begin
 select auth_user_id into actor from public.sys_user where user_roles @>array['R_SUPER'] and auth_user_id is not null limit 1;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 select account_set.tenant_id,account_set.id,currency.id into tenant,book,currency_id
 from public.fms_account_set account_set join public.fms_currency currency on currency.tenant_id=account_set.tenant_id and currency.currency_code='CNY'
 join public.sys_tenant tenant_record on tenant_record.id=account_set.tenant_id
 where account_set.status='active' and account_set.is_default
 and exists(select 1 from public.mdm_material where tenant_id=account_set.tenant_id and inventory_unit_id is not null)
 and exists(select 1 from public.mdm_supplier where tenant_id=account_set.tenant_id)
 and exists(select 1 from public.mdm_payment_purpose where tenant_id=account_set.tenant_id and enabled and business_type='advance' and payable_writeoff)
 and exists(select 1 from public.mdm_settlement_method where tenant_id=account_set.tenant_id and enabled and category='cash')
 and exists(select 1 from public.mdm_settlement_method where tenant_id=account_set.tenant_id and enabled and category='virtual')
 and exists(select 1 from public.sys_user where tenant_id=account_set.tenant_id and auth_user_id is not null and status='1')
 order by (tenant_record.tenant_code='qa-payable-20261022') desc,account_set.id limit 1;
 if tenant is null then raise exception 'Refund consumption regression needs CNY accounting and procurement masters';end if;
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',tenant)::text,true);
 select auth_user_id into fund_actor from public.sys_user where tenant_id=tenant and auth_user_id is not null and status='1' order by id limit 1;
 perform set_config('request.jwt.claim.sub',fund_actor::text,true);
 insert into public.fms_fund_account(tenant_id,account_set_id,currency_id,account_code,account_name,account_type,bank_name,account_no_masked,account_no_fingerprint,opening_balance)
 values(tenant,book,currency_id,'QA_RFC_'||upper(left(gen_random_uuid()::text,8)),'退款核销测试资金户','cash','','**** QA',md5(gen_random_uuid()::text),2000) returning id into fund;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 select id into purpose from public.mdm_payment_purpose where tenant_id=tenant and enabled and business_type='advance' and payable_writeoff limit 1;
 select id into method from public.mdm_settlement_method where tenant_id=tenant and enabled and category='cash' limit 1;
 select id,category into virtual_method,method_category from public.mdm_settlement_method where tenant_id=tenant and enabled and category='virtual' limit 1;
 select id into supplier from public.mdm_supplier where tenant_id=tenant limit 1;
 select id,inventory_unit_id into material,unit_id from public.mdm_material where tenant_id=tenant and inventory_unit_id is not null limit 1;
 select id into finance_type from public.mdm_document_type where tenant_id=tenant and enabled and document_type_code='AP_FIN_STANDARD';
 select id into payment_type from public.mdm_document_type where tenant_id=tenant and enabled and document_type_code='AP_PAYMENT_PURCHASE';
 scheme:=public.fms_save_payable_reference_secure('scheme',jsonb_build_object('code','QA_RFC_'||upper(left(gen_random_uuid()::text,8)),
 'name','退款后可用余额回归方案','automatic',true,'rules','[{"primary_field":"supplier_id","secondary_field":"supplier_id","operator":"eq","empty_matches":false},{"primary_field":"currency_code","secondary_field":"currency_code","operator":"eq","empty_matches":false}]'::jsonb));
 for case_number in 1..3 loop
  refund_cash:=case case_number when 1 then 45 when 2 then 89.99 else 90 end;
  expired_discount:=case case_number when 1 then 5 when 2 then 0 else 10 end;
  available:=100-refund_cash-expired_discount;
  finance:=public.fms_save_purchase_payable_secure(jsonb_build_object('kind','financial','tenant_id',tenant,'document_type_id',finance_type,'supplier_id',supplier,
   'business_date',app_private.payable_business_date(),'account_set_id',book,'lines',jsonb_build_array(jsonb_build_object('material_id',material,'inventory_unit_id',unit_id,'quantity',1,'unit_price',100,'tax_rate',0))));
  perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'submit');
  perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'approve');
  source_document:=public.fms_save_payable_settlement_secure(jsonb_build_object('kind','payment','tenant_id',tenant,'document_type_id',payment_type,
   'business_date',app_private.payable_business_date(),'currency_code','CNY','lines',jsonb_build_array(jsonb_build_object('purpose_id',purpose,'supplier_id',supplier,
    'settlement_method_id',method,'fund_account_id',fund,'amount',90,'approved_amount',90,'planned_amount',90,'cash_discount',10,'details',jsonb_build_object('execution_category','virtual')))));
  source_line:=(source_document->'lines'->0->>'id')::uuid;
  perform public.fms_act_payable_settlement_secure(array[(source_document->>'id')::uuid],'submit');
  perform public.fms_act_payable_settlement_secure(array[(source_document->>'id')::uuid],'approve');
  perform public.fms_act_payable_settlement_secure(array[(source_document->>'id')::uuid],'confirm');
  if (select details->>'execution_category' from public.fms_payable_settlement_line where id=source_line)<>'cash' then raise exception 'Caller forged the confirmed settlement category snapshot';end if;
  insert into public.fms_payable_settlement_document(tenant_id,kind,document_no,business_date,amount,created_by_user_id,account_set_id)
  values(tenant,'refund','QA-RFC-'||upper(left(gen_random_uuid()::text,8)),app_private.payable_business_date(),refund_cash,actor,book) returning id into refund_document;
  insert into public.fms_payable_settlement_line(tenant_id,document_id,line_no,purpose_id,supplier_id,payee_supplier_id,settlement_method_id,fund_account_id,amount,approved_amount,planned_amount,refund_payment_line_id,expired_discount_amount)
  values(tenant,refund_document,10,purpose,supplier,supplier,method,fund,refund_cash,refund_cash,refund_cash,source_line,expired_discount) returning id into refund_line;
  state:=app_private.payable_payment_line_state(source_line);
  if (state->>'available_settlement_face')::numeric is distinct from available then raise exception 'Draft refund did not reserve the payment writeoff balance';end if;
  workspace:=public.fms_payable_writeoff_workspace_secure(jsonb_build_object('supplier_id',supplier));
  if available=0 then
   if exists(select 1 from jsonb_array_elements(workspace->'secondary') item where item->>'id'=source_line::text) then raise exception 'Fully reserved payment remained available in the workbench';end if;
  elsif not exists(select 1 from jsonb_array_elements(workspace->'secondary') item where item->>'id'=source_line::text and (item->>'available_amount')::numeric=available) then
   raise exception 'Workbench ignored pending refund cash or discount reservation';
  end if;
  plan:=public.fms_auto_payable_writeoff_secure(scheme,app_private.payable_business_date(),jsonb_build_object('supplier_id',supplier));
  if coalesce((select sum((item->>'amount')::numeric) from jsonb_array_elements(plan->'items') item where item->>'payment_line_id'=source_line::text),0)>available then raise exception 'Automatic matching spent a pending refund reservation';end if;
  blocked:=false;
  begin
   perform public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('payable_id',finance->>'id','payment_line_id',source_line,'amount',available+0.01)),scheme,app_private.payable_business_date(),'不得使用待退金额');
  exception when check_violation then blocked:=true;
  end;
  if not blocked then raise exception 'Manual writeoff spent pending refund cash or discount';end if;
  update public.fms_payable_settlement_document set status='approved' where id=refund_document;
  receipt_execution:=gen_random_uuid();
  select id into receipt_ledger from app_private.post_fms_fund_ledger_entry(fund,app_private.payable_business_date(),'inflow',refund_cash,'payable_refund',receipt_execution,'QA-RFC','退款核销回归',null,null,null);
  insert into public.fms_payable_payment_execution(id,tenant_id,line_id,document_id,amount,fund_ledger_id,status,actor)
  values(receipt_execution,tenant,refund_line,refund_document,refund_cash,receipt_ledger,'posted',actor);
  update public.fms_payable_settlement_document set status='confirmed' where id=refund_document;
  projection:=app_private.payable_settlement_json((source_document->>'id')::uuid);
  if (projection->'lines'->0->>'available_writeoff_amount')::numeric is distinct from available or (projection->'lines'->0->>'refunded_amount')::numeric is distinct from refund_cash then raise exception 'Payment projection omitted real refund balance';end if;
  if available>0 then
   first_amount:=round(available/2,2);last_amount:=available-first_amount;
   perform public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('payable_id',finance->>'id','payment_line_id',source_line,'amount',first_amount)),scheme,app_private.payable_business_date(),'退款后首笔核销');
   result:=public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('payable_id',finance->>'id','payment_line_id',source_line,'amount',last_amount)),scheme,app_private.payable_business_date(),'退款后尾笔核销');
   record_id:=(result->>0)::uuid;
   if (select sum(payment_amount) from public.fms_payable_writeoff_record where payment_line_id=source_line and status='active')<>90-refund_cash
    or (select sum(cash_discount_amount) from public.fms_payable_writeoff_record where payment_line_id=source_line and status='active')<>10-expired_discount then raise exception 'Refund-adjusted allocation overspent cash or lost discount cents';end if;
   state:=app_private.payable_payment_line_state(source_line);
   if (state->>'available_settlement_face')::numeric<>0 then raise exception 'Completed refund-adjusted writeoff left reusable credit';end if;
   perform public.fms_reverse_payable_writeoff_secure(record_id,'仅恢复本次核销，不恢复已退本金');
   state:=app_private.payable_payment_line_state(source_line);
   if (state->>'available_settlement_face')::numeric<>last_amount or (state->>'available_cash')::numeric>90-refund_cash then raise exception 'Reversing writeoff restored money that was already refunded';end if;
   perform public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('payable_id',finance->>'id','payment_line_id',source_line,'amount',last_amount)),scheme,app_private.payable_business_date(),'恢复末笔核销');
  end if;
 end loop;
 source_document:=public.fms_save_payable_settlement_secure(jsonb_build_object('kind','payment','tenant_id',tenant,'document_type_id',payment_type,
  'business_date',app_private.payable_business_date(),'currency_code','CNY','lines',jsonb_build_array(jsonb_build_object('purpose_id',purpose,'supplier_id',supplier,
   'settlement_method_id',virtual_method,'amount',100,'approved_amount',100,'planned_amount',100,'details',jsonb_build_object('execution_category','cash')))));
 source_line:=(source_document->'lines'->0->>'id')::uuid;
 perform public.fms_act_payable_settlement_secure(array[(source_document->>'id')::uuid],'submit');
 perform public.fms_act_payable_settlement_secure(array[(source_document->>'id')::uuid],'approve');
 perform public.fms_act_payable_settlement_secure(array[(source_document->>'id')::uuid],'confirm');
 update public.mdm_settlement_method set category='remittance' where id=virtual_method;
 state:=app_private.payable_payment_line_state(source_line);
 if (state->>'source_valid')::boolean or (state->>'available_cash')::numeric<>0 or (state->>'settlement_valid')::boolean is distinct from true or (state->>'available_settlement_face')::numeric<>100 then raise exception 'Virtual settlement became refundable cash or lost its historical credit';end if;
 perform public.fms_payable_writeoff_secure(jsonb_build_array(jsonb_build_object('payable_id',finance->>'id','payment_line_id',source_line,'amount',100)),scheme,app_private.payable_business_date(),'虚拟结算保留原核销能力');
 update public.mdm_settlement_method set category=method_category where id=virtual_method;
 if (app_private.payable_payment_line_state(source_line)->>'available_settlement_face')::numeric<>0 then raise exception 'Virtual payment credit was not consumed once';end if;
end $test$;

rollback;
