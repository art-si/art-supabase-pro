begin;

do $test$
declare
  actor uuid;
  stock public.wms_inventory_batch%rowtype;
  manual_warehouse uuid;
  counter_id uuid;
  v_plan_id uuid;
  stock_sheet_id uuid;
  manual_sheet_id uuid;
  v_line public.wms_count_line%rowtype;
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
  where b.quantity > 0
    and b.status = 'normal'
    and w.status = 'enabled'
    and i.enabled_on is not null
    and not m.serial_management_enabled
    and not exists(select 1 from public.wms_serial_number sn where sn.batch_id = b.id and sn.status = 'in_stock')
    and not exists(select 1 from public.wms_inventory_reservation r where r.batch_id = b.id and r.status = 'active')
    and exists(select 1 from public.mdm_warehouse empty_warehouse
      where empty_warehouse.tenant_id = b.tenant_id
        and empty_warehouse.organization_id = b.organization_id
        and empty_warehouse.status = 'enabled'
        and not empty_warehouse.enable_locations
        and not exists(select 1 from public.wms_inventory_batch other_batch
          where other_batch.warehouse_id = empty_warehouse.id))
  order by b.quantity, b.id
  limit 1
  for update of b;
  select w.id into strict manual_warehouse
  from public.mdm_warehouse w
  where w.tenant_id = stock.tenant_id
    and w.organization_id = stock.organization_id
    and w.status = 'enabled'
    and not w.enable_locations
    and not exists(select 1 from public.wms_inventory_batch b where b.warehouse_id = w.id)
  order by w.id limit 1;
  select id into strict counter_id from public.mdm_employee
  where tenant_id = stock.tenant_id and employment_status = 'active'
  order by id limit 1;

  v_plan_id := public.wms_create_count_plan_v2_secure(jsonb_build_object(
    'document_no', 'PD-ROLLBACK-MULTI-' || txid_current(),
    'organization_id', stock.organization_id,
    'warehouse_ids', jsonb_build_array(stock.warehouse_id, manual_warehouse),
    'material_ids', jsonb_build_array(stock.material_id),
    'backup_condition', 'immediate',
    'freeze_movements', true
  ));
  perform public.wms_approve_count_plan_secure(v_plan_id);
  select id into strict stock_sheet_id from public.wms_count_sheet
    where plan_id = v_plan_id and warehouse_id = stock.warehouse_id;
  select id into strict manual_sheet_id from public.wms_count_sheet
    where plan_id = v_plan_id and warehouse_id = manual_warehouse;
  if (select count(*) from public.wms_count_sheet where plan_id = v_plan_id) <> 2 then
    raise exception '双仓库方案未生成两张盘点表';
  end if;

  perform public.wms_update_count_sheet_secure(stock_sheet_id, null, null, counter_id);
  for v_line in select * from public.wms_count_line where sheet_id = stock_sheet_id loop
    perform public.wms_record_count_sheet_line_secure(
      v_line.id, v_line.expected_quantity, '{}'::uuid[], '{}'::text[], false, null
    );
  end loop;
  perform public.wms_submit_count_sheet_secure(stock_sheet_id);
  perform public.wms_approve_count_sheet_secure(stock_sheet_id);
  if not exists(select 1 from public.wms_count_plan where id = v_plan_id
    and status = 'counting' and completion_status = 'pending' and freeze_movements) then
    raise exception '首张盘点表审核后提前完成或解除冻结';
  end if;
  begin
    update public.wms_inventory_batch set quantity = quantity + 1 where id = stock.id;
    raise exception '尚有未审核盘点表时库存写入未冻结';
  exception when check_violation then
    if sqlerrm not like '%盘点方案已冻结%' then raise; end if;
  end;

  perform public.wms_update_count_sheet_secure(manual_sheet_id, null, null, counter_id);
  if public.wms_add_count_sheet_lines_secure(
    manual_sheet_id, array[stock.material_id], null, null, null
  ) <> 1 then
    raise exception '空仓盘点表未能增加账外实物';
  end if;
  select * into strict v_line from public.wms_count_line where sheet_id = manual_sheet_id;
  perform public.wms_record_count_sheet_line_secure(
    v_line.id, 1, '{}'::uuid[], '{}'::text[], false, null
  );
  perform public.wms_submit_count_sheet_secure(manual_sheet_id);
  perform public.wms_approve_count_sheet_secure(manual_sheet_id);
  if not exists(select 1 from public.wms_count_plan where id = v_plan_id
    and status = 'posted' and completion_status = 'completed') then
    raise exception '两张盘点表审核后方案未完成或冻结未解除';
  end if;
  update public.wms_inventory_batch set quantity = quantity + 1 where id = stock.id;
end
$test$;

select '双盘点表逐张审核、完成状态和冻结解除回滚验证通过' result;
rollback;
