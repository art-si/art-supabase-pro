begin;

do $test$
declare
  actor uuid;
  fixture record;
  direct_type uuid;
  direct_business uuid;
  step_type uuid;
  step_business uuid;
  direct_id uuid;
  step_id uuid;
  receipt_id uuid;
  step_line_id uuid;
  direct_target_batch uuid;
  step_target_batch uuid;
begin
  select u.auth_user_id into strict actor from public.sys_user u
    join public.sys_role r on r.tenant_id=u.tenant_id and r.role_code=any(u.user_roles)
    where r.builtin_type='platform_super' and u.status='1' and u.system_protected limit 1;
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub',actor,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  select b.id batch_id,b.tenant_id,b.material_id,b.project_id,b.construction_no,
    b.batch_no,b.organization_id source_org,b.warehouse_id source_wh,b.bin_id source_bin,
    m.base_unit_id,target.organization_id target_org,target.id target_wh
    into strict fixture
    from public.wms_inventory_batch b
    join public.mdm_material m on m.id=b.material_id and m.tenant_id=b.tenant_id
    join public.wms_inventory_initialization source_init
      on source_init.tenant_id=b.tenant_id
        and source_init.organization_id=b.organization_id
    join public.mdm_warehouse target
      on target.tenant_id=b.tenant_id
        and target.organization_id<>b.organization_id
        and target.status='enabled' and not target.enable_locations
    join public.mdm_organization target_org
      on target_org.id=target.organization_id and target_org.status='1'
    where b.tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9'
      and b.status='normal' and b.quantity>=2 and b.pack_id is null
      and m.status='enabled' and m.base_unit_id is not null
      and not m.serial_management_enabled
      and source_init.enabled_on is not null
      and source_init.initialization_closed_at is not null
    limit 1;
  insert into public.wms_inventory_initialization
    (tenant_id,organization_id,enabled_on,initialization_closed_at)
  values(fixture.tenant_id,fixture.target_org,
    (now() at time zone 'Asia/Shanghai')::date,now())
  on conflict (organization_id) do update set
    enabled_on=coalesce(public.wms_inventory_initialization.enabled_on,excluded.enabled_on),
    initialization_closed_at=coalesce(
      public.wms_inventory_initialization.initialization_closed_at,
      excluded.initialization_closed_at);
  select d.id,bt.id into strict direct_type,direct_business
    from public.mdm_document_type d
    join public.mdm_business_type bt on bt.tenant_id=d.tenant_id
      and d.id=any(bt.document_type_ids)
    where d.tenant_id=fixture.tenant_id and d.enabled and bt.enabled
      and d.document_type_code='MT' and bt.business_type_code='M311' limit 1;
  select d.id,bt.id into strict step_type,step_business
    from public.mdm_document_type d
    join public.mdm_business_type bt on bt.tenant_id=d.tenant_id
      and d.id=any(bt.document_type_ids)
    where d.tenant_id=fixture.tenant_id and d.enabled and bt.enabled
      and d.document_type_code='MT20' and bt.business_type_code='M303' limit 1;
  direct_id:=public.wms_save_transfer_business_secure(jsonb_build_object(
    'tenant_id',fixture.tenant_id,'kind','direct',
    'document_type_id',direct_type,'business_type_id',direct_business,
    'source_organization_id',fixture.source_org,
    'target_organization_id',fixture.target_org,
    'lines',jsonb_build_array(jsonb_build_object(
      'material_id',fixture.material_id,'source_batch_id',fixture.batch_id,
      'project_id',fixture.project_id,'construction_no',fixture.construction_no,
      'inventory_unit_id',fixture.base_unit_id,'quantity',1,
      'batch_no',fixture.batch_no,
      'source_organization_id',fixture.source_org,
      'source_warehouse_id',fixture.source_wh,'source_bin_id',fixture.source_bin,
      'target_organization_id',fixture.target_org,
      'target_warehouse_id',fixture.target_wh))));
  perform public.wms_change_transfer_business_status_secure(direct_id,'submit');
  perform public.wms_change_transfer_business_status_secure(direct_id,'approve');
  select move.target_batch_id into strict direct_target_batch
    from public.wms_transfer_business_line line
    join public.wms_inventory_movement move on move.id=line.movement_id
    where line.document_id=direct_id;
  if not exists(select 1 from public.wms_inventory_batch
    where id=direct_target_batch and organization_id=fixture.target_org
      and warehouse_id=fixture.target_wh and quantity=1) then
    raise exception '跨组织直接调拨审核未写入目标库存组织';
  end if;
  step_id:=public.wms_save_transfer_business_secure(jsonb_build_object(
    'tenant_id',fixture.tenant_id,'kind','step',
    'document_type_id',step_type,'business_type_id',step_business,
    'source_organization_id',fixture.source_org,
    'target_organization_id',fixture.target_org,
    'lines',jsonb_build_array(jsonb_build_object(
      'material_id',fixture.material_id,'source_batch_id',fixture.batch_id,
      'project_id',fixture.project_id,'construction_no',fixture.construction_no,
      'inventory_unit_id',fixture.base_unit_id,'quantity',1,
      'batch_no',fixture.batch_no,
      'source_organization_id',fixture.source_org,
      'source_warehouse_id',fixture.source_wh,'source_bin_id',fixture.source_bin,
      'target_organization_id',fixture.target_org,
      'target_warehouse_id',fixture.target_wh))));
  perform public.wms_change_transfer_business_status_secure(step_id,'submit');
  perform public.wms_change_transfer_business_status_secure(step_id,'approve');
  select id into strict step_line_id from public.wms_transfer_business_line
    where document_id=step_id;
  if not exists(select 1 from public.wms_transfer_document child
    join public.wms_transfer_business_line source_line
      on source_line.step_transfer_id=child.id
    where source_line.id=step_line_id and child.status='in_transit'
      and child.target_organization_id=fixture.target_org
      and child.target_warehouse_id=fixture.target_wh) then
    raise exception '跨组织分步调拨未进入目标组织在途';
  end if;
  receipt_id:=public.wms_create_transfer_business_receipt_secure(
    step_id,jsonb_build_array(jsonb_build_object(
      'line_id',step_line_id,'target_bin_id',null)));
  perform public.wms_change_transfer_business_status_secure(receipt_id,'submit');
  perform public.wms_change_transfer_business_status_secure(receipt_id,'approve');
  select child.target_batch_id into strict step_target_batch
    from public.wms_transfer_document child
    join public.wms_transfer_business_line source_line
      on source_line.step_transfer_id=child.id
    where source_line.id=step_line_id and child.status='received';
  if not exists(select 1 from public.wms_inventory_batch
    where id=step_target_batch and organization_id=fixture.target_org
      and warehouse_id=fixture.target_wh and quantity=1) then
    raise exception '跨组织分步收货审核未写入目标库存组织';
  end if;
end $test$;

rollback;
