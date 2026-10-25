-- Posted purchase and production lines retain source identity in both movement reports.
-- Read-only assertions run inside a transaction for the linked project.
begin;
do $test$
declare
  actor uuid;
  source record;
  report_kind text;
  report jsonb;
  page_index integer;
  found_source boolean;
  production_count integer := 0;
  purchase_count integer := 0;
begin
  select u.auth_user_id into strict actor
  from public.sys_user u
  join public.sys_role r on r.tenant_id = u.tenant_id and r.role_code = any(u.user_roles)
  where r.builtin_type = 'platform_super' and u.system_protected and u.status = '1'
  limit 1;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', actor, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{}', true);

  for source in
    with linked as (
      select 'production' as family, movement.id as movement_id, movement.tenant_id,
        document.id as document_id,
        case document.kind when 'issue' then 'production_issue'
          when 'return' then 'production_return' else document.kind end as source_kind,
        line.line_no, movement.movement_type,
        coalesce(movement.target_batch_id, movement.source_batch_id) as batch_id
      from public.wms_production_material_line line
      join public.wms_production_material_document document
        on document.id = line.document_id and document.tenant_id = line.tenant_id
      join public.wms_inventory_movement movement
        on movement.id = line.movement_id and movement.tenant_id = line.tenant_id
      where document.status = 'approved'
      union all
      select 'purchase', movement.id, movement.tenant_id, document.id,
        'inbound_' || document.kind, line.line_no, movement.movement_type,
        coalesce(movement.target_batch_id, movement.source_batch_id)
      from public.wms_purchase_document_line line
      join public.wms_purchase_document document
        on document.id = line.document_id and document.tenant_id = line.tenant_id
      join public.wms_inventory_movement movement
        on movement.id = line.movement_id and movement.tenant_id = line.tenant_id
      where document.status = 'approved'
    )
    select linked.* from linked
    where linked.movement_type not in (
      'initial_stock_in', 'initial_purchase_in', 'initial_purchase_return', 'initialization_correction'
    ) and not exists (
      select 1 from public.wms_inventory_movement legacy
      where legacy.tenant_id = linked.tenant_id and legacy.target_batch_id = linked.batch_id
        and legacy.movement_type = 'initial_purchase_in'
    )
  loop
    if source.family = 'production' then production_count := production_count + 1;
    else purchase_count := purchase_count + 1; end if;
    for report_kind in select unnest(array['movement', 'receipt-issue']) loop
      report := public.wms_inventory_report_secure(
        report_kind, p_tenant_id => source.tenant_id, p_limit => 200
      );
      found_source := false;
      for page_index in 0..ceiling((report->>'total')::numeric / 200)::integer - 1 loop
        report := public.wms_inventory_report_secure(
          report_kind, p_tenant_id => source.tenant_id, p_limit => 200,
          p_offset => page_index * 200
        );
        if exists (
          select 1 from jsonb_array_elements(report->'data') item
          where item->>'id' in (source.movement_id::text || ':in', source.movement_id::text || ':out')
            and item->>'source_document_id' = source.document_id::text
            and item->>'source_document_kind' = source.source_kind
            and (item->>'source_line_no')::integer = source.line_no
            and item->>'document_type' = source.source_kind
        ) then found_source := true; exit; end if;
      end loop;
      if not found_source then
        raise exception 'Report % lost % source for movement %',
          report_kind, source.family, source.movement_id;
      end if;
    end loop;
  end loop;
  if production_count = 0 or purchase_count = 0 then
    raise exception 'Fixture needs posted production and purchase movements';
  end if;
end $test$;
select 'purchase and production sources found in movement and receipt-issue' as result;
rollback;
