begin;

do $test$
declare
 actor uuid;fund_actor uuid;tenant uuid;fund uuid;book uuid;currency_id uuid;fund_type text;purpose uuid;method uuid;application_type uuid;payment_type uuid;
 parent public.scm_purchase_document;contract_id uuid;contract_total numeric;application jsonb;payment jsonb;replacement jsonb;additional jsonb;
 original_line uuid;refund_document uuid;refund_line uuid;receipt_execution uuid;receipt_ledger uuid;blocked boolean;projection jsonb;
 second_application jsonb;second_payment jsonb;second_replacement jsonb;second_line uuid;cross_record uuid;
begin
 select auth_user_id into actor from public.sys_user where user_roles @>array['R_SUPER'] and auth_user_id is not null limit 1;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 select account.tenant_id,account.account_set_id,account.currency_id,account.account_type into tenant,book,currency_id,fund_type
 from public.fms_fund_account account join public.fms_currency currency on currency.id=account.currency_id and currency.tenant_id=account.tenant_id
 join public.sys_tenant tenant_record on tenant_record.id=account.tenant_id
 where account.status='active' and account.account_type in('cash','bank') and currency.currency_code='CNY'
 and exists(select 1 from public.scm_purchase_document purchase where purchase.tenant_id=account.tenant_id and purchase.supplier_id is not null and coalesce((purchase.lines->0->>'quantity')::numeric,0)>=1)
 and exists(select 1 from public.mdm_payment_purpose purpose where purpose.tenant_id=account.tenant_id and purpose.enabled and purpose.business_type='advance')
 and exists(select 1 from public.mdm_settlement_method method where method.tenant_id=account.tenant_id and method.enabled and method.category=case account.account_type when 'cash' then 'cash' else 'remittance' end)
 and exists(select 1 from public.sys_user tenant_user where tenant_user.tenant_id=account.tenant_id and tenant_user.auth_user_id is not null and tenant_user.status='1')
 order by (tenant_record.tenant_code='qa-payable-20261022') desc,account.id limit 1;
 if tenant is null then raise exception 'Refund commitment regression needs procurement masters and a funded account';end if;
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',tenant)::text,true);
 select auth_user_id into fund_actor from public.sys_user where tenant_id=tenant and auth_user_id is not null and status='1' order by id limit 1;
 perform set_config('request.jwt.claim.sub',fund_actor::text,true);
 insert into public.fms_fund_account(tenant_id,account_set_id,currency_id,account_code,account_name,account_type,bank_name,account_no_masked,account_no_fingerprint,opening_balance)
 values(tenant,book,currency_id,'QA_RF_FUND_'||upper(left(gen_random_uuid()::text,8)),'退款额度测试资金户',fund_type,'虚构验收银行','**** QA',md5(gen_random_uuid()::text),2000) returning id into fund;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 select * into parent from public.scm_purchase_document where tenant_id=tenant and supplier_id is not null and coalesce((lines->0->>'quantity')::numeric,0)>=1 order by id limit 1;
 select id into purpose from public.mdm_payment_purpose where tenant_id=tenant and enabled and business_type='advance' limit 1;
 select id into method from public.mdm_settlement_method where tenant_id=tenant and enabled and category=case(select account_type from public.fms_fund_account where id=fund) when 'cash' then 'cash' else 'remittance' end limit 1;
 select id into application_type from public.mdm_document_type where tenant_id=tenant and enabled and document_type_code='AP_APP_PURCHASE';
 select id into payment_type from public.mdm_document_type where tenant_id=tenant and enabled and document_type_code='AP_PAYMENT_PURCHASE';
 insert into public.scm_purchase_document(tenant_id,kind,document_no,supplier_id,project_id,document_date,lines,created_by_user_id)
 values(tenant,'purchase_contract','QA-RF-CONTRACT-'||left(gen_random_uuid()::text,8),parent.supplier_id,parent.project_id,current_date,
 jsonb_build_array((parent.lines->0)-array['source_line_id','source_line_no','source_document_no','source_purchase_document_id','source_sales_document_id','source_quantity','quotation_line_id']||jsonb_build_object('line_id',gen_random_uuid()::text,'unit_price',1000,'tax_inclusive_unit_price',1000,'tax_rate',0,'discount_mode','none','discount_rate',0,'gift',false)),actor)
 returning id,total_amount into contract_id,contract_total;
 if contract_total<200 then raise exception 'Synthetic refund contract budget was not calculated';end if;
 update public.scm_purchase_document set status='submitted' where id=contract_id;
 update public.scm_purchase_document set status='approved' where id=contract_id;
 update public.scm_purchase_document set status='effective' where id=contract_id;
 application:=public.fms_save_payable_settlement_secure(jsonb_build_object('kind','application','tenant_id',tenant,'document_type_id',application_type,
 'business_date',current_date,'currency_code','CNY','lines',jsonb_build_array(jsonb_build_object('purpose_id',purpose,'supplier_id',parent.supplier_id,
 'payee_supplier_id',parent.supplier_id,'purchase_id',contract_id,'contract_id',contract_id,'settlement_method_id',method,'fund_account_id',fund,'amount',100,'approved_amount',100,'planned_amount',100))));
 perform public.fms_act_payable_settlement_secure(array[(application->>'id')::uuid],'submit');
 perform public.fms_act_payable_settlement_secure(array[(application->>'id')::uuid],'approve');
 payment:=public.fms_push_payable_settlement_secure((application->>'id')::uuid,'payment','application');
 payment:=public.fms_save_payable_settlement_secure(payment||jsonb_build_object('lines',jsonb_build_array(payment->'lines'->0||jsonb_build_object('amount',90,'approved_amount',90,'planned_amount',90,'cash_discount',10))));
 original_line:=(payment->'lines'->0->>'id')::uuid;
 perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'submit');
 perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'approve');
 perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'confirm');
 insert into public.fms_payable_settlement_document(tenant_id,kind,document_no,business_date,amount,created_by_user_id,account_set_id)
 values(tenant,'refund','QA-RF-COMMIT-'||left(gen_random_uuid()::text,8),current_date,45,actor,book) returning id into refund_document;
 insert into public.fms_payable_settlement_line(tenant_id,document_id,line_no,purpose_id,supplier_id,payee_supplier_id,settlement_method_id,fund_account_id,amount,approved_amount,planned_amount,refund_payment_line_id,expired_discount_amount)
 values(tenant,refund_document,10,purpose,parent.supplier_id,parent.supplier_id,method,fund,45,45,45,original_line,5) returning id into refund_line;
 if app_private.purchase_advance_reserved(contract_id,true)<>100 then raise exception 'Pending refund prematurely released procurement quota';end if;
 update public.fms_payable_settlement_document set status='approved' where id=refund_document;
 perform app_private.act_payable_refund_receipt(refund_document,'confirm');
 select id,fund_ledger_id into receipt_execution,receipt_ledger from public.fms_payable_payment_execution where document_id=refund_document and status='posted';
 projection:=app_private.payable_settlement_json((application->>'id')::uuid);
 if (projection->'lines'->0->>'unassigned_amount')::numeric<>50 or (projection->>'paid_amount')::numeric<>45 or projection->>'payment_status'<>'partial' then raise exception 'Refund did not reopen the correct application cash and approval budget';end if;
 replacement:=public.fms_push_payable_settlement_secure((application->>'id')::uuid,'payment','application');
 if (replacement->>'amount')::numeric<>50 then raise exception 'Refunded application cannot push its remaining approved quota';end if;
 blocked:=false;
 begin
  perform app_private.act_payable_refund_receipt(refund_document,'cancel_receipt','补付后不得超额撤销收回');
 exception when check_violation then blocked:=true;
 end;
 if not blocked then raise exception 'Refund cancellation exceeded the approval budget after a replacement payment';end if;
 if (select status from public.fms_payable_settlement_document where id=refund_document)<>'confirmed' then raise exception 'Failed refund budget validation did not roll back the projected status';end if;
 perform public.fms_act_payable_settlement_secure(array[(replacement->>'id')::uuid],'void','取消补付夹具');
 perform public.fms_act_payable_settlement_secure(array[(application->>'id')::uuid],'close','关闭剩余申请额度');
 if app_private.purchase_advance_reserved(contract_id,true)<>50 then raise exception 'Closed application kept already returned procurement credit reserved';end if;
 additional:=public.fms_save_payable_settlement_secure(jsonb_build_object('kind','payment','tenant_id',tenant,'document_type_id',payment_type,
 'business_date',current_date,'currency_code','CNY','lines',jsonb_build_array(jsonb_build_object('purpose_id',purpose,'supplier_id',parent.supplier_id,
 'payee_supplier_id',parent.supplier_id,'purchase_id',contract_id,'contract_id',contract_id,'settlement_method_id',method,'fund_account_id',fund,
 'amount',contract_total-50,'approved_amount',contract_total-50,'planned_amount',contract_total-50))));
 blocked:=false;
 begin
  perform app_private.act_payable_refund_receipt(refund_document,'cancel_receipt','采购额度已占用不得撤销收回');
 exception when check_violation then blocked:=true;
 end;
 if not blocked then raise exception 'Refund cancellation exceeded the shared procurement budget after new commitments';end if;
 perform public.fms_act_payable_settlement_secure(array[(additional->>'id')::uuid],'void','释放采购夹具额度');
 second_application:=public.fms_save_payable_settlement_secure(jsonb_build_object('kind','application','tenant_id',tenant,'document_type_id',application_type,
  'business_date',current_date,'currency_code','CNY','lines',jsonb_build_array(jsonb_build_object('purpose_id',purpose,'supplier_id',parent.supplier_id,
  'payee_supplier_id',parent.supplier_id,'settlement_method_id',method,'fund_account_id',fund,'amount',50,'approved_amount',50,'planned_amount',50))));
 perform public.fms_act_payable_settlement_secure(array[(second_application->>'id')::uuid],'submit');
 perform public.fms_act_payable_settlement_secure(array[(second_application->>'id')::uuid],'approve');
 second_payment:=public.fms_push_payable_settlement_secure((second_application->>'id')::uuid,'payment','application');
 second_line:=(second_payment->'lines'->0->>'id')::uuid;
 perform public.fms_act_payable_settlement_secure(array[(second_payment->>'id')::uuid],'submit');
 perform public.fms_act_payable_settlement_secure(array[(second_payment->>'id')::uuid],'approve');
 perform public.fms_act_payable_settlement_secure(array[(second_payment->>'id')::uuid],'confirm');
 insert into public.fms_payable_writeoff_record(tenant_id,record_no,payment_line_id,refund_line_id,relation,amount,payment_amount,refund_amount,cash_discount_amount,writeoff_date,actor)
 values(tenant,'QA-RF-CROSS-'||upper(left(gen_random_uuid()::text,8)),second_line,refund_line,'payment_refund',45,45,45,0,current_date,actor) returning id into cross_record;
 second_replacement:=public.fms_push_payable_settlement_secure((second_application->>'id')::uuid,'payment','application');
 if (second_replacement->>'amount')::numeric<>45 then raise exception 'Cross-source refund did not reopen the matched payment application quota';end if;
 blocked:=false;
 begin perform app_private.act_payable_refund_receipt(refund_document,'cancel_receipt','必须复核跨来源核销的另一张申请');exception when check_violation then blocked:=true;end;
 if not blocked or not exists(select 1 from public.fms_payable_writeoff_record where id=cross_record and status='active') then raise exception 'Refund cancellation omitted the other application or leaked a reversed matching record';end if;
 blocked:=false;
 begin perform public.fms_reverse_payable_writeoff_secure(cross_record,'公开反核销不得绕过另一张申请的补付占用');exception when check_violation then blocked:=true;end;
 if not blocked or not exists(select 1 from public.fms_payable_writeoff_record where id=cross_record and status='active') then raise exception 'Public refund unmatching exceeded the other application approval budget';end if;
 perform public.fms_act_payable_settlement_secure(array[(second_replacement->>'id')::uuid],'void','释放跨来源补付额度');
 blocked:=false;
 begin perform public.fms_reverse_payable_writeoff_secure(cross_record,null);exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Public refund unmatching accepted an empty reason';end if;
 perform public.fms_reverse_payable_writeoff_secure(cross_record,'额度释放后允许公开反核销');
 if exists(select 1 from public.fms_payable_writeoff_record where id=cross_record and status='active')
  or (app_private.payable_settlement_json((second_application->>'id')::uuid)->'lines'->0->>'unassigned_amount')::numeric<>0 then raise exception 'Public refund unmatching did not restore the matched application commitment';end if;
 insert into public.fms_payable_writeoff_record(tenant_id,record_no,payment_line_id,refund_line_id,relation,amount,payment_amount,refund_amount,cash_discount_amount,writeoff_date,actor)
 values(tenant,'QA-RF-CROSS-RETRY-'||upper(left(gen_random_uuid()::text,8)),second_line,refund_line,'payment_refund',45,45,45,0,current_date,actor) returning id into cross_record;
 perform app_private.act_payable_refund_receipt(refund_document,'cancel_receipt','撤销退款收回夹具');
 if not exists(select 1 from public.fms_payable_payment_execution where id=receipt_execution and status='reversed' and reversal_ledger_id is not null)
  or (select status from public.fms_fund_ledger_entry where id=receipt_ledger)<>'reversed' then raise exception 'Refund cancellation did not reverse its actual cash execution';end if;
 if exists(select 1 from public.fms_payable_writeoff_record where id=cross_record and status='active') then raise exception 'Refund cancellation left the cross-source matching record active';end if;
 perform public.fms_act_payable_settlement_secure(array[(second_payment->>'id')::uuid],'cancel_payment','退款跨来源核销已撤销');
 perform public.fms_act_payable_settlement_secure(array[(second_payment->>'id')::uuid],'void','清理跨来源付款夹具');
 perform public.fms_act_payable_settlement_secure(array[(second_application->>'id')::uuid],'close','关闭跨来源申请夹具');
 update public.fms_payable_settlement_document set status='cancelled' where id=refund_document;
 perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'cancel_payment','退回付款夹具');
 perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'void','作废付款夹具');
 if app_private.purchase_advance_reserved(contract_id,true)<>0 then raise exception 'Final cancellation left a leaked procurement commitment';end if;
 if has_function_privilege('authenticated','app_private.payable_settlement_source_lines(jsonb)','EXECUTE') or has_function_privilege('authenticated','app_private.assert_payable_settlement_budgets(jsonb)','EXECUTE') or has_function_privilege('authenticated','app_private.payable_refund_receipt_valid(uuid)','EXECUTE') then raise exception 'Private refund helpers became client-executable';end if;
end $test$;

rollback;
