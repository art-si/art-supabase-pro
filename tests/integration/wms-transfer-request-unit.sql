begin;

do $test$
declare
  actor uuid;
  fixture record;
  document_type uuid;
  business_type uuid;
  warehouse_id uuid;
  organization_id uuid;
  other_employee_id uuid;
  other_department_id uuid;
  payload jsonb;
  v_document_id uuid;
  expected_base numeric;
begin
  select u.auth_user_id into strict actor from public.sys_user u
    join public.sys_role r on r.tenant_id=u.tenant_id and r.role_code=any(u.user_roles)
    where r.builtin_type='platform_super' and u.status='1' and u.system_protected limit 1;
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub',actor,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  select m.id material_id,m.tenant_id,m.base_unit_id,
    (rule.value->>'source_unit_id')::uuid source_unit_id
    into strict fixture
    from public.mdm_material m
    cross join lateral jsonb_array_elements(m.unit_conversions) rule(value)
    where m.status='enabled' and m.base_unit_id is not null
      and (rule.value->>'base_factor')::numeric <>
        (rule.value->>'source_factor')::numeric
      and m.tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9'
    limit 1;
  select w.id,w.organization_id into strict warehouse_id,organization_id
    from public.mdm_warehouse w
    join public.wms_inventory_initialization i on i.tenant_id=w.tenant_id
      and i.organization_id=w.organization_id and i.enabled_on is not null
    where w.tenant_id=fixture.tenant_id and w.status='enabled' limit 1;
  select dt.id,bt.id into strict document_type,business_type
    from public.mdm_document_type dt
    join public.mdm_business_type bt on bt.tenant_id=dt.tenant_id
      and dt.id=any(bt.document_type_ids)
    where dt.tenant_id=fixture.tenant_id and dt.enabled and bt.enabled
      and exists(select 1 from public.sys_menu menu where menu.name='WmsTransfer'
        and menu.id=any(dt.menu_ids) and menu.id=any(bt.menu_ids))
    limit 1;
  expected_base:=app_private.wms_convert_material_quantity(
    fixture.material_id,2,fixture.source_unit_id,fixture.base_unit_id);
  if expected_base=2 then raise exception '单位换算夹具无效'; end if;
  payload:=jsonb_build_object(
    'tenant_id',fixture.tenant_id,'organization_id',organization_id,
    'document_type_id',document_type,'business_type_id',business_type,
    'lines',jsonb_build_array(jsonb_build_object(
      'material_id',fixture.material_id,
      'inventory_unit_id',fixture.source_unit_id,'quantity',2,
      'base_unit_id',fixture.source_unit_id,'base_quantity',2,
      'source_organization_id',organization_id,
      'source_warehouse_id',warehouse_id,
      'target_organization_id',organization_id,
      'target_warehouse_id',warehouse_id)));
  v_document_id:=public.wms_save_transfer_request_secure(payload);
  if not exists(select 1 from public.wms_transfer_request_line
    where document_id=v_document_id and base_unit_id=fixture.base_unit_id
      and base_quantity=expected_base)
    or not exists(select 1 from public.wms_transfer_request_list
      where document_id=v_document_id and unit_conversions<>'[]'::jsonb) then
    raise exception '申请单未按物料单位换算写入基本数量或回显换算关系';
  end if;
  begin
    perform public.wms_save_transfer_request_secure(
      payload||jsonb_build_object('lines',jsonb_build_array(
        jsonb_build_object('material_id',fixture.material_id,
          'inventory_unit_id',gen_random_uuid(),'quantity',2,
          'source_organization_id',organization_id,
          'source_warehouse_id',warehouse_id,
          'target_organization_id',organization_id,
          'target_warehouse_id',warehouse_id))));
    raise exception '不存在换算关系的库存单位被接受';
  exception when check_violation then null;
  end;
  select id into other_employee_id from public.hr_employee
    where tenant_id<>fixture.tenant_id
      and id is distinct from (select hr_employee_id from public.sys_user
        where auth_user_id=actor limit 1) limit 1;
  if other_employee_id is not null then
    begin
      perform public.wms_save_transfer_request_secure(
        payload||jsonb_build_object('applicant_id',other_employee_id));
      raise exception '跨租户申请人被接受';
    exception when check_violation then null;
    end;
  end if;
  select id into other_department_id from public.mdm_organization
    where tenant_id<>fixture.tenant_id
      and id is distinct from (select account.organization_id from public.sys_user account
        where account.auth_user_id=actor limit 1)
      and id is distinct from (select employee.organization_id
        from public.sys_user account
        join public.hr_employee employee on employee.id=account.hr_employee_id
        where account.auth_user_id=actor limit 1)
    limit 1;
  if other_department_id is not null then
    begin
      perform public.wms_save_transfer_request_secure(
        payload||jsonb_build_object('department_id',other_department_id));
      raise exception '跨租户申请部门被接受';
    exception when check_violation then null;
    end;
  end if;
end $test$;

rollback;
