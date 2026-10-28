-- Forward-leg planned income follows the freight allocated to its main task.
-- A cost correction must not rewrite that income. All test writes roll back.
begin;

do $test$
declare
  v_tenant uuid := '2824c2b5-2774-4781-b995-f55e8bcee920';
  v_waybill uuid := 'a83978af-bc51-4dc1-aee4-c13dccaa9b64';
  v_cost uuid := '1ee74184-8c83-4381-8348-291e69bbcbd9';
  v_forward_before numeric;
  v_return_before numeric;
  v_allocation_before numeric;
begin
  select l.freight_income into strict v_forward_before
  from public.tms_waybill_leg l
  where l.tenant_id = v_tenant and l.waybill_id = v_waybill
    and l.leg_kind = 'forward';
  select l.freight_income into strict v_return_before
  from public.tms_waybill_leg l
  where l.tenant_id = v_tenant and l.waybill_id = v_waybill
    and l.leg_kind = 'return';
  select sum(a.freight_amount) into strict v_allocation_before
  from public.tms_waybill_order_allocation a
  where a.tenant_id = v_tenant and a.waybill_id = v_waybill;
  if v_forward_before is distinct from v_allocation_before then
    raise exception 'Forward leg is not aligned with its allocations';
  end if;
  update public.tms_waybill_cost
  set amount = amount + 1
  where id = v_cost and tenant_id = v_tenant and waybill_id = v_waybill
    and audit_status = 'draft';
  if not found then raise exception 'Draft cost fixture missing'; end if;
  if (select l.freight_income from public.tms_waybill_leg l
      where l.tenant_id = v_tenant and l.waybill_id = v_waybill
        and l.leg_kind = 'forward') is distinct from v_forward_before
    or (select l.freight_income from public.tms_waybill_leg l
      where l.tenant_id = v_tenant and l.waybill_id = v_waybill
        and l.leg_kind = 'return') is distinct from v_return_before
    or (select sum(a.freight_amount) from public.tms_waybill_order_allocation a
      where a.tenant_id = v_tenant and a.waybill_id = v_waybill)
      is distinct from v_allocation_before then
    raise exception 'Cost correction changed planned freight income';
  end if;
end $test$;

rollback;
