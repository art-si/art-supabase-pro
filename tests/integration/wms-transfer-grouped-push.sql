begin;

do $test$
declare
  actor uuid;
  fixture record;
  request_id uuid;
  request_line jsonb;
  created jsonb;
  first_id uuid;
  second_id uuid;
  stock_before numeric;
  ordinary_user public.sys_user%rowtype;
  ordinary_role public.sys_role%rowtype;
  other_tenant uuid;
begin
  select u.auth_user_id into strict actor from public.sys_user u
    join public.sys_role r on r.tenant_id=u.tenant_id and r.role_code=any(u.user_roles)
    where r.builtin_type='platform_super' and u.status='1' and u.system_protected
    limit 1;
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub',actor,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);

  select b.id batch_id,b.tenant_id,b.organization_id source_org,b.warehouse_id source_wh,
    b.bin_id source_bin,b.material_id,b.project_id,b.construction_no,b.batch_no,
    b.quantity,m.base_unit_id,
    internal_wh.id internal_wh_id,cross_wh.id cross_wh_id,
    cross_wh.organization_id target_org,dt.id document_type_id,
    bt.id business_type_id
    into strict fixture from public.wms_inventory_batch b
    join public.mdm_material m on m.id=b.material_id and m.tenant_id=b.tenant_id
    join public.wms_inventory_initialization source_init
      on source_init.tenant_id=b.tenant_id
        and source_init.organization_id=b.organization_id
    join public.mdm_warehouse internal_wh
      on internal_wh.tenant_id=b.tenant_id
        and internal_wh.organization_id=b.organization_id
        and internal_wh.id<>b.warehouse_id and internal_wh.status='enabled'
    join public.mdm_warehouse cross_wh
      on cross_wh.tenant_id=b.tenant_id
        and cross_wh.organization_id<>b.organization_id
        and cross_wh.status='enabled' and not cross_wh.enable_locations
    join public.mdm_organization cross_org
      on cross_org.id=cross_wh.organization_id and cross_org.status='1'
    join public.mdm_document_type dt
      on dt.tenant_id=b.tenant_id and dt.enabled
    join public.mdm_business_type bt
      on bt.tenant_id=b.tenant_id and bt.enabled
        and dt.id=any(bt.document_type_ids)
    where b.tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9'
      and b.quantity>=2 and b.status='normal' and b.pack_id is null
      and m.base_unit_id is not null and not m.serial_management_enabled
      and source_init.enabled_on is not null
      and source_init.initialization_closed_at is not null
      and exists(select 1 from public.sys_menu menu where menu.name='WmsTransfer'
        and menu.id=any(dt.menu_ids) and menu.id=any(bt.menu_ids))
      and exists(select 1 from public.mdm_document_type target_type
        join public.mdm_business_type target_business
          on target_business.tenant_id=target_type.tenant_id
          and target_type.id=any(target_business.document_type_ids)
        where target_type.tenant_id=b.tenant_id and target_type.enabled
          and target_business.enabled
          and target_type.document_type_code='MT'
          and target_business.business_type_code='M311')
    limit 1;
  insert into public.wms_inventory_initialization
    (tenant_id,organization_id,enabled_on,initialization_closed_at)
  values(fixture.tenant_id,fixture.target_org,
    (now() at time zone 'Asia/Shanghai')::date,now())
  on conflict (organization_id) do update set
    enabled_on=coalesce(public.wms_inventory_initialization.enabled_on,excluded.enabled_on),
    initialization_closed_at=coalesce(
      public.wms_inventory_initialization.initialization_closed_at,
      excluded.initialization_closed_at);

  request_line:=jsonb_build_object(
    'material_id',fixture.material_id,'project_id',fixture.project_id,
    'construction_no',fixture.construction_no,
    'inventory_unit_id',fixture.base_unit_id,'quantity',1,
    'batch_no',fixture.batch_no,
    'source_organization_id',fixture.source_org,
    'source_warehouse_id',fixture.source_wh,'source_bin_id',fixture.source_bin);
  request_id:=public.wms_save_transfer_request_secure(jsonb_build_object(
    'tenant_id',fixture.tenant_id,'organization_id',fixture.source_org,
    'document_type_id',fixture.document_type_id,
    'business_type_id',fixture.business_type_id,
    'application_date',(now() at time zone 'Asia/Shanghai')::date,
    'lines',jsonb_build_array(
      request_line||jsonb_build_object(
        'target_organization_id',fixture.source_org,
        'target_warehouse_id',fixture.internal_wh_id),
      request_line||jsonb_build_object(
        'target_organization_id',fixture.target_org,
        'target_warehouse_id',fixture.cross_wh_id))));
  perform public.wms_change_transfer_request_status_secure(request_id,'submit');
  perform public.wms_change_transfer_request_status_secure(request_id,'approve');
  select id into strict first_id from public.wms_transfer_request_line
    where document_id=request_id order by line_no limit 1;
  select id into strict second_id from public.wms_transfer_request_line
    where document_id=request_id order by line_no desc limit 1;
  select quantity into strict stock_before from public.wms_inventory_batch
    where id=fixture.batch_id;

  select id into strict other_tenant from public.sys_tenant
    where id<>fixture.tenant_id limit 1;
  perform set_config('request.headers',jsonb_build_object(
    'x-art-tenant-scope',other_tenant)::text,true);
  begin
    perform public.wms_create_transfer_business_grouped_from_request_secure(
      request_id,'direct','{}'::uuid[]);
    raise exception '平台选定其他租户后仍可下推原租户申请';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.headers','{}',true);

  select * into strict ordinary_user from public.sys_user u
    where u.tenant_id=fixture.tenant_id and u.auth_user_id is not null
      and u.status='1' and u.deleted_at is null
      and not exists(select 1 from public.sys_role r where r.tenant_id=u.tenant_id
        and r.role_code=any(u.user_roles) and r.builtin_type='platform_super')
    limit 1;
  select * into strict ordinary_role from public.sys_role
    where tenant_id=fixture.tenant_id and enabled
      and builtin_type is distinct from 'platform_super' limit 1;
  insert into public.sys_role_menu(role_id,menu_id,tenant_id,create_by)
    select ordinary_role.id,menu.id,ordinary_role.tenant_id,'rollback verification'
    from public.sys_menu menu
    where menu.name in ('WmsTransfer:Push','WmsDirectTransfer:Create')
      and not exists(select 1 from public.sys_role_menu existing
        where existing.role_id=ordinary_role.id and existing.menu_id=menu.id);
  update public.sys_user set user_roles=array[ordinary_role.role_code]
    where id=ordinary_user.id;
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub',ordinary_user.auth_user_id,'role','authenticated')::text,true);
  perform set_config('request.headers',jsonb_build_object(
    'x-art-tenant-scope',other_tenant)::text,true);
  begin
    created:=public.wms_create_transfer_business_grouped_from_request_secure(
      request_id,'direct','{}'::uuid[]);
    if jsonb_array_length(created)<>2 or exists(
      select 1 from public.wms_transfer_business_document d
      where d.id in ((created->0->>'id')::uuid,(created->1->>'id')::uuid)
        and d.tenant_id<>fixture.tenant_id) then
      raise exception '普通用户伪造范围后拆单结果错误';
    end if;
    raise exception '回滚普通用户成功下推样本' using errcode='PT001';
  exception when sqlstate 'PT001' then null;
  end;
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub',actor,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);

  created:=public.wms_create_transfer_business_grouped_from_request_secure(
    request_id,'direct','{}'::uuid[]);
  if jsonb_array_length(created)<>2 or
    (select count(*) from public.wms_transfer_business_document d
      where d.id in ((created->0->>'id')::uuid,(created->1->>'id')::uuid)
        and d.status='draft' and d.source_request_id=request_id)<>2 or
    (select count(distinct l.source_request_line_id)
      from public.wms_transfer_business_line l
      where l.document_id in ((created->0->>'id')::uuid,(created->1->>'id')::uuid))<>2 then
    raise exception '混合组织申请未拆成两张暂存单且逐行关联';
  end if;
  if not exists(select 1 from public.wms_transfer_business_line l
    join public.wms_transfer_business_document d on d.id=l.document_id
    where l.source_request_line_id=first_id
      and d.source_organization_id=fixture.source_org
      and d.target_organization_id=fixture.source_org)
    or not exists(select 1 from public.wms_transfer_business_line l
      join public.wms_transfer_business_document d on d.id=l.document_id
      where l.source_request_line_id=second_id
        and d.source_organization_id=fixture.source_org
        and d.target_organization_id=fixture.target_org) then
    raise exception '拆单组织组合错误';
  end if;
  if not exists(select 1 from public.wms_transfer_request_document
    where id=request_id and pushed_at is not null and pushed_mode='direct') then
    raise exception '混合组织明细下推后申请状态未反填';
  end if;
  if (select quantity from public.wms_inventory_batch
      where id=fixture.batch_id)<>stock_before then
    raise exception '生成暂存单时不应记账';
  end if;
  begin
    perform public.wms_create_transfer_business_grouped_from_request_secure(
      request_id,'direct','{}'::uuid[]);
    raise exception '重复下推已处理明细被接受';
  exception when check_violation then null;
  end;
end $test$;

rollback;
