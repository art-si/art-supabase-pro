-- Read-only package composition keeps the original WMS document/report grain.
-- Temporary permission and batch-link fixtures are rolled back.
begin;
do $test$
declare
  platform_actor uuid;
  ordinary_actor uuid;
  ordinary_role uuid;
  other_tenant uuid;
  package public.mes_work_order_pack%rowtype;
  stock_batch public.wms_inventory_batch%rowtype;
  baseline jsonb;
  enriched jsonb;
  baseline_rows jsonb;
  enriched_rows jsonb;
  own_rows integer;
  row_data jsonb;
begin
  select u.auth_user_id into strict platform_actor
  from public.sys_user u
  join public.sys_role r on r.tenant_id=u.tenant_id and r.role_code=any(u.user_roles)
  where r.builtin_type='platform_super' and u.system_protected and u.status='1'
  limit 1;
  select p.* into strict package from public.mes_work_order_pack p
  where exists(select 1 from public.mes_work_order_pack_item i where i.pack_id=p.id)
    and exists(select 1 from public.wms_production_material_line l where l.pack_id=p.id)
    and exists(select 1 from public.wms_inventory_batch b
      where b.tenant_id=p.tenant_id and b.pack_id is null and b.quantity>0
        and not exists(select 1 from public.wms_inventory_movement legacy
          where legacy.target_batch_id=b.id and legacy.tenant_id=b.tenant_id
            and legacy.movement_type='initial_purchase_in'))
  order by p.id limit 1;
  select * into strict stock_batch from public.wms_inventory_batch
  where tenant_id=package.tenant_id and pack_id is null and quantity>0
    and not exists(select 1 from public.wms_inventory_movement legacy
      where legacy.target_batch_id=wms_inventory_batch.id
        and legacy.tenant_id=wms_inventory_batch.tenant_id
        and legacy.movement_type='initial_purchase_in')
  order by id limit 1;
  select id into strict other_tenant from public.sys_tenant
  where id<>package.tenant_id order by id limit 1;
  select u.auth_user_id,r.id into strict ordinary_actor,ordinary_role
  from public.sys_user u
  join public.sys_role r on r.tenant_id=u.tenant_id and r.role_code=any(u.user_roles)
  where u.tenant_id=package.tenant_id and u.status='1' and u.user_type='2'
    and u.auth_user_id is not null and r.builtin_type is distinct from 'platform_super'
  order by u.id limit 1;
  insert into public.sys_role_menu(tenant_id,role_id,menu_id,create_by)
  select package.tenant_id,ordinary_role,m.id,'system'
  from public.sys_menu m
  where m.name in ('WmsFinishedInbound:View','WmsFinishedReturn:View',
    'WmsStock:View','WmsInventoryLedger:View','WmsStockLedger:View',
    'WmsMaterialReceiptIssue:View')
  on conflict do nothing;

  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',platform_actor,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  baseline:=public.wms_inventory_report_secure('stock',p_limit=>200);
  update public.wms_inventory_batch set pack_id=package.id where id=stock_batch.id;
  enriched:=public.wms_inventory_report_secure('stock',p_limit=>200);
  if baseline->'total' is distinct from enriched->'total'
    or baseline->'navigation' is distinct from enriched->'navigation' then
    raise exception 'Package metadata changed report row counts or navigation';
  end if;
  select jsonb_agg(item-'pack_no'-'pack_area'-'pack_details' order by item->>'id')
    into baseline_rows from jsonb_array_elements(baseline->'data') item;
  select jsonb_agg(item-'pack_no'-'pack_area'-'pack_details' order by item->>'id')
    into enriched_rows from jsonb_array_elements(enriched->'data') item;
  if baseline_rows is distinct from enriched_rows then
    raise exception 'Package metadata changed inventory quantity or amount';
  end if;
  select item into strict row_data from jsonb_array_elements(enriched->'data') item
  where item->>'batch_id'=stock_batch.id::text;
  if row_data->>'pack_no'<>package.pack_no
    or jsonb_array_length(row_data->'pack_details')<1
    or jsonb_typeof(row_data->'pack_details'->0->'lengthMm')<>'number'
    or jsonb_typeof(row_data->'pack_details'->0->'pieces')<>'number' then
    raise exception 'Report package composition is missing or malformed';
  end if;

  perform set_config('role','authenticated',true);
  if not exists(
    select 1 from public.wms_production_material_list v
    join public.mes_work_order w on w.id=v.work_order_id and w.tenant_id=v.tenant_id
    where v.tenant_id=package.tenant_id and v.pack_id=package.id
      and v.pack_no=package.pack_no
      and jsonb_array_length(v.pack_details)>0
      and v.inbound_quantity=w.warehoused_quantity
      and v.pending_inbound_quantity=w.order_quantity-w.warehoused_quantity
      and v.work_order_unit_name=w.unit_snapshot
  ) then
    raise exception 'Production list lost package or work-order progress';
  end if;
  perform set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
  if exists(select 1 from public.wms_production_material_list
    where tenant_id=package.tenant_id) then
    raise exception 'Platform selected tenant leaked production rows';
  end if;
  if app_private.wms_pack_composition_secure(package.id,package.tenant_id)->>'packNo'
    is not null then
    raise exception 'Platform selected tenant leaked package composition';
  end if;

  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',ordinary_actor,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  select count(*) into own_rows from public.wms_production_material_list
  where tenant_id=package.tenant_id;
  if own_rows<1 then raise exception 'Ordinary WMS user lost own production rows'; end if;
  perform set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
  if (select count(*) from public.wms_production_material_list
      where tenant_id=package.tenant_id)<>own_rows
    or app_private.wms_pack_composition_secure(package.id,package.tenant_id)->>'packNo'
      <>package.pack_no then
    raise exception 'Forged ordinary tenant header changed package scope';
  end if;
  if app_private.wms_pack_composition_secure(package.id,other_tenant)->>'packNo'
    is not null then
    raise exception 'Package composition accepted mismatched tenant';
  end if;
end;
$test$;
rollback;
