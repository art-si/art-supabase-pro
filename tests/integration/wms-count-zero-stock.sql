begin;

do $test$
declare
  actor uuid;
  stock public.wms_inventory_batch%rowtype;
  v_plan_id uuid;
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
  where b.quantity = 0
    and b.status = 'normal'
    and w.status = 'enabled'
    and i.enabled_on is not null
    and not m.serial_management_enabled
    and not exists(select 1 from public.wms_serial_number sn where sn.batch_id = b.id and sn.status = 'in_stock')
  order by b.id
  limit 1;

  v_plan_id := public.wms_create_count_plan_v2_secure(jsonb_build_object(
    'document_no', 'PD-ROLLBACK-ZERO-' || txid_current(),
    'organization_id', stock.organization_id,
    'warehouse_ids', jsonb_build_array(stock.warehouse_id),
    'material_ids', jsonb_build_array(stock.material_id),
    'backup_condition', 'immediate',
    'include_zero_stock', true
  ));
  if not exists(select 1 from public.wms_count_plan where id = v_plan_id
    and backup_condition = 'immediate' and include_zero_stock) then
    raise exception '即时盘点方案未保留零库存参数';
  end if;
  if not exists(select 1 from public.wms_count_line l
    where l.plan_id = v_plan_id and l.batch_id = stock.id and l.expected_quantity = 0) then
    raise exception '零库存批次未进入即时盘点表';
  end if;
end
$test$;

select '即时盘点纳入零库存批次回滚验证通过' result;
rollback;
