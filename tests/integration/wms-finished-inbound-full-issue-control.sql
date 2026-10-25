-- Exercises full issue control at receipt approval and stock posting.
-- Every configuration and business-data change is rolled back.
begin;
do $test$
declare
  actor uuid;
  work_order public.mes_work_order%rowtype;
  receipt_type record;
  return_type record;
  material_unit_id uuid;
  key_material_id uuid;
  bom_index integer;
  item_index integer;
  bin_id uuid;
  zone_category_id uuid;
  receipt_document_id uuid;
  return_document_id uuid;
  return_line_id uuid;
  return_document_no text;
  receipt_line_id uuid;
  gaps jsonb;
  rejected boolean;
  payload jsonb;
  work_order_option jsonb;
  other_tenant uuid;
  ordinary_user uuid;
  ordinary_role_id uuid;
  view_menu_id uuid;
  return_push_menu_id uuid;
  exposed_control jsonb;
  posted_movement_id uuid;
  return_movement_id uuid;
  posted_batch_id uuid;
  posted_batch_status text;
  posted_warehouse_quantity numeric;
  pack_board_id uuid;
  qa_pack_id uuid;
  qa_pack_no text;
  pack_movement_id uuid;
  pack_batch_id uuid;
  pack_receipt_id uuid;
  pack_receipt_line_id uuid;
  pack_return_id uuid;
  inbound_warehouse_name text;
  report jsonb;
  report_kind text;
begin
  select u.auth_user_id into strict actor
  from public.sys_user u
  join public.sys_role r on r.tenant_id = u.tenant_id and r.role_code = any(u.user_roles)
  where r.builtin_type = 'platform_super' and u.system_protected and u.status = '1'
  limit 1;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', actor, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{}', true);

  select wo.* into strict work_order
  from public.mes_work_order wo
  join public.mdm_material material on material.id = wo.material_id and material.tenant_id = wo.tenant_id
  join public.mdm_warehouse warehouse on warehouse.id = wo.inbound_warehouse_id and warehouse.tenant_id = wo.tenant_id
  where wo.status = 'confirmed' and wo.deleted_at is null and wo.work_order_type_id is not null
    and wo.project_id is not null and wo.order_quantity >= 1
    and material.inventory_unit_id is not null and not material.serial_management_enabled
    and jsonb_typeof(wo.bom_snapshot) = 'array' and jsonb_array_length(wo.bom_snapshot) > 0
    and jsonb_array_length(app_private.wms_full_issue_gaps_internal(wo.tenant_id, wo.id, 'all')) > 0
    and exists (
      select 1 from public.wms_inventory_initialization i
      where i.tenant_id = wo.tenant_id and i.organization_id = warehouse.organization_id
        and i.enabled_on is not null and i.initialization_closed_at is not null
    )
    and exists (
      select 1 from public.mdm_project_construction section
      where section.project_id = wo.project_id and section.tenant_id = wo.tenant_id
    )
  order by wo.id limit 1;
  select section.construction_no into strict work_order.construction_no
  from public.mdm_project_construction section
  where section.project_id = work_order.project_id and section.tenant_id = work_order.tenant_id
  order by section.construction_no limit 1;
  select warehouse.id into strict work_order.inbound_warehouse_id
  from public.mdm_warehouse warehouse
  where warehouse.tenant_id = work_order.tenant_id
    and warehouse.organization_id = work_order.organization_id
    and warehouse.warehouse_type = 'finished' and warehouse.status = 'enabled'
    and cardinality(warehouse.business_scopes) > 0
  order by warehouse.id limit 1;
  update public.mes_work_order set construction_no = work_order.construction_no,
    inbound_warehouse_id = work_order.inbound_warehouse_id
    where id = work_order.id and tenant_id = work_order.tenant_id;
  select bin.id,zone.category_id into strict bin_id,zone_category_id
  from public.mdm_warehouse_bin bin
  join public.mdm_warehouse_zone zone on zone.id = bin.zone_id and zone.tenant_id = bin.tenant_id
  where bin.tenant_id = work_order.tenant_id and bin.warehouse_id = work_order.inbound_warehouse_id
    and bin.status = 'available' and bin.fixed_material_id is null
    and bin.max_quantity is null and bin.max_area_sqm is null and bin.max_weight_kg is null
    and zone.status = 'enabled' and not zone.abnormal
    and (zone.allow_mix or not exists (
      select 1 from public.wms_inventory_batch stock
      join public.mdm_warehouse_bin stock_bin on stock_bin.id = stock.bin_id
      where stock_bin.zone_id = zone.id and stock.quantity > 0
    ))
  order by bin.id limit 1;
  update public.mdm_material set inbound_warehouse_id = work_order.inbound_warehouse_id,
    category_id = zone_category_id
    where id = work_order.material_id and tenant_id = work_order.tenant_id;
  select inventory_unit_id into strict material_unit_id from public.mdm_material
    where id = work_order.material_id and tenant_id = work_order.tenant_id;
  select dt.id as document_type_id, bt.id as business_type_id
    into strict receipt_type
  from public.sys_menu menu
  join public.mdm_document_type dt on dt.tenant_id = work_order.tenant_id
    and (dt.menu_id = menu.id or menu.id = any(dt.menu_ids))
  join public.mdm_business_type bt on bt.document_type_id = dt.id and bt.tenant_id = dt.tenant_id
  where menu.name = 'WmsFinishedInbound' and dt.enabled
  order by dt.is_default desc, bt.is_default desc limit 1;
  select dt.id as document_type_id, bt.id as business_type_id
    into strict return_type
  from public.sys_menu menu
  join public.mdm_document_type dt on dt.tenant_id = work_order.tenant_id
    and (dt.menu_id = menu.id or menu.id = any(dt.menu_ids))
  join public.mdm_business_type bt on bt.document_type_id = dt.id and bt.tenant_id = dt.tenant_id
  where menu.name = 'WmsFinishedReturn' and dt.enabled
  order by dt.is_default desc, bt.is_default desc limit 1;

  gaps := app_private.wms_full_issue_gaps_internal(work_order.tenant_id, work_order.id, 'all');
  if jsonb_array_length(gaps) = 0 then raise exception 'Expected an unissued BOM component'; end if;
  if jsonb_array_length(app_private.wms_full_issue_gaps_internal(work_order.tenant_id, work_order.id, 'key')) <> 0 then
    raise exception 'Fixture unexpectedly has key-component issue gaps';
  end if;
  select (item.value->>'component_material_id')::uuid into strict key_material_id
  from jsonb_array_elements(work_order.bom_snapshot) bom(value)
  cross join lateral jsonb_array_elements(bom.value->'items') item(value)
  where item.value->>'id' = gaps->0->>'sourceLineNo'
  limit 1;
  update public.mdm_material set key_component = true
    where id = key_material_id and tenant_id = work_order.tenant_id;
  if jsonb_array_length(app_private.wms_full_issue_gaps_internal(
    work_order.tenant_id, work_order.id, 'key'
  )) = 0 then raise exception 'Marked key component was not checked'; end if;
  update public.mdm_material set key_component = false
    where id = key_material_id and tenant_id = work_order.tenant_id;
  select bom.position - 1, item.position - 1 into strict bom_index,item_index
  from jsonb_array_elements(work_order.bom_snapshot) with ordinality bom(value,position)
  cross join lateral jsonb_array_elements(bom.value->'items') with ordinality item(value,position)
  where item.value->>'id' = gaps->0->>'sourceLineNo'
  limit 1;
  update public.mes_work_order set bom_snapshot = jsonb_set(
    bom_snapshot,
    array[bom_index::text,'items',item_index::text,'backflush_method'],
    to_jsonb('backflush'::text),true
  ) where id = work_order.id and tenant_id = work_order.tenant_id;
  if jsonb_array_length(app_private.wms_full_issue_gaps_internal(
    work_order.tenant_id, work_order.id, 'non_backflush'
  )) >= jsonb_array_length(gaps) then
    raise exception 'Non-backflush scope did not exclude a backflush component';
  end if;
  update public.mdm_document_type set production_full_issue_control = 'strict',
    production_full_issue_scope = 'all'
  where id = work_order.work_order_type_id and tenant_id = work_order.tenant_id;
  select option.value into strict work_order_option
  from jsonb_array_elements(public.wms_work_order_options_secure(
    work_order.inbound_warehouse_id, work_order.id::text
  )) option(value)
  where option.value->>'id' = work_order.id::text;
  if work_order_option->>'productionFullIssueControl' <> 'strict'
    or jsonb_array_length(work_order_option->'productionFullIssueGaps') = 0 then
    raise exception 'Work order picker did not expose strict full issue gaps';
  end if;
  select id into strict other_tenant from public.sys_tenant
    where id <> work_order.tenant_id order by id limit 1;
  select u.auth_user_id,role.id into strict ordinary_user,ordinary_role_id
  from public.sys_user u
  join public.sys_role role on role.tenant_id = u.tenant_id
    and role.role_code = any(u.user_roles) and role.enabled
  where u.tenant_id = work_order.tenant_id and u.status = '1'
    and u.user_type = '2' and u.auth_user_id is not null
    and role.builtin_type is distinct from 'platform_super'
  order by u.id limit 1;
  select id into strict view_menu_id from public.sys_menu
    where name = 'WmsFinishedInbound:View' and type = 'button' limit 1;
  if not exists (select 1 from public.sys_role_menu
    where tenant_id = work_order.tenant_id and role_id = ordinary_role_id and menu_id = view_menu_id) then
    insert into public.sys_role_menu(tenant_id,role_id,menu_id,create_by)
      values(work_order.tenant_id,ordinary_role_id,view_menu_id,'system');
  end if;
  select id into strict return_push_menu_id from public.sys_menu
    where name = 'WmsFinishedReturn:Push' and type = 'button' limit 1;
  if not exists (select 1 from public.sys_role_menu
    where tenant_id = work_order.tenant_id and role_id = ordinary_role_id
      and menu_id = return_push_menu_id) then
    insert into public.sys_role_menu(tenant_id,role_id,menu_id,create_by)
      values(work_order.tenant_id,ordinary_role_id,return_push_menu_id,'system');
  end if;
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', ordinary_user, 'role', 'authenticated')::text, true);
  select option.value into strict exposed_control
  from jsonb_array_elements(public.wms_work_order_options_secure(
    work_order.inbound_warehouse_id, work_order.id::text
  )) option(value);
  if exposed_control->>'productionFullIssueControl' <> 'strict'
    or jsonb_array_length(exposed_control->'productionFullIssueGaps') = 0 then
    raise exception 'Authorized ordinary user could not read own-tenant issue gaps';
  end if;
  perform set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope', other_tenant)::text, true);
  select option.value into strict exposed_control
  from jsonb_array_elements(public.wms_work_order_options_secure(
    work_order.inbound_warehouse_id, work_order.id::text
  )) option(value);
  if exposed_control->>'productionFullIssueControl' <> 'strict' then
    raise exception 'Forged tenant header changed ordinary-user issue control';
  end if;
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', actor, 'role', 'authenticated')::text, true);
  begin
    perform public.wms_work_order_options_secure(work_order.inbound_warehouse_id, work_order.id::text);
    raise exception 'Platform-selected foreign tenant exposed issue gaps';
  exception when no_data_found or invalid_parameter_value then null;
  end;
  perform set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope', work_order.tenant_id)::text, true);
  select option.value into strict exposed_control
  from jsonb_array_elements(public.wms_work_order_options_secure(
    work_order.inbound_warehouse_id, work_order.id::text
  )) option(value);
  if exposed_control->>'productionFullIssueControl' <> 'strict' then
    raise exception 'Platform-selected own tenant could not read issue control';
  end if;
  perform set_config('request.headers', '{}', true);

  insert into public.wms_production_material_document (
    tenant_id,kind,document_no,document_type_id,business_type_id,organization_id,
    warehouse_id,work_order_id,project_id,status,created_by
  ) values (
    work_order.tenant_id,'finished_inbound','QA-FULL-ISSUE-' || gen_random_uuid(),
    receipt_type.document_type_id,receipt_type.business_type_id,work_order.organization_id,
    work_order.inbound_warehouse_id,work_order.id,work_order.project_id,'submitted',actor
  ) returning id into receipt_document_id;
  insert into public.wms_production_material_line (
    tenant_id,document_id,line_no,material_id,inventory_unit_id,requested_quantity,
    actual_quantity,warehouse_id,bin_id,stock_type,stock_status,
    work_order_id,project_id,construction_no,batch_no
  ) values (
    work_order.tenant_id,receipt_document_id,10,work_order.material_id,material_unit_id,1,
    1,work_order.inbound_warehouse_id,bin_id,'normal','defective',work_order.id,
    work_order.project_id,work_order.construction_no,
    'QA-FULL-ISSUE-ROLLBACK'
  );

  rejected := false;
  begin
    perform public.wms_change_production_material_status_secure(receipt_document_id, 'approve');
  exception when check_violation then
    if sqlerrm not like '%尚未完全领料%' then raise; end if;
    rejected := true;
  end;
  if not rejected then raise exception 'Strict full issue control did not block approval'; end if;

  update public.mdm_document_type set production_full_issue_control = 'warning'
  where id = work_order.work_order_type_id and tenant_id = work_order.tenant_id;
  perform public.wms_change_production_material_status_secure(receipt_document_id, 'approve');
  if not exists (select 1 from public.wms_production_material_document
    where id = receipt_document_id and status = 'approved') then
    raise exception 'Warning full issue control blocked approval';
  end if;
  perform public.wms_push_production_material_secure(receipt_document_id, null);
  select line.id,line.movement_id, movement.target_batch_id
    into strict receipt_line_id,posted_movement_id,posted_batch_id
  from public.wms_production_material_line line
  join public.wms_inventory_movement movement on movement.id = line.movement_id
  where line.document_id = receipt_document_id;
  select status into strict posted_batch_status from public.wms_inventory_batch
    where id = posted_batch_id and tenant_id = work_order.tenant_id;
  if posted_batch_status <> 'defective' then
    raise exception 'Unqualified finished receipt lost its quality status';
  end if;
  select warehoused_quantity into strict posted_warehouse_quantity
  from public.mes_work_order where id = work_order.id and tenant_id = work_order.tenant_id;
  select warehouse_name into strict inbound_warehouse_name from public.mdm_warehouse
    where id = work_order.inbound_warehouse_id and tenant_id = work_order.tenant_id;
  select option.value into strict work_order_option
  from jsonb_array_elements(public.wms_work_order_options_secure(
    work_order.inbound_warehouse_id, work_order.id::text
  )) option(value);
  if work_order_option->>'workOrderTypeName' is null
    or work_order_option->>'documentDate' is null
    or work_order_option->>'documentStatus' <> 'confirmed' then
    raise exception 'Work order picker identity is incomplete';
  end if;
  if work_order_option->>'inboundWarehouseName' <> inbound_warehouse_name then
    raise exception 'Work order picker shows a stale inbound warehouse name';
  end if;
  if (work_order_option->>'pendingInboundQuantity')::numeric <>
    greatest(work_order.order_quantity - posted_warehouse_quantity, 0) then
    raise exception 'Work order picker pending inbound quantity is inconsistent';
  end if;
  if (work_order_option->>'returnedQuantity')::numeric <> 0
    or (work_order_option->>'qualifiedInboundQuantity')::numeric <> 0
    or (work_order_option->>'defectiveInboundQuantity')::numeric <> 1
    or (work_order_option->>'scrappedInboundQuantity')::numeric <> 0 then
    raise exception 'Work order picker quality or return totals are inconsistent';
  end if;
  if not exists (
    select 1 from public.wms_finished_inbound_source_list
    where id = receipt_line_id and source_batch_id = posted_batch_id
      and stock_status = 'defective' and available_quantity >= 1
  ) then raise exception 'Unqualified finished receipt is not selectable for return'; end if;
  insert into public.wms_production_material_document (
    tenant_id,kind,document_no,document_type_id,business_type_id,organization_id,
    warehouse_id,work_order_id,project_id,status,created_by
  ) values (
    work_order.tenant_id,'finished_return','QA-FULL-RETURN-' || gen_random_uuid(),
    return_type.document_type_id,return_type.business_type_id,work_order.organization_id,
    work_order.inbound_warehouse_id,work_order.id,work_order.project_id,'submitted',actor
  ) returning id into return_document_id;
  insert into public.wms_production_material_line (
    tenant_id,document_id,line_no,material_id,inventory_unit_id,requested_quantity,
    actual_quantity,warehouse_id,bin_id,stock_type,stock_status,source_batch_id,
    source_line_id,work_order_id,project_id,construction_no,batch_no
  ) values (
    work_order.tenant_id,return_document_id,10,work_order.material_id,material_unit_id,-1,
    -1,work_order.inbound_warehouse_id,bin_id,'normal','defective',posted_batch_id,
    receipt_line_id,work_order.id,work_order.project_id,work_order.construction_no,
    'QA-FULL-ISSUE-ROLLBACK'
  );
  perform public.wms_change_production_material_status_secure(return_document_id, 'approve');
  select line.id,document.document_no into strict return_line_id,return_document_no
  from public.wms_production_material_line line
  join public.wms_production_material_document document on document.id = line.document_id
  where line.document_id = return_document_id;
  begin
    perform public.wms_post_inventory_movement_secure(jsonb_build_object(
      'movement_type','other_out','batch_id',posted_batch_id,
      'finished_return_line_id',return_line_id,'quantity',1,
      'project_id',work_order.project_id,'construction_no',work_order.construction_no,
      'serial_ids','[]'::jsonb,'reference_no',return_document_no
    ));
    raise exception 'Public stock RPC bypassed the finished-return source guard';
  exception when check_violation then
    if sqlerrm not like '异常库存批次不可出库或调拨%' then raise; end if;
  end;
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', ordinary_user, 'role', 'authenticated')::text, true);
  perform set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope', other_tenant)::text, true);
  if app_private.has_permission('MdmInventoryBatch:Issue')
    or app_private.has_permission('WmsStockOperation:Issue')
    or not app_private.has_permission('WmsFinishedReturn:Push') then
    raise exception 'Ordinary return actor must have Push without generic stock issue permission';
  end if;
  perform public.wms_push_production_material_secure(return_document_id, null);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', actor, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{}', true);
  select movement_id into strict return_movement_id from public.wms_production_material_line
    where document_id = return_document_id;
  select option.value into strict work_order_option
  from jsonb_array_elements(public.wms_work_order_options_secure(
    work_order.inbound_warehouse_id, work_order.id::text
  )) option(value);
  if (work_order_option->>'returnedQuantity')::numeric <> 1
    or (work_order_option->>'defectiveInboundQuantity')::numeric <> 1
    or (work_order_option->>'pendingInboundQuantity')::numeric <> work_order.order_quantity
    or exists (select 1 from public.wms_inventory_batch where id = posted_batch_id and quantity <> 0)
    or exists (select 1 from public.wms_finished_inbound_source_list where id = receipt_line_id) then
    raise exception 'Work order picker lost finished return or gross quality quantity';
  end if;
  for report_kind in select unnest(array['stock', 'movement', 'ledger', 'receipt-issue']) loop
    report := public.wms_inventory_report_secure(
      report_kind, p_batch_no => 'QA-FULL-ISSUE-ROLLBACK',
      p_tenant_id => work_order.tenant_id, p_limit => 200
    );
    if report_kind = 'stock' then
      if exists (select 1 from jsonb_array_elements(report->'data') item
        where item->>'id' = posted_batch_id::text) then
        raise exception 'Fully returned finished stock still appears as on-hand inventory';
      end if;
    else
      if not exists (
        select 1 from jsonb_array_elements(report->'data') item
        where item->>'id' = case when report_kind = 'ledger'
          then posted_batch_id::text else posted_movement_id::text || ':in' end
          and (report_kind = 'ledger'
            or (item->>'source_document_id' = receipt_document_id::text
              and item->>'source_document_kind' = 'finished_inbound'))
      ) then raise exception 'Posted finished receipt missing from report %', report_kind; end if;
      if report_kind in ('movement', 'receipt-issue') and not exists (
        select 1 from jsonb_array_elements(report->'data') item
        where item->>'id' = return_movement_id::text || ':out'
          and item->>'source_document_id' = return_document_id::text
          and item->>'source_document_kind' = 'finished_return'
      ) then raise exception 'Finished return missing from report %', report_kind; end if;
    end if;
  end loop;

  -- Scrapped finished goods use the same guarded return path as defective goods.
  insert into public.wms_production_material_document (
    tenant_id,kind,document_no,document_type_id,business_type_id,organization_id,
    warehouse_id,work_order_id,project_id,status,created_by
  ) values (
    work_order.tenant_id,'finished_inbound','QA-SCRAPPED-IN-' || gen_random_uuid(),
    receipt_type.document_type_id,receipt_type.business_type_id,work_order.organization_id,
    work_order.inbound_warehouse_id,work_order.id,work_order.project_id,'submitted',actor
  ) returning id into receipt_document_id;
  insert into public.wms_production_material_line (
    tenant_id,document_id,line_no,material_id,inventory_unit_id,requested_quantity,
    actual_quantity,warehouse_id,bin_id,stock_type,stock_status,
    work_order_id,project_id,construction_no,batch_no
  ) values (
    work_order.tenant_id,receipt_document_id,10,work_order.material_id,material_unit_id,1,
    1,work_order.inbound_warehouse_id,bin_id,'normal','scrapped',work_order.id,
    work_order.project_id,work_order.construction_no,'QA-SCRAPPED-ROLLBACK'
  );
  perform public.wms_change_production_material_status_secure(receipt_document_id,'approve');
  perform public.wms_push_production_material_secure(receipt_document_id,null);
  select line.id,line.movement_id,movement.target_batch_id
    into strict receipt_line_id,posted_movement_id,posted_batch_id
  from public.wms_production_material_line line
  join public.wms_inventory_movement movement on movement.id=line.movement_id
  where line.document_id=receipt_document_id;
  if not exists (select 1 from public.wms_inventory_batch
    where id=posted_batch_id and tenant_id=work_order.tenant_id
      and status='scrapped' and quantity=1)
    or not exists (select 1 from public.wms_finished_inbound_source_list
      where id=receipt_line_id and source_batch_id=posted_batch_id
        and stock_status='scrapped' and available_quantity>=1) then
    raise exception 'Scrapped receipt was not selectable for a guarded return';
  end if;
  insert into public.wms_production_material_document (
    tenant_id,kind,document_no,document_type_id,business_type_id,organization_id,
    warehouse_id,work_order_id,project_id,status,created_by
  ) values (
    work_order.tenant_id,'finished_return','QA-SCRAPPED-RETURN-' || gen_random_uuid(),
    return_type.document_type_id,return_type.business_type_id,work_order.organization_id,
    work_order.inbound_warehouse_id,work_order.id,work_order.project_id,'submitted',actor
  ) returning id into return_document_id;
  insert into public.wms_production_material_line (
    tenant_id,document_id,line_no,material_id,inventory_unit_id,requested_quantity,
    actual_quantity,warehouse_id,bin_id,stock_type,stock_status,source_batch_id,
    source_line_id,work_order_id,project_id,construction_no,batch_no
  ) values (
    work_order.tenant_id,return_document_id,10,work_order.material_id,material_unit_id,-1,
    -1,work_order.inbound_warehouse_id,bin_id,'normal','scrapped',posted_batch_id,
    receipt_line_id,work_order.id,work_order.project_id,work_order.construction_no,
    'QA-SCRAPPED-ROLLBACK'
  );
  perform public.wms_change_production_material_status_secure(return_document_id,'approve');
  perform public.wms_push_production_material_secure(return_document_id,null);
  select movement_id into strict return_movement_id
  from public.wms_production_material_line where document_id=return_document_id;
  if exists (select 1 from public.wms_inventory_batch
      where id=posted_batch_id and quantity<>0)
    or exists (select 1 from public.wms_finished_inbound_source_list
      where id=receipt_line_id)
    or (select warehoused_quantity from public.mes_work_order
      where id=work_order.id and tenant_id=work_order.tenant_id)<>0 then
    raise exception 'Scrapped finished return failed to reverse stock or work order';
  end if;
  for report_kind in select unnest(array['stock','movement','ledger','receipt-issue']) loop
    report:=public.wms_inventory_report_secure(
      report_kind,p_batch_no=>'QA-SCRAPPED-ROLLBACK',
      p_tenant_id=>work_order.tenant_id,p_limit=>200
    );
    if report_kind='stock' then
      if exists(select 1 from jsonb_array_elements(report->'data') item
        where item->>'id'=posted_batch_id::text) then
        raise exception 'Fully returned scrapped stock appears in on-hand inventory';
      end if;
    elsif report_kind='ledger' then
      if not exists(select 1 from jsonb_array_elements(report->'data') item
        where item->>'id'=posted_batch_id::text
          and (item->>'closing_quantity')::numeric=0) then
        raise exception 'Scrapped return did not reconcile the inventory ledger';
      end if;
    elsif report_kind in ('movement','receipt-issue') then
      if not exists(select 1 from jsonb_array_elements(report->'data') item
        where item->>'id'=posted_movement_id::text||':in'
          and item->>'source_document_id'=receipt_document_id::text
          and item->>'source_document_kind'='finished_inbound')
        or not exists(select 1 from jsonb_array_elements(report->'data') item
          where item->>'id'=return_movement_id::text||':out'
            and item->>'source_document_id'=return_document_id::text
            and item->>'source_document_kind'='finished_return') then
        raise exception 'Scrapped receipt or return missing from report %',report_kind;
      end if;
    end if;
  end loop;

  payload := jsonb_build_object(
    'movement_type','production_in','material_id',work_order.material_id,
    'warehouse_id',work_order.inbound_warehouse_id,'bin_id',bin_id,
    'work_order_id',work_order.id,
    'project_id',work_order.project_id,'construction_no',work_order.construction_no,
    'quantity',1,'batch_no','QA-FULL-ISSUE-ROLLBACK','reference_no','QA-FULL-ISSUE-ROLLBACK'
  );
  update public.mdm_document_type set production_full_issue_control = 'strict'
  where id = work_order.work_order_type_id and tenant_id = work_order.tenant_id;
  rejected := false;
  begin
    perform public.wms_post_inventory_movement_secure(payload);
  exception when check_violation then
    if sqlerrm not like '%尚未完全领料%' then raise; end if;
    rejected := true;
  end;
  if not rejected then raise exception 'Strict full issue control did not block stock posting'; end if;

  update public.mdm_document_type set production_full_issue_scope = 'key'
  where id = work_order.work_order_type_id and tenant_id = work_order.tenant_id;
  select option.value into strict work_order_option
  from jsonb_array_elements(public.wms_work_order_options_secure(
    work_order.inbound_warehouse_id, work_order.id::text
  )) option(value)
  where option.value->>'id' = work_order.id::text;
  if work_order_option->>'productionFullIssueScope' <> 'key'
    or jsonb_array_length(work_order_option->'productionFullIssueGaps') <> 0 then
    raise exception 'Work order picker ignored the key-component scope';
  end if;

  update public.mes_work_order set packing_enabled_snapshot = true,
    packing_published_at = null
  where id = work_order.id and tenant_id = work_order.tenant_id;
  insert into public.mes_work_order_detail (
    tenant_id,work_order_id,area,number,length_mm,width_mm,pieces,area_sqm
  ) values (
    work_order.tenant_id,work_order.id,'QA 区','QA-1',1000,1000,1,1
  ) returning id into pack_board_id;
  insert into public.mes_work_order_pack (
    tenant_id,work_order_id,pack_no,area,axis,confirmed
  ) values (
    work_order.tenant_id,work_order.id,'QA-PACK-' || left(gen_random_uuid()::text,8),
    'QA 区','QA-1',true
  ) returning id into qa_pack_id;
  select pack_no into strict qa_pack_no from public.mes_work_order_pack
    where id = qa_pack_id;
  insert into public.mes_work_order_pack_item (tenant_id,pack_id,board_id,pieces)
    values (work_order.tenant_id,qa_pack_id,pack_board_id,1);

  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', ordinary_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if not exists (select 1 from public.mes_work_order_detail where id = pack_board_id) then
    raise exception 'Finished inbound viewer cannot read packing board detail';
  end if;
  perform set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope', other_tenant)::text, true);
  if not exists (select 1 from public.mes_work_order_detail where id = pack_board_id) then
    raise exception 'Forged tenant header hid own packing board detail';
  end if;
  execute 'reset role';
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', actor, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{}', true);

  payload := payload || jsonb_build_object('pack_id', qa_pack_id);
  rejected := false;
  begin
    perform public.wms_post_inventory_movement_secure(payload);
  exception when check_violation then
    if sqlerrm not like '%尚未确认发布%' then raise; end if;
    rejected := true;
  end;
  if not rejected then raise exception 'Unpublished pack was accepted for finished inbound'; end if;
  update public.mes_work_order set packing_published_at = now()
    where id = work_order.id and tenant_id = work_order.tenant_id;
  insert into public.wms_production_material_document (
    tenant_id,kind,document_no,document_type_id,business_type_id,organization_id,
    warehouse_id,work_order_id,project_id,status,created_by
  ) values (
    work_order.tenant_id,'finished_inbound','QA-PACK-RECEIPT-' || gen_random_uuid(),
    receipt_type.document_type_id,receipt_type.business_type_id,work_order.organization_id,
    work_order.inbound_warehouse_id,work_order.id,work_order.project_id,'submitted',actor
  ) returning id into pack_receipt_id;
  insert into public.wms_production_material_line (
    tenant_id,document_id,line_no,material_id,inventory_unit_id,requested_quantity,
    actual_quantity,warehouse_id,bin_id,stock_type,stock_status,
    work_order_id,pack_id,project_id,construction_no,batch_no
  ) values (
    work_order.tenant_id,pack_receipt_id,10,work_order.material_id,material_unit_id,1,
    1,work_order.inbound_warehouse_id,bin_id,'normal','available',
    work_order.id,qa_pack_id,work_order.project_id,work_order.construction_no,
    'QA-PACK-ROLLBACK'
  ) returning id into pack_receipt_line_id;
  perform public.wms_change_production_material_status_secure(pack_receipt_id, 'approve');
  perform public.wms_push_production_material_secure(pack_receipt_id, null);
  select movement_id into strict pack_movement_id from public.wms_production_material_line
    where id = pack_receipt_line_id;
  if not exists (
    select 1 from public.wms_inventory_movement movement
    join public.wms_inventory_batch batch on batch.id = movement.target_batch_id
    where movement.id = pack_movement_id and batch.pack_id = qa_pack_id
      and batch.tenant_id = work_order.tenant_id and batch.quantity = 1
  ) then raise exception 'Published pack did not create linked finished stock'; end if;
  if not exists (
    select 1 from public.wms_work_order_pack_inbound_secure(work_order.id) detail
    where detail.line_id = pack_receipt_line_id and detail.pack_id = qa_pack_id
      and detail.document_id = pack_receipt_id and detail.inbound_quantity = 1
      and detail.returned_quantity = 0 and detail.net_quantity = 1
  ) then raise exception 'Pack receipt link did not return posted source detail'; end if;
  if not exists (
    select 1 from jsonb_array_elements(public.wms_sales_choices_secure(
      'stock', work_order.tenant_id, work_order.organization_id,
      work_order.inbound_warehouse_id, qa_pack_no, 20, 0, null
    )->'data') choice(value)
    where choice.value->>'pack_no' = qa_pack_no
      and (choice.value->>'available_quantity')::numeric >= 1
  ) then raise exception 'Sales stock choice did not expose searchable pack number'; end if;
  select target_batch_id into strict pack_batch_id from public.wms_inventory_movement
    where id = pack_movement_id;
  insert into public.wms_production_material_document (
    tenant_id,kind,document_no,document_type_id,business_type_id,organization_id,
    warehouse_id,work_order_id,project_id,status,created_by
  ) values (
    work_order.tenant_id,'finished_return','QA-PACK-RETURN-' || gen_random_uuid(),
    return_type.document_type_id,return_type.business_type_id,work_order.organization_id,
    work_order.inbound_warehouse_id,work_order.id,work_order.project_id,'submitted',actor
  ) returning id into pack_return_id;
  insert into public.wms_production_material_line (
    tenant_id,document_id,line_no,material_id,inventory_unit_id,requested_quantity,
    actual_quantity,warehouse_id,bin_id,stock_type,stock_status,source_batch_id,
    source_line_id,work_order_id,project_id,construction_no,batch_no
  ) values (
    work_order.tenant_id,pack_return_id,10,work_order.material_id,material_unit_id,-1,
    -1,work_order.inbound_warehouse_id,bin_id,'normal','available',pack_batch_id,
    pack_receipt_line_id,work_order.id,work_order.project_id,work_order.construction_no,
    'QA-PACK-ROLLBACK'
  );
  perform public.wms_change_production_material_status_secure(pack_return_id, 'approve');
  perform public.wms_push_production_material_secure(pack_return_id, null);
  if not exists (
    select 1 from public.wms_work_order_pack_inbound_secure(work_order.id) detail
    where detail.line_id = pack_receipt_line_id and detail.inbound_quantity = 1
      and detail.returned_quantity = 1 and detail.net_quantity = 0
  ) then raise exception 'Pack receipt link did not deduct posted return'; end if;
  perform set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope', other_tenant)::text, true);
  rejected := false;
  begin
    perform public.wms_work_order_pack_inbound_secure(work_order.id);
  exception when no_data_found or invalid_parameter_value then rejected := true;
  end;
  if not rejected then raise exception 'Selected foreign tenant read pack receipt details'; end if;
  perform set_config('request.headers', '{}', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', ordinary_user, 'role', 'authenticated')::text, true);
  if app_private.has_permission('MesWorkOrder:View') then
    if not exists (
      select 1 from public.wms_work_order_pack_inbound_secure(work_order.id) detail
      where detail.line_id = pack_receipt_line_id
    ) then raise exception 'Authorized ordinary user could not read pack receipt detail'; end if;
  else
    rejected := false;
    begin
      perform public.wms_work_order_pack_inbound_secure(work_order.id);
    exception when insufficient_privilege then rejected := true;
    end;
    if not rejected then raise exception 'MES view permission was not enforced'; end if;
  end if;
end $test$;
select 'strict rejected approval and posting; defective and scrapped receipts and returns reconciled across four reports; non-backflush and key scopes filtered; published pack enforced and linked to receipt detail' as result;
rollback;
