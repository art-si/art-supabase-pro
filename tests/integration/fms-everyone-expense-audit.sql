begin;
do $test$
declare v_table text;
begin
  foreach v_table in array array[
    'fms_payee_information','fms_travel_application','fms_travel_itinerary',
    'fms_travel_loan','fms_travel_loan_item','fms_travel_loan_payee','fms_travel_loan_payment',
    'fms_travel_repayment','fms_travel_repayment_item','fms_travel_repayment_receipt'
  ] loop
    if (select count(*) from information_schema.columns where table_schema='public'
      and table_name=v_table and column_name in ('create_by','create_time','update_by','update_time','tenant_id'))<>5 then
      raise exception 'Audit columns missing for %',v_table;
    end if;
    if (select count(*) from pg_trigger t join pg_proc p on p.oid=t.tgfoid
      where t.tgrelid=('public.'||v_table)::regclass and not t.tgisinternal
      and p.proname in ('trg_set_create_time_and_by','trg_set_update_time_and_by'))<>2 then
      raise exception 'Canonical audit triggers missing for %',v_table;
    end if;
    if not exists(select 1 from information_schema.columns where table_schema='public'
      and table_name=v_table and column_name='tenant_id'
      and column_default like '%current_user_tenant_id%') then
      raise exception 'Authenticated tenant default missing for %',v_table;
    end if;
  end loop;
end $test$;
select 'everyone-expense canonical audit columns, triggers and tenant defaults passed' result;
rollback;
