begin;

do $test$
declare
  actor uuid;
  stock public.wms_inventory_batch%rowtype;
  v_plan_id uuid;
  v_sheet_id uuid;
  v_line_id uuid;
  inbound_id uuid;
  outbound_id uuid;
begin
  select u.auth_user_id into strict actor
  from public.sys_user u
  join public.sys_tenant t on t.id = u.tenant_id
  join public.sys_role r on r.tenant_id = u.tenant_id
    and r.role_code = any(u.user_roles)
    and r.builtin_type = 'platform_super'
  where t.builtin_type = 'platform'
    and u.status = '1'
    and u.system_protected
    and u.deleted_at is null
  limit 1;
  perform set_config('request.jwt.claim.sub', actor::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', actor, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{}', true);

  select b.* into strict stock
  from public.wms_inventory_batch b
  join public.mdm_material m on m.id = b.material_id
  join public.mdm_warehouse w on w.id = b.warehouse_id
  join public.wms_inventory_initialization i on i.organization_id = b.organization_id
  where b.quantity >= 3
    and b.status = 'normal'
    and w.status = 'enabled'
    and i.enabled_on is not null
    and i.initialization_closed_at is not null
    and not m.serial_management_enabled
    and not exists(select 1 from public.wms_serial_number sn where sn.batch_id = b.id and sn.status = 'in_stock')
  order by b.quantity, b.id
  limit 1
  for update of b;

  v_plan_id := public.wms_create_count_plan_v2_secure(jsonb_build_object(
    'document_no', 'PD-ROLLBACK-ADJUST-' || txid_current(),
    'organization_id', stock.organization_id,
    'warehouse_ids', jsonb_build_array(stock.warehouse_id),
    'material_ids', jsonb_build_array(stock.material_id),
    'backup_condition', 'immediate'
  ));
  perform public.wms_approve_count_plan_secure(v_plan_id);
  select id into strict v_sheet_id from public.wms_count_sheet where plan_id = v_plan_id;
  select id into strict v_line_id from public.wms_count_line
    where sheet_id = v_sheet_id and batch_id = stock.id;

  insert into public.wms_inventory_movement(
    tenant_id, movement_type, target_batch_id, material_id, quantity, reference_no
  ) values (
    stock.tenant_id, 'other_in', stock.id, stock.material_id, 2,
    'COUNT-ADJ-ROLLBACK-IN-' || txid_current()
  ) returning id into inbound_id;
  insert into public.wms_inventory_movement(
    tenant_id, movement_type, source_batch_id, material_id, quantity, reference_no
  ) values (
    stock.tenant_id, 'other_out', stock.id, stock.material_id, 1,
    'COUNT-ADJ-ROLLBACK-OUT-' || txid_current()
  ) returning id into outbound_id;

  if (select count(*) from public.wms_count_adjustment_candidates_secure(
    v_line_id, 'COUNT-ADJ-ROLLBACK', 0, 20
  ) where id in (inbound_id, outbound_id)) <> 2 then
    raise exception '选单候选未包含账存后的入库及出库流水';
  end if;
  perform public.wms_select_count_adjustments_secure(v_line_id, array[inbound_id, outbound_id]);
  if not exists(select 1 from public.wms_count_line
    where id = v_line_id and adjustment_quantity = 1
      and adjustment_movement_ids @> array[inbound_id, outbound_id]) then
    raise exception '选单调整未写入正确的有符号数量';
  end if;
  begin
    perform public.wms_select_count_adjustments_secure(v_line_id, array[gen_random_uuid()]);
    raise exception '不存在的库存流水仍被选入';
  exception when check_violation then
    if sqlerrm not like '%所选库存单据%' then raise; end if;
  end;
end
$test$;

select '盘点选单调整双流水与无效单据回滚验证通过' result;
rollback;
