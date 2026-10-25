-- Isolated transactional fixtures; do not alter existing warehouse documents.
begin;
do $test$
declare
  actor uuid; template public.wms_purchase_document%rowtype;
  material_line jsonb; fixture uuid; payload jsonb; department uuid;
  other_tenant uuid; own_user public.sys_user%rowtype; own_role public.sys_role%rowtype;
begin
  select u.auth_user_id into strict actor from public.sys_user u
    join public.sys_role r on r.tenant_id=u.tenant_id and r.role_code=any(u.user_roles)
    where r.builtin_type='platform_super' and u.status='1' and u.system_protected limit 1;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  select * into strict template from public.wms_purchase_document
    where kind='other_inbound' and status='approved' order by create_time desc limit 1;
  select to_jsonb(l) into strict material_line from public.wms_purchase_document_line l
    join public.mdm_material m on m.id=l.material_id
    where l.document_id=template.id and not m.serial_management_enabled limit 1;
  select id into strict department from public.mdm_organization
    where tenant_id=template.tenant_id and status='1' limit 1;
  material_line:=material_line||jsonb_build_object('quantity',1,'construction_no',null,
    'source_order_target_line_id',null,'source_batch_id',null,'source_document',null,
    'source_line_no',null,'serial_nos','[]'::jsonb,'batch_no','QA-OTHER-'||gen_random_uuid());
  payload:=(to_jsonb(template)-'id')||jsonb_build_object('business_date',current_date,
    'supplier_id',null,'business_department_id',null,'lines',jsonb_build_array(material_line));
  fixture:=public.wms_save_purchase_document_secure(payload);
  if not exists(select 1 from public.wms_purchase_document where id=fixture and supplier_id is null and business_department_id is null and status='draft') then
    raise exception 'Draft must allow both optional references blank';
  end if;
  begin
    perform public.wms_change_purchase_document_status_secure(fixture,'submit');
    raise exception 'Blank counterparty submit unexpectedly allowed';
  exception when check_violation then
    if sqlerrm<>'业务部门和供应商不能同时为空。' then raise; end if;
  end;
  perform public.wms_save_purchase_document_secure(payload||jsonb_build_object('id',fixture,'business_department_id',department));
  perform public.wms_change_purchase_document_status_secure(fixture,'submit');
  if not exists(select 1 from public.wms_purchase_document where id=fixture and status='submitted' and supplier_id is null and business_department_id=department) then
    raise exception 'Department-only submit failed';
  end if;
  payload:=payload||jsonb_build_object('business_department_id',department);
  select id into strict other_tenant from public.sys_tenant where id<>template.tenant_id limit 1;
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',template.tenant_id)::text,true);
  perform public.wms_save_purchase_document_secure(payload);
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
  begin
    perform public.wms_save_purchase_document_secure(payload);
    raise exception 'Platform-selected cross tenant save allowed';
  exception when insufficient_privilege then null; end;
  select * into strict own_user from public.sys_user u where u.tenant_id=template.tenant_id
    and u.auth_user_id is not null and u.status='1' and u.deleted_at is null
    and not exists(select 1 from public.sys_role r where r.tenant_id=u.tenant_id and r.role_code=any(u.user_roles) and r.builtin_type='platform_super') limit 1;
  select * into strict own_role from public.sys_role where tenant_id=template.tenant_id and enabled and builtin_type is distinct from 'platform_super' limit 1;
  insert into public.sys_role_menu(role_id,menu_id,tenant_id,create_by)
    select own_role.id,m.id,own_role.tenant_id,'rollback verification' from public.sys_menu m
    where m.name in ('WmsOtherInbound:Add','WmsOtherInbound:Submit')
      and not exists(select 1 from public.sys_role_menu x where x.role_id=own_role.id and x.menu_id=m.id);
  update public.sys_user set user_roles=array[own_role.role_code] where id=own_user.id;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',own_user.auth_user_id,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  fixture:=public.wms_save_purchase_document_secure(payload);
  perform public.wms_change_purchase_document_status_secure(fixture,'submit');
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
  fixture:=public.wms_save_purchase_document_secure(payload);
  perform public.wms_change_purchase_document_status_secure(fixture,'submit');
  begin
    perform public.wms_save_purchase_document_secure(payload||jsonb_build_object('tenant_id',other_tenant));
    raise exception 'Forged header cross tenant save allowed';
  exception when insufficient_privilege then null; end;
end $test$;
rollback;
