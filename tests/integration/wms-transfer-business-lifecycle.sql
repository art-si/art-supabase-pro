begin;
do $test$
declare
  actor uuid;
  fixture record;
  v_document_id uuid;
  v_return_id uuid;
  v_original_line_id uuid;
  v_return_document public.wms_transfer_business_document%rowtype;
  v_return_line public.wms_transfer_business_line%rowtype;
  line jsonb;
  payload jsonb;
  failure_id uuid;
  failure_no text;
  original_stock_qty numeric;
  other_organization_warehouse uuid;
  other_organization uuid;
begin
  select u.auth_user_id into strict actor from public.sys_user u
    join public.sys_role r on r.tenant_id=u.tenant_id and r.role_code=any(u.user_roles)
    where r.builtin_type='platform_super' and u.status='1' and u.system_protected
    limit 1;
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub',actor,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  select b.id batch_id,b.tenant_id,b.organization_id,b.warehouse_id,b.bin_id,
    b.material_id,b.project_id,b.construction_no,b.batch_no,b.owner_type,b.owner_id,
    least(b.quantity,1) quantity,b.quantity available_qty,
    m.base_unit_id,tw.id target_warehouse_id,
    dt.id document_type_id,bt.id business_type_id
  into strict fixture from public.wms_inventory_batch b
    join public.mdm_material m on m.id=b.material_id and m.tenant_id=b.tenant_id
    join public.mdm_warehouse tw on tw.tenant_id=b.tenant_id
      and tw.id<>b.warehouse_id and tw.status='enabled'
    join public.wms_inventory_initialization i on i.tenant_id=b.tenant_id
      and i.organization_id=b.organization_id and i.enabled_on is not null
      and i.initialization_closed_at is not null
    join public.mdm_document_type dt on dt.tenant_id=b.tenant_id and dt.enabled
    join public.mdm_business_type bt on bt.tenant_id=b.tenant_id and bt.enabled
      and dt.id=any(bt.document_type_ids)
  where b.quantity>0 and b.status='normal' and b.organization_id is not null
    and b.bin_id is not null
    and m.base_unit_id is not null and not m.serial_management_enabled
    and not exists(select 1 from public.wms_serial_number serial
      where serial.batch_id=b.id and serial.status='in_stock')
    and exists(select 1 from public.sys_menu menu where menu.name='WmsDirectTransfer'
      and menu.id=any(dt.menu_ids) and menu.id=any(bt.menu_ids))
  limit 1;
  line:=jsonb_build_object(
    'material_id',fixture.material_id,'source_batch_id',fixture.batch_id,
    'project_id',fixture.project_id,'construction_no',fixture.construction_no,
    'inventory_unit_id',fixture.base_unit_id,'base_unit_id',fixture.base_unit_id,
    'quantity',fixture.quantity,'batch_no',fixture.batch_no,
    'source_organization_id',fixture.organization_id,
    'source_warehouse_id',fixture.warehouse_id,'source_bin_id',fixture.bin_id,
    'target_organization_id',fixture.organization_id,
    'target_warehouse_id',fixture.target_warehouse_id,
    'owner_type','supplier','owner_id',gen_random_uuid());
  payload:=jsonb_build_object(
    'tenant_id',fixture.tenant_id,'kind','direct',
    'document_type_id',fixture.document_type_id,
    'business_type_id',fixture.business_type_id,
    'source_organization_id',fixture.organization_id,
    'target_organization_id',fixture.organization_id,
    'lines',jsonb_build_array(line));
  select id,organization_id into strict other_organization_warehouse,other_organization
    from public.mdm_warehouse
    where tenant_id=fixture.tenant_id and organization_id<>fixture.organization_id
      and status='enabled' limit 1;
  begin
    perform public.wms_save_transfer_business_secure(payload||jsonb_build_object(
      'lines',jsonb_build_array(line||jsonb_build_object(
        'target_warehouse_id',other_organization_warehouse))));
    raise exception '调入仓库与调入组织不一致仍被保存';
  exception when check_violation then null;
  end;
  begin
    perform public.wms_save_transfer_business_secure(payload||jsonb_build_object(
      'lines',jsonb_build_array(line||jsonb_build_object(
        'target_organization_id',other_organization,
        'target_warehouse_id',other_organization_warehouse))));
    raise exception '明细调入组织与表头不一致仍被保存';
  exception when check_violation then null;
  end;
  begin
    perform public.wms_save_transfer_business_secure(payload||jsonb_build_object(
      'lines',jsonb_build_array(line||jsonb_build_object(
        'target_warehouse_id',fixture.warehouse_id,'target_bin_id',null))));
    raise exception '同仓调拨缺少调入仓位仍被保存';
  exception when check_violation then null;
  end;
  select quantity into strict original_stock_qty from public.wms_inventory_batch
    where id=fixture.batch_id;
  failure_id:=public.wms_save_transfer_business_secure(payload||jsonb_build_object(
    'lines',jsonb_build_array(line,line||jsonb_build_object(
      'quantity',fixture.available_qty))));
  select document_no into strict failure_no from public.wms_transfer_business_document
    where id=failure_id;
  perform public.wms_change_transfer_business_status_secure(failure_id,'submit');
  begin
    perform public.wms_change_transfer_business_status_secure(failure_id,'approve');
    raise exception '超量多行直接调拨审核被接受';
  exception when check_violation then null;
  end;
  if (select quantity from public.wms_inventory_batch where id=fixture.batch_id)
      <>original_stock_qty
    or exists(select 1 from public.wms_inventory_movement
      where reference_no=failure_no) then
    raise exception '多行审核失败后库存或流水未原子回滚';
  end if;
  v_document_id:=public.wms_save_transfer_business_secure(payload);
  if not exists(select 1 from public.wms_transfer_business_document
    where id=v_document_id and document_no ~ '^DBDD[0-9]{6}-[0-9]{3}$') then
    raise exception '直接调拨编号不是按月三位流水';
  end if;
  if not exists(select 1 from public.wms_transfer_business_list saved
    where saved.id=v_document_id and (saved.line->>'source_batch_id')::uuid=fixture.batch_id
      and (saved.line->>'owner_type')=fixture.owner_type
      and (saved.line->>'owner_id')::uuid is not distinct from fixture.owner_id) then
    raise exception '调拨单保存或来源库存属性保护失败';
  end if;
  begin
    perform public.wms_save_transfer_business_secure(payload||jsonb_build_object(
      'lines',jsonb_build_array(line||jsonb_build_object('project_id',gen_random_uuid()))));
    raise exception '篡改来源库存项目被接受';
  exception when check_violation then null;
  end;
  perform public.wms_change_transfer_business_status_secure(v_document_id,'submit');
  perform public.wms_change_transfer_business_status_secure(v_document_id,'approve');
  if not exists(select 1 from public.wms_transfer_business_document d
    join public.wms_transfer_business_line l on l.document_id=d.id
    join public.wms_inventory_movement move on move.id=l.movement_id
    join public.wms_inventory_batch target on target.id=move.target_batch_id
    where d.id=v_document_id and d.status='approved'
      and target.warehouse_id=fixture.target_warehouse_id
      and target.owner_type=fixture.owner_type
      and target.owner_id is not distinct from fixture.owner_id
      and target.quantity=fixture.quantity) then
    raise exception '直接调拨跨仓审核记账或货主保留失败';
  end if;
  begin
    perform public.wms_change_transfer_business_status_secure(v_document_id,'approve');
    raise exception '重复审核被接受';
  exception when check_violation then null;
  end;
  select id into strict v_original_line_id from public.wms_transfer_business_line
    where document_id=v_document_id;
  v_return_id:=public.wms_create_transfer_business_return_secure(
    v_document_id,array[v_original_line_id]);
  select * into strict v_return_document from public.wms_transfer_business_document
    where id=v_return_id;
  select * into strict v_return_line from public.wms_transfer_business_line
    where document_id=v_return_id;
  begin
    perform public.wms_save_transfer_business_secure(jsonb_build_object(
      'id',v_return_id,'tenant_id',fixture.tenant_id,'kind','direct_return',
      'document_type_id',v_return_document.document_type_id,
      'business_type_id',v_return_document.business_type_id,
      'source_organization_id',v_return_document.source_organization_id,
      'target_organization_id',v_return_document.target_organization_id,
      'lines',jsonb_build_array(to_jsonb(v_return_line)||
        jsonb_build_object('stock_type','gift'))));
    raise exception '直接调拨退回库存属性篡改被接受';
  exception when check_violation then null;
  end;
  perform public.wms_change_transfer_business_status_secure(v_return_id,'submit');
  perform public.wms_change_transfer_business_status_secure(v_return_id,'approve');
  if not exists(select 1 from public.wms_transfer_business_line original
    join public.wms_transfer_business_line returned
      on returned.return_of_line_id=original.id
    join public.wms_inventory_movement move on move.id=returned.movement_id
    join public.wms_inventory_batch target on target.id=move.target_batch_id
    where original.id=v_original_line_id and returned.document_id=v_return_id
      and original.returned_quantity=original.quantity
      and target.warehouse_id=fixture.warehouse_id
      and target.bin_id is not distinct from fixture.bin_id) then
    raise exception '直接调拨退回未回原仓位或未反填已退回数量';
  end if;
end $test$;

do $test$
declare
  actor uuid;
  fixture record;
  v_document_id uuid;
  v_return_id uuid;
  v_original_line_id uuid;
  v_child_id uuid;
  v_received_movement_id uuid;
  v_receipt_id uuid;
  other_tenant uuid;
  v_partial_qty numeric;
  v_return_document public.wms_transfer_business_document%rowtype;
  v_return_line public.wms_transfer_business_line%rowtype;
  payload jsonb;
  line jsonb;
begin
  select u.auth_user_id into strict actor from public.sys_user u
    join public.sys_role r on r.tenant_id=u.tenant_id and r.role_code=any(u.user_roles)
    where r.builtin_type='platform_super' and u.status='1' and u.system_protected
    limit 1;
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub',actor,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  select b.id batch_id,b.tenant_id,b.organization_id,b.warehouse_id,b.bin_id,
    b.material_id,b.project_id,b.construction_no,b.batch_no,
    least(b.quantity,1) quantity,m.base_unit_id,tw.id target_warehouse_id,
    dt.id document_type_id,bt.id business_type_id
  into strict fixture from public.wms_inventory_batch b
    join public.mdm_material m on m.id=b.material_id and m.tenant_id=b.tenant_id
    join public.mdm_warehouse tw on tw.tenant_id=b.tenant_id
      and tw.id<>b.warehouse_id and tw.status='enabled' and not tw.enable_locations
    join public.wms_inventory_initialization i on i.tenant_id=b.tenant_id
      and i.organization_id=b.organization_id and i.enabled_on is not null
      and i.initialization_closed_at is not null
    join public.mdm_document_type dt on dt.tenant_id=b.tenant_id and dt.enabled
    join public.mdm_business_type bt on bt.tenant_id=b.tenant_id and bt.enabled
      and dt.id=any(bt.document_type_ids)
  where b.quantity>0 and b.status='normal' and b.organization_id is not null
    and m.base_unit_id is not null and not m.serial_management_enabled
    and not exists(select 1 from public.wms_serial_number serial
      where serial.batch_id=b.id and serial.status='in_stock')
    and dt.document_type_code='MT20' and bt.business_type_code='M303'
    and exists(select 1 from public.mdm_business_type receipt_type
      where receipt_type.tenant_id=b.tenant_id and receipt_type.enabled
        and receipt_type.business_type_code='M305'
        and dt.id=any(receipt_type.document_type_ids))
    and exists(select 1 from public.sys_menu menu where menu.name='WmsStepTransfer'
      and menu.id=any(dt.menu_ids) and menu.id=any(bt.menu_ids))
  limit 1;
  line:=jsonb_build_object(
    'material_id',fixture.material_id,'source_batch_id',fixture.batch_id,
    'project_id',fixture.project_id,'construction_no',fixture.construction_no,
    'inventory_unit_id',fixture.base_unit_id,'quantity',fixture.quantity,
    'source_organization_id',fixture.organization_id,
    'source_warehouse_id',fixture.warehouse_id,'source_bin_id',fixture.bin_id,
    'target_organization_id',fixture.organization_id,
    'target_warehouse_id',fixture.target_warehouse_id);
  payload:=jsonb_build_object(
    'tenant_id',fixture.tenant_id,'kind','step',
    'document_type_id',fixture.document_type_id,
    'business_type_id',fixture.business_type_id,
    'source_organization_id',fixture.organization_id,
    'target_organization_id',fixture.organization_id,
    'lines',jsonb_build_array(line));
  v_document_id:=public.wms_save_transfer_business_secure(payload);
  if not exists(select 1 from public.wms_transfer_business_document
    where id=v_document_id and document_no ~ '^DBFB[0-9]{6}-[0-9]{3}$') then
    raise exception '分步调拨编号不是按月三位流水';
  end if;
  perform public.wms_change_transfer_business_status_secure(v_document_id,'submit');
  perform public.wms_change_transfer_business_status_secure(v_document_id,'approve');
  if not exists(select 1 from public.wms_transfer_business_line l
    join public.wms_transfer_document child on child.id=l.step_transfer_id
    where l.document_id=v_document_id and child.status='in_transit'
      and child.outbound_movement_id=l.movement_id
      and child.target_warehouse_id=fixture.target_warehouse_id) then
    raise exception '分步调拨审核未产生在途子单和调出流水';
  end if;
  select id,step_transfer_id into strict v_original_line_id,v_child_id
    from public.wms_transfer_business_line where document_id=v_document_id;
  select id into strict other_tenant from public.sys_tenant
    where id<>fixture.tenant_id limit 1;
  perform set_config('request.headers',jsonb_build_object(
    'x-art-tenant-scope',other_tenant)::text,true);
  begin
    perform public.wms_create_transfer_business_receipt_secure(v_document_id,
      jsonb_build_array(jsonb_build_object('line_id',v_original_line_id,
        'target_bin_id',null)));
    raise exception '平台选定其他租户后仍可下推原租户收货单';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.headers','{}',true);
  v_receipt_id:=public.wms_create_transfer_business_receipt_secure(v_document_id,
    jsonb_build_array(jsonb_build_object('line_id',v_original_line_id,
      'target_bin_id',null)));
  begin
    perform public.wms_save_transfer_business_secure(jsonb_build_object(
      'id',v_receipt_id,'kind','step_receipt'));
    raise exception '通用调拨保存入口允许改写收货单来源';
  exception when check_violation then null;
  end;
  v_return_id:=public.wms_create_transfer_business_return_secure(
    v_document_id,array[v_original_line_id]);
  select * into strict v_return_document from public.wms_transfer_business_document
    where id=v_return_id;
  select * into strict v_return_line from public.wms_transfer_business_line
    where document_id=v_return_id;
  begin
    perform public.wms_save_transfer_business_secure(jsonb_build_object(
      'id',v_return_id,'tenant_id',fixture.tenant_id,'kind','step_return',
      'document_type_id',v_return_document.document_type_id,
      'business_type_id',v_return_document.business_type_id,
      'source_organization_id',v_return_document.source_organization_id,
      'target_organization_id',v_return_document.target_organization_id,
      'lines',jsonb_build_array(to_jsonb(v_return_line)||
        jsonb_build_object('stock_type','gift'))));
    raise exception '分步调拨退回库存属性篡改被接受';
  exception when check_violation then null;
  end;
  v_partial_qty:=fixture.quantity/2;
  payload:=jsonb_build_object(
    'id',v_return_id,'tenant_id',fixture.tenant_id,'kind','step_return',
    'document_type_id',v_return_document.document_type_id,
    'business_type_id',v_return_document.business_type_id,
    'source_organization_id',v_return_document.source_organization_id,
    'target_organization_id',v_return_document.target_organization_id,
    'lines',jsonb_build_array(to_jsonb(v_return_line)||
      jsonb_build_object('quantity',v_partial_qty)));
  perform public.wms_save_transfer_business_secure(payload);
  perform public.wms_change_transfer_business_status_secure(v_return_id,'submit');
  perform public.wms_change_transfer_business_status_secure(v_return_id,'approve');
  if not exists(select 1 from public.wms_transfer_document child
    join public.wms_transfer_business_line original on original.step_transfer_id=child.id
    where original.id=v_original_line_id and child.status='in_transit'
      and child.returned_quantity=v_partial_qty
      and original.returned_quantity=v_partial_qty) then
    raise exception '分步部分调出退回未反填在途和原行数量';
  end if;
  perform public.wms_change_transfer_business_status_secure(v_receipt_id,'submit');
  begin
    perform public.wms_change_transfer_business_status_secure(v_receipt_id,'approve');
    raise exception '部分退回后旧收货单仍按原数量入库';
  exception when check_violation then null;
  end;
  if not exists(select 1 from public.wms_transfer_document
    where id=v_child_id and status='in_transit') then
    raise exception '过期收货单审核失败时未保持在途';
  end if;
  perform public.wms_change_transfer_business_status_secure(v_receipt_id,'withdraw');
  perform public.wms_change_transfer_business_status_secure(v_receipt_id,'delete');
  begin
    perform public.wms_receive_transfer_business_secure(v_document_id,
      jsonb_build_array(jsonb_build_object('line_id',v_original_line_id,
        'target_bin_id',null)));
    raise exception '旧的直接收货入口仍可入库';
  exception when check_violation then null;
  end;
  begin
    perform public.wms_receive_transfer_secure(v_child_id,null);
    raise exception '未生成收货单时直接入库被接受';
  exception when check_violation then null;
  end;
  v_receipt_id:=public.wms_create_transfer_business_receipt_secure(v_document_id,
    jsonb_build_array(jsonb_build_object('line_id',v_original_line_id,
      'target_bin_id',null)));
  perform set_config('request.headers',jsonb_build_object(
    'x-art-tenant-scope',other_tenant)::text,true);
  begin
    perform public.wms_update_transfer_business_receipt_secure(v_receipt_id,
      current_date,null,jsonb_build_array(jsonb_build_object(
        'line_id',(select id from public.wms_transfer_business_line
          where document_id=v_receipt_id),'target_bin_id',null)));
    raise exception '平台选定其他租户后仍可编辑原租户收货单';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.headers','{}',true);
  if not exists(select 1 from public.wms_transfer_business_document
    where id=v_receipt_id and kind='step_receipt' and status='draft'
      and document_no ~ '^DBSH[0-9]{6}-[0-9]{3}$')
    or exists(select 1 from public.wms_transfer_document
      where id=v_child_id and status='received') then
    raise exception '下推收货单未保持暂存和在途状态';
  end if;
  begin
    perform public.wms_create_transfer_business_receipt_secure(v_document_id,
      jsonb_build_array(jsonb_build_object('line_id',v_original_line_id,
        'target_bin_id',null)));
    raise exception '同一在途行重复下推收货单被接受';
  exception when unique_violation then null;
  end;
  perform public.wms_change_transfer_business_status_secure(v_receipt_id,'submit');
  if exists(select 1 from public.wms_transfer_document
    where id=v_child_id and status='received') then
    raise exception '提交收货单提前入库';
  end if;
  perform public.wms_change_transfer_business_status_secure(v_receipt_id,'approve');
  select inbound_movement_id into strict v_received_movement_id
    from public.wms_transfer_document where id=v_child_id;
  if not exists(select 1 from public.wms_inventory_movement movement
    join public.wms_inventory_batch target on target.id=movement.target_batch_id
    where movement.id=v_received_movement_id
      and movement.quantity=fixture.quantity-v_partial_qty
      and target.quantity=fixture.quantity-v_partial_qty
      and target.warehouse_id=fixture.target_warehouse_id) then
    raise exception '部分退回后收货未按剩余在途数量入库';
  end if;
end $test$;

do $test$
declare
  actor uuid;
  request_id uuid;
  first_line_id uuid;
  direct_id uuid;
  step_id uuid;
  v_direct public.wms_transfer_business_document%rowtype;
  v_direct_line public.wms_transfer_business_line%rowtype;
  fixture record;
  request_line jsonb;
begin
  select u.auth_user_id into strict actor from public.sys_user u
    join public.sys_role r on r.tenant_id=u.tenant_id and r.role_code=any(u.user_roles)
    where r.builtin_type='platform_super' and u.status='1' and u.system_protected
    limit 1;
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub',actor,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  select b.tenant_id,b.organization_id,b.warehouse_id,b.bin_id,b.material_id,
    b.project_id,b.construction_no,b.batch_no,b.id batch_id,
    m.base_unit_id,
    (select (conversion->>'source_unit_id')::uuid
      from jsonb_array_elements(m.unit_conversions) conversion
      where (conversion->>'source_unit_id')::uuid<>m.base_unit_id limit 1)
      alternate_unit_id,
    tw.id target_warehouse_id,
    dt.id document_type_id,bt.id business_type_id
    into strict fixture from public.wms_inventory_batch b
    join public.mdm_material m on m.id=b.material_id and m.tenant_id=b.tenant_id
    join public.mdm_warehouse tw on tw.tenant_id=b.tenant_id
      and tw.organization_id=b.organization_id and tw.id<>b.warehouse_id
      and tw.status='enabled'
    join public.wms_inventory_initialization i on i.tenant_id=b.tenant_id
      and i.organization_id=b.organization_id and i.enabled_on is not null
      and i.initialization_closed_at is not null
    join public.mdm_document_type dt on dt.tenant_id=b.tenant_id and dt.enabled
    join public.mdm_business_type bt on bt.tenant_id=b.tenant_id and bt.enabled
      and dt.id=any(bt.document_type_ids)
    where b.quantity>0 and b.status='normal' and m.base_unit_id is not null
      and exists(select 1 from jsonb_array_elements(m.unit_conversions) conversion
        where (conversion->>'source_unit_id')::uuid<>m.base_unit_id)
      and exists(select 1 from public.sys_menu menu where menu.name='WmsTransfer'
        and menu.id=any(dt.menu_ids) and menu.id=any(bt.menu_ids))
      and exists(select 1 from public.mdm_document_type target_type
        join public.mdm_business_type target_business
          on target_business.tenant_id=target_type.tenant_id
          and target_type.id=any(target_business.document_type_ids)
        where target_type.tenant_id=b.tenant_id and target_type.enabled
          and target_business.enabled and target_type.document_type_code='MT'
          and target_business.business_type_code='M311')
      and exists(select 1 from public.mdm_document_type target_type
        join public.mdm_business_type target_business
          on target_business.tenant_id=target_type.tenant_id
          and target_type.id=any(target_business.document_type_ids)
        where target_type.tenant_id=b.tenant_id and target_type.enabled
          and target_business.enabled and target_type.document_type_code='MT20'
          and target_business.business_type_code='M303')
    limit 1;
  request_line:=jsonb_build_object(
    'material_id',fixture.material_id,
    'project_id',fixture.project_id,
    'construction_no',fixture.construction_no,
    'inventory_unit_id',fixture.base_unit_id,
    'quantity',1,
    'batch_no',fixture.batch_no,
    'source_organization_id',fixture.organization_id,
    'source_warehouse_id',fixture.warehouse_id,
    'source_bin_id',fixture.bin_id,
    'target_organization_id',fixture.organization_id,
    'target_warehouse_id',fixture.target_warehouse_id);
  request_id:=public.wms_save_transfer_request_secure(jsonb_build_object(
    'tenant_id',fixture.tenant_id,
    'organization_id',fixture.organization_id,
    'document_type_id',fixture.document_type_id,
    'business_type_id',fixture.business_type_id,
    'application_date',current_date,
    'lines',jsonb_build_array(request_line,request_line)));
  perform public.wms_change_transfer_request_status_secure(request_id,'submit');
  perform public.wms_change_transfer_request_status_secure(request_id,'approve');
  select id into strict first_line_id from public.wms_transfer_request_line
    where document_id=request_id order by line_no limit 1;
  direct_id:=public.wms_create_transfer_business_from_request_secure(
    request_id,'direct',array[first_line_id]);
  select * into strict v_direct from public.wms_transfer_business_document where id=direct_id;
  select * into strict v_direct_line from public.wms_transfer_business_line
    where document_id=direct_id;
  begin
    perform public.wms_save_transfer_business_secure(jsonb_build_object(
      'id',direct_id,'tenant_id',v_direct.tenant_id,'kind','direct',
      'document_type_id',v_direct.document_type_id,
      'business_type_id',v_direct.business_type_id,
      'source_organization_id',v_direct.source_organization_id,
      'target_organization_id',v_direct.target_organization_id,
      'lines',jsonb_build_array(to_jsonb(v_direct_line)||
        jsonb_build_object('quantity',v_direct_line.quantity+1))));
    raise exception '申请选单后改写调拨数量被接受';
  exception when check_violation then null;
  end;
  begin
    perform public.wms_save_transfer_business_secure(jsonb_build_object(
      'id',direct_id,'tenant_id',v_direct.tenant_id,'kind','direct',
      'document_type_id',v_direct.document_type_id,
      'business_type_id',v_direct.business_type_id,
      'source_organization_id',v_direct.source_organization_id,
      'target_organization_id',v_direct.target_organization_id,
      'lines',jsonb_build_array(to_jsonb(v_direct_line)||
        jsonb_build_object('inventory_unit_id',fixture.alternate_unit_id))));
    raise exception '申请选单后保持数字不变却改库存单位被接受';
  exception when check_violation then null;
  end;
  if not exists(select 1 from public.wms_transfer_business_document d
    join public.wms_transfer_business_line l on l.document_id=d.id
    where d.id=direct_id and d.kind='direct' and d.status='draft'
      and l.source_request_line_id=first_line_id) then
    raise exception '按明细下推直接调拨未创建暂存单';
  end if;
  if (select pushed_at from public.wms_transfer_request_document
    where id=request_id) is not null then
    raise exception '部分下推不应标记整张申请完成';
  end if;
  if exists(select 1 from public.get_record_delete_dependency_details(
    'wms_transfer_business_document',array[direct_id::text],null)
    where source_table='wms_transfer_business_line') then
    raise exception '暂存调拨单自身明细不应阻断删除';
  end if;
  if not exists(select 1 from public.get_record_delete_dependency_details(
    'wms_transfer_request_document',array[request_id::text],null)
    where source_table in ('wms_transfer_business_document','wms_transfer_business_line')) then
    raise exception '来源申请删除检查未识别已下推的目标调拨单';
  end if;
  step_id:=public.wms_create_transfer_business_from_request_secure(
    request_id,'step','{}'::uuid[]);
  if not exists(select 1 from public.wms_transfer_business_document
    where id=step_id and kind='step' and status='draft')
    or not exists(select 1 from public.wms_transfer_request_document
      where id=request_id and pushed_mode='mixed' and pushed_at is not null) then
    raise exception '剩余明细下推分步调拨或整单标记失败';
  end if;
  begin
    perform public.wms_create_transfer_business_from_request_secure(
      request_id,'direct',array[first_line_id]);
    raise exception '已下推申请明细被重复下推';
  exception when check_violation then null;
  end;
  perform public.wms_change_transfer_business_status_secure(direct_id,'delete');
  if (select pushed_at from public.wms_transfer_request_document
    where id=request_id) is not null then
    raise exception '删除下推暂存单后申请未恢复可下推状态';
  end if;
  direct_id:=public.wms_create_transfer_business_from_request_secure(
    request_id,'direct',array[first_line_id]);
  if not exists(select 1 from public.wms_transfer_request_document
    where id=request_id and pushed_mode='mixed' and pushed_at is not null) then
    raise exception '删除后重新下推没有恢复整单状态';
  end if;
end $test$;

do $test$
declare
  platform_actor uuid;
  ordinary_user public.sys_user%rowtype;
  ordinary_role public.sys_role%rowtype;
  fixture_doc public.wms_transfer_business_document%rowtype;
  fixture_line public.wms_transfer_business_line%rowtype;
  other_tenant uuid;
  payload jsonb;
begin
  select * into strict fixture_doc from public.wms_transfer_business_document
    where kind='direct' and status='approved' order by created_at limit 1;
  select * into strict fixture_line from public.wms_transfer_business_line
    where document_id=fixture_doc.id order by line_no limit 1;
  select id into strict other_tenant from public.sys_tenant
    where id<>fixture_doc.tenant_id limit 1;
  select u.auth_user_id into strict platform_actor from public.sys_user u
    join public.sys_role r on r.tenant_id=u.tenant_id and r.role_code=any(u.user_roles)
    where r.builtin_type='platform_super' and u.status='1' and u.system_protected limit 1;
  payload:=jsonb_build_object(
    'tenant_id',fixture_doc.tenant_id,'kind','direct',
    'document_type_id',fixture_doc.document_type_id,
    'business_type_id',fixture_doc.business_type_id,
    'source_organization_id',fixture_doc.source_organization_id,
    'target_organization_id',fixture_doc.target_organization_id,
    'lines',jsonb_build_array(to_jsonb(fixture_line)-'source_request_line_id'));
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub',platform_actor,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  perform public.wms_save_transfer_business_secure(payload);
  perform set_config('request.headers',jsonb_build_object(
    'x-art-tenant-scope',fixture_doc.tenant_id)::text,true);
  perform public.wms_save_transfer_business_secure(payload);
  perform set_config('request.headers',jsonb_build_object(
    'x-art-tenant-scope',other_tenant)::text,true);
  begin
    perform public.wms_save_transfer_business_secure(payload);
    raise exception '平台选定其他租户后仍可写入原租户调拨单';
  exception when insufficient_privilege then null;
  end;
  select * into strict ordinary_user from public.sys_user u
    where u.tenant_id=fixture_doc.tenant_id and u.auth_user_id is not null
      and u.status='1' and u.deleted_at is null
      and not exists(select 1 from public.sys_role r where r.tenant_id=u.tenant_id
        and r.role_code=any(u.user_roles) and r.builtin_type='platform_super')
    limit 1;
  select * into strict ordinary_role from public.sys_role
    where tenant_id=fixture_doc.tenant_id and enabled
      and builtin_type is distinct from 'platform_super' limit 1;
  insert into public.sys_role_menu(role_id,menu_id,tenant_id,create_by)
    select ordinary_role.id,menu.id,ordinary_role.tenant_id,'rollback verification'
    from public.sys_menu menu
    where menu.name in ('WmsDirectTransfer:Create','WmsDirectTransfer:View')
      and not exists(select 1 from public.sys_role_menu existing
        where existing.role_id=ordinary_role.id and existing.menu_id=menu.id);
  update public.sys_user set user_roles=array[ordinary_role.role_code]
    where id=ordinary_user.id;
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub',ordinary_user.auth_user_id,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  perform public.wms_save_transfer_business_secure(payload);
  perform set_config('request.headers',jsonb_build_object(
    'x-art-tenant-scope',other_tenant)::text,true);
  perform public.wms_save_transfer_business_secure(payload);
  begin
    perform public.wms_save_transfer_business_secure(payload||jsonb_build_object(
      'tenant_id',other_tenant));
    raise exception '普通用户伪造租户范围后跨租户新增成功';
  exception when insufficient_privilege then null;
  end;
end $test$;

do $test$
declare
  actor uuid;
  source_batch public.wms_inventory_batch%rowtype;
  serial_bin public.mdm_warehouse_bin%rowtype;
  material public.mdm_material%rowtype;
  serial_rule public.mdm_supply_chain_code_rule%rowtype;
  target_warehouse uuid;
  document_type uuid;
  business_type uuid;
  new_material_id uuid:=gen_random_uuid();
  new_rule_id uuid:=gen_random_uuid();
  new_batch_id uuid:=gen_random_uuid();
  first_serial uuid:=gen_random_uuid();
  second_serial uuid:=gen_random_uuid();
  v_document_id uuid;
  original_line_id uuid;
  return_id uuid;
  return_doc public.wms_transfer_business_document%rowtype;
  return_line public.wms_transfer_business_line%rowtype;
  target_batch_id uuid;
  step_batch_id uuid:=gen_random_uuid();
  step_first_serial uuid:=gen_random_uuid();
  step_second_serial uuid:=gen_random_uuid();
  step_type uuid;
  step_business uuid;
  step_document_id uuid;
  step_line_id uuid;
  step_return_id uuid;
  step_return_doc public.wms_transfer_business_document%rowtype;
  step_return_line public.wms_transfer_business_line%rowtype;
  step_receipt_id uuid;
begin
  select u.auth_user_id into strict actor from public.sys_user u
    join public.sys_role r on r.tenant_id=u.tenant_id and r.role_code=any(u.user_roles)
    where r.builtin_type='platform_super' and u.status='1' and u.system_protected
    limit 1;
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub',actor,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  select bin.* into strict serial_bin from public.mdm_warehouse_bin bin
    join public.mdm_warehouse w on w.id=bin.warehouse_id
      and w.tenant_id=bin.tenant_id
    join public.mdm_material m on m.id=bin.fixed_material_id
      and m.tenant_id=bin.tenant_id
    join public.wms_inventory_initialization i on i.tenant_id=bin.tenant_id
      and i.organization_id=w.organization_id and i.enabled_on is not null
      and i.initialization_closed_at is not null
    where bin.supports_serial and bin.status='available'
      and w.status='enabled' and m.status='enabled'
      and m.base_unit_id is not null
      and exists(select 1 from public.mdm_warehouse target
        where target.tenant_id=w.tenant_id and target.organization_id=w.organization_id
          and target.id<>w.id and target.status='enabled'
          and not target.enable_locations)
    limit 1;
  select b.* into strict source_batch
    from public.wms_inventory_batch b
    join public.mdm_material m on m.id=b.material_id and m.tenant_id=b.tenant_id
    join public.wms_inventory_initialization i on i.tenant_id=b.tenant_id
      and i.organization_id=b.organization_id and i.enabled_on is not null
      and i.initialization_closed_at is not null
    where b.tenant_id=serial_bin.tenant_id
      and b.organization_id=(select organization_id from public.mdm_warehouse
        where id=serial_bin.warehouse_id)
      and b.status='normal' and b.quantity>=2 and b.organization_id is not null
      and m.base_unit_id is not null and m.status='enabled'
      and exists(select 1 from public.mdm_warehouse w where w.tenant_id=b.tenant_id
        and w.organization_id=b.organization_id and w.id<>b.warehouse_id
        and w.status='enabled' and not w.enable_locations)
      and exists(select 1 from public.mdm_document_type d
        join public.mdm_business_type bt on bt.tenant_id=d.tenant_id
          and d.id=any(bt.document_type_ids)
        where d.tenant_id=b.tenant_id and d.enabled and bt.enabled
          and d.document_type_code='MT' and bt.business_type_code='M311')
    limit 1;
  select * into strict material from public.mdm_material
    where id=serial_bin.fixed_material_id;
  select id into strict target_warehouse from public.mdm_warehouse
    where tenant_id=source_batch.tenant_id
      and organization_id=source_batch.organization_id
      and id<>serial_bin.warehouse_id and status='enabled'
      and not enable_locations limit 1;
  select d.id,bt.id into strict document_type,business_type
    from public.mdm_document_type d
    join public.mdm_business_type bt on bt.tenant_id=d.tenant_id
      and d.id=any(bt.document_type_ids)
    where d.tenant_id=source_batch.tenant_id and d.enabled and bt.enabled
      and d.document_type_code='MT' and bt.business_type_code='M311'
      and exists(select 1 from public.sys_menu menu where menu.name='WmsDirectTransfer'
        and menu.id=any(d.menu_ids) and menu.id=any(bt.menu_ids))
    limit 1;
  select * into strict serial_rule from public.mdm_supply_chain_code_rule
    where apply_serial limit 1;
  insert into public.mdm_supply_chain_code_rule
    select (jsonb_populate_record(null::public.mdm_supply_chain_code_rule,
      to_jsonb(serial_rule)||jsonb_build_object(
        'id',new_rule_id,'tenant_id',source_batch.tenant_id,
        'rule_code','ROLLBACK-SN-'||upper(left(new_rule_id::text,12)),
        'rule_name','回滚测试序列号规则'))).*;
  insert into public.mdm_material
    select (jsonb_populate_record(null::public.mdm_material,to_jsonb(material)||
      jsonb_build_object('id',new_material_id,
        'material_code','ROLLBACK-SN-'||left(new_material_id::text,12),
        'serial_management_enabled',true,'serial_rule_id',new_rule_id,
        'serial_generation_timing','inbound'))).*;
  update public.mdm_warehouse_bin set fixed_material_id=new_material_id
    where id=serial_bin.id;
  insert into public.wms_inventory_batch
    select (jsonb_populate_record(null::public.wms_inventory_batch,to_jsonb(source_batch)||
      jsonb_build_object('id',new_batch_id,'material_id',new_material_id,
        'warehouse_id',serial_bin.warehouse_id,'zone_id',serial_bin.zone_id,
        'bin_id',serial_bin.id,
        'quantity',2,'display_quantity',2,'initial_purchase_line_id',null))).*;
  insert into public.wms_serial_number(
    id,tenant_id,serial_no,material_id,batch_id,status,warehouse_id,bin_id,
    project_id,construction_no,organization_id)
  values
    (first_serial,source_batch.tenant_id,'ROLLBACK-SN-'||first_serial::text,
      new_material_id,new_batch_id,'in_stock',serial_bin.warehouse_id,
      serial_bin.id,source_batch.project_id,source_batch.construction_no,
      source_batch.organization_id),
    (second_serial,source_batch.tenant_id,'ROLLBACK-SN-'||second_serial::text,
      new_material_id,new_batch_id,'in_stock',serial_bin.warehouse_id,
      serial_bin.id,source_batch.project_id,source_batch.construction_no,
      source_batch.organization_id);
  v_document_id:=public.wms_save_transfer_business_secure(jsonb_build_object(
    'tenant_id',source_batch.tenant_id,'kind','direct',
    'document_type_id',document_type,'business_type_id',business_type,
    'source_organization_id',source_batch.organization_id,
    'target_organization_id',source_batch.organization_id,
    'lines',jsonb_build_array(jsonb_build_object(
      'material_id',new_material_id,'source_batch_id',new_batch_id,
      'project_id',source_batch.project_id,
      'construction_no',source_batch.construction_no,
      'inventory_unit_id',material.base_unit_id,'quantity',2,
      'batch_no',source_batch.batch_no,
      'source_organization_id',source_batch.organization_id,
      'source_warehouse_id',serial_bin.warehouse_id,
      'source_bin_id',serial_bin.id,
      'target_organization_id',source_batch.organization_id,
      'target_warehouse_id',target_warehouse,
      'serial_ids',jsonb_build_array(first_serial,second_serial)))));
  perform public.wms_change_transfer_business_status_secure(v_document_id,'submit');
  perform public.wms_change_transfer_business_status_secure(v_document_id,'approve');
  select id into strict original_line_id from public.wms_transfer_business_line
    where document_id=v_document_id limit 1;
  select movement.target_batch_id into strict target_batch_id
    from public.wms_transfer_business_line line
    join public.wms_inventory_movement movement on movement.id=line.movement_id
    where line.id=original_line_id;
  if (select count(*) from public.wms_serial_number
    where id in (first_serial,second_serial) and batch_id=target_batch_id
      and status='in_stock')<>2 then
    raise exception '直接调拨审核未逐件转移 SN';
  end if;
  return_id:=public.wms_create_transfer_business_return_secure(
    v_document_id,array[original_line_id]);
  select * into strict return_doc from public.wms_transfer_business_document
    where id=return_id;
  select * into strict return_line from public.wms_transfer_business_line
    where document_id=return_id;
  perform public.wms_save_transfer_business_secure(jsonb_build_object(
    'id',return_id,'tenant_id',return_doc.tenant_id,'kind','direct_return',
    'document_type_id',return_doc.document_type_id,
    'business_type_id',return_doc.business_type_id,
    'source_organization_id',return_doc.source_organization_id,
    'target_organization_id',return_doc.target_organization_id,
    'lines',jsonb_build_array(to_jsonb(return_line)||jsonb_build_object(
      'quantity',1,'serial_ids',jsonb_build_array(first_serial)))));
  perform public.wms_change_transfer_business_status_secure(return_id,'submit');
  perform public.wms_change_transfer_business_status_secure(return_id,'approve');
  if not exists(select 1 from public.wms_serial_number serial
    join public.wms_inventory_batch stock on stock.id=serial.batch_id
    where serial.id=first_serial and serial.status='in_stock'
      and stock.warehouse_id=serial_bin.warehouse_id and stock.bin_id=serial_bin.id)
    or not exists(select 1 from public.wms_serial_number
      where id=second_serial and batch_id=target_batch_id and status='in_stock')
    or not exists(select 1 from public.wms_transfer_business_line
      where id=original_line_id and returned_quantity=1) then
    raise exception '直接调拨 SN 部分退回未按原仓位反填';
  end if;
  select d.id,bt.id into strict step_type,step_business
    from public.mdm_document_type d
    join public.mdm_business_type bt on bt.tenant_id=d.tenant_id
      and d.id=any(bt.document_type_ids)
    where d.tenant_id=source_batch.tenant_id and d.enabled and bt.enabled
      and d.document_type_code='MT20' and bt.business_type_code='M303'
      and exists(select 1 from public.sys_menu menu where menu.name='WmsStepTransfer'
        and menu.id=any(d.menu_ids) and menu.id=any(bt.menu_ids))
    limit 1;
  insert into public.wms_inventory_batch
    select (jsonb_populate_record(null::public.wms_inventory_batch,to_jsonb(source_batch)||
      jsonb_build_object('id',step_batch_id,'material_id',new_material_id,
        'warehouse_id',serial_bin.warehouse_id,'zone_id',serial_bin.zone_id,
        'bin_id',serial_bin.id,'quantity',2,'display_quantity',2,
        'initial_purchase_line_id',null))).*;
  insert into public.wms_serial_number(
    id,tenant_id,serial_no,material_id,batch_id,status,warehouse_id,bin_id,
    project_id,construction_no,organization_id)
  values
    (step_first_serial,source_batch.tenant_id,'ROLLBACK-SN-'||step_first_serial::text,
      new_material_id,step_batch_id,'in_stock',serial_bin.warehouse_id,
      serial_bin.id,source_batch.project_id,source_batch.construction_no,
      source_batch.organization_id),
    (step_second_serial,source_batch.tenant_id,'ROLLBACK-SN-'||step_second_serial::text,
      new_material_id,step_batch_id,'in_stock',serial_bin.warehouse_id,
      serial_bin.id,source_batch.project_id,source_batch.construction_no,
      source_batch.organization_id);
  step_document_id:=public.wms_save_transfer_business_secure(jsonb_build_object(
    'tenant_id',source_batch.tenant_id,'kind','step',
    'document_type_id',step_type,'business_type_id',step_business,
    'source_organization_id',source_batch.organization_id,
    'target_organization_id',source_batch.organization_id,
    'lines',jsonb_build_array(jsonb_build_object(
      'material_id',new_material_id,'source_batch_id',step_batch_id,
      'project_id',source_batch.project_id,
      'construction_no',source_batch.construction_no,
      'inventory_unit_id',material.base_unit_id,'quantity',2,
      'batch_no',source_batch.batch_no,
      'source_organization_id',source_batch.organization_id,
      'source_warehouse_id',serial_bin.warehouse_id,
      'source_bin_id',serial_bin.id,
      'target_organization_id',source_batch.organization_id,
      'target_warehouse_id',target_warehouse,
      'serial_ids',jsonb_build_array(step_first_serial,step_second_serial)))));
  perform public.wms_change_transfer_business_status_secure(step_document_id,'submit');
  perform public.wms_change_transfer_business_status_secure(step_document_id,'approve');
  select id into strict step_line_id from public.wms_transfer_business_line
    where document_id=step_document_id;
  if (select count(*) from public.wms_serial_number
    where id in (step_first_serial,step_second_serial)
      and status='transfer_in_transit')<>2 then
    raise exception '分步调拨审核未将两件 SN 转为在途';
  end if;
  step_return_id:=public.wms_create_transfer_business_return_secure(
    step_document_id,array[step_line_id]);
  select * into strict step_return_doc from public.wms_transfer_business_document
    where id=step_return_id;
  select * into strict step_return_line from public.wms_transfer_business_line
    where document_id=step_return_id;
  perform public.wms_save_transfer_business_secure(jsonb_build_object(
    'id',step_return_id,'tenant_id',step_return_doc.tenant_id,'kind','step_return',
    'document_type_id',step_return_doc.document_type_id,
    'business_type_id',step_return_doc.business_type_id,
    'source_organization_id',step_return_doc.source_organization_id,
    'target_organization_id',step_return_doc.target_organization_id,
    'lines',jsonb_build_array(to_jsonb(step_return_line)||jsonb_build_object(
      'quantity',1,'serial_ids',jsonb_build_array(step_first_serial)))));
  perform public.wms_change_transfer_business_status_secure(step_return_id,'submit');
  perform public.wms_change_transfer_business_status_secure(step_return_id,'approve');
  if not exists(select 1 from public.wms_serial_number serial
    join public.wms_inventory_batch stock on stock.id=serial.batch_id
    where serial.id=step_first_serial and serial.status='in_stock'
      and stock.warehouse_id=serial_bin.warehouse_id and stock.bin_id=serial_bin.id)
    or not exists(select 1 from public.wms_serial_number
      where id=step_second_serial and status='transfer_in_transit') then
    raise exception '分步调拨 SN 部分调出退回未按原仓位反填';
  end if;
  step_receipt_id:=public.wms_create_transfer_business_receipt_secure(step_document_id,
    jsonb_build_array(jsonb_build_object('line_id',step_line_id,'target_bin_id',null)));
  if not exists(select 1 from public.wms_serial_number
    where id=step_second_serial and status='transfer_in_transit') then
    raise exception '收货单暂存时 SN 提前入库';
  end if;
  perform public.wms_change_transfer_business_status_secure(step_receipt_id,'submit');
  perform public.wms_change_transfer_business_status_secure(step_receipt_id,'approve');
  if not exists(select 1 from public.wms_serial_number serial
    join public.wms_inventory_batch stock on stock.id=serial.batch_id
    where serial.id=step_second_serial and serial.status='in_stock'
      and stock.warehouse_id=target_warehouse)
    or not exists(select 1 from public.wms_transfer_business_line
      where id=step_line_id and returned_quantity=1) then
    raise exception '分步调拨退回后剩余 SN 收货错误';
  end if;
end $test$;

do $test$
declare
  actor uuid;
  fixture record;
  document_type uuid;
  business_type uuid;
  transfer_id uuid;
  original_line_id uuid;
  receipt_id uuid;
  child_id uuid;
  received_batch_id uuid;
  source_before numeric;
begin
  select u.auth_user_id into strict actor from public.sys_user u
    join public.sys_role r on r.tenant_id=u.tenant_id and r.role_code=any(u.user_roles)
    where r.builtin_type='platform_super' and u.status='1' and u.system_protected limit 1;
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub',actor,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  select b.id batch_id,b.tenant_id,b.quantity,b.material_id,b.organization_id,
    b.warehouse_id,b.bin_id source_bin_id,dest.id target_bin_id,
    b.project_id,b.construction_no,m.base_unit_id
    into strict fixture
    from public.wms_inventory_batch b
    join public.mdm_material m on m.id=b.material_id and m.tenant_id=b.tenant_id
    join public.mdm_warehouse w on w.id=b.warehouse_id and w.tenant_id=b.tenant_id
    join public.mdm_warehouse_bin dest on dest.warehouse_id=b.warehouse_id
      and dest.id<>b.bin_id and dest.status='available'
      and dest.fixed_material_id is null
    left join public.mdm_warehouse_zone target_zone
      on target_zone.id=dest.zone_id and target_zone.tenant_id=b.tenant_id
    join public.wms_inventory_initialization i on i.tenant_id=b.tenant_id
      and i.organization_id=b.organization_id and i.enabled_on is not null
      and i.initialization_closed_at is not null
    where b.tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9'
      and b.quantity>=1 and b.status='normal' and b.pack_id is null
      and b.bin_id is not null and w.status='enabled' and m.status='enabled'
      and not m.serial_management_enabled and m.base_unit_id is not null
      and (target_zone.id is null or target_zone.status='enabled'
        and not target_zone.abnormal and target_zone.allow_mix
        and (target_zone.category_id is null or target_zone.category_id=m.category_id))
      and dest.max_quantity is null and dest.max_area_sqm is null
      and dest.max_weight_kg is null
    order by b.quantity desc limit 1;
  select dt.id,bt.id into strict document_type,business_type
    from public.mdm_document_type dt
    join public.mdm_business_type bt on bt.tenant_id=dt.tenant_id
      and dt.id=any(bt.document_type_ids)
    where dt.tenant_id=fixture.tenant_id and dt.enabled and bt.enabled
      and dt.document_type_code='MT20' and bt.business_type_code='M303'
    limit 1;
  source_before:=fixture.quantity;
  begin
    perform public.wms_save_transfer_business_secure(jsonb_build_object(
      'tenant_id',fixture.tenant_id,'kind','step',
      'document_type_id',document_type,'business_type_id',business_type,
      'source_organization_id',fixture.organization_id,
      'target_organization_id',fixture.organization_id,
      'lines',jsonb_build_array(jsonb_build_object(
        'material_id',fixture.material_id,'source_batch_id',fixture.batch_id,
        'project_id',fixture.project_id,'construction_no',fixture.construction_no,
        'inventory_unit_id',fixture.base_unit_id,'quantity',1,
        'source_organization_id',fixture.organization_id,
        'source_warehouse_id',fixture.warehouse_id,
        'source_bin_id',fixture.source_bin_id,
        'target_organization_id',fixture.organization_id,
        'target_warehouse_id',fixture.warehouse_id,
        'target_bin_id',fixture.source_bin_id))));
    raise exception '同仓同仓位分步调拨被接受';
  exception when check_violation then null;
  end;
  transfer_id:=public.wms_save_transfer_business_secure(jsonb_build_object(
    'tenant_id',fixture.tenant_id,'kind','step',
    'document_type_id',document_type,'business_type_id',business_type,
    'source_organization_id',fixture.organization_id,
    'target_organization_id',fixture.organization_id,
    'lines',jsonb_build_array(jsonb_build_object(
      'material_id',fixture.material_id,'source_batch_id',fixture.batch_id,
      'project_id',fixture.project_id,'construction_no',fixture.construction_no,
      'inventory_unit_id',fixture.base_unit_id,'quantity',1,
      'source_organization_id',fixture.organization_id,
      'source_warehouse_id',fixture.warehouse_id,
      'source_bin_id',fixture.source_bin_id,
      'target_organization_id',fixture.organization_id,
      'target_warehouse_id',fixture.warehouse_id,
      'target_bin_id',fixture.target_bin_id))));
  perform public.wms_change_transfer_business_status_secure(transfer_id,'submit');
  perform public.wms_change_transfer_business_status_secure(transfer_id,'approve');
  select l.id,l.step_transfer_id into strict original_line_id,child_id
    from public.wms_transfer_business_line l where l.document_id=transfer_id;
  if not exists(select 1 from public.wms_transfer_document
    where id=child_id and status='in_transit' and target_bin_id=fixture.target_bin_id)
    or not exists(select 1 from public.wms_inventory_batch
      where id=fixture.batch_id and quantity=source_before-1) then
    raise exception '同仓异仓位审核未按来源仓位调出并进入在途';
  end if;
  begin
    perform public.wms_create_transfer_business_receipt_secure(transfer_id,
      jsonb_build_array(jsonb_build_object('line_id',original_line_id,
        'target_bin_id',fixture.source_bin_id)));
    raise exception '同仓收货草稿允许退回原仓位';
  exception when check_violation then null;
  end;
  receipt_id:=public.wms_create_transfer_business_receipt_secure(transfer_id,
    jsonb_build_array(jsonb_build_object('line_id',original_line_id,
      'target_bin_id',fixture.target_bin_id)));
  begin
    perform public.wms_update_transfer_business_receipt_secure(receipt_id,
      current_date,null,jsonb_build_array(jsonb_build_object(
        'line_id',(select id from public.wms_transfer_business_line
          where document_id=receipt_id),'target_bin_id',fixture.source_bin_id)));
    raise exception '同仓收货草稿编辑允许改回原仓位';
  exception when check_violation then null;
  end;
  perform public.wms_change_transfer_business_status_secure(receipt_id,'submit');
  perform public.wms_change_transfer_business_status_secure(receipt_id,'approve');
  select child.target_batch_id into strict received_batch_id
    from public.wms_transfer_document child where child.id=child_id and child.status='received';
  if not exists(select 1 from public.wms_inventory_batch
      where id=received_batch_id and warehouse_id=fixture.warehouse_id
        and bin_id=fixture.target_bin_id and quantity=1)
    or not exists(select 1 from public.wms_inventory_batch
      where id=fixture.batch_id and quantity=source_before-1) then
    raise exception '同仓异仓位审核收货没有落到目标仓位';
  end if;
end $test$;

rollback;


