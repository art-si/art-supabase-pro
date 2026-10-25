begin;

do $test$
declare
  actor uuid;
  fixture record;
  target_warehouse uuid;
  document_type uuid;
  business_type uuid;
  v_document_id uuid;
  source_line public.wms_transfer_business_line%rowtype;
  return_id uuid;
  return_document public.wms_transfer_business_document%rowtype;
  return_line public.wms_transfer_business_line%rowtype;
  receipt_id uuid;
  child public.wms_transfer_document%rowtype;
begin
  select u.auth_user_id into strict actor from public.sys_user u
    join public.sys_role r on r.tenant_id=u.tenant_id and r.role_code=any(u.user_roles)
    where r.builtin_type='platform_super' and u.status='1' and u.system_protected limit 1;
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub',actor,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  select b.id batch_id,b.tenant_id,b.material_id,b.project_id,b.construction_no,
    b.batch_no,b.organization_id,b.warehouse_id,b.bin_id,
    m.base_unit_id,(rule.value->>'source_unit_id')::uuid inventory_unit_id
    into strict fixture
    from public.wms_inventory_batch b
    join public.mdm_material m on m.id=b.material_id and m.tenant_id=b.tenant_id
    cross join lateral jsonb_array_elements(m.unit_conversions) rule(value)
    where b.tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9'
      and b.status='normal' and b.quantity>=1000 and m.status='enabled'
      and not m.serial_management_enabled
      and (rule.value->>'base_factor')::numeric/
        (rule.value->>'source_factor')::numeric=1000
      and exists(select 1 from public.mdm_warehouse target
        where target.tenant_id=b.tenant_id and target.id<>b.warehouse_id
          and target.organization_id=b.organization_id and target.status='enabled'
          and not target.enable_locations)
    limit 1;
  select id into strict target_warehouse from public.mdm_warehouse
    where tenant_id=fixture.tenant_id and organization_id=fixture.organization_id
      and id<>fixture.warehouse_id and status='enabled' and not enable_locations limit 1;
  select d.id,bt.id into strict document_type,business_type
    from public.mdm_document_type d
    join public.mdm_business_type bt on bt.tenant_id=d.tenant_id
      and d.id=any(bt.document_type_ids)
    where d.tenant_id=fixture.tenant_id and d.enabled and bt.enabled
      and d.document_type_code='MT20' and bt.business_type_code='M303' limit 1;
  v_document_id:=public.wms_save_transfer_business_secure(jsonb_build_object(
    'tenant_id',fixture.tenant_id,'kind','step',
    'document_type_id',document_type,'business_type_id',business_type,
    'source_organization_id',fixture.organization_id,
    'target_organization_id',fixture.organization_id,
    'lines',jsonb_build_array(jsonb_build_object(
      'material_id',fixture.material_id,'source_batch_id',fixture.batch_id,
      'project_id',fixture.project_id,'construction_no',fixture.construction_no,
      'inventory_unit_id',fixture.inventory_unit_id,'quantity',1,
      'source_organization_id',fixture.organization_id,
      'source_warehouse_id',fixture.warehouse_id,'source_bin_id',fixture.bin_id,
      'target_organization_id',fixture.organization_id,
      'target_warehouse_id',target_warehouse))));
  perform public.wms_change_transfer_business_status_secure(v_document_id,'submit');
  perform public.wms_change_transfer_business_status_secure(v_document_id,'approve');
  select * into strict source_line from public.wms_transfer_business_line
    where document_id=v_document_id;
  select * into strict child from public.wms_transfer_document
    where id=source_line.step_transfer_id;
  if child.quantity<>1000 or source_line.base_quantity<>1000 then
    raise exception '分步调出吨/千克换算错误';
  end if;
  return_id:=public.wms_create_transfer_business_return_secure(
    v_document_id,array[source_line.id]);
  select * into strict return_document from public.wms_transfer_business_document
    where id=return_id;
  select * into strict return_line from public.wms_transfer_business_line
    where document_id=return_id;
  perform public.wms_save_transfer_business_secure(jsonb_build_object(
    'id',return_id,'tenant_id',return_document.tenant_id,'kind','step_return',
    'document_type_id',return_document.document_type_id,
    'business_type_id',return_document.business_type_id,
    'source_organization_id',return_document.source_organization_id,
    'target_organization_id',return_document.target_organization_id,
    'lines',jsonb_build_array(to_jsonb(return_line)||
      jsonb_build_object('quantity',0.4))));
  perform public.wms_change_transfer_business_status_secure(return_id,'submit');
  perform public.wms_change_transfer_business_status_secure(return_id,'approve');
  select * into strict child from public.wms_transfer_document
    where id=source_line.step_transfer_id;
  if child.returned_quantity<>400 then
    raise exception '分步部分退回吨/千克换算错误';
  end if;
  receipt_id:=public.wms_create_transfer_business_receipt_secure(
    v_document_id,jsonb_build_array(jsonb_build_object(
      'line_id',source_line.id,'target_bin_id',null)));
  if not exists(select 1 from public.wms_transfer_business_line
    where document_id=receipt_id and quantity=0.6 and base_quantity=600) then
    raise exception '收货草稿未按剩余吨/千克数量生成';
  end if;
  perform public.wms_change_transfer_business_status_secure(receipt_id,'submit');
  perform public.wms_change_transfer_business_status_secure(receipt_id,'approve');
  select * into strict child from public.wms_transfer_document
    where id=source_line.step_transfer_id;
  if child.status<>'received' or not exists(
    select 1 from public.wms_inventory_batch
      where id=child.target_batch_id and quantity=600
        and warehouse_id=target_warehouse) then
    raise exception '分步收货未按剩余 600 千克入库';
  end if;
end $test$;

rollback;
