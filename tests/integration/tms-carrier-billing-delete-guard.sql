-- Execute inside BEGIN/ROLLBACK. A used billing account must survive parent child replacement.
do $test$
declare
  v_waybill public.tms_waybill%rowtype;
  v_account uuid;
  v_rejected boolean := false;
begin
  select * into v_waybill from public.tms_waybill
    where carrier_id is not null order by create_time desc limit 1;
  if v_waybill.id is null then raise exception 'Need a carrier waybill fixture'; end if;
  insert into public.mdm_carrier_billing_account
    (tenant_id,carrier_id,invoice_title,bank_name,bank_account,is_default)
  values (v_waybill.tenant_id,v_waybill.carrier_id,'临时测试账户','测试银行','6222000000000000',true)
  returning id into v_account;
  insert into public.tms_waybill_carrier_billing_snapshot
    (waybill_id,tenant_id,carrier_id,billing_account_id,invoice_title,bank_name,bank_account)
  values (v_waybill.id,v_waybill.tenant_id,v_waybill.carrier_id,v_account,
          '临时测试账户','测试银行','6222000000000000');
  begin
    perform app_private.replace_tms_carrier_children(v_waybill.carrier_id,null,'[]'::jsonb);
  exception when sqlstate '23503' then v_rejected := true;
  end;
  if not v_rejected then raise exception 'Referenced account deletion was accepted'; end if;
  if not exists(select 1 from public.mdm_carrier_billing_account where id=v_account) then
    raise exception 'Referenced account disappeared despite rejection';
  end if;
  raise notice 'Referenced carrier billing account deletion rejected without losing history';
end $test$;
