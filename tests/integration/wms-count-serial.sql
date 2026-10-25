begin;

do $test$
declare
  actor uuid;
  stock public.wms_inventory_batch%rowtype;
  v_serial_rule_id uuid;
  empty_warehouse uuid;
  people uuid[];
  v_plan_id uuid;
  v_sheet_id uuid;
  v_line public.wms_count_line%rowtype;
  first_serial text := 'COUNT-ROLLBACK-' || txid_current() || '-A';
  second_serial text := 'COUNT-ROLLBACK-' || txid_current() || '-B';
  replacement_serial text := 'COUNT-ROLLBACK-' || txid_current() || '-C';
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
  where b.quantity > 0 and b.status = 'normal' and not m.serial_management_enabled
  order by b.id limit 1;
  select id into strict v_serial_rule_id
  from public.mdm_supply_chain_code_rule
  where tenant_id = stock.tenant_id and status = 'enabled'
  order by id limit 1;
  update public.mdm_supply_chain_code_rule set apply_serial = true where id = v_serial_rule_id;
  update public.mdm_material
    set serial_management_enabled = true,
      serial_rule_id = v_serial_rule_id,
      serial_generation_timing = 'inbound'
    where id = stock.material_id;

  select w.id into strict empty_warehouse
  from public.mdm_warehouse w
  where w.tenant_id = stock.tenant_id
    and w.organization_id = stock.organization_id
    and w.status = 'enabled'
    and not w.enable_locations
    and not exists(select 1 from public.wms_inventory_batch b where b.warehouse_id = w.id)
  order by w.id limit 1;
  select array_agg(id order by id) into people
  from public.mdm_employee
  where tenant_id = stock.tenant_id and employment_status = 'active';
  if cardinality(people) < 2 then raise exception 'SN 盘点测试需要两名在职员工'; end if;

  v_plan_id := public.wms_create_count_plan_v2_secure(jsonb_build_object(
    'document_no', 'PD-ROLLBACK-SN-' || txid_current(),
    'organization_id', stock.organization_id,
    'warehouse_ids', jsonb_build_array(empty_warehouse),
    'material_ids', jsonb_build_array(stock.material_id),
    'backup_condition', 'immediate',
    'recount_enabled', true
  ));
  perform public.wms_approve_count_plan_secure(v_plan_id);
  select id into strict v_sheet_id from public.wms_count_sheet where plan_id = v_plan_id;
  perform public.wms_update_count_sheet_secure(v_sheet_id, null, null, people[1]);
  if public.wms_add_count_sheet_lines_secure(v_sheet_id, array[stock.material_id], null, null, null) <> 1 then
    raise exception 'SN 账外物料未加入盘点表';
  end if;
  select * into strict v_line from public.wms_count_line where sheet_id = v_sheet_id;
  perform public.wms_record_count_sheet_line_secure(
    v_line.id, 2, '{}'::uuid[], array[first_serial, second_serial], false, null
  );
  perform public.wms_record_count_sheet_line_secure(
    v_line.id, 2, '{}'::uuid[], array[first_serial, second_serial], true, people[2]
  );
  perform public.wms_submit_count_sheet_secure(v_sheet_id);
  perform public.wms_approve_count_sheet_secure(v_sheet_id);

  if not exists(select 1 from public.wms_count_plan where id = v_plan_id
    and status = 'posted' and completion_status = 'completed') then
    raise exception 'SN 盘点方案未完成';
  end if;
  if not exists(select 1 from public.wms_count_line l
    join public.wms_inventory_batch b on b.id = l.batch_id
    where l.id = v_line.id and l.gain_movement_id is not null
      and b.quantity = 2 and b.warehouse_id = empty_warehouse) then
    raise exception 'SN 盘盈库存批次未生成';
  end if;
  if (select count(*) from public.wms_serial_number sn
      join public.wms_count_line l on l.batch_id = sn.batch_id
      where l.id = v_line.id and sn.status = 'in_stock'
        and sn.serial_no in (first_serial, second_serial)) <> 2 then
    raise exception '盘盈序列号未逐件入库';
  end if;

  v_plan_id := public.wms_create_count_plan_v2_secure(jsonb_build_object(
    'document_no', 'PD-ROLLBACK-SN-REPLACE-' || txid_current(),
    'organization_id', stock.organization_id,
    'warehouse_ids', jsonb_build_array(empty_warehouse),
    'material_ids', jsonb_build_array(stock.material_id),
    'backup_condition', 'immediate'
  ));
  perform public.wms_approve_count_plan_secure(v_plan_id);
  select id into strict v_sheet_id from public.wms_count_sheet where plan_id = v_plan_id;
  perform public.wms_update_count_sheet_secure(v_sheet_id, null, null, people[1]);
  select * into strict v_line from public.wms_count_line where sheet_id = v_sheet_id;
  perform public.wms_record_count_sheet_line_secure(
    v_line.id, 2,
    array[(select id from public.wms_serial_number where serial_no = first_serial and tenant_id = stock.tenant_id)],
    array[replacement_serial], false, null
  );
  perform public.wms_submit_count_sheet_secure(v_sheet_id);
  perform public.wms_approve_count_sheet_secure(v_sheet_id);
  if not exists(select 1 from public.wms_count_line where id = v_line.id
    and loss_movement_id is not null and gain_movement_id is not null) then
    raise exception 'SN 换件应同时生成盘盈和盘亏流水';
  end if;
  if (select count(*) from public.wms_serial_number sn
      where sn.tenant_id = stock.tenant_id and sn.serial_no in (first_serial, replacement_serial)
        and sn.status = 'in_stock') <> 2
    or not exists(select 1 from public.wms_serial_number sn
      where sn.tenant_id = stock.tenant_id and sn.serial_no = second_serial and sn.status = 'out') then
    raise exception 'SN 换件后的在库和盘亏状态不正确';
  end if;
end
$test$;

select 'SN 初盘、复盘、盘盈入库与同一行盘盈盘亏回滚验证通过' result;
rollback;
