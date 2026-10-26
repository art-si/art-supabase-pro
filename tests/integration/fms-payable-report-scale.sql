BEGIN;
do $scale$
declare actor uuid:='a9eeb9b7-e474-43e3-9cc2-c2f46c0f0ec3';tenant uuid:='111e83d3-190e-4405-84c8-440d484d13a6';book uuid;supplier uuid;started timestamptz;row_count integer;elapsed numeric;
begin
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers','{}',true);
 select id into book from public.fms_account_set where tenant_id=tenant and is_default;
 insert into public.mdm_supplier(tenant_id,supplier_code,supplier_name) values(tenant,'RPT_SCALE_'||upper(left(gen_random_uuid()::text,8)),'报表性能回滚主体'||gen_random_uuid()) returning id into supplier;
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers','{}',true);
 with documents as(
  insert into public.fms_purchase_payable_document(tenant_id,kind,document_no,business_date,created_by_user_id,source_type,account_set_id,currency_code,base_currency_code,exchange_rate,supplier_id,status)
  select tenant,'financial','RPT-SCALE-'||gen_random_uuid(),app_private.payable_business_date(),actor,'manual',book,'CNY','CNY',1,supplier,'approved' from generate_series(1,5000) returning id
 )
 insert into public.fms_purchase_payable_line(tenant_id,document_id,kind,line_no,line_snapshot,quantity,unit_price,amount,tax_amount,total_amount)
 select tenant,id,'financial',10,'{}',1,1,1,0,1 from documents;
 perform set_config('test.payable_report_scale_party',supplier::text,true);
 started:=clock_timestamp();
 select count(*) into row_count from app_private.payable_report_source_balances(jsonb_build_object('kind','financial','party_type','supplier','party_id',supplier));
 elapsed:=extract(epoch from clock_timestamp()-started)*1000;
 if row_count<>5000 then raise exception 'Source row count truncated: %',row_count;end if;
 perform set_config('test.payable_report_scale_ms',elapsed::text,true);
end $scale$;
select current_setting('test.payable_report_scale_ms') elapsed_ms;
ROLLBACK;
