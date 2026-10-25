-- Verifies all three report-control levels through the public inventory-posting RPC.
-- The test uses an existing confirmed work order and rolls back every change.
begin;
do $test$
declare
  actor uuid;
  receipt public.mes_work_order%rowtype;
  rejected boolean;
  posted boolean;
  payload jsonb;
  movement_id uuid;
  batch_id uuid;
  report jsonb;
  report_kind text;
begin
  select u.auth_user_id into strict actor
  from public.sys_user u
  join public.sys_role r on r.tenant_id = u.tenant_id and r.role_code = any(u.user_roles)
  where r.builtin_type = 'platform_super' and u.system_protected and u.status = '1'
  limit 1;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', actor, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{}', true);

  select wo.* into strict receipt
  from public.mes_work_order wo
  join public.mdm_material m on m.id = wo.material_id and m.tenant_id = wo.tenant_id
  where wo.status = 'confirmed' and wo.deleted_at is null
    and wo.inbound_warehouse_id is not null and wo.work_order_type_id is not null
    and wo.completed_quantity > 0 and wo.warehoused_quantity = 0
    and wo.project_id is not null and wo.construction_no is not null
    and not m.serial_management_enabled
  order by wo.id
  limit 1;

  payload := jsonb_build_object(
    'movement_type', 'production_in', 'material_id', receipt.material_id,
    'warehouse_id', receipt.inbound_warehouse_id, 'work_order_id', receipt.id,
    'project_id', receipt.project_id, 'construction_no', receipt.construction_no,
    'quantity', 1, 'batch_no', 'QA-REPORT-ROLLBACK',
    'reference_no', 'QA-REPORT-ROLLBACK'
  );

  update public.mes_work_order set completed_quantity = 0 where id = receipt.id;
  update public.mdm_document_type set production_report_control = 'none'
  where id = receipt.work_order_type_id and tenant_id = receipt.tenant_id;
  posted := false;
  begin
    movement_id := public.wms_post_inventory_movement_secure(payload);
    posted := true;
    select target_batch_id into strict batch_id from public.wms_inventory_movement
    where id = movement_id and tenant_id = receipt.tenant_id;
    for report_kind in select unnest(array['stock', 'movement', 'ledger', 'receipt-issue']) loop
      report := public.wms_inventory_report_secure(
        report_kind, p_batch_no => 'QA-REPORT-ROLLBACK',
        p_tenant_id => receipt.tenant_id, p_limit => 200
      );
      if not exists (
        select 1 from jsonb_array_elements(report->'data') item
        where item->>'id' = case when report_kind in ('stock', 'ledger')
          then batch_id::text else movement_id::text || ':in' end
      ) then
        raise exception 'Finished receipt missing from inventory report %', report_kind
          using errcode = '23514';
      end if;
    end loop;
    raise exception 'rollback_test_posting' using errcode = 'P0001';
  exception when sqlstate 'P0001' then null;
  end;
  if not posted then raise exception 'Default report control blocked a valid finished receipt'; end if;

  update public.mdm_document_type set production_report_control = 'warning'
  where id = receipt.work_order_type_id and tenant_id = receipt.tenant_id;
  posted := false;
  begin
    perform public.wms_post_inventory_movement_secure(payload);
    posted := true;
    raise exception 'rollback_test_posting' using errcode = 'P0001';
  exception when sqlstate 'P0001' then null;
  end;
  if not posted then raise exception 'Warning report control blocked a valid finished receipt'; end if;

  update public.mdm_document_type set production_report_control = 'strict'
  where id = receipt.work_order_type_id and tenant_id = receipt.tenant_id;
  rejected := false;
  begin
    perform public.wms_post_inventory_movement_secure(payload);
  exception when check_violation then
    if sqlerrm not like '工单类型设置严格报工控制%' then raise; end if;
    rejected := true;
  end;
  if not rejected then raise exception 'Strict report control did not reject an unreported receipt'; end if;
end $test$;
select 'none and warning posted; strict rejected' as result;
rollback;
