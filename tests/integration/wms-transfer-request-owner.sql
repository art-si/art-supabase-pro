begin;

do $test$
declare
  actor uuid;
  fixture record;
  customer_id uuid;
  supplier_id uuid;
  foreign_owner_id uuid;
  document_type uuid;
  business_type uuid;
  payload jsonb;
  v_document_id uuid;
begin
  select u.auth_user_id into strict actor from public.sys_user u
    join public.sys_role r on r.tenant_id=u.tenant_id and r.role_code=any(u.user_roles)
    where r.builtin_type='platform_super' and u.status='1' and u.system_protected limit 1;
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub',actor,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  select w.tenant_id,w.id warehouse_id,w.organization_id,m.id material_id,m.base_unit_id
    into strict fixture
    from public.mdm_warehouse w
    join public.wms_inventory_initialization i on i.tenant_id=w.tenant_id
      and i.organization_id=w.organization_id and i.enabled_on is not null
    cross join public.mdm_material m
    where w.tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9'
      and w.status='enabled' and m.tenant_id=w.tenant_id
      and m.status='enabled' and m.base_unit_id is not null limit 1;
  select id into strict customer_id from public.mdm_customer
    where tenant_id=fixture.tenant_id limit 1;
  select id into strict supplier_id from public.mdm_supplier
    where tenant_id=fixture.tenant_id limit 1;
  select id into strict foreign_owner_id from public.mdm_customer
    where tenant_id<>fixture.tenant_id limit 1;
  select d.id,bt.id into strict document_type,business_type
    from public.mdm_document_type d
    join public.mdm_business_type bt on bt.tenant_id=d.tenant_id
      and d.id=any(bt.document_type_ids)
    where d.tenant_id=fixture.tenant_id and d.enabled and bt.enabled
      and exists(select 1 from public.sys_menu menu where menu.name='WmsTransfer'
        and menu.id=any(d.menu_ids) and menu.id=any(bt.menu_ids))
    limit 1;
  payload:=jsonb_build_object(
    'tenant_id',fixture.tenant_id,'organization_id',fixture.organization_id,
    'document_type_id',document_type,'business_type_id',business_type,
    'lines',jsonb_build_array(jsonb_build_object(
      'material_id',fixture.material_id,
      'inventory_unit_id',fixture.base_unit_id,'quantity',1,
      'source_organization_id',fixture.organization_id,
      'source_warehouse_id',fixture.warehouse_id,
      'target_organization_id',fixture.organization_id,
      'target_warehouse_id',fixture.warehouse_id,
      'owner_type','customer','owner_id',customer_id)));
  v_document_id:=public.wms_save_transfer_request_secure(payload);
  if not exists(select 1 from public.wms_transfer_request_line
    where document_id=v_document_id and owner_type='customer'
      and owner_id=customer_id) then
    raise exception '客户货主选择未保存';
  end if;
  begin
    perform public.wms_save_transfer_request_secure(
      payload||jsonb_build_object('lines',jsonb_build_array(
        jsonb_build_object('material_id',fixture.material_id,
          'inventory_unit_id',fixture.base_unit_id,'quantity',1,
          'source_organization_id',fixture.organization_id,
          'source_warehouse_id',fixture.warehouse_id,
          'target_organization_id',fixture.organization_id,
          'target_warehouse_id',fixture.warehouse_id,
          'owner_type','customer','owner_id',foreign_owner_id))));
    raise exception '跨租户客户货主被接受';
  exception when check_violation then null;
  end;
  begin
    perform public.wms_save_transfer_request_secure(
      payload||jsonb_build_object('lines',jsonb_build_array(
        jsonb_build_object('material_id',fixture.material_id,
          'inventory_unit_id',fixture.base_unit_id,'quantity',1,
          'source_organization_id',fixture.organization_id,
          'source_warehouse_id',fixture.warehouse_id,
          'target_organization_id',fixture.organization_id,
          'target_warehouse_id',fixture.warehouse_id,
          'owner_type','supplier'))));
    raise exception '缺少供应商货主仍可保存';
  exception when check_violation then null;
  end;
  perform public.wms_save_transfer_request_secure(
    payload||jsonb_build_object('lines',jsonb_build_array(
      jsonb_build_object('material_id',fixture.material_id,
        'inventory_unit_id',fixture.base_unit_id,'quantity',1,
        'source_organization_id',fixture.organization_id,
        'source_warehouse_id',fixture.warehouse_id,
        'target_organization_id',fixture.organization_id,
        'target_warehouse_id',fixture.warehouse_id,
        'owner_type','supplier','owner_id',supplier_id))));
end $test$;

rollback;
