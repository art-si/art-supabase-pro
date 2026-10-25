-- Compare all four inventory reports with posted inventory batches and movement legs.
-- Runs against the linked project inside a transaction and leaves no data behind.
begin;
do $test$
declare
  actor uuid;
  tenant uuid;
  kind text;
  report jsonb;
  expected_ids text[];
  actual_ids text[];
  page_count integer;
  page_index integer;
  report_row jsonb;
  batch_quantity numeric;
begin
  select u.auth_user_id into strict actor
  from public.sys_user u
  join public.sys_role r on r.tenant_id = u.tenant_id and r.role_code = any(u.user_roles)
  where r.builtin_type = 'platform_super' and u.system_protected and u.status = '1'
  limit 1;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', actor, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{}', true);

  for tenant in select distinct tenant_id from public.wms_inventory_batch loop
    for kind in select unnest(array['stock', 'movement', 'ledger', 'receipt-issue']) loop
      if kind in ('stock', 'ledger') then
        select coalesce(array_agg(b.id::text order by b.id::text), '{}'::text[])
        into expected_ids
        from public.wms_inventory_batch b
        join public.mdm_material material on material.id = b.material_id and material.tenant_id = b.tenant_id
        join public.mdm_warehouse warehouse on warehouse.id = b.warehouse_id and warehouse.tenant_id = b.tenant_id
        where b.tenant_id = tenant
          and (kind = 'ledger' or b.quantity > 0)
          and not exists (
            select 1 from public.wms_inventory_movement legacy
            where legacy.target_batch_id = b.id and legacy.tenant_id = b.tenant_id
              and legacy.movement_type = 'initial_purchase_in'
          );
      else
        with eligible_batches as (
          select b.id, b.tenant_id
          from public.wms_inventory_batch b
          join public.mdm_material material on material.id = b.material_id and material.tenant_id = b.tenant_id
          join public.mdm_warehouse warehouse on warehouse.id = b.warehouse_id and warehouse.tenant_id = b.tenant_id
          where b.tenant_id = tenant
            and not exists (
              select 1 from public.wms_inventory_movement legacy
              where legacy.target_batch_id = b.id and legacy.tenant_id = b.tenant_id
                and legacy.movement_type = 'initial_purchase_in'
            )
        ), legs as (
          select movement.id::text || ':out' as id
          from public.wms_inventory_movement movement
          join eligible_batches batch on batch.id = movement.source_batch_id and batch.tenant_id = movement.tenant_id
          where movement.movement_type not in (
            'initial_stock_in', 'initial_purchase_in', 'initial_purchase_return', 'initialization_correction'
          )
          union all
          select movement.id::text || ':in' as id
          from public.wms_inventory_movement movement
          join eligible_batches batch on batch.id = movement.target_batch_id and batch.tenant_id = movement.tenant_id
          where movement.movement_type not in (
            'initial_stock_in', 'initial_purchase_in', 'initial_purchase_return', 'initialization_correction'
          )
        )
        select coalesce(array_agg(id order by id), '{}'::text[]) into expected_ids from legs;
      end if;

      report := public.wms_inventory_report_secure(kind, p_tenant_id => tenant, p_limit => 200);
      if (report->>'total')::integer <> cardinality(expected_ids) then
        raise exception 'Inventory report % count differs for tenant %: expected %, actual %',
          kind, tenant, cardinality(expected_ids), report->>'total';
      end if;
      actual_ids := '{}'::text[];
      page_count := ceiling(cardinality(expected_ids) / 200.0)::integer;
      for page_index in 0..page_count - 1 loop
        report := public.wms_inventory_report_secure(
          kind, p_tenant_id => tenant, p_limit => 200, p_offset => page_index * 200
        );
        if kind in ('stock', 'ledger') then
          for report_row in select value from jsonb_array_elements(report->'data') loop
            select quantity into strict batch_quantity from public.wms_inventory_batch
            where id = (report_row->>'batch_id')::uuid and tenant_id = tenant;
            if (report_row->>'inventory_quantity')::numeric <> batch_quantity then
              raise exception 'Inventory report % balance differs for batch %', kind, report_row->>'batch_id';
            end if;
          end loop;
        end if;
        actual_ids := actual_ids || coalesce(
          (select array_agg(item->>'id') from jsonb_array_elements(report->'data') item),
          '{}'::text[]
        );
      end loop;
      select coalesce(array_agg(id order by id), '{}'::text[])
      into actual_ids from unnest(actual_ids) id;
      if actual_ids <> expected_ids then
        raise exception 'Inventory report % has missing or duplicate rows for tenant %', kind, tenant;
      end if;
    end loop;
  end loop;
end $test$;
select 'stock, movement, ledger, and receipt-issue match posted inventory' as result;
rollback;
