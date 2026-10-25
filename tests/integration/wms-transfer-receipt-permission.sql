begin;

do $test$
declare
  platform_actor uuid;
  ordinary_actor public.sys_user%rowtype;
  ordinary_role public.sys_role%rowtype;
  fixture record;
  document_type uuid;
  business_type uuid;
  step_id uuid;
  source_line public.wms_transfer_business_line%rowtype;
  receipt_id uuid;
  legacy_id uuid;
begin
  select u.auth_user_id into strict platform_actor from public.sys_user u
    join public.sys_role r on r.tenant_id=u.tenant_id and r.role_code=any(u.user_roles)
    where r.builtin_type='platform_super' and u.status='1' and u.system_protected limit 1;
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub',platform_actor,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  select b.id batch_id,b.tenant_id,b.material_id,b.project_id,b.construction_no,
    b.batch_no,b.organization_id,b.warehouse_id,b.bin_id,m.base_unit_id,
    target.id target_warehouse_id
    into strict fixture
    from public.wms_inventory_batch b
    join public.mdm_material m on m.id=b.material_id and m.tenant_id=b.tenant_id
    join public.wms_inventory_initialization i on i.tenant_id=b.tenant_id
      and i.organization_id=b.organization_id and i.enabled_on is not null
      and i.initialization_closed_at is not null
    join public.mdm_warehouse target on target.tenant_id=b.tenant_id
      and target.organization_id=b.organization_id
      and target.id<>b.warehouse_id and target.status='enabled'
      and not target.enable_locations
    where b.tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9'
      and b.status='normal' and b.quantity>=3 and b.pack_id is null
      and m.status='enabled' and m.base_unit_id is not null
      and not m.serial_management_enabled
    limit 1;
  select d.id,bt.id into strict document_type,business_type
    from public.mdm_document_type d
    join public.mdm_business_type bt on bt.tenant_id=d.tenant_id
      and d.id=any(bt.document_type_ids)
    where d.tenant_id=fixture.tenant_id and d.enabled and bt.enabled
      and d.document_type_code='MT20' and bt.business_type_code='M303' limit 1;
  step_id:=public.wms_save_transfer_business_secure(jsonb_build_object(
    'tenant_id',fixture.tenant_id,'kind','step',
    'document_type_id',document_type,'business_type_id',business_type,
    'source_organization_id',fixture.organization_id,
    'target_organization_id',fixture.organization_id,
    'lines',jsonb_build_array(jsonb_build_object(
      'material_id',fixture.material_id,'source_batch_id',fixture.batch_id,
      'project_id',fixture.project_id,'construction_no',fixture.construction_no,
      'inventory_unit_id',fixture.base_unit_id,'quantity',1,
      'batch_no',fixture.batch_no,
      'source_organization_id',fixture.organization_id,
      'source_warehouse_id',fixture.warehouse_id,'source_bin_id',fixture.bin_id,
      'target_organization_id',fixture.organization_id,
      'target_warehouse_id',fixture.target_warehouse_id))));
  perform public.wms_change_transfer_business_status_secure(step_id,'submit');
  perform public.wms_change_transfer_business_status_secure(step_id,'approve');
  select * into strict source_line from public.wms_transfer_business_line
    where document_id=step_id;
  receipt_id:=public.wms_create_transfer_business_receipt_secure(
    step_id,jsonb_build_array(jsonb_build_object(
      'line_id',source_line.id,'target_bin_id',null)));
  perform public.wms_change_transfer_business_status_secure(receipt_id,'submit');
  select * into strict ordinary_actor from public.sys_user u
    where u.tenant_id=fixture.tenant_id and u.auth_user_id is not null
      and u.status='1' and u.deleted_at is null and 'yq_2026_001'=any(u.user_roles)
    limit 1;
  select * into strict ordinary_role from public.sys_role
    where tenant_id=fixture.tenant_id and role_code='yq_2026_001';
  delete from public.sys_role_menu grant_row using public.sys_menu menu
    where grant_row.menu_id=menu.id and grant_row.role_id=ordinary_role.id
      and menu.name='WmsTransfer:Receive';
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub',ordinary_actor.auth_user_id,'role','authenticated')::text,true);
  if not app_private.has_permission('WmsStepTransfer:Receive')
    or not app_private.has_permission('WmsStepTransfer:Approve')
    or app_private.has_permission('WmsTransfer:Receive') then
    raise exception '普通用户分步审核权限夹具不满足仅新菜单授权';
  end if;
  perform public.wms_change_transfer_business_status_secure(receipt_id,'approve');
  if not exists(select 1 from public.wms_transfer_document child
    where child.id=source_line.step_transfer_id and child.status='received'
      and exists(select 1 from public.wms_inventory_batch target
        where target.id=child.target_batch_id and target.quantity=1)) then
    raise exception '仅持分步菜单权限的普通用户未能审核入库';
  end if;
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub',platform_actor,'role','authenticated')::text,true);
  legacy_id:=public.wms_create_transfer_secure(jsonb_build_object(
    'document_no','ROLLBACK-LEGACY-'||gen_random_uuid()::text,
    'source_batch_id',fixture.batch_id,
    'target_warehouse_id',fixture.target_warehouse_id,
    'target_organization_id',fixture.organization_id,
    'document_type_id',document_type,'business_type_id',business_type,
    'quantity',1,'serial_ids','[]'::jsonb));
  perform public.wms_dispatch_transfer_secure(legacy_id);
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub',ordinary_actor.auth_user_id,'role','authenticated')::text,true);
  begin
    perform public.wms_receive_transfer_secure(legacy_id,null);
    raise exception '分步菜单权限绕过了旧在途单收货权限';
  exception when insufficient_privilege then null;
  end;
  if not exists(select 1 from public.wms_transfer_document
    where id=legacy_id and status='in_transit') then
    raise exception '旧在途单在越权尝试后被错误入库';
  end if;
end $test$;

rollback;
