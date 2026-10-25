-- Append after fms-receivable-acceptance.sql fixtures, inside the same rollback transaction.
do $isolated_payable$
declare tenant uuid; profile uuid; book uuid; currency uuid; category uuid; unit_id uuid;
begin
 select id into strict tenant from public.sys_tenant where tenant_code=current_setting('test.ar_tenant_code');
 select id into strict profile from public.sys_user where tenant_id=tenant;
 select id into strict book from public.fms_account_set where tenant_id=tenant and is_default;
 select id into strict currency from public.fms_currency where account_set_id=book and currency_code='CNY';
 insert into public.mdm_supplier(tenant_id,supplier_code,supplier_name,created_by_user_id)
 values(tenant,'AP_QA_SUPPLIER','隔离应付验收供应商',profile);
 insert into public.mdm_material_category(tenant_id,category_code,category_name)
 values(tenant,'AP_QA_CATEGORY','隔离应付验收分类') returning id into category;
 insert into public.mdm_unit_of_measure(tenant_id,unit_code,unit_name,is_base_unit)
 values(tenant,'AP_QA_PCS','验收件',true) returning id into unit_id;
 insert into public.mdm_material(tenant_id,category_id,material_code,material_name,basic_unit,material_type,
  material_source,inventory_unit_id,base_unit_id,status)
 values(tenant,category,'AP_QA_MATERIAL','隔离应付验收物料','验收件','test','purchase',unit_id,unit_id,'enabled');
 insert into public.fms_fund_account(tenant_id,account_set_id,currency_id,account_code,account_name,
  account_type,bank_name,account_no_masked,account_no_fingerprint,opening_balance,
  status,online_banking_enabled,reconciliation_enabled,created_by_user_id,remark)
 values(tenant,book,currency,'AP_QA_TEST_BANK','隔离核销测试账户','bank','合成测试银行（无连接）',
  'TEST-ONLY',md5(tenant::text||'ap'),10000,'active',false,false,profile,'仅事务内账务投影，不接入银行');
end $isolated_payable$;
