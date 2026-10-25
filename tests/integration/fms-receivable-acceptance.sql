-- Isolated synthetic context and two end-to-end AR chains; all changes roll back.
begin;
select set_config('test.ar_tenant_code','fms-ar-qa-regression-'||left(gen_random_uuid()::text,8),true);

select set_config('request.jwt.claims','{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','0a872664-874c-447d-a256-d0dbdca6ed45',true);
select set_config('request.headers','{}',true);
do $seed$
declare t uuid; a uuid; c uuid; o uuid; u uuid; fund uuid; currency uuid; item uuid;
 n int; ord uuid; wb uuid; est uuid; fin uuid; rec uuid; refund uuid; req uuid; rev uuid; line uuid; ids jsonb; saved jsonb; balance numeric;
begin
 if exists(select 1 from public.sys_tenant where tenant_code=current_setting('test.ar_tenant_code')) then raise exception '验收租户已存在，请核对已创建结果后继续'; end if;
 insert into public.sys_tenant(tenant_code,tenant_name,remark,create_by) values(current_setting('test.ar_tenant_code'),'FMS应收验收租户','仅用于功能和视觉验收；单据和资金流水均为合成测试数据，不接入真实银行','system') returning id into t;
 insert into public.mdm_organization(tenant_id,organization_code,organization_name,organization_type,description) values(t,'AR_QA','演示结算公司','company','应收验收专用') returning id into o;
 insert into public.sys_user(tenant_id,user_name,user_email,status,create_by,account_identity_type) values(t,'应收验收数据员','ar-qa-'||left(t::text,8)||'@example.invalid','1','system','pending_review') returning id into u;
 saved:=public.save_fms_account_set_secure(jsonb_build_object('tenantId',t,'accountSetCode','AR_QA_20261022','accountSetName','应收验收测试账套','legalEntityName','演示结算公司','accountingStandard','enterprise_2019','vatTaxpayerType','general','baseCurrencyCode','CNY','enabledOn',date_trunc('year',current_date)::date,'fiscalYearStartMonth',1,'status','active','isDefault',true,'remark','仅合成测试记录'));
 a:=(saved->>'id')::uuid;
 -- Minimal accounting chart belongs only to the synthetic acceptance account set.
 insert into public.fms_subject(tenant_id,account_set_id,subject_code,subject_name,category,balance_direction,is_enabled,cash_flow_required)
 values(t,a,'1122','应收账款','asset','debit',true,false),(t,a,'6001','主营业务收入','income','credit',true,false),
 (t,a,'6401','主营业务成本','expense','debit',true,false),(t,a,'1001','测试现金','asset','debit',true,false);
 insert into public.fms_opening_balance_control(tenant_id,account_set_id,fiscal_year,status,confirmed_at,confirmed_by)
 values(t,a,extract(year from current_date)::int,'confirmed',now(),'ar-qa-test-context');
 select id into currency from public.fms_currency where account_set_id=a and currency_code='CNY';
 insert into public.fms_fund_account(tenant_id,account_set_id,currency_id,account_code,account_name,account_type,account_no_masked,account_no_fingerprint,opening_balance,status,online_banking_enabled,reconciliation_enabled,created_by_user_id,remark)
 values(t,a,currency,'AR_QA_CASH','应收验收测试现金账户','cash','TEST-AR-QA',md5(t::text),10000,'active',false,false,u,'合成测试流水，无银行连接') returning id into fund;
 insert into public.tms_expense_item(tenant_id,item_code,item_name,business_category) values(t,'AR_QA_COST','演示运输成本','other') returning id into item;
 for n in 1..2 loop
  insert into public.mdm_customer(tenant_id,customer_code,customer_name,created_by_user_id,remark)
  values(t,'AR_QA_CUSTOMER_'||n,'演示客户'||n,u,'应收验收专用合成客户') returning id into c;
  -- Upstream synthetic fixtures have an explicit owner without Auth credentials or roles.
  perform set_config('request.jwt.claims','{}',true);
  perform set_config('request.jwt.claim.sub','',true);
  insert into public.tms_order(tenant_id,order_no,order_status,origin_station,destination_station,delivery_method,
   shipping_customer_id,shipping_contact_name,shipping_contact_phone,shipping_address_detail,receiving_contact_name,receiving_contact_phone,receiving_address_detail,
   transport_fee,total_fee,payment_method,monthly_amount,payment_total,signed_at,created_by_user_id,order_remark)
  values(t,'TEST-AR-ORDER-'||n,'created','演示起点','演示终点','pickup',c,'测试发货方','00000000000','演示发货地址','测试收货方','00000000000','演示收货地址',
   n*1000,n*1000,'monthly',n*1000,n*1000,now(),u,'合成来源，只验证FMS下推与成本取数') returning id into ord;
  insert into public.tms_waybill(tenant_id,waybill_no,status,origin_city,destination_city,shipper_address,receiver_address,cargo_name,freight_amount,order_id,created_by_user_id,remark)
  values(t,'TEST-AR-WAYBILL-'||n,'signed','演示起点','演示终点','演示发货地址','演示收货地址','演示货物',n*1000,ord,u,'应收验收合成运输来源') returning id into wb;
  insert into public.tms_waybill_order_allocation(tenant_id,waybill_id,order_id,quantity,weight_kg,volume_m3,freight_amount,receipt_recorded_at) values(t,wb,ord,0,0,0,n*1000,now());
  insert into public.tms_waybill_cost(tenant_id,waybill_id,cost_type,amount,audit_status,reporter_name_snapshot,reporter_department_snapshot,cost_no,expense_item_id,created_by_user_id,reporter_user_id,remark)
  values(t,wb,'other',n*400,'approved','应收验收数据员','演示结算公司','TEST-AR-COST-'||n,item,u,u,'合成的已审核成本来源');
  perform set_config('request.jwt.claims','{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
  perform set_config('request.jwt.claim.sub','0a872664-874c-447d-a256-d0dbdca6ed45',true);
  -- Seed only synthetic upstream cost states; this is not a TMS approval-workflow test.
  perform set_config('app.workflow_engine','on',true);
  update public.tms_waybill_cost set audit_status='pending_review' where waybill_id=wb and tenant_id=t;
  update public.tms_waybill_cost set audit_status='approved',review_remark='合成来源验收准备' where waybill_id=wb and tenant_id=t;
  perform set_config('app.workflow_engine','off',true);
  ids:=public.fms_create_transport_estimated_receivables_secure(wb); est:=(ids->>0)::uuid;
  update public.fms_receivable_line set tax_rate=0 where document_id=est and tenant_id=t;
  update public.fms_receivable_document set settlement_organization_id=o,remark='演示流程'||n||'：运输暂估至财务应收，测试数据' where id=est and tenant_id=t;
  perform public.fms_act_receivable_document_secure(est,'submit'); perform public.fms_act_receivable_document_secure(est,'approve');
  rev:=public.fms_push_revenue_cost_secure(est);
  if public.fms_push_revenue_cost_secure(est)<>rev then raise exception '重复下推生成了第二张全额收入确认单'; end if;
  perform public.fms_act_revenue_cost_secure(rev,'refresh'); perform public.fms_act_revenue_cost_secure(rev,'submit'); perform public.fms_act_revenue_cost_secure(rev,'approve');
  fin:=public.fms_push_financial_receivable_secure(est);
  perform public.fms_act_receivable_document_secure(fin,'submit'); perform public.fms_act_receivable_document_secure(fin,'approve');
  select id into line from public.fms_receivable_line where document_id=fin order by line_no limit 1;
  rec:=public.fms_save_receipt_secure(jsonb_build_object('tenantId',t,'customerId',c,'settlementOrganizationId',o,'businessDate',current_date,'currencyCode','CNY','paymentMethod','cash','fundAccountId',fund,'remark','演示流程'||n||'：合成收款，不涉及真实银行','lines',jsonb_build_array(jsonb_build_object('financialLineId',line,'amount',n*600,'remark','演示分次回款'))));
  perform public.fms_act_receipt_secure(rec,'submit'); perform public.fms_act_receipt_secure(rec,'approve'); perform public.fms_act_receipt_secure(rec,'confirm');
  refund:=public.fms_save_receivable_refund_secure(jsonb_build_object('originalReceiptId',rec,'amount',n*50,'businessDate',current_date,'remark','演示流程'||n||'：合成收款差额退回'));
  perform public.fms_act_receivable_refund_secure(refund,'submit'); perform public.fms_act_receivable_refund_secure(refund,'approve');
  req:=public.fms_act_receivable_refund_secure(refund,'request');
  perform public.fms_act_receivable_payment_request_secure(req,'submit'); perform public.fms_act_receivable_payment_request_secure(req,'approve');
  perform public.fms_act_receivable_refund_secure(refund,'pay');
  if app_private.ar_line_balance(line,false)<>n*450 then raise exception '收款退款后的应收余额不正确'; end if;
 end loop;
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',t)::text,true);
 select sum((value->>'balanceAmount')::numeric) into balance from jsonb_array_elements(public.fms_ar_report_secure(jsonb_build_object('mode','summary','asOfDate',current_date))->'records');
 if balance<>1350 then raise exception '演示应收余额与账龄汇总不一致'; end if;
 if (select count(*) from public.fms_receivable_document where tenant_id=t and kind='estimate')<>2
  or (select count(*) from public.fms_receivable_document where tenant_id=t and kind='financial')<>2
  or (select count(*) from public.fms_receipt_document where tenant_id=t and status='confirmed')<>2
  or (select count(*) from public.fms_receipt_refund where tenant_id=t and status='paid')<>2
  or (select count(*) from public.fms_receivable_payment_request where tenant_id=t and status='paid')<>2
  or (select count(*) from public.fms_revenue_cost_document where tenant_id=t and status='approved')<>2
 then raise exception '验收流程数量或终态不正确'; end if;
end $seed$;

-- A public profile with a synthetic JWT subject is enough for SQL authorization tests.
-- No Auth account, password, login session or persistent grant is created.
do $security_context$
declare tenant uuid; source public.fms_receivable_document%rowtype; credit uuid;
begin
 select id into tenant from public.sys_tenant where tenant_code=current_setting('test.ar_tenant_code');
 for source in select * from public.fms_receivable_document
  where tenant_id=tenant and kind='financial' and not is_credit order by id loop
  credit:=public.fms_save_receivable_document_secure(jsonb_build_object(
   'kind','financial','tenantId',tenant,'documentTypeId',source.document_type_id,
   'customerId',source.customer_id,'settlementOrganizationId',source.settlement_organization_id,
   'businessDate',current_date,'isCredit',true,'currencyCode','CNY','settlementMethod','cash',
   'lines',jsonb_build_array(jsonb_build_object('lineNo',10,'basis','amount',
    'materialDescription','隔离贷方权限验收','quantity',0,'enteredGrossAmount',20,'taxRate',0,'gift',false))));
  perform public.fms_act_receivable_document_secure(credit,'submit');
  perform public.fms_act_receivable_document_secure(credit,'approve');
 end loop;
 update public.sys_user set auth_user_id=gen_random_uuid()
 where tenant_id=tenant and auth_user_id is null;
 if (select count(*) from public.fms_receivable_document where tenant_id=tenant and kind='financial' and is_credit and status='approved')<>2
  or (select count(*) from public.sys_user where tenant_id=tenant and auth_user_id is not null)<>1
 then raise exception 'Isolated debit/credit and ordinary profile fixtures are incomplete';end if;
end $security_context$;
select tenant_code,tenant_name,id from public.sys_tenant where tenant_code=current_setting('test.ar_tenant_code');

rollback;
