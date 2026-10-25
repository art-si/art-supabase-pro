begin;

do $test$
declare
  actor uuid;
  batch public.wms_inventory_batch%rowtype;
  material public.mdm_material%rowtype;
  document_type uuid;
  business_type uuid;
  target_warehouse uuid;
  v_document_id uuid;
  saved public.wms_transfer_request_line%rowtype;
  payload jsonb;
begin
  select u.auth_user_id into strict actor from public.sys_user u
    join public.sys_role r on r.tenant_id=u.tenant_id and r.role_code=any(u.user_roles)
    where r.builtin_type='platform_super' and u.status='1' and u.system_protected limit 1;
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub',actor,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  select * into strict batch from public.wms_inventory_batch
    where owner_type='customer' and stock_type='entrusted_processing'
      and status='normal' and quantity>0 limit 1;
  select * into strict material from public.mdm_material
    where id=batch.material_id and tenant_id=batch.tenant_id and status='enabled';
  select w.id into strict target_warehouse from public.mdm_warehouse w
    where w.tenant_id=batch.tenant_id and w.organization_id=batch.organization_id
      and w.id<>batch.warehouse_id and w.status='enabled' limit 1;
  select dt.id,bt.id into strict document_type,business_type
    from public.mdm_document_type dt
    join public.mdm_business_type bt on bt.tenant_id=dt.tenant_id
      and dt.id=any(bt.document_type_ids)
    where dt.tenant_id=batch.tenant_id and dt.enabled and bt.enabled
      and exists(select 1 from public.sys_menu menu where menu.name='WmsTransfer'
        and menu.id=any(dt.menu_ids) and menu.id=any(bt.menu_ids))
    limit 1;
  payload:=jsonb_build_object(
    'tenant_id',batch.tenant_id,'organization_id',batch.organization_id,
    'document_type_id',document_type,'business_type_id',business_type,
    'lines',jsonb_build_array(jsonb_build_object(
      'material_id',batch.material_id,'source_batch_id',batch.id,
      'project_id',batch.project_id,'construction_no',batch.construction_no,
      'inventory_unit_id',material.base_unit_id,'quantity',1,
      'batch_no',batch.batch_no,
      'source_organization_id',batch.organization_id,
      'source_warehouse_id',batch.warehouse_id,'source_bin_id',batch.bin_id,
      'target_organization_id',batch.organization_id,
      'target_warehouse_id',target_warehouse,
      'owner_type','self','owner_id',null,'stock_type','normal',
      'stock_status','frozen','production_date','2001-01-01',
      'expiry_date','2002-01-01','tracking_no','forged')));
  v_document_id:=public.wms_save_transfer_request_secure(payload);
  select * into strict saved from public.wms_transfer_request_line
    where document_id=v_document_id;
  if saved.owner_type is distinct from batch.owner_type
    or saved.owner_id is distinct from batch.owner_id
    or saved.stock_type is distinct from batch.stock_type
    or saved.stock_status<>'available'
    or saved.production_date is distinct from batch.production_date
    or saved.expiry_date is distinct from batch.expiry_date
    or saved.tracking_no is distinct from batch.tracking_no then
    raise exception '调拨申请没有按来源批次覆盖伪造库存属性';
  end if;
end $test$;

rollback;
