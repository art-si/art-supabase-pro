begin;

do $audit$
declare relation text;
begin
 foreach relation in array array['mdm_payment_term','fms_payable_settlement_line','fms_payable_payment_execution','fms_payable_writeoff_record'] loop
  if (select count(*) from information_schema.columns where table_schema='public' and table_name=relation and ((column_name in('create_by','update_by') and data_type='text') or(column_name in('create_time','update_time') and data_type='timestamp with time zone' and is_nullable='NO')))<>4 then raise exception 'Missing standard payable audit columns: %',relation;end if;
  if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=relation and c.relrowsecurity) then raise exception 'Payable audit table lost RLS: %',relation;end if;
  if (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_proc p on p.oid=t.tgfoid join pg_namespace n on n.oid=p.pronamespace where c.relname=relation and not t.tgisinternal and t.tgenabled='O' and n.nspname='public' and p.proname in('trg_set_create_time_and_by','trg_set_update_time_and_by'))<>2 then raise exception 'Missing shared audit triggers: %',relation;end if;
 end loop;
end $audit$;

rollback;
