-- Validates two BOM-linked issue selections and two source-linked returns. All records roll back.
begin;
do $test$
declare
  actor uuid;
  issue_template record;
  return_template public.wms_production_material_document%rowtype;
  posted_line record;
  first_issue uuid;
  second_issue uuid;
  first_return uuid;
  second_return uuid;
  required numeric;
  issued numeric;
  source_key text;
  total record;
begin
  select u.auth_user_id into strict actor
  from public.sys_user u
  join public.sys_role r on r.tenant_id = u.tenant_id and r.role_code = any(u.user_roles)
  where r.builtin_type = 'platform_super' and u.system_protected and u.status = '1'
  limit 1;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', actor, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{}'::text, true);

  select d.*, item.value as bom_item, m.inventory_unit_id, m.base_unit_id
  into strict issue_template
  from public.wms_production_material_document d
  join public.mes_work_order wo on wo.id = d.work_order_id
  cross join lateral jsonb_array_elements(coalesce(wo.bom_snapshot, '[]'::jsonb)) component
  cross join lateral jsonb_array_elements(coalesce(component.value -> 'items', '[]'::jsonb)) item
  join public.mdm_material m on m.id = (item.value ->> 'component_material_id')::uuid
  where d.kind = 'issue' and d.status = 'approved'
    and m.tenant_id = d.tenant_id and m.inventory_unit_id is not null
    and (item.value ->> 'required_quantity')::numeric > 2
    and not exists (
      select 1 from public.wms_production_material_line existing_line
      join public.wms_production_material_document existing_doc on existing_doc.id = existing_line.document_id
      where existing_doc.kind = 'issue' and existing_doc.work_order_id = d.work_order_id
        and existing_line.source_line_no = item.value ->> 'id'
    )
  order by d.id
  limit 1;
  required := (issue_template.bom_item ->> 'required_quantity')::numeric;
  source_key := issue_template.bom_item ->> 'id';

  insert into public.wms_production_material_document (
    tenant_id, kind, document_no, document_type_id, business_type_id,
    organization_id, warehouse_id, work_order_id, project_id, customer_id,
    demand_date, created_by
  ) values (
    issue_template.tenant_id, 'issue', 'QA-BOM-' || gen_random_uuid(),
    issue_template.document_type_id, issue_template.business_type_id,
    issue_template.organization_id, issue_template.warehouse_id,
    issue_template.work_order_id, issue_template.project_id, issue_template.customer_id,
    current_date, actor
  ) returning id into first_issue;
  insert into public.wms_production_material_document (
    tenant_id, kind, document_no, document_type_id, business_type_id,
    organization_id, warehouse_id, work_order_id, project_id, customer_id,
    demand_date, created_by
  ) values (
    issue_template.tenant_id, 'issue', 'QA-BOM-' || gen_random_uuid(),
    issue_template.document_type_id, issue_template.business_type_id,
    issue_template.organization_id, issue_template.warehouse_id,
    issue_template.work_order_id, issue_template.project_id, issue_template.customer_id,
    current_date, actor
  ) returning id into second_issue;

  insert into public.wms_production_material_line (
    tenant_id, document_id, line_no, material_id, inventory_unit_id,
    requested_quantity, actual_quantity, base_unit_id, base_quantity,
    warehouse_id, stock_type, source_line_no
  ) values (
    issue_template.tenant_id, first_issue, 10,
    (issue_template.bom_item ->> 'component_material_id')::uuid,
    issue_template.inventory_unit_id, 1, 1,
    issue_template.base_unit_id, 1, issue_template.warehouse_id, 'normal', source_key
  );
  insert into public.wms_production_material_line (
    tenant_id, document_id, line_no, material_id, inventory_unit_id,
    requested_quantity, actual_quantity, base_unit_id, base_quantity,
    warehouse_id, stock_type, source_line_no
  ) values (
    issue_template.tenant_id, second_issue, 10,
    (issue_template.bom_item ->> 'component_material_id')::uuid,
    issue_template.inventory_unit_id, 1, 1,
    issue_template.base_unit_id, 1, issue_template.warehouse_id, 'normal', source_key
  );
  select * into strict total from public.wms_work_order_bom_issue_totals_secure(issue_template.work_order_id)
  where source_line_no = source_key;
  if total.selected_quantity <> 2 or total.issued_quantity <> 0 then
    raise exception 'BOM selected/issued total is inconsistent after two selections';
  end if;
  begin
    insert into public.wms_production_material_line (
      tenant_id, document_id, line_no, material_id, inventory_unit_id,
      requested_quantity, actual_quantity, base_unit_id, base_quantity,
      warehouse_id, stock_type, source_line_no
    ) values (
      issue_template.tenant_id, second_issue, 20,
      (issue_template.bom_item ->> 'component_material_id')::uuid,
      issue_template.inventory_unit_id, required - 1, required - 1,
      issue_template.base_unit_id, required - 1,
      issue_template.warehouse_id, 'normal', source_key
    );
    raise exception 'BOM over-selection was accepted';
  exception when check_violation then null;
  end;

  select line.id, line.tenant_id, line.material_id, line.inventory_unit_id,
    line.base_unit_id, line.fulfilled_quantity, line.batch_no,
    line.warehouse_id, line.project_id, line.construction_no,
    line.stock_type, doc.organization_id, doc.work_order_id, doc.customer_id
  into strict posted_line
  from public.wms_production_material_line line
  join public.wms_production_material_document doc on doc.id = line.document_id
  where doc.kind = 'issue' and doc.status = 'approved'
    and line.movement_id is not null and abs(line.fulfilled_quantity) >= 2
  limit 1;
  select * into strict return_template from public.wms_production_material_document
  where kind = 'return' and tenant_id = posted_line.tenant_id limit 1;
  first_return := gen_random_uuid();
  insert into public.wms_production_material_document (
      id, tenant_id, kind, document_no, document_type_id, business_type_id,
      organization_id, warehouse_id, work_order_id, project_id, customer_id,
      demand_date, created_by
    ) values (
      first_return, posted_line.tenant_id, 'return', 'QA-RETURN-' || gen_random_uuid(),
      return_template.document_type_id, return_template.business_type_id,
      posted_line.organization_id, posted_line.warehouse_id,
      posted_line.work_order_id, posted_line.project_id, posted_line.customer_id,
      current_date, actor
    );
  insert into public.wms_production_material_document (
    tenant_id, kind, document_no, document_type_id, business_type_id,
    organization_id, warehouse_id, work_order_id, project_id, customer_id,
    demand_date, created_by
  ) values (
    posted_line.tenant_id, 'return', 'QA-RETURN-' || gen_random_uuid(),
    return_template.document_type_id, return_template.business_type_id,
    posted_line.organization_id, posted_line.warehouse_id,
    posted_line.work_order_id, posted_line.project_id, posted_line.customer_id,
    current_date, actor
  ) returning id into second_return;
  insert into public.wms_production_material_line (
    tenant_id, document_id, line_no, material_id, inventory_unit_id,
    requested_quantity, actual_quantity, base_unit_id, base_quantity,
    batch_no, warehouse_id, stock_type, source_line_id, return_type
  ) values (
    posted_line.tenant_id, first_return, 10, posted_line.material_id,
    posted_line.inventory_unit_id, -1, -1,
    posted_line.base_unit_id, -1, posted_line.batch_no,
    posted_line.warehouse_id, posted_line.stock_type, posted_line.id, 'good'
  );
  insert into public.wms_production_material_line (
    tenant_id, document_id, line_no, material_id, inventory_unit_id,
    requested_quantity, actual_quantity, base_unit_id, base_quantity,
    batch_no, warehouse_id, stock_type, source_line_id, return_type
  ) values (
    posted_line.tenant_id, second_return, 10, posted_line.material_id,
    posted_line.inventory_unit_id, -1, -1,
    posted_line.base_unit_id, -1, posted_line.batch_no,
    posted_line.warehouse_id, posted_line.stock_type, posted_line.id, 'good'
  );
  begin
    insert into public.wms_production_material_line (
      tenant_id, document_id, line_no, material_id, inventory_unit_id,
      requested_quantity, actual_quantity, base_unit_id, base_quantity,
      batch_no, warehouse_id, stock_type, source_line_id, return_type
    ) values (
      posted_line.tenant_id, second_return, 20, posted_line.material_id,
      posted_line.inventory_unit_id, -abs(posted_line.fulfilled_quantity), -abs(posted_line.fulfilled_quantity),
      posted_line.base_unit_id, -abs(posted_line.fulfilled_quantity), posted_line.batch_no,
      posted_line.warehouse_id, posted_line.stock_type, posted_line.id, 'good'
    );
    raise exception 'Source-linked over-return was accepted';
  exception when check_violation then null;
  end;
end $test$;
rollback;
