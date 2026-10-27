-- Exercises real reporting/approval/stock boundaries; all fixture changes roll back.
begin;
do $test$
declare
 actor uuid; ordinary uuid; ordinary_role uuid; other_tenant uuid;
 wo public.mes_work_order%rowtype; first_task public.mes_operation_task%rowtype;
 milestone public.mes_operation_task%rowtype; final_task public.mes_operation_task%rowtype;
 ids uuid[]; milestone_report uuid; final_report uuid; receipt uuid; warehouse uuid; location_warehouse uuid; manual_report uuid;
 report_result jsonb; response jsonb; source_qty numeric; generated integer; equipment uuid;
 package_id uuid; board_id uuid; package_quantity numeric;
begin
 select u.auth_user_id into strict actor from public.sys_user u join public.sys_role role
  on role.tenant_id=u.tenant_id and role.role_code=any(u.user_roles)
  where role.builtin_type='platform_super' and u.system_protected and u.status='1' limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 perform set_config('request.headers','{}',true);
 select w.* into strict wo from public.mes_work_order w where w.status='confirmed' and w.deleted_at is null
  and w.order_quantity>10 and (select count(*) from public.mes_operation_task t where t.work_order_id=w.id and t.sequence_type='main' and t.deleted_at is null)>=3
  and not exists(select 1 from public.mes_production_report r join public.mes_operation_task t on t.id=r.task_id where t.work_order_id=w.id)
  order by w.id limit 1;
 select array_agg(o.task_id order by o.step_order) into ids from app_private.mes_execution_ordered_tasks(wo.id) o
  join public.mes_operation_task t on t.id=o.task_id where t.sequence_type='main';
 if (select count(*) from public.mes_execution_task_rules(ids))<>array_length(ids,1) then
  raise exception 'Platform-all rule lookup lost task rules'; end if;
 select * into first_task from public.mes_operation_task where id=ids[1];
 select * into milestone from public.mes_operation_task where id=ids[array_length(ids,1)-1];
 select * into final_task from public.mes_operation_task where id=ids[array_length(ids,1)];
 update public.mes_work_order set bom_snapshot='[]',inbound_warehouse_id=null,finished_inbound_mode=null,
  route_snapshot=jsonb_set(route_snapshot,'{steps}',(
   select jsonb_agg(step.value||jsonb_build_object('report_mode','optional','sequence_control','none')||
    case when step.value->>'id'=milestone.route_step_snapshot_id::text then jsonb_build_object('control_code','SY06','report_mode','required','sequence_control','strict')
     when step.value->>'id'=final_task.route_step_snapshot_id::text then jsonb_build_object('control_code','SY05','report_mode','required','sequence_control','strict')
     else jsonb_build_object('control_code','SY01') end order by step.ordinality)
   from jsonb_array_elements(route_snapshot->'steps') with ordinality step(value,ordinality))) where id=wo.id;
 update public.mdm_material set inbound_warehouse_id=null,default_warehouse_id=null,serial_management_enabled=false where id=wo.material_id;
 update public.mes_operation_task set scheduling_status='scheduled',operation_status='released',started_at=null,
  equipment_id=null,equipment_locked=true where work_order_id=wo.id;
 begin
  perform public.mes_start_execution(milestone.id,milestone.work_center_id);
  raise exception 'Non-first operation unexpectedly accepted start';
 exception when object_not_in_prerequisite_state then null; end;
 begin
  perform public.mes_submit_production_report(first_task.id,first_task.work_center_id,jsonb_build_object('goodQuantity',1));
  raise exception 'First operation unexpectedly skipped start';
 exception when object_not_in_prerequisite_state then null; end;
 perform public.mes_start_execution(first_task.id,first_task.work_center_id);
 select u.auth_user_id,role.id into strict ordinary,ordinary_role from public.sys_user u join public.sys_role role
  on role.tenant_id=u.tenant_id and role.role_code=any(u.user_roles) and role.enabled
  where u.tenant_id=wo.tenant_id and u.status='1' and u.user_type='2' and u.auth_user_id is not null
   and role.builtin_type is distinct from 'platform_super' order by u.id limit 1;
 insert into public.sys_role_menu(tenant_id,role_id,menu_id,create_by)
 select wo.tenant_id,ordinary_role,m.id,'system' from public.sys_menu m
  where m.name in ('MesProductionReport:View','MesProductionReport:Report','MesProductionReport:Start','MesReportApproval:Approve')
   and not exists(select 1 from public.sys_role_menu rm where rm.role_id=ordinary_role and rm.menu_id=m.id);
 delete from public.sys_role_menu rm using public.sys_menu menu,public.sys_role role,public.sys_user u
  where rm.menu_id=menu.id and rm.role_id=role.id and role.tenant_id=u.tenant_id
   and role.role_code=any(u.user_roles) and u.auth_user_id=ordinary
   and menu.name in ('WmsFinishedInbound:Submit','WmsFinishedInbound:Approve','WmsFinishedInbound:Push','WmsStockOperation:Post',
    'MesWorkOrder:View','WmsFinishedInbound:View','WmsFinishedReturn:View','WmsProductionIssue:View','WmsProductionReturn:View');
 select id into strict other_tenant from public.sys_tenant where id<>wo.tenant_id and builtin_type is distinct from 'platform' and status='1' limit 1;
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
 if exists(select 1 from public.mes_execution_task_rules(ids)) then raise exception 'Platform-selected foreign scope exposed execution rules'; end if;
 begin
  perform public.mes_submit_production_report(milestone.id,milestone.work_center_id,jsonb_build_object('goodQuantity',1));
  raise exception 'Platform-selected foreign scope unexpectedly accepted reporting';
 exception when insufficient_privilege then null; end;
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',wo.tenant_id)::text,true);
 if (select count(*) from public.mes_execution_task_rules(ids))<>array_length(ids,1) then
  raise exception 'Platform-selected own rule lookup lost task rules'; end if;
 report_result:=public.mes_submit_production_report(milestone.id,milestone.work_center_id,jsonb_build_object('goodQuantity',1));
 milestone_report:=(report_result->>'id')::uuid;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ordinary,'role','authenticated')::text,true);
 if app_private.has_permission('WmsFinishedInbound:Push') or app_private.has_permission('WmsStockOperation:Post') then
  raise exception 'Fixture must prove automated receipt does not require unrelated WMS posting permissions'; end if;
 if app_private.has_permission('MesWorkOrder:View') then raise exception 'Fixture must prove rule reading does not require full work-order permission'; end if;
 perform set_config('request.headers','{}',true);
 if not exists(select 1 from public.mes_execution_task_rules(ids) rules where rules.task_id=first_task.id and rules.first_task_id=first_task.id) then
  raise exception 'Ordinary reporting user cannot read scoped operation rules'; end if;
 begin
  report_result:=public.mes_submit_production_report(final_task.id,final_task.work_center_id,jsonb_build_object('goodQuantity',1));
  perform public.mes_review_production_report((report_result->>'id')::uuid,'approve');
  raise exception 'A required preceding operation was bypassed';
 exception when check_violation then null; end;
 response:=public.mes_review_production_report(milestone_report,'approve');
 generated:=(response->>'systemReportsCreated')::integer;
 if generated<>array_length(ids,1)-2 then raise exception 'SY06 did not backfill every preceding main task'; end if;
 if exists(select 1 from public.mes_production_report r where r.system_source_report_id=milestone_report
   and (r.status<>'approved' or r.reporter_name<>'系统自报工' or r.remark not like '系统自报工%')) then
  raise exception 'System reports lost provenance or approved status'; end if;
 if exists(select 1 from public.mes_operation_task where work_order_id=wo.id and sequence_type='parallel' and completed_quantity>0) then
  raise exception 'SY06 unexpectedly completed an independent parallel branch'; end if;
 begin
  perform public.mes_review_production_report(milestone_report,'approve');
  raise exception 'Duplicate approval unexpectedly succeeded';
 exception when object_not_in_prerequisite_state then null; end;
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
 report_result:=public.mes_submit_production_report(final_task.id,final_task.work_center_id,jsonb_build_object('goodQuantity',1));
 if (select count(*) from public.mes_execution_task_rules(ids))<>array_length(ids,1) then
  raise exception 'Forged ordinary-user header changed task rule scope'; end if;
 final_report:=(report_result->>'id')::uuid;
 response:=public.mes_review_production_report(final_report,'approve');
 receipt:=(response->>'finishedInboundDocumentId')::uuid;
 if receipt is null or not exists(select 1 from public.wms_production_material_document d where d.id=receipt
   and d.source_report_id=final_report and d.source_report_quantity=1 and d.status='draft' and d.warehouse_id is null) then
  raise exception 'Unselected receipt mode/missing warehouse must create a recoverable draft'; end if;
 if exists(select 1 from public.wms_production_material_line where document_id=receipt) then
  raise exception 'Unselected receipt mode must not preselect summary or package lines'; end if;
 if not exists(select 1 from public.wms_production_material_list where document_id=receipt and line_id=receipt and work_order_no=wo.work_order_no) then
  raise exception 'Empty system receipt draft is not visible in the receipt workspace'; end if;
 if app_private.mes_create_finished_receipt(final_report)<>receipt then raise exception 'Receipt generation is not idempotent'; end if;
 begin
  update public.wms_production_material_document set work_order_id=(select id from public.mes_work_order where id<>wo.id limit 1) where id=receipt;
  raise exception 'Automatic receipt source work order unexpectedly changed';
 exception when check_violation then null; end;
 -- Second batch: known summary mode plus a usable non-location warehouse can post automatically.
 select id into strict warehouse from public.mdm_warehouse where tenant_id=wo.tenant_id and warehouse_type='finished' and status='enabled' and not enable_locations order by id limit 1;
 update public.mdm_warehouse set organization_id=wo.organization_id where id=warehouse;
 update public.wms_inventory_initialization set enabled_on=current_date-1,initialization_closed_at=now()
  where tenant_id=wo.tenant_id and organization_id=wo.organization_id;
 update public.mdm_document_type set production_full_issue_control='none' where id=wo.work_order_type_id;
 update public.mes_work_order set inbound_warehouse_id=warehouse,finished_inbound_mode='order' where id=wo.id;
 update public.mdm_material set inbound_warehouse_id=warehouse where id=wo.material_id;
 report_result:=public.mes_submit_production_report(milestone.id,milestone.work_center_id,jsonb_build_object('goodQuantity',1));
 milestone_report:=(report_result->>'id')::uuid;
 perform public.mes_review_production_report(milestone_report,'approve');
 if exists(select 1 from public.mes_operation_task t where t.id=any(ids[1:array_length(ids,1)-1]) and t.completed_quantity<>2) then
  raise exception 'Second batch duplicated or omitted preceding reported quantities'; end if;
 report_result:=public.mes_submit_production_report(final_task.id,final_task.work_center_id,jsonb_build_object('goodQuantity',1));
 response:=public.mes_review_production_report((report_result->>'id')::uuid,'approve');
 receipt:=(response->>'finishedInboundDocumentId')::uuid;
 if not exists(select 1 from public.wms_production_material_document d where d.id=receipt and d.status='approved' and d.material_status='fulfilled') then
  raise exception 'Complete summary receipt did not post automatically: %',(select remark from public.wms_production_material_document where id=receipt); end if;
 if not exists(select 1 from public.mes_work_order where id=wo.id and completed_quantity=2 and warehoused_quantity=1 and finished_inbound_mode='order') then
  raise exception 'Approved/report/receipt quantities did not remain independent'; end if;
 -- Existing manual pending reports reserve their output and must not be duplicated by SY06.
 perform public.mes_start_execution(first_task.id,first_task.work_center_id);
 report_result:=public.mes_submit_production_report(first_task.id,first_task.work_center_id,jsonb_build_object('goodQuantity',1));
 manual_report:=(report_result->>'id')::uuid;
 report_result:=public.mes_submit_production_report(milestone.id,milestone.work_center_id,jsonb_build_object('goodQuantity',1));
 milestone_report:=(report_result->>'id')::uuid;
 perform public.mes_review_production_report(milestone_report,'approve');
 if exists(select 1 from public.mes_production_report where system_source_report_id=milestone_report and task_id=first_task.id)
  or not exists(select 1 from public.mes_production_report where id=manual_report and status='pending') then
  raise exception 'SY06 duplicated or overwrote a manual pending report'; end if;
 perform public.mes_review_production_report(manual_report,'approve');
 report_result:=public.mes_submit_production_report(final_task.id,final_task.work_center_id,jsonb_build_object('goodQuantity',1));
 perform public.mes_review_production_report((report_result->>'id')::uuid,'approve');
 -- Location-enabled warehouse must retain a draft rather than guessing a storage bin.
 select id into strict location_warehouse from public.mdm_warehouse where tenant_id=wo.tenant_id
  and warehouse_type='finished' and status='enabled' and enable_locations order by id limit 1;
 update public.mes_work_order set inbound_warehouse_id=location_warehouse where id=wo.id;
 update public.mdm_material set inbound_warehouse_id=location_warehouse where id=wo.material_id;
 report_result:=public.mes_submit_production_report(milestone.id,milestone.work_center_id,jsonb_build_object('goodQuantity',1));
 perform public.mes_review_production_report((report_result->>'id')::uuid,'approve');
 report_result:=public.mes_submit_production_report(final_task.id,final_task.work_center_id,jsonb_build_object('goodQuantity',1));
 response:=public.mes_review_production_report((report_result->>'id')::uuid,'approve');
 receipt:=(response->>'finishedInboundDocumentId')::uuid;
 if not exists(select 1 from public.wms_production_material_document where id=receipt and status='draft' and warehouse_id=location_warehouse)
  or not exists(select 1 from public.wms_production_material_line where document_id=receipt and bin_id is null and movement_id is null) then
  raise exception 'Location-enabled warehouse must leave a draft with unposted lines'; end if;
 -- Fixed package mode must never silently generate summary inventory when no exact pack matches.
 update public.mes_work_order set finished_inbound_mode='pack',inbound_warehouse_id=warehouse,packing_published_at=null where id=wo.id;
 update public.mdm_material set inbound_warehouse_id=warehouse where id=wo.material_id;
 report_result:=public.mes_submit_production_report(milestone.id,milestone.work_center_id,jsonb_build_object('goodQuantity',1));
 perform public.mes_review_production_report((report_result->>'id')::uuid,'approve');
 report_result:=public.mes_submit_production_report(final_task.id,final_task.work_center_id,jsonb_build_object('goodQuantity',1));
 response:=public.mes_review_production_report((report_result->>'id')::uuid,'approve');
 receipt:=(response->>'finishedInboundDocumentId')::uuid;
 if not exists(select 1 from public.wms_production_material_document where id=receipt and status='draft')
  or exists(select 1 from public.wms_production_material_line where document_id=receipt) then
  raise exception 'Package mode without eligible packages must remain an empty package-selection draft'; end if;
 -- A published whole package that exactly matches the next confirmed batch posts in package mode.
 select id into strict board_id from public.mes_work_order_detail where work_order_id=wo.id and pieces>0 and area_sqm>0 order by id limit 1;
 insert into public.mes_work_order_pack(tenant_id,work_order_id,pack_no,area,axis)
  values(wo.tenant_id,wo.id,'QA-SY05-'||gen_random_uuid()::text,'QA','QA') returning id into package_id;
 insert into public.mes_work_order_pack_item(tenant_id,pack_id,board_id,pieces) values(wo.tenant_id,package_id,board_id,1);
 update public.mes_work_order set packing_published_at=now() where id=wo.id;
 select app_private.wms_convert_material_quantity(wo.material_id,metrics.stock_quantity,
  (select inventory_unit_id from public.mdm_material where id=wo.material_id),wo.production_unit_id)
  into package_quantity from app_private.wms_pack_receipt_metrics(package_id) metrics;
 report_result:=public.mes_submit_production_report(milestone.id,milestone.work_center_id,jsonb_build_object('goodQuantity',package_quantity));
 perform public.mes_review_production_report((report_result->>'id')::uuid,'approve');
 report_result:=public.mes_submit_production_report(final_task.id,final_task.work_center_id,jsonb_build_object('goodQuantity',package_quantity));
 response:=public.mes_review_production_report((report_result->>'id')::uuid,'approve');
 receipt:=(response->>'finishedInboundDocumentId')::uuid;
 if not exists(select 1 from public.wms_production_material_document where id=receipt and status='approved' and material_status='fulfilled')
  or not exists(select 1 from public.wms_production_material_line where document_id=receipt and pack_id=package_id and movement_id is not null)
  or not exists(select 1 from public.mes_work_order_pack where id=package_id and inbound_at is not null and inbound_quantity>0) then
  raise exception 'Exactly matching package did not post with package traceability: %',(select remark from public.wms_production_material_document where id=receipt); end if;
 if has_function_privilege('authenticated','app_private.mes_create_finished_receipt(uuid)','execute')
  or has_function_privilege('authenticated','app_private.mes_backfill_preceding_reports(uuid)','execute') then
  raise exception 'Internal automation helpers must not be directly executable'; end if;
end $test$;
rollback;
