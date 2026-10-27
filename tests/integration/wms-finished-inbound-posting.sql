-- Real three-pack/two-bin receipts, save-and-post atomicity, and ordinary permissions.
-- Every stock, source, master-data, and permission change rolls back.
begin;
do $test$
declare
 actor uuid; ordinary uuid; ordinary_role uuid; other_tenant uuid;
 receipt public.mes_work_order%rowtype; material public.mdm_material%rowtype;
 warehouse uuid; zone_id uuid; zone_category uuid; bin_a uuid; bin_b uuid; receipt_type uuid; business_type uuid;
 pack_ids uuid[]; package_id uuid; qty numeric; payload jsonb; lines jsonb:='[]';
 saved_document uuid; before_count bigint; posted integer; checked boolean:=false;
 scenario text; header text;
begin
 select u.auth_user_id into strict actor from public.sys_user u join public.sys_role r
  on r.tenant_id=u.tenant_id and r.role_code=any(u.user_roles)
 where r.builtin_type='platform_super' and u.system_protected and u.status='1' limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 perform set_config('request.headers','{}',true);
 select w.* into strict receipt from public.mes_work_order w
 where w.status='confirmed' and w.deleted_at is null and w.packing_published_at is not null
  and w.finished_inbound_mode is null and (select count(*) from public.mes_work_order_pack p
   where p.work_order_id=w.id and p.inbound_at is null and not exists(
    select 1 from public.wms_production_material_line l join public.wms_production_material_document d on d.id=l.document_id
    where l.pack_id=p.id and d.material_status not in ('closed','void')) )>=3
 order by w.id limit 1;
 select * into strict material from public.mdm_material where id=receipt.material_id;
 select id into strict warehouse from public.mdm_warehouse where tenant_id=receipt.tenant_id
  and organization_id=receipt.organization_id and warehouse_type='finished' and status='enabled'
  and cardinality(business_scopes)>0 and enable_locations limit 1;
 if (select count(*) from public.mdm_warehouse where tenant_id=receipt.tenant_id
  and warehouse_type='finished' and status='enabled' and cardinality(business_scopes)>0)<2 then
  raise exception 'Fixture requires multiple finished warehouses';
 end if;
 update public.mdm_material set inbound_warehouse_id=null,batch_management_enabled=false,serial_management_enabled=false
  where id=material.id;
 update public.mdm_document_type set production_report_control='none',production_full_issue_control='none'
  where id=receipt.work_order_type_id;
 select z.id,z.category_id into strict zone_id,zone_category from public.mdm_warehouse_zone z
  where z.warehouse_id=warehouse and z.status='enabled' and not z.abnormal order by z.id limit 1;
 if zone_category is not null then update public.mdm_material set category_id=zone_category where id=material.id; end if;
 insert into public.mdm_warehouse_bin(tenant_id,warehouse_id,zone_id,bin_code,bin_name)
  values(receipt.tenant_id,warehouse,zone_id,'QA-POST-A','回滚验证仓位 A') returning id into bin_a;
 insert into public.mdm_warehouse_bin(tenant_id,warehouse_id,zone_id,bin_code,bin_name)
  values(receipt.tenant_id,warehouse,zone_id,'QA-POST-B','回滚验证仓位 B') returning id into bin_b;
 select dt.id,bt.id into strict receipt_type,business_type from public.mdm_document_type dt
 join public.sys_menu m on m.id=any(dt.menu_ids) and m.name='WmsFinishedInbound'
 join public.mdm_business_type bt on bt.tenant_id=dt.tenant_id and dt.id=any(bt.document_type_ids)
 where dt.tenant_id=receipt.tenant_id and dt.enabled and bt.enabled and m.id=any(bt.menu_ids) limit 1;
 select array_agg(id) into pack_ids from (select p.id from public.mes_work_order_pack p
  where p.work_order_id=receipt.id and p.inbound_at is null and not exists(
   select 1 from public.wms_production_material_line l join public.wms_production_material_document d on d.id=l.document_id
   where l.pack_id=p.id and d.material_status not in ('closed','void')) order by p.id limit 3) selected;
 foreach package_id in array pack_ids loop
  select stock_quantity into strict qty from app_private.wms_pack_receipt_metrics(package_id);
  lines:=lines||jsonb_build_array(jsonb_build_object('material_id',receipt.material_id,'work_order_id',receipt.id,
   'project_id',receipt.project_id,'construction_no',receipt.construction_no,'warehouse_id',warehouse,
   'bin_id',case when package_id=pack_ids[2] then bin_b else bin_a end,'pack_id',package_id,
   'inventory_unit_id',material.inventory_unit_id,'production_unit_id',coalesce(material.production_unit_id,material.inventory_unit_id),
   'base_unit_id',material.base_unit_id,'requested_quantity',qty,'actual_quantity',qty,
   'stock_type','normal','stock_status','available','owner_type','self','batch_no','OLD-AUTO-NUMBER'));
 end loop;
 payload:=jsonb_build_object('tenant_id',receipt.tenant_id,'kind','finished_inbound','document_type_id',receipt_type,
  'business_type_id',business_type,'organization_id',receipt.organization_id,'warehouse_id',warehouse,
  'work_order_id',receipt.id,'project_id',receipt.project_id,'lines',lines);

 -- Save alone remains a draft; explicit submit/approve/post handles all three bins.
 begin
  saved_document:=public.wms_save_production_material_secure(payload);
  if exists(select 1 from public.wms_production_material_line where document_id=saved_document and batch_no is not null) then
   raise exception 'Non-managed material received an automatic batch number'; end if;
  perform public.wms_change_production_material_status_secure(saved_document,'submit');
  perform public.wms_change_production_material_status_secure(saved_document,'approve');
  -- Simulate a previously saved draft with old generated numbers; posting must clear them.
  update public.wms_production_material_line set batch_no='OLD-AUTO-NUMBER' where document_id=saved_document;
  posted:=public.wms_push_production_material_secure(saved_document);
  if posted<>3 or (select count(distinct bin_id) from public.wms_inventory_batch where pack_id=any(pack_ids))<>2
   or exists(select 1 from public.wms_inventory_batch where pack_id=any(pack_ids) and (warehouse_id<>warehouse or batch_no<>'')) then
   raise exception 'Three-pack/two-bin posting lost warehouse, bin, or batch semantics'; end if;
  checked:=true;
  raise exception 'rollback staged receipt' using errcode='ZX101';
 exception when sqlstate 'ZX101' then null;
 end;
 if not checked then raise exception 'Staged receipt scenario was skipped'; end if;

 -- Capacity/position failure must leave neither a saved document nor partial stock.
 select count(*) into before_count from public.wms_production_material_document;
 begin
  update public.mdm_warehouse_bin set max_quantity=0 where id=bin_b;
  perform public.wms_save_production_material_secure(payload||jsonb_build_object('post_immediately',true));
  raise exception 'Invalid destination was accepted';
 exception when check_violation then null;
 end;
 if (select count(*) from public.wms_production_material_document)<>before_count
  or exists(select 1 from public.wms_inventory_batch where pack_id=any(pack_ids)) then
  raise exception 'Failed one-click receipt was not atomic'; end if;

 select u.auth_user_id,r.id into strict ordinary,ordinary_role from public.sys_user u join public.sys_role r
  on r.tenant_id=u.tenant_id and r.role_code=any(u.user_roles) and r.enabled
 where u.tenant_id=receipt.tenant_id and u.status='1' and u.user_type='2' and u.auth_user_id is not null
  and r.builtin_type is distinct from 'platform_super' order by u.id limit 1;
 insert into public.sys_role_menu(tenant_id,role_id,menu_id,create_by)
 select receipt.tenant_id,ordinary_role,m.id,'system' from public.sys_menu m
 where m.name in ('WmsFinishedInbound:Add','WmsFinishedInbound:Submit','WmsFinishedInbound:Approve','WmsFinishedInbound:Push')
 on conflict do nothing;
 select id into strict other_tenant from public.sys_tenant where id<>receipt.tenant_id and status='1'
  and builtin_type is distinct from 'platform' order by id limit 1;

 -- Missing the new one-click permission cannot bypass the individual permissions.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ordinary,'role','authenticated')::text,true);
 begin
  perform public.wms_save_production_material_secure(payload||jsonb_build_object('post_immediately',true));
  raise exception 'Ordinary user without one-click permission posted inventory';
 exception when insufficient_privilege then null;
 end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 insert into public.sys_role_menu(tenant_id,role_id,menu_id,create_by)
 select receipt.tenant_id,ordinary_role,m.id,'system' from public.sys_menu m where m.name='WmsFinishedInbound:SaveAndPost'
 on conflict do nothing;
 foreach scenario in array array['platform-selected','ordinary-own','ordinary-forged'] loop
  begin
   perform set_config('request.jwt.claims',jsonb_build_object('sub',case when scenario='platform-selected' then actor else ordinary end,'role','authenticated')::text,true);
   header:=case scenario when 'platform-selected' then jsonb_build_object('x-art-tenant-scope',receipt.tenant_id)::text
    when 'ordinary-forged' then jsonb_build_object('x-art-tenant-scope',other_tenant)::text else '{}' end;
   perform set_config('request.headers',header,true);
   saved_document:=public.wms_save_production_material_secure(payload||jsonb_build_object('post_immediately',true));
   if not exists(select 1 from public.wms_production_material_document d where d.id=saved_document and d.status='approved' and d.material_status='fulfilled')
    or (select count(*) from public.wms_production_material_line l where l.document_id=saved_document and l.movement_id is not null and l.batch_no is null)<>3 then
    raise exception 'Save-and-post did not complete: %',scenario; end if;
   raise exception 'rollback one-click receipt' using errcode='ZX102';
  exception when sqlstate 'ZX102' then null;
  end;
 end loop;
end;
$test$;
rollback;
