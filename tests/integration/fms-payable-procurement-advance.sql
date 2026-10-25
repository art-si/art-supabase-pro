begin;
do $test$
declare actor uuid;source record;parent record;linked_contract uuid;application jsonb;second jsonb;payment jsonb;half_amount numeric;available numeric;blocked boolean;count_test integer:=0;new_tenant uuid;fixture_code text:='AP_SEED_'||left(gen_random_uuid()::text,8);
begin
 select auth_user_id into actor from public.sys_user where user_roles @>array['R_SUPER'] and auth_user_id is not null limit 1;
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers','{}',true);
 for source in select * from public.scm_purchase_document where kind in('purchase_contract','purchase_order') and status in('approved','effective','completed') and total_amount>0 order by kind,id limit 2 loop
  available:=app_private.purchase_advance_available(source.id);
  application:=public.fms_push_payable_settlement_secure(source.id,'application','purchase');
  if (application->>'amount')::numeric<>available or (application->>'tenant_id')::uuid<>source.tenant_id then raise exception 'Procurement push lost amount or parent tenant';end if;
  if application->'lines'->0->>'purchase_id'<>source.id::text then raise exception 'Procurement prepayment lost source';end if;
  blocked:=false;begin perform public.fms_push_payable_settlement_secure(source.id,'application','purchase');exception when check_violation then blocked:=true;end;
  if not blocked then raise exception 'Procurement source allowed duplicate full prepayment';end if;
  half_amount:=round(available/2,2);
  application:=public.fms_save_payable_settlement_secure(application||jsonb_build_object('lines',jsonb_build_array(application->'lines'->0||jsonb_build_object('amount',half_amount,'approved_amount',half_amount,'planned_amount',half_amount))));
  second:=public.fms_push_payable_settlement_secure(source.id,'application','purchase');
  if (second->>'amount')::numeric<>available-half_amount then raise exception 'Partial prepayment did not release source remainder';end if;
  perform public.fms_act_payable_settlement_secure(array[(application->>'id')::uuid],'submit');perform public.fms_act_payable_settlement_secure(array[(application->>'id')::uuid],'approve');
  payment:=public.fms_push_payable_settlement_secure((application->>'id')::uuid,'payment','application');
  perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'void','不再付款，作废未付款单');
  perform public.fms_act_payable_settlement_secure(array[(application->>'id')::uuid],'close','下游未付款单已作废，关闭剩余申请');
  if (select status from public.fms_payable_settlement_document where id=(application->>'id')::uuid)<>'closed' then raise exception 'Application cannot close after voiding unpaid child';end if;
  count_test:=count_test+1;
 end loop;
 if count_test<>2 then raise exception 'Expected two procurement prepayment sources';end if;
 select * into parent from public.scm_purchase_document where kind='purchase_order' and status in('approved','completed') and total_amount>0 limit 1;
 insert into public.scm_purchase_document(tenant_id,kind,document_no,supplier_id,project_id,document_date,lines,created_by_user_id)
 values(parent.tenant_id,'purchase_contract',fixture_code,parent.supplier_id,parent.project_id,current_date,(select jsonb_agg(line||jsonb_build_object('unit_price',round((line->>'unit_price')::numeric,2))) from jsonb_array_elements(parent.lines) line),parent.created_by_user_id) returning id into linked_contract;
 update public.scm_purchase_document set status='submitted' where id=linked_contract;
 update public.scm_purchase_document set status='approved' where id=linked_contract;
 update public.scm_purchase_document set status='effective' where id=linked_contract;
 application:=public.fms_push_payable_settlement_secure(parent.id,'application','purchase');
 application:=public.fms_save_payable_settlement_secure(application||jsonb_build_object('lines',jsonb_build_array(application->'lines'->0||jsonb_build_object('contract_id',linked_contract))));
 available:=app_private.purchase_advance_available(linked_contract);
 second:=public.fms_push_payable_settlement_secure(linked_contract,'application','purchase');
 if (second->>'amount')::numeric<>available then raise exception 'Explicit contract reference did not share the order prepayment budget';end if;
 blocked:=false;begin perform public.fms_push_payable_settlement_secure(linked_contract,'application','purchase');exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Contract and child order allowed duplicate economic prepayment';end if;
 available:=(application->>'amount')::numeric;
 blocked:=false;begin perform public.fms_save_payable_settlement_secure(application||jsonb_build_object('lines',jsonb_build_array(application->'lines'->0||jsonb_build_object('amount',available+0.01,'approved_amount',available+0.01,'planned_amount',available+0.01))));exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Editing an order bypassed shared contract budget';end if;
 insert into public.sys_tenant(tenant_code,tenant_name,status) values(fixture_code,'应付默认资料回归租户','1') returning id into new_tenant;
 if (select count(*) from public.mdm_document_type dt join public.sys_menu m on m.id=dt.menu_id where dt.tenant_id=new_tenant and m.name in('FinanceEstimatedPayable','FinancePurchasePayable','FinancePayableApplication','FinancePayablePayment'))<17 then raise exception 'New tenant did not receive all payable document types';end if;
 if not exists(select 1 from public.mdm_document_type dt join public.sys_menu m on m.id=dt.menu_id where dt.tenant_id=new_tenant and m.name='FinancePayableRefund' and dt.document_type_code='AP_PAYMENT_REFUND' and dt.enabled and dt.is_default) then raise exception 'New tenant missing its dedicated refund document type';end if;
 if (select count(*) from public.mdm_payment_purpose where tenant_id=new_tenant)<>7 or (select count(*) from public.mdm_payment_purpose where tenant_id=new_tenant and code in('205','206','207') and business_type in('purchase_refund','advance_refund','other_refund') and payable_writeoff and not receivable_writeoff)<>3 or (select count(*) from public.mdm_settlement_method where tenant_id=new_tenant)<>5 or (select count(*) from public.mdm_payment_term where tenant_id=new_tenant)<>4 or (select count(*) from public.fms_payable_writeoff_scheme where tenant_id=new_tenant)<>4 then raise exception 'New tenant payment reference provisioning incomplete';end if;
 if (select count(*) from public.fms_payable_writeoff_scheme where tenant_id=new_tenant and code in('AP-MANUAL','AP-SAME-SOURCE') and enabled)<>2
  or (select count(*) from public.fms_payable_writeoff_scheme where tenant_id=new_tenant and code in('AP-AR-MANUAL','AP-AR-AUTO') and enabled
   and automatic=(code='AP-AR-AUTO') and rules='[{"primary_field":"counterparty_id","secondary_field":"counterparty_id","operator":"eq","empty_matches":false},{"primary_field":"currency_code","secondary_field":"currency_code","operator":"eq","empty_matches":false}]'::jsonb)<>2 then raise exception 'New tenant lost legacy schemes or governed AP/AR defaults';end if;
 if (select count(*) from public.sys_document_number_rule where tenant_id=new_tenant and rule_key in('fms.payable_application','fms.payable_payment','fms.payable_refund'))<>3 then raise exception 'New tenant missing payment numbering rules';end if;
end $test$;
rollback;
