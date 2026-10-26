-- Run in one session. Uses existing released, published work orders as transaction-local
-- fixtures; every receipt, configuration change and identity adjustment is rolled back.
begin;
do $test$
declare
 actor uuid; ordinary uuid; ordinary_role uuid; other_tenant uuid;
 receipt public.mes_work_order%rowtype;
 warehouse uuid; qa_bin uuid; zone_category uuid; qa_pack_id uuid; second_pack uuid; material public.mdm_material%rowtype;
 receipt_type uuid; business_type uuid; return_type uuid; return_business uuid; first_line uuid;
 doc_id uuid; movement_id uuid; qa_batch_id uuid;
 quantity_value numeric; first_quantity numeric; area_value numeric; second_area numeric; reported numeric;
 payload jsonb; options jsonb; result_count integer; posted boolean:=false;
 plan_packs jsonb; changed_plan jsonb; current_revision text; packing_rule uuid; received_index integer;
begin
 select u.auth_user_id into strict actor from public.sys_user u
 join public.sys_role r on r.tenant_id=u.tenant_id and r.role_code=any(u.user_roles)
 where r.builtin_type='platform_super' and u.system_protected and u.status='1' limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 perform set_config('request.headers','{}',true);
 select w.* into strict receipt from public.mes_work_order w
 join public.mdm_material m on m.id=w.material_id and m.tenant_id=w.tenant_id
 where w.status='confirmed' and w.deleted_at is null and w.packing_published_at is not null
   and w.finished_inbound_mode is null and w.order_quantity>10 and not m.serial_management_enabled
   and exists(select 1 from public.mes_work_order_pack p where p.work_order_id=w.id)
   and app_private.wms_material_sqm_unit(w.material_id) is not null order by w.id limit 1;
 reported:=receipt.completed_quantity;
 select * into strict material from public.mdm_material where id=receipt.material_id;
 select id into strict warehouse from public.mdm_warehouse where tenant_id=receipt.tenant_id
   and organization_id=receipt.organization_id and warehouse_type='finished' and status='enabled' limit 1;
 select b.id,z.category_id into strict qa_bin,zone_category from public.mdm_warehouse_bin b
 left join public.mdm_warehouse_zone z on z.id=b.zone_id
 where b.warehouse_id=warehouse and b.status='available'
   and b.fixed_material_id is null and b.max_quantity is null and b.max_area_sqm is null and b.max_weight_kg is null
   and z.status='enabled' and not z.abnormal
 order by b.id limit 1;
 update public.mdm_material set inbound_warehouse_id=warehouse,category_id=zone_category where id=material.id;
 select s.construction_no into strict receipt.construction_no from public.mdm_project_construction s
   where s.project_id=receipt.project_id and s.tenant_id=receipt.tenant_id order by s.construction_no limit 1;
 update public.mes_work_order set construction_no=receipt.construction_no,inbound_warehouse_id=warehouse where id=receipt.id;
 update public.mdm_document_type set production_report_control='none',production_full_issue_control='none'
   where id=receipt.work_order_type_id;
 select dt.id,bt.id into strict receipt_type,business_type from public.mdm_document_type dt
 join public.sys_menu menu on menu.id=any(dt.menu_ids) and menu.name='WmsFinishedInbound'
 join public.mdm_business_type bt on bt.tenant_id=dt.tenant_id and dt.id=any(bt.document_type_ids)
 where dt.tenant_id=receipt.tenant_id and dt.enabled and bt.enabled and menu.id=any(bt.menu_ids) limit 1;
 select p.id into strict qa_pack_id from public.mes_work_order_pack p
 where p.work_order_id=receipt.id and p.inbound_at is null order by p.pack_no limit 1;
 select p.id into strict second_pack from public.mes_work_order_pack p
 where p.work_order_id=receipt.id and p.id<>qa_pack_id order by p.pack_no limit 1;
 options:=public.wms_finished_pack_options_secure(receipt.id);
 if not exists(select 1 from jsonb_array_elements(options) x where x->>'id'=qa_pack_id::text) then
   raise exception 'Published legacy packs must be selectable even when confirmed is false';
 end if;
 result_count:=jsonb_array_length(options);
 select u.auth_user_id,r.id into strict ordinary,ordinary_role from public.sys_user u
 join public.sys_role r on r.tenant_id=u.tenant_id and r.role_code=any(u.user_roles) and r.enabled
 where u.tenant_id=receipt.tenant_id and u.status='1' and u.user_type='2' and u.auth_user_id is not null
   and r.builtin_type is distinct from 'platform_super' order by u.id limit 1;
 insert into public.sys_role_menu(tenant_id,role_id,menu_id,create_by)
 select receipt.tenant_id,ordinary_role,m.id,'system' from public.sys_menu m
 where m.name in ('WmsFinishedInbound:View','WmsFinishedInbound:Add','WmsFinishedInbound:Select',
   'WmsFinishedInbound:Submit','WmsFinishedInbound:Approve','WmsFinishedInbound:Push','WmsStockOperation:Post')
   and not exists(select 1 from public.sys_role_menu rm where rm.tenant_id=receipt.tenant_id and rm.role_id=ordinary_role and rm.menu_id=m.id);
 select t.id into strict other_tenant from public.sys_tenant t
   where t.id<>receipt.tenant_id and t.status='1' and t.builtin_type is distinct from 'platform'
     and (t.service_start_date is null or t.service_start_date<=current_date)
     and (t.service_end_date is null or t.service_end_date>=current_date) order by t.id limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ordinary,'role','authenticated')::text,true);
 if jsonb_array_length(public.wms_finished_pack_options_secure(receipt.id))<>result_count then
   raise exception 'Authorized ordinary user cannot read own packages'; end if;
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
 if jsonb_array_length(public.wms_finished_pack_options_secure(receipt.id))<>result_count then
   raise exception 'Forged header changed ordinary user package scope'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 begin
   perform public.wms_finished_pack_options_secure(receipt.id);
   raise exception 'Platform-selected foreign tenant exposed packages';
 exception when insufficient_privilege then null;
 end;
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',receipt.tenant_id)::text,true);
 if jsonb_array_length(public.wms_finished_pack_options_secure(receipt.id))<>result_count then
   raise exception 'Platform-selected own tenant cannot read packages'; end if;
 perform set_config('request.headers','{}',true);
 select stock_quantity,area_sqm into strict quantity_value,area_value from app_private.wms_pack_receipt_metrics(qa_pack_id);
 if quantity_value<=0 or area_value<=0 then raise exception 'Pack receipt metrics are missing'; end if;
 if area_value is distinct from (select sum(d.area_sqm/d.pieces*i.pieces)
   from public.mes_work_order_pack_item i join public.mes_work_order_detail d on d.id=i.board_id where i.pack_id=qa_pack_id) then
   raise exception 'Pack area must use each board row total area divided by row pieces';
 end if;
 payload:=jsonb_build_object('movement_type','production_in','material_id',receipt.material_id,
   'warehouse_id',warehouse,'bin_id',qa_bin,'work_order_id',receipt.id,'project_id',receipt.project_id,
   'construction_no',receipt.construction_no,'batch_no','QA-INBOUND-MODE','quantity',1);
 begin
   perform public.wms_post_inventory_movement_secure(payload);
   perform public.wms_post_inventory_movement_secure(payload||jsonb_build_object('quantity',2));
   if not exists(select 1 from public.mes_work_order where id=receipt.id and finished_inbound_mode='order'
     and warehoused_quantity=receipt.warehoused_quantity+3 and finished_inbound_area_sqm=3
     and completed_quantity=reported) then raise exception 'Summary receipts did not accumulate independently from reports'; end if;
   if jsonb_array_length(public.wms_finished_pack_options_secure(receipt.id))<>0 then
     raise exception 'Summary mode must not activate package inventory'; end if;
   if exists(select 1 from public.mes_work_order_pack where work_order_id=receipt.id and inbound_at is not null) then
     raise exception 'Summary mode changed package receipt state'; end if;
   begin
     perform public.wms_post_inventory_movement_secure(payload||jsonb_build_object('pack_id',qa_pack_id,'quantity',quantity_value));
     raise exception 'Summary mode unexpectedly accepted a pack receipt';
   exception when check_violation then
     if sqlerrm not like '%固定%' then raise; end if;
   end;
   posted:=true;
   raise exception 'rollback summary scenario' using errcode='ZX001';
 exception when sqlstate 'ZX001' then null;
 end;
 if not posted then raise exception 'Summary scenario was not executed'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ordinary,'role','authenticated')::text,true);
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
 payload:=jsonb_build_object('tenant_id',receipt.tenant_id,'kind','finished_inbound','document_type_id',receipt_type,
   'business_type_id',business_type,'organization_id',receipt.organization_id,'warehouse_id',warehouse,
   'work_order_id',receipt.id,'project_id',receipt.project_id,'lines',jsonb_build_array(jsonb_build_object(
     'material_id',receipt.material_id,'work_order_id',receipt.id,'project_id',receipt.project_id,
     'construction_no',receipt.construction_no,'warehouse_id',warehouse,'bin_id',qa_bin,'pack_id',qa_pack_id,
     'inventory_unit_id',material.inventory_unit_id,'production_unit_id',coalesce(material.production_unit_id,material.inventory_unit_id),
     'base_unit_id',material.base_unit_id,'requested_quantity',quantity_value,'actual_quantity',quantity_value,
     'stock_type','normal','stock_status','available','owner_type','self')));
 begin
   perform public.wms_save_production_material_secure(payload||jsonb_build_object('tenant_id',other_tenant));
   raise exception 'Ordinary user created a cross-tenant receipt';
 exception when insufficient_privilege then null;
 end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 perform set_config('request.headers','{}',true);
 doc_id:=public.wms_save_production_material_secure(payload);
 doc_id:=public.wms_save_production_material_secure(payload||jsonb_build_object('id',doc_id));
 begin
   perform public.wms_change_production_material_status_secure(doc_id,'submit');
   perform public.wms_change_production_material_status_secure(doc_id,'approve');
   perform public.wms_change_production_material_status_secure(doc_id,'close');
   if not exists(select 1 from jsonb_array_elements(public.wms_finished_pack_options_secure(receipt.id)) x where x->>'id'=qa_pack_id::text) then
     raise exception 'Closing an unposted receipt did not release its package'; end if;
   perform public.wms_save_production_material_secure(payload);
   raise exception 'rollback closed reservation scenario' using errcode='ZX003';
 exception when sqlstate 'ZX003' then null;
 end;
 if exists(select 1 from jsonb_array_elements(public.wms_finished_pack_options_secure(receipt.id)) x where x->>'id'=qa_pack_id::text) then
   raise exception 'Another draft must reserve its selected package'; end if;
 if not exists(select 1 from jsonb_array_elements(public.wms_finished_pack_options_secure(receipt.id,doc_id)) x where x->>'id'=qa_pack_id::text) then
   raise exception 'Editing a draft must restore its own package reference'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ordinary,'role','authenticated')::text,true);
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
 perform public.wms_change_production_material_status_secure(doc_id,'submit');
 perform public.wms_change_production_material_status_secure(doc_id,'approve');
 result_count:=public.wms_push_production_material_secure(doc_id);
 if result_count<>1 then raise exception 'Expected one posted package'; end if;
 select l.movement_id,m.target_batch_id into strict movement_id,qa_batch_id
 from public.wms_production_material_line l join public.wms_inventory_movement m on m.id=l.movement_id where l.document_id=doc_id;
 select id into strict first_line from public.wms_production_material_line where document_id=doc_id;
 first_quantity:=quantity_value;
 if not exists(select 1 from public.mes_work_order_pack where id=qa_pack_id and inbound_at is not null
   and inbound_quantity=quantity_value and inbound_area_sqm=area_value) then raise exception 'Package receipt state was not written'; end if;
 if not exists(select 1 from public.mes_work_order where id=receipt.id and finished_inbound_mode='pack'
   and finished_inbound_area_sqm=area_value and completed_quantity=reported) then raise exception 'Package area did not accumulate independently from reports'; end if;
 if not exists(select 1 from public.wms_inventory_batch b where b.id=qa_batch_id and b.pack_id=qa_pack_id
   and work_order_id=receipt.id and quantity=quantity_value and area_sqm=area_value) then raise exception 'Package identity or area missing from stock'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 perform set_config('request.headers','{}',true);
 select update_time::text,packing_rule_id into current_revision,packing_rule from public.mes_work_order where id=receipt.id;
 current_revision:=public.mes_set_packing_publication(receipt.id,current_revision,false)->>'revision';
 select jsonb_agg(jsonb_build_object('id',p.id,'pack_no',p.pack_no,'manually_adjusted',p.manually_adjusted,
   'confirmed',p.confirmed,'remark',case when p.id=second_pack then 'QA pending adjustment' else p.remark end,
   'items',(select jsonb_agg(jsonb_build_object('board_id',i.board_id,'pieces',i.pieces,'remark',i.remark) order by i.id)
     from public.mes_work_order_pack_item i where i.pack_id=p.id)) order by p.id)
 into plan_packs from public.mes_work_order_pack p where p.work_order_id=receipt.id;
 current_revision:=public.mes_save_packing_plan_v2(receipt.id,current_revision,plan_packs,packing_rule)->>'revision';
 if not exists(select 1 from public.mes_work_order_pack where id=second_pack and remark='QA pending adjustment') then
   raise exception 'An unreceived package could not be adjusted after a partial receipt'; end if;
 if not exists(select 1 from public.mes_work_order_pack where id=qa_pack_id and inbound_quantity=first_quantity and inbound_area_sqm=area_value) then
   raise exception 'Partial repacking changed a received package'; end if;
 select ordinal::integer-1 into received_index from jsonb_array_elements(plan_packs) with ordinality x(value,ordinal)
   where value->>'id'=qa_pack_id::text;
 changed_plan:=jsonb_set(plan_packs,array[received_index::text,'remark'],to_jsonb('invalid received edit'::text));
 begin
   perform public.mes_save_packing_plan_v2(receipt.id,current_revision,changed_plan,packing_rule);
   raise exception 'Received package production data was editable';
 exception when check_violation then
   if sqlerrm not like '已入库%' then raise; end if;
 end;
 begin
   update public.mes_work_order_detail set length_mm=length_mm+1 where id=(
     select board_id from public.mes_work_order_pack_item where pack_id=qa_pack_id limit 1);
   raise exception 'Received package board geometry was editable';
 exception when check_violation then
   if sqlerrm not like '已入库%' then raise; end if;
 end;
 perform public.mes_set_packing_publication(receipt.id,current_revision,true);
 begin
   perform public.wms_save_production_material_secure(payload);
   raise exception 'Duplicate package was accepted';
 exception when check_violation or unique_violation then null;
 end;
 begin
   perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
   perform set_config('request.headers','{}',true);
   perform public.wms_post_inventory_movement_secure(jsonb_build_object('movement_type','other_out','batch_id',qa_batch_id,
     'quantity',quantity_value/2,'project_id',receipt.project_id,'construction_no',receipt.construction_no));
   raise exception 'Partial package picking was accepted';
 exception when check_violation then
   if sqlerrm not like '%整包%' then raise; end if;
 end;
 select area_sqm into second_area from app_private.wms_pack_receipt_metrics(second_pack);
 select stock_quantity into quantity_value from app_private.wms_pack_receipt_metrics(second_pack);
 payload:=jsonb_set(payload,'{lines,0,pack_id}',to_jsonb(second_pack));
 payload:=jsonb_set(payload,'{lines,0,requested_quantity}',to_jsonb(quantity_value));
 payload:=jsonb_set(payload,'{lines,0,actual_quantity}',to_jsonb(quantity_value));
 doc_id:=public.wms_save_production_material_secure(payload);
 perform public.wms_change_production_material_status_secure(doc_id,'submit');
 perform public.wms_change_production_material_status_secure(doc_id,'approve');
 perform public.wms_push_production_material_secure(doc_id);
 if not exists(select 1 from public.mes_work_order where id=receipt.id
   and finished_inbound_area_sqm=area_value+second_area) then raise exception 'Split package receipts did not accumulate'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 perform set_config('request.headers','{}',true);
 select dt.id,bt.id into strict return_type,return_business from public.mdm_document_type dt
 join public.sys_menu menu on menu.id=any(dt.menu_ids) and menu.name='WmsFinishedReturn'
 join public.mdm_business_type bt on bt.tenant_id=dt.tenant_id and dt.id=any(bt.document_type_ids)
 where dt.tenant_id=receipt.tenant_id and dt.enabled and bt.enabled and menu.id=any(bt.menu_ids) limit 1;
 payload:=payload||jsonb_build_object('kind','finished_return','document_type_id',return_type,'business_type_id',return_business);
 payload:=jsonb_set(payload,'{lines,0}',(payload->'lines'->0)-'pack_id'||jsonb_build_object(
   'requested_quantity',-first_quantity,'actual_quantity',-first_quantity,'source_line_id',first_line,'source_batch_id',qa_batch_id));
 doc_id:=public.wms_save_production_material_secure(payload);
 perform public.wms_change_production_material_status_secure(doc_id,'submit');
 perform public.wms_change_production_material_status_secure(doc_id,'approve');
 perform public.wms_push_production_material_secure(doc_id);
 if not exists(select 1 from public.mes_work_order where id=receipt.id and finished_inbound_mode='pack'
   and finished_inbound_area_sqm=second_area) then raise exception 'Finished return did not reverse receipt area'; end if;
 if not exists(select 1 from public.mes_work_order_pack where id=qa_pack_id and inbound_at is not null
   and inbound_quantity=0 and inbound_area_sqm=0) then raise exception 'Finished return lost package history or net quantity'; end if;
 if exists(select 1 from jsonb_array_elements(public.wms_finished_pack_options_secure(receipt.id)) x where x->>'id'=qa_pack_id::text) then
   raise exception 'Returned package incorrectly became an unreceived package'; end if;
end $test$;
select 'summary and package receipt scenarios passed; all test data rolled back' as result;
rollback;
