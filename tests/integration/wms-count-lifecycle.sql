begin;

do $test$
declare
  actor uuid;
  stock public.wms_inventory_batch%rowtype;
  manual_warehouse uuid;
  people uuid[];
  initial_quantity numeric;
  v_plan_id uuid;
  v_sheet_id uuid;
  v_line public.wms_count_line%rowtype;
  v_cutoff_date date := (now() at time zone 'Asia/Shanghai')::date - 1;
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
    and not m.serial_management_enabled
    and not exists(select 1 from public.wms_serial_number sn where sn.batch_id = b.id and sn.status = 'in_stock')
    and not exists(select 1 from public.wms_inventory_reservation r where r.batch_id = b.id and r.status = 'active')
  order by b.quantity, b.id
  limit 1
  for update of b;
  initial_quantity := stock.quantity;
  select array_agg(id order by id) into people
  from public.mdm_employee
  where tenant_id = stock.tenant_id and employment_status = 'active';
  if cardinality(people) < 2 then raise exception '盘点流程测试需要两名在职员工'; end if;

  v_plan_id := public.wms_create_count_plan_v2_secure(jsonb_build_object(
    'document_no', 'PD-ROLLBACK-GAIN-' || txid_current(),
    'organization_id', stock.organization_id,
    'warehouse_ids', jsonb_build_array(stock.warehouse_id),
    'material_ids', jsonb_build_array(stock.material_id),
    'backup_condition', 'immediate',
    'recount_enabled', true,
    'freeze_movements', true
  ));
  perform public.wms_approve_count_plan_secure(v_plan_id);
  begin
    update public.wms_inventory_batch set quantity = quantity + 1 where id = stock.id;
    raise exception '冻结范围仍允许库存写入';
  exception when check_violation then
    if sqlerrm not like '%盘点方案已冻结%' then raise; end if;
  end;
  select id into strict v_sheet_id from public.wms_count_sheet where plan_id = v_plan_id;
  perform public.wms_update_count_sheet_secure(v_sheet_id, null, null, people[1]);
  for v_line in select * from public.wms_count_line where sheet_id = v_sheet_id loop
    perform public.wms_record_count_sheet_line_secure(
      v_line.id,
      v_line.expected_quantity + case when v_line.batch_id = stock.id then 1 else 0 end,
      '{}'::uuid[], '{}'::text[], false, null
    );
    perform public.wms_record_count_sheet_line_secure(
      v_line.id,
      v_line.expected_quantity + case when v_line.batch_id = stock.id then 2 else 0 end,
      '{}'::uuid[], '{}'::text[], true, people[2]
    );
  end loop;
  perform public.wms_submit_count_sheet_secure(v_sheet_id);
  perform public.wms_approve_count_sheet_secure(v_sheet_id);
  if (select quantity from public.wms_inventory_batch where id = stock.id) <> initial_quantity + 2 then
    raise exception '复盘盘盈数量未记账';
  end if;
  if not exists(select 1 from public.wms_count_plan where id = v_plan_id
    and status = 'posted' and completion_status = 'completed') then
    raise exception '盘盈方案未自动完成';
  end if;

  v_plan_id := public.wms_create_count_plan_v2_secure(jsonb_build_object(
    'document_no', 'PD-ROLLBACK-LOSS-' || txid_current(),
    'organization_id', stock.organization_id,
    'warehouse_ids', jsonb_build_array(stock.warehouse_id),
    'material_ids', jsonb_build_array(stock.material_id),
    'backup_condition', 'immediate'
  ));
  perform public.wms_approve_count_plan_secure(v_plan_id);
  select id into strict v_sheet_id from public.wms_count_sheet where plan_id = v_plan_id;
  perform public.wms_update_count_sheet_secure(v_sheet_id, null, null, people[1]);
  for v_line in select * from public.wms_count_line where sheet_id = v_sheet_id loop
    perform public.wms_record_count_sheet_line_secure(
      v_line.id,
      v_line.expected_quantity - case when v_line.batch_id = stock.id then 2 else 0 end,
      '{}'::uuid[], '{}'::text[], false, null
    );
  end loop;
  perform public.wms_submit_count_sheet_secure(v_sheet_id);
  perform public.wms_approve_count_sheet_secure(v_sheet_id);
  if (select quantity from public.wms_inventory_batch where id = stock.id) <> initial_quantity then
    raise exception '盘盈盘亏抵销后库存数量未恢复';
  end if;
  if not exists(select 1 from public.wms_count_line
    where sheet_id = v_sheet_id and loss_movement_id is not null and batch_id = stock.id) then
    raise exception '盘亏流水未生成';
  end if;

  v_plan_id := public.wms_create_count_plan_v2_secure(jsonb_build_object(
    'document_no', 'PD-ROLLBACK-CUTOFF-' || txid_current(),
    'organization_id', stock.organization_id,
    'warehouse_ids', jsonb_build_array(stock.warehouse_id),
    'material_ids', jsonb_build_array(stock.material_id),
    'backup_condition', 'cutoff',
    'cutoff_date', v_cutoff_date,
    'include_zero_stock', true
  ));
  if not exists(select 1 from public.wms_count_plan where id = v_plan_id
    and backup_condition = 'cutoff' and cutoff_date = v_cutoff_date and not include_zero_stock) then
    raise exception '截止日期账存或零库存参数错误';
  end if;
  perform public.wms_cancel_count_plan_secure(v_plan_id);

  select w.id into strict manual_warehouse
  from public.mdm_warehouse w
  where w.tenant_id = stock.tenant_id
    and w.organization_id = stock.organization_id
    and w.status = 'enabled'
    and not w.enable_locations
    and not exists(select 1 from public.wms_inventory_batch b where b.warehouse_id = w.id)
  order by w.id limit 1;
  v_plan_id := public.wms_create_count_plan_v2_secure(jsonb_build_object(
    'document_no', 'PD-ROLLBACK-MANUAL-' || txid_current(),
    'organization_id', stock.organization_id,
    'warehouse_ids', jsonb_build_array(manual_warehouse),
    'material_ids', jsonb_build_array(stock.material_id),
    'backup_condition', 'immediate'
  ));
  perform public.wms_approve_count_plan_secure(v_plan_id);
  select id into strict v_sheet_id from public.wms_count_sheet where plan_id = v_plan_id;
  perform public.wms_update_count_sheet_secure(v_sheet_id, null, null, people[1]);
  if public.wms_add_count_sheet_lines_secure(v_sheet_id, array[stock.material_id], null, null, null) <> 1 then
    raise exception '账外物料未写入盘点表';
  end if;
  select * into strict v_line from public.wms_count_line where sheet_id = v_sheet_id;
  if not v_line.manual_entry or v_line.expected_quantity <> 0 then
    raise exception '账外明细账存不是零';
  end if;
  perform public.wms_record_count_sheet_line_secure(v_line.id, 2, '{}'::uuid[], '{}'::text[], false, null);
  perform public.wms_submit_count_sheet_secure(v_sheet_id);
  perform public.wms_approve_count_sheet_secure(v_sheet_id);
  if not exists(select 1 from public.wms_count_line l
    join public.wms_inventory_batch b on b.id = l.batch_id
    where l.id = v_line.id and l.gain_movement_id is not null and b.quantity = 2
      and b.warehouse_id = manual_warehouse) then
    raise exception '账外物料盘盈批次或流水未生成';
  end if;
end
$test$;

select '盘点生命周期、复盘、冻结、截止日期和账外物料回滚验证通过' result;
rollback;
