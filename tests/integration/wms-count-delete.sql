begin;

do $test$
declare
  actor uuid;
  stock public.wms_inventory_batch%rowtype;
  empty_warehouse uuid;
  v_plan_id uuid;
  v_sheet_ids uuid[];
  v_sheet_id uuid;
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
  join public.mdm_warehouse w on w.id = b.warehouse_id
  where b.quantity > 0 and b.status = 'normal' and w.status = 'enabled'
  order by b.id limit 1;
  select id into strict empty_warehouse
  from public.mdm_warehouse w
  where w.tenant_id = stock.tenant_id
    and w.organization_id = stock.organization_id
    and w.id <> stock.warehouse_id
    and w.status = 'enabled'
  order by w.id limit 1;

  v_plan_id := public.wms_create_count_plan_v2_secure(jsonb_build_object(
    'document_no', 'PD-ROLLBACK-DELETE-' || txid_current(),
    'organization_id', stock.organization_id,
    'warehouse_ids', jsonb_build_array(stock.warehouse_id, empty_warehouse),
    'material_ids', jsonb_build_array(stock.material_id)
  ));
  select array_agg(id order by warehouse_id) into v_sheet_ids
  from public.wms_count_sheet where plan_id = v_plan_id;
  if cardinality(v_sheet_ids) <> 2 then raise exception '多仓方案未生成两张盘点表'; end if;
  if exists(select 1 from public.wms_count_sheet_delete_dependencies_secure(v_sheet_ids)) then
    raise exception '草稿盘点表被误判为删除阻塞';
  end if;
  if public.wms_delete_count_sheets_secure(array[v_sheet_ids[1]]) <> 1 then
    raise exception '单张草稿盘点表未删除';
  end if;
  if (select count(*) from public.wms_count_sheet where plan_id = v_plan_id) <> 1
    or (select cardinality(warehouse_ids) from public.wms_count_plan where id = v_plan_id) <> 1 then
    raise exception '删除后方案仓库范围未同步';
  end if;
  if public.wms_delete_count_sheets_secure(array[v_sheet_ids[2]]) <> 1 then
    raise exception '最后一张草稿盘点表未删除';
  end if;
  if not exists(select 1 from public.wms_count_plan where id = v_plan_id and status = 'cancelled')
    or exists(select 1 from public.wms_count_sheet where plan_id = v_plan_id)
    or exists(select 1 from public.wms_count_line where plan_id = v_plan_id) then
    raise exception '删除全部盘点表后方案或明细残留';
  end if;

  v_plan_id := public.wms_create_count_plan_v2_secure(jsonb_build_object(
    'document_no', 'PD-ROLLBACK-DELETE-BLOCK-' || txid_current(),
    'organization_id', stock.organization_id,
    'warehouse_ids', jsonb_build_array(stock.warehouse_id),
    'material_ids', jsonb_build_array(stock.material_id)
  ));
  select id into strict v_sheet_id from public.wms_count_sheet where plan_id = v_plan_id;
  perform public.wms_approve_count_plan_secure(v_plan_id);
  if not exists(select 1 from public.wms_count_sheet_delete_dependencies_secure(array[v_sheet_id])
    where record_no <> '' and record_status = 'draft') then
    raise exception '已审核方案的关联阻塞记录缺少名称或状态';
  end if;
  begin
    perform public.wms_delete_count_sheets_secure(array[v_sheet_id]);
    raise exception '已审核方案仍允许删除盘点表';
  exception when check_violation then
    if sqlerrm not like '%仅草稿方案%' then raise; end if;
  end;
end
$test$;

select '盘点表单张、批量删除与已审核阻塞回滚验证通过' result;
rollback;
