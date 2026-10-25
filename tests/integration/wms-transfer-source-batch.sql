-- The document and sequence changes below are rolled back after the assertions.
begin;
do $test$
declare
  actor uuid;
  stock record;
  v_document_id uuid;
  payload jsonb;
  line jsonb;
  other_tenant uuid;
  ordinary_user public.sys_user%rowtype;
  ordinary_role public.sys_role%rowtype;
begin
  select u.auth_user_id into strict actor
  from public.sys_user u
  join public.sys_role r on r.tenant_id=u.tenant_id and r.role_code=any(u.user_roles)
  where r.builtin_type='platform_super' and u.status='1' and u.system_protected
  limit 1;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);

  select b.id batch_id,b.tenant_id,b.organization_id,b.warehouse_id,b.bin_id,
    b.material_id,b.project_id,b.construction_no,b.batch_no,
    least(b.quantity,1) quantity,
    coalesce(m.inventory_unit_id,m.base_unit_id) inventory_unit_id,
    d.id document_type_id,bt.id business_type_id
  into strict stock
  from public.wms_inventory_batch b
  join public.mdm_material m on m.id=b.material_id and m.tenant_id=b.tenant_id
  join public.mdm_warehouse w on w.id=b.warehouse_id and w.organization_id=b.organization_id
  join public.wms_inventory_initialization i on i.tenant_id=b.tenant_id
    and i.organization_id=b.organization_id and i.enabled_on is not null
  join public.mdm_document_type d on d.tenant_id=b.tenant_id and d.enabled
  join public.mdm_business_type bt on bt.tenant_id=b.tenant_id and bt.enabled
    and d.id=any(bt.document_type_ids)
  where b.quantity>0 and b.status='normal' and b.organization_id is not null
    and coalesce(m.inventory_unit_id,m.base_unit_id) is not null
    and exists(select 1 from public.sys_menu menu where menu.name='WmsTransfer'
      and menu.id=any(d.menu_ids) and menu.id=any(bt.menu_ids))
  limit 1;

  line:=jsonb_build_object(
    'material_id',stock.material_id,'source_batch_id',stock.batch_id,
    'project_id',stock.project_id,'construction_no',stock.construction_no,
    'inventory_unit_id',stock.inventory_unit_id,'quantity',stock.quantity,
    'batch_no',stock.batch_no,'source_organization_id',stock.organization_id,
    'source_warehouse_id',stock.warehouse_id,'source_bin_id',stock.bin_id,
    'target_organization_id',stock.organization_id,
    'target_warehouse_id',stock.warehouse_id,'target_bin_id',stock.bin_id);
  payload:=jsonb_build_object(
    'tenant_id',stock.tenant_id,'organization_id',stock.organization_id,
    'document_type_id',stock.document_type_id,'business_type_id',stock.business_type_id,
    'application_date',current_date,'lines',jsonb_build_array(line));
  v_document_id:=public.wms_save_transfer_request_secure(payload);
  if not exists(select 1 from public.wms_transfer_request_list request_line
    where request_line.document_id=v_document_id and request_line.source_batch_id=stock.batch_id) then
    raise exception '来源库存批次未保存或未显示';
  end if;

  begin
    perform public.wms_save_transfer_request_secure(payload||jsonb_build_object(
      'lines',jsonb_build_array(line||jsonb_build_object('project_id',gen_random_uuid()))));
    raise exception '篡改项目的库存批次被接受';
  exception when check_violation then null;
  end;

  select id into strict other_tenant from public.sys_tenant where id<>stock.tenant_id limit 1;
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',stock.tenant_id)::text,true);
  perform public.wms_save_transfer_request_secure(payload);
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
  begin
    perform public.wms_save_transfer_request_secure(payload);
    raise exception '平台选定其他租户后仍可写入原租户';
  exception when insufficient_privilege then null;
  end;

  select * into strict ordinary_user from public.sys_user u
  where u.tenant_id=stock.tenant_id and u.auth_user_id is not null
    and u.status='1' and u.deleted_at is null
    and not exists(select 1 from public.sys_role r where r.tenant_id=u.tenant_id
      and r.role_code=any(u.user_roles) and r.builtin_type='platform_super')
  limit 1;
  select * into strict ordinary_role from public.sys_role
  where tenant_id=stock.tenant_id and enabled and builtin_type is distinct from 'platform_super'
  limit 1;
  insert into public.sys_role_menu(role_id,menu_id,tenant_id,create_by)
    select ordinary_role.id,m.id,ordinary_role.tenant_id,'rollback verification'
    from public.sys_menu m
    where m.name in ('WmsTransfer:Create','WmsTransfer:View')
      and not exists(select 1 from public.sys_role_menu rm
        where rm.role_id=ordinary_role.id and rm.menu_id=m.id);
  update public.sys_user set user_roles=array[ordinary_role.role_code] where id=ordinary_user.id;
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub',ordinary_user.auth_user_id,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  perform public.wms_save_transfer_request_secure(payload);
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
  perform public.wms_save_transfer_request_secure(payload);
  begin
    perform public.wms_save_transfer_request_secure(payload||jsonb_build_object('tenant_id',other_tenant));
    raise exception '普通账号伪造租户范围后跨租户保存成功';
  exception when insufficient_privilege then null;
  end;
end $test$;
rollback;
