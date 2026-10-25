begin;

do $test$
declare
  actor public.sys_user%rowtype;
  actor_role public.sys_role%rowtype;
  target_user public.sys_user%rowtype;
  foreign_user uuid;
  legacy_employee public.hr_employee%rowtype;
  warehouse_id uuid;
  inventory_org uuid;
  material_id uuid;
  base_unit_id uuid;
  document_type uuid;
  business_type uuid;
  payload jsonb;
  v_document_id uuid;
  legacy_document_id uuid;
begin
  select * into strict actor from public.sys_user
    where tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9'
      and auth_user_id is not null and status='1' and deleted_at is null
      and hr_employee_id is null and cardinality(user_roles)>0
    limit 1;
  select * into strict actor_role from public.sys_role
    where tenant_id=actor.tenant_id and role_code=any(actor.user_roles) limit 1;
  insert into public.sys_role_menu(role_id,menu_id,tenant_id,create_by)
    select actor_role.id,menu.id,actor.tenant_id,'rollback verification'
      from public.sys_menu menu
      where menu.name in ('WmsTransfer','WmsTransfer:Create','WmsTransfer:Edit')
      and not exists(select 1 from public.sys_role_menu existing
        where existing.role_id=actor_role.id and existing.menu_id=menu.id);
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub',actor.auth_user_id,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  select w.id,w.organization_id into strict warehouse_id,inventory_org
    from public.mdm_warehouse w
    join public.wms_inventory_initialization i on i.tenant_id=w.tenant_id
      and i.organization_id=w.organization_id and i.enabled_on is not null
    where w.tenant_id=actor.tenant_id and w.status='enabled' limit 1;
  select material.id,material.base_unit_id into strict material_id,base_unit_id
    from public.mdm_material material where material.tenant_id=actor.tenant_id
      and material.status='enabled' and material.base_unit_id is not null limit 1;
  select dt.id,bt.id into strict document_type,business_type
    from public.mdm_document_type dt
    join public.mdm_business_type bt on bt.tenant_id=dt.tenant_id
      and dt.id=any(bt.document_type_ids)
    where dt.tenant_id=actor.tenant_id and dt.enabled and bt.enabled
      and exists(select 1 from public.sys_menu menu where menu.name='WmsTransfer'
        and menu.id=any(dt.menu_ids) and menu.id=any(bt.menu_ids))
    limit 1;
  payload:=jsonb_build_object(
    'tenant_id',actor.tenant_id,'organization_id',inventory_org,
    'document_type_id',document_type,'business_type_id',business_type,
    'department_id',actor.organization_id,
    'lines',jsonb_build_array(jsonb_build_object(
      'material_id',material_id,'inventory_unit_id',base_unit_id,'quantity',1,
      'source_organization_id',inventory_org,
      'source_warehouse_id',warehouse_id,
      'target_organization_id',inventory_org,
      'target_warehouse_id',warehouse_id)));
  v_document_id:=public.wms_save_transfer_request_secure(payload);
  if not exists(select 1 from public.wms_transfer_request_document
    where id=v_document_id and applicant_user_id=actor.id and applicant_id is null)
    or not exists(select 1 from public.wms_transfer_request_list
      where document_id=v_document_id
        and applicant_name=coalesce(nullif(actor.nick_name,''),actor.user_name)) then
    raise exception '未绑定员工的登录账号没有默认申请人或列表未显示账号名';
  end if;
  select * into strict target_user from public.sys_user
    where tenant_id=actor.tenant_id and id<>actor.id
      and status='1' and deleted_at is null limit 1;
  perform public.wms_save_transfer_request_secure(
    payload||jsonb_build_object('id',v_document_id,
      'applicant_user_id',target_user.id,'department_id',target_user.organization_id));
  if not exists(select 1 from public.wms_transfer_request_document
    where id=v_document_id and applicant_user_id=target_user.id
      and department_id=target_user.organization_id) then
    raise exception '改选申请账号或自动带出的申请部门未保存';
  end if;
  select id into strict foreign_user from public.sys_user
    where tenant_id<>actor.tenant_id and status='1' limit 1;
  begin
    perform public.wms_save_transfer_request_secure(
      payload||jsonb_build_object('id',v_document_id,
        'applicant_user_id',foreign_user));
    raise exception '普通用户可将申请人改为其他租户账号';
  exception when check_violation then null;
  end;
  select * into strict legacy_employee from public.hr_employee
    where tenant_id=actor.tenant_id limit 1;
  legacy_document_id:=public.wms_save_transfer_request_secure(
    payload||jsonb_build_object('applicant_id',legacy_employee.id));
  if not exists(select 1 from public.wms_transfer_request_document
    where id=legacy_document_id and applicant_id=legacy_employee.id
      and applicant_user_id is null)
    or not exists(select 1 from public.wms_transfer_request_list
      where document_id=legacy_document_id
        and applicant_name=legacy_employee.employee_name) then
    raise exception '历史员工申请人兼容读取失败';
  end if;
end $test$;

rollback;
