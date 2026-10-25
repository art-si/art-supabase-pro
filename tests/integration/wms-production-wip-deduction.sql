-- WIP deduction ledger, timing snapshot and tenant boundary regression.
-- Uses a real posted issue as the source. Synthetic movement references test
-- reconciliation branches, followed by an actual finished receipt and return
-- through the guarded stock-posting RPCs. All changes roll back.
begin;

do $test$
declare
 v_wo public.mes_work_order%rowtype;
 v_issue public.wms_production_material_line%rowtype;
 v_actor uuid;
 v_receipt_type uuid; v_receipt_business uuid;
 v_issue_type uuid; v_issue_business uuid;
 v_return_type uuid; v_return_business uuid;
 v_finished_return_type uuid; v_finished_return_business uuid;
 v_warehouse uuid; v_material_unit uuid;
 v_receipt1 uuid; v_receipt2 uuid; v_receipt3 uuid; v_receipt4 uuid;
 v_receipt_line uuid; v_issue_doc uuid; v_issue_line uuid;
 v_return_doc uuid; v_return_line uuid;
 v_finished_return_doc uuid; v_finished_return_line uuid;
 v_fake_movement uuid; v_amount numeric; v_sources integer;
 v_real_receipt uuid; v_real_receipt_line uuid; v_real_return uuid;
 v_real_batch uuid; v_bin_id uuid; v_zone_category_id uuid;
 v_approved_amount numeric; v_real_quantity numeric;
 v_denied boolean;
begin
 select u.auth_user_id into strict v_actor from public.sys_user u
 join public.sys_role role on role.tenant_id=u.tenant_id and role.role_code=any(u.user_roles)
 where role.builtin_type='platform_super' and u.system_protected and u.status='1'
 limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_actor,'role','authenticated')::text,true);
 perform set_config('request.headers','{}',true);

 select wo.* into strict v_wo
 from public.mes_work_order wo
 where exists (
   select 1 from public.wms_production_material_line l
   join public.wms_production_material_document d on d.id=l.document_id
   where d.kind='issue' and l.movement_id is not null
     and coalesce(l.work_order_id,d.work_order_id)=wo.id
 )
 order by wo.id limit 1;
 select l.* into strict v_issue
 from public.wms_production_material_line l
 join public.wms_production_material_document d on d.id=l.document_id
 where d.kind='issue' and l.movement_id is not null
   and coalesce(l.work_order_id,d.work_order_id)=v_wo.id
 order by l.id limit 1;
 v_fake_movement:=v_issue.movement_id;
 select id into strict v_warehouse from public.mdm_warehouse
 where tenant_id=v_wo.tenant_id and organization_id=v_wo.organization_id
   and warehouse_type='finished' order by id limit 1;
 select inventory_unit_id into strict v_material_unit from public.mdm_material
 where id=v_wo.material_id and tenant_id=v_wo.tenant_id;

 select dt.id,bt.id into strict v_receipt_type,v_receipt_business
 from public.sys_menu m join public.mdm_document_type dt
 on dt.tenant_id=v_wo.tenant_id and (dt.menu_id=m.id or m.id=any(dt.menu_ids))
 join public.mdm_business_type bt on bt.document_type_id=dt.id and bt.tenant_id=dt.tenant_id
 where m.name='WmsFinishedInbound' order by dt.id limit 1;
 select dt.id,bt.id into strict v_issue_type,v_issue_business
 from public.sys_menu m join public.mdm_document_type dt
 on dt.tenant_id=v_wo.tenant_id and (dt.menu_id=m.id or m.id=any(dt.menu_ids))
 join public.mdm_business_type bt on bt.document_type_id=dt.id and bt.tenant_id=dt.tenant_id
 where m.name='WmsProductionIssue' order by dt.id limit 1;
 select dt.id,bt.id into strict v_return_type,v_return_business
 from public.sys_menu m join public.mdm_document_type dt
 on dt.tenant_id=v_wo.tenant_id and (dt.menu_id=m.id or m.id=any(dt.menu_ids))
 join public.mdm_business_type bt on bt.document_type_id=dt.id and bt.tenant_id=dt.tenant_id
 where m.name='WmsProductionReturn' order by dt.id limit 1;
 select dt.id,bt.id into strict v_finished_return_type,v_finished_return_business
 from public.sys_menu m join public.mdm_document_type dt
 on dt.tenant_id=v_wo.tenant_id and (dt.menu_id=m.id or m.id=any(dt.menu_ids))
 join public.mdm_business_type bt on bt.document_type_id=dt.id and bt.tenant_id=dt.tenant_id
 where m.name='WmsFinishedReturn' order by dt.id limit 1;

 update public.mdm_document_type set production_wip_deduction_timing='inbound_approval'
 where id=v_wo.work_order_type_id and tenant_id=v_wo.tenant_id;

 insert into public.wms_production_material_document
 (tenant_id,kind,document_no,document_type_id,business_type_id,
 organization_id,warehouse_id,work_order_id,status,created_by)
 values(v_wo.tenant_id,'finished_inbound','QA-WIP-1-'||gen_random_uuid(),
 v_receipt_type,v_receipt_business,v_wo.organization_id,v_warehouse,v_wo.id,'submitted',v_actor)
 returning id into v_receipt1;
 insert into public.wms_production_material_line
 (tenant_id,document_id,line_no,material_id,inventory_unit_id,
 requested_quantity,actual_quantity,warehouse_id,stock_type,work_order_id,work_order_quantity)
 values(v_wo.tenant_id,v_receipt1,10,v_wo.material_id,v_material_unit,
 v_wo.order_quantity/4,v_wo.order_quantity/4,v_warehouse,'normal',v_wo.id,v_wo.order_quantity)
 returning id into v_receipt_line;
 perform public.wms_change_production_material_status_secure(v_receipt1,'approve');
 select coalesce(sum(quantity_delta),0) into v_amount
 from app_private.wms_production_wip_entry where work_order_id=v_wo.id;
 if v_amount<>0.75 then raise exception 'First approval expected 0.75, got %',v_amount; end if;

 v_denied:=false;
 begin
   update public.wms_production_material_document set status='draft'
   where id=v_receipt1;
 exception when check_violation then v_denied:=true;
 end;
 if not v_denied then raise exception 'Approved WIP receipt status was rewritable'; end if;
 v_denied:=false;
 begin
   update public.wms_production_material_line set actual_quantity=actual_quantity+1
   where id=v_receipt_line;
 exception when check_violation then v_denied:=true;
 end;
 if not v_denied then raise exception 'Approved WIP receipt amount was rewritable'; end if;

 update public.mes_work_order set order_quantity=v_wo.order_quantity*2
 where id=v_wo.id and tenant_id=v_wo.tenant_id;
 select coalesce(sum(quantity_delta),0) into v_amount
 from app_private.wms_production_wip_entry where work_order_id=v_wo.id;
 if v_amount<>0.375 then raise exception 'Larger order expected 0.375, got %',v_amount; end if;
 update public.mes_work_order set order_quantity=v_wo.order_quantity
 where id=v_wo.id and tenant_id=v_wo.tenant_id;
 select coalesce(sum(quantity_delta),0) into v_amount
 from app_private.wms_production_wip_entry where work_order_id=v_wo.id;
 if v_amount<>0.75 then raise exception 'Restored order expected 0.75, got %',v_amount; end if;

 insert into public.wms_production_material_document
 (tenant_id,kind,document_no,document_type_id,business_type_id,
 organization_id,warehouse_id,work_order_id,status,created_by)
 values(v_wo.tenant_id,'finished_inbound','QA-WIP-2-'||gen_random_uuid(),
 v_receipt_type,v_receipt_business,v_wo.organization_id,v_warehouse,v_wo.id,'submitted',v_actor)
 returning id into v_receipt2;
 insert into public.wms_production_material_line
 (tenant_id,document_id,line_no,material_id,inventory_unit_id,
 requested_quantity,actual_quantity,warehouse_id,stock_type,work_order_id,work_order_quantity)
 values(v_wo.tenant_id,v_receipt2,10,v_wo.material_id,v_material_unit,
 v_wo.order_quantity/4,v_wo.order_quantity/4,v_warehouse,'normal',v_wo.id,v_wo.order_quantity);
 perform public.wms_change_production_material_status_secure(v_receipt2,'approve');
 select coalesce(sum(quantity_delta),0) into v_amount
 from app_private.wms_production_wip_entry where work_order_id=v_wo.id;
 if v_amount<>1.5 then raise exception 'Second approval expected 1.5, got %',v_amount; end if;
 perform public.wms_change_production_material_status_secure(v_receipt2,'void');
 select coalesce(sum(quantity_delta),0) into v_amount
 from app_private.wms_production_wip_entry where work_order_id=v_wo.id;
 if v_amount<>0.75 then raise exception 'Void expected 0.75, got %',v_amount; end if;

 insert into public.wms_production_material_document
 (tenant_id,kind,document_no,document_type_id,business_type_id,
 organization_id,warehouse_id,status,created_by)
 values(v_wo.tenant_id,'return','QA-WIP-RETURN-'||gen_random_uuid(),
 v_return_type,v_return_business,v_wo.organization_id,v_issue.warehouse_id,'approved',v_actor)
 returning id into v_return_doc;
 insert into public.wms_production_material_line
 (tenant_id,document_id,line_no,material_id,inventory_unit_id,
 requested_quantity,actual_quantity,warehouse_id,stock_type,
 work_order_id,source_line_id,return_type)
 values(v_wo.tenant_id,v_return_doc,10,v_issue.material_id,v_issue.inventory_unit_id,
 -0.5,-0.5,v_issue.warehouse_id,'normal',v_wo.id,v_issue.id,'good')
 returning id into v_return_line;
 update public.wms_production_material_line
 set movement_id=v_fake_movement,fulfilled_quantity=-0.5 where id=v_return_line;
 select coalesce(sum(quantity_delta),0) into v_amount
 from app_private.wms_production_wip_entry where work_order_id=v_wo.id;
 if v_amount<>0.625 then raise exception 'Material return expected 0.625, got %',v_amount; end if;

 insert into public.wms_production_material_document
 (tenant_id,kind,document_no,document_type_id,business_type_id,
 organization_id,warehouse_id,status,created_by)
 values(v_wo.tenant_id,'issue','QA-WIP-ISSUE-'||gen_random_uuid(),
 v_issue_type,v_issue_business,v_wo.organization_id,v_issue.warehouse_id,'approved',v_actor)
 returning id into v_issue_doc;
 insert into public.wms_production_material_line
 (tenant_id,document_id,line_no,material_id,inventory_unit_id,
 requested_quantity,actual_quantity,warehouse_id,stock_type,work_order_id)
 values(v_wo.tenant_id,v_issue_doc,10,v_issue.material_id,v_issue.inventory_unit_id,
 1,1,v_issue.warehouse_id,'normal',v_wo.id)
 returning id into v_issue_line;
 update public.wms_production_material_line
 set movement_id=v_fake_movement,fulfilled_quantity=1 where id=v_issue_line;
 select coalesce(sum(quantity_delta),0) into v_amount
 from app_private.wms_production_wip_entry where work_order_id=v_wo.id;
 if v_amount<>0.875 then raise exception 'Added issue expected 0.875, got %',v_amount; end if;
 v_denied:=false;
 begin
   update public.wms_production_material_line set fulfilled_quantity=0
   where id=v_issue_line;
 exception when check_violation then v_denied:=true;
 end;
 if not v_denied then raise exception 'Posted issue amount was rewritable'; end if;

 insert into public.wms_production_material_document
 (tenant_id,kind,document_no,document_type_id,business_type_id,
 organization_id,warehouse_id,work_order_id,status,created_by)
 values(v_wo.tenant_id,'finished_return','QA-WIP-FIN-RETURN-'||gen_random_uuid(),
 v_finished_return_type,v_finished_return_business,v_wo.organization_id,v_warehouse,v_wo.id,'approved',v_actor)
 returning id into v_finished_return_doc;
 insert into public.wms_production_material_line
 (tenant_id,document_id,line_no,material_id,inventory_unit_id,
 requested_quantity,actual_quantity,warehouse_id,stock_type,
 work_order_id,source_line_id,work_order_quantity)
 values(v_wo.tenant_id,v_finished_return_doc,10,v_wo.material_id,v_material_unit,
 -v_wo.order_quantity/8,-v_wo.order_quantity/8,v_warehouse,'normal',
 v_wo.id,v_receipt_line,-v_wo.order_quantity)
 returning id into v_finished_return_line;
 update public.wms_production_material_line
 set movement_id=v_fake_movement,fulfilled_quantity=-v_wo.order_quantity/8
 where id=v_finished_return_line;
 select coalesce(sum(quantity_delta),0) into v_amount
 from app_private.wms_production_wip_entry where work_order_id=v_wo.id;
 if v_amount<>0.4375 then raise exception 'Finished return expected 0.4375, got %',v_amount; end if;

 insert into public.wms_production_material_document
 (tenant_id,kind,document_no,document_type_id,business_type_id,
 organization_id,warehouse_id,work_order_id,status,created_by)
 values(v_wo.tenant_id,'finished_inbound','QA-WIP-FINAL-'||gen_random_uuid(),
 v_receipt_type,v_receipt_business,v_wo.organization_id,v_warehouse,v_wo.id,'submitted',v_actor)
 returning id into v_receipt4;
 insert into public.wms_production_material_line
 (tenant_id,document_id,line_no,material_id,inventory_unit_id,
 requested_quantity,actual_quantity,warehouse_id,stock_type,work_order_id)
 values(v_wo.tenant_id,v_receipt4,10,v_wo.material_id,v_material_unit,
 v_wo.order_quantity*7/8,v_wo.order_quantity*7/8,v_warehouse,'normal',v_wo.id);
 perform public.wms_change_production_material_status_secure(v_receipt4,'approve');
 select coalesce(sum(quantity_delta),0) into v_amount
 from app_private.wms_production_wip_entry where work_order_id=v_wo.id;
 if v_amount<>3.5 then raise exception 'Final batch expected all 3.5, got %',v_amount; end if;
 perform public.wms_change_production_material_status_secure(v_receipt4,'close');
 select coalesce(sum(quantity_delta),0) into v_amount
 from app_private.wms_production_wip_entry where work_order_id=v_wo.id;
 if v_amount<>0.4375 then raise exception 'Final batch close expected 0.4375, got %',v_amount; end if;

 update public.mdm_document_type set production_wip_deduction_timing='none'
 where id=v_wo.work_order_type_id and tenant_id=v_wo.tenant_id;
 insert into public.wms_production_material_document
 (tenant_id,kind,document_no,document_type_id,business_type_id,
 organization_id,warehouse_id,work_order_id,status,created_by)
 values(v_wo.tenant_id,'finished_inbound','QA-WIP-DISABLED-'||gen_random_uuid(),
 v_receipt_type,v_receipt_business,v_wo.organization_id,v_warehouse,v_wo.id,'submitted',v_actor)
 returning id into v_receipt3;
 insert into public.wms_production_material_line
 (tenant_id,document_id,line_no,material_id,inventory_unit_id,
 requested_quantity,actual_quantity,warehouse_id,stock_type,work_order_id)
 values(v_wo.tenant_id,v_receipt3,10,v_wo.material_id,v_material_unit,
 v_wo.order_quantity/4,v_wo.order_quantity/4,v_warehouse,'normal',v_wo.id);
 perform public.wms_change_production_material_status_secure(v_receipt3,'approve');
 select count(*) into v_sources from app_private.wms_production_wip_source
 where work_order_id=v_wo.id;
 if v_sources<>3 then raise exception 'Disabled timing created % sources',v_sources; end if;
 select coalesce(sum(quantity_delta),0) into v_amount
 from app_private.wms_production_wip_entry where work_order_id=v_wo.id;
 if v_amount<>0.4375 then raise exception 'Disabled timing changed ledger to %',v_amount; end if;

 perform public.wms_change_production_material_status_secure(v_receipt1,'close');
 select coalesce(sum(quantity_delta),0) into v_amount
 from app_private.wms_production_wip_entry where work_order_id=v_wo.id;
 if v_amount<>0 then raise exception 'Close before posting expected 0, got %',v_amount; end if;

 -- The same ledger must participate in the actual finished receipt and return RPCs.
 -- Keep the posted synthetic return: posted source quantities are immutable.
 v_denied:=false;
 begin
   update public.wms_production_material_line
   set movement_id=null,fulfilled_quantity=0 where id=v_finished_return_line;
 exception when check_violation then v_denied:=true;
 end;
 if not v_denied then raise exception 'Posted finished return was rewritable'; end if;
 update public.mdm_document_type set production_wip_deduction_timing='inbound_approval'
 where id=v_wo.work_order_type_id and tenant_id=v_wo.tenant_id;
 select bin.id,zone.category_id into strict v_bin_id,v_zone_category_id
 from public.mdm_warehouse_bin bin
 join public.mdm_warehouse_zone zone
   on zone.id=bin.zone_id and zone.tenant_id=bin.tenant_id
 where bin.tenant_id=v_wo.tenant_id and bin.warehouse_id=v_warehouse
   and bin.status='available' and zone.status='enabled' and not zone.abnormal
   and bin.fixed_material_id is null and bin.max_quantity is null
   and bin.max_area_sqm is null and bin.max_weight_kg is null
 order by bin.id limit 1;
 update public.mes_work_order set inbound_warehouse_id=v_warehouse
 where id=v_wo.id and tenant_id=v_wo.tenant_id;
 update public.mdm_material set inbound_warehouse_id=v_warehouse,
   category_id=v_zone_category_id
 where id=v_wo.material_id and tenant_id=v_wo.tenant_id;
 -- Exceed the earlier synthetic finished return while keeping this real cycle partial.
 v_real_quantity:=v_wo.order_quantity/4+1;
 insert into public.wms_production_material_document
 (tenant_id,kind,document_no,document_type_id,business_type_id,
 organization_id,warehouse_id,work_order_id,project_id,status,created_by)
 values(v_wo.tenant_id,'finished_inbound','QA-WIP-REAL-IN-'||gen_random_uuid(),
 v_receipt_type,v_receipt_business,v_wo.organization_id,v_warehouse,
 v_wo.id,v_wo.project_id,'submitted',v_actor)
 returning id into v_real_receipt;
 insert into public.wms_production_material_line
 (tenant_id,document_id,line_no,material_id,inventory_unit_id,
 requested_quantity,actual_quantity,warehouse_id,bin_id,stock_type,stock_status,
 work_order_id,project_id,construction_no,batch_no)
 values(v_wo.tenant_id,v_real_receipt,10,v_wo.material_id,v_material_unit,
 v_real_quantity,v_real_quantity,v_warehouse,v_bin_id,'normal','available',v_wo.id,
 v_wo.project_id,v_wo.construction_no,'QA-WIP-REAL-ROLLBACK')
 returning id into v_real_receipt_line;
 perform public.wms_change_production_material_status_secure(v_real_receipt,'approve');
 select coalesce(sum(quantity_delta),0) into v_approved_amount
 from app_private.wms_production_wip_entry where work_order_id=v_wo.id;
 if v_approved_amount<=0 or v_approved_amount>=3.5 then
   raise exception 'Real receipt approval did not deduct proportional WIP';
 end if;
 perform public.wms_push_production_material_secure(v_real_receipt,null);
 select movement.target_batch_id into strict v_real_batch
 from public.wms_production_material_line line
 join public.wms_inventory_movement movement on movement.id=line.movement_id
 where line.id=v_real_receipt_line;
 select coalesce(sum(quantity_delta),0) into v_amount
 from app_private.wms_production_wip_entry where work_order_id=v_wo.id;
 if v_amount<>v_approved_amount then
   raise exception 'Stock posting repeated the approval-time WIP deduction';
 end if;
 insert into public.wms_production_material_document
 (tenant_id,kind,document_no,document_type_id,business_type_id,
 organization_id,warehouse_id,work_order_id,project_id,status,created_by)
 values(v_wo.tenant_id,'finished_return','QA-WIP-REAL-RETURN-'||gen_random_uuid(),
 v_finished_return_type,v_finished_return_business,v_wo.organization_id,
 v_warehouse,v_wo.id,v_wo.project_id,'submitted',v_actor)
 returning id into v_real_return;
 insert into public.wms_production_material_line
 (tenant_id,document_id,line_no,material_id,inventory_unit_id,
 requested_quantity,actual_quantity,warehouse_id,bin_id,stock_type,stock_status,
 source_batch_id,source_line_id,work_order_id,project_id,construction_no,batch_no)
 values(v_wo.tenant_id,v_real_return,10,v_wo.material_id,v_material_unit,
 -v_real_quantity,-v_real_quantity,v_warehouse,v_bin_id,'normal','available',v_real_batch,
 v_real_receipt_line,v_wo.id,v_wo.project_id,v_wo.construction_no,
 'QA-WIP-REAL-ROLLBACK');
 perform public.wms_change_production_material_status_secure(v_real_return,'approve');
 perform public.wms_push_production_material_secure(v_real_return,null);
 select coalesce(sum(quantity_delta),0) into v_amount
 from app_private.wms_production_wip_entry where work_order_id=v_wo.id;
 if v_amount<>0 or exists(select 1 from public.wms_inventory_batch
   where id=v_real_batch and quantity<>0) then
   raise exception 'Real finished return did not reverse WIP or stock';
 end if;
end $test$;


do $security$
declare
 v_wo public.mes_work_order%rowtype;
 v_actor uuid;
 v_ordinary uuid;
 v_role uuid;
 v_menu uuid;
 v_other_tenant uuid;
 v_issue_line uuid;
 v_page jsonb;
 v_history jsonb;
 v_denied boolean;
begin
 select wo.* into strict v_wo
 from public.mes_work_order wo
 where exists (
   select 1 from public.wms_production_material_line l
   join public.wms_production_material_document d on d.id=l.document_id
   where d.kind='issue' and l.movement_id is not null
     and coalesce(l.work_order_id,d.work_order_id)=wo.id
 )
 order by wo.id limit 1;
 select l.id into strict v_issue_line
 from public.wms_production_material_line l
 join public.wms_production_material_document d on d.id=l.document_id
 where d.kind='issue' and l.movement_id is not null
   and coalesce(l.work_order_id,d.work_order_id)=v_wo.id
 order by l.id limit 1;
 select u.auth_user_id into strict v_actor from public.sys_user u
 join public.sys_role role on role.tenant_id=u.tenant_id and role.role_code=any(u.user_roles)
 where role.builtin_type='platform_super' and u.system_protected and u.status='1'
 limit 1;
 select id into strict v_other_tenant from public.sys_tenant
 where id<>v_wo.tenant_id order by id limit 1;
 select u.auth_user_id,role.id into strict v_ordinary,v_role
 from public.sys_user u
 join public.sys_role role on role.tenant_id=u.tenant_id
   and role.role_code=any(u.user_roles) and role.enabled
 where u.tenant_id=v_wo.tenant_id and u.status='1'
   and u.user_type='2' and u.auth_user_id is not null
   and role.builtin_type is distinct from 'platform_super'
 order by u.id limit 1;
 select id into strict v_menu from public.sys_menu
 where name='WmsProjectReport:View' and type='button' limit 1;
 if not exists(select 1 from public.sys_role_menu
 where tenant_id=v_wo.tenant_id and role_id=v_role and menu_id=v_menu) then
   insert into public.sys_role_menu(tenant_id,role_id,menu_id,create_by)
   values(v_wo.tenant_id,v_role,v_menu,'system');
 end if;
 if has_table_privilege('authenticated',
   'app_private.wms_production_wip_entry','SELECT')
 or has_table_privilege('anon',
   'app_private.wms_production_wip_source','SELECT')
 or has_function_privilege('authenticated',
   'app_private.wms_reconcile_production_wip_internal(uuid,uuid,uuid,uuid,text)','EXECUTE')
 then raise exception 'Private WIP objects are directly accessible'; end if;

 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_actor,'role','authenticated')::text,true);
 perform set_config('request.headers','{}',true);
 v_page:=public.wms_project_material_wip_page_secure(v_wo.project_id,null,null,0,20);
 if (v_page->>'total')::integer < 2 then
   raise exception 'Platform all-tenant page omitted posted issue lines';
 end if;
 v_history:=public.wms_production_wip_history_secure(v_issue_line);
 if jsonb_array_length(v_history)=0 then
   raise exception 'Audit history was not returned for issued line';
 end if;
 v_denied:=false;
 begin
   perform public.wms_project_material_wip_page_secure(v_wo.project_id,null,null,0,null);
 exception when invalid_parameter_value then v_denied:=true;
 end;
 if not v_denied then raise exception 'Null page limit was accepted'; end if;
 v_denied:=false;
 begin
   perform public.wms_project_material_wip_page_secure(v_wo.project_id,null,null,null,20);
 exception when invalid_parameter_value then v_denied:=true;
 end;
 if not v_denied then raise exception 'Null page offset was accepted'; end if;
 perform set_config('request.headers',
   jsonb_build_object('x-art-tenant-scope',v_other_tenant)::text,true);
 v_denied:=false;
 begin
   perform public.wms_project_material_wip_page_secure(v_wo.project_id,null,null,0,20);
 exception when insufficient_privilege or invalid_parameter_value then v_denied:=true;
 end;
 if not v_denied then raise exception 'Platform-selected foreign tenant could read WIP'; end if;

 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_ordinary,'role','authenticated')::text,true);
 perform set_config('request.headers','{}',true);
 v_page:=public.wms_project_material_wip_page_secure(v_wo.project_id,null,null,0,20);
 if (v_page->>'total')::integer < 2 then
   raise exception 'Ordinary own-tenant page omitted posted issues';
 end if;
 perform set_config('request.headers',
   jsonb_build_object('x-art-tenant-scope',v_other_tenant)::text,true);
 v_page:=public.wms_project_material_wip_page_secure(v_wo.project_id,null,null,0,20);
 if (v_page->>'total')::integer < 2 then
   raise exception 'Forged header hid ordinary own-tenant WIP';
 end if;
 v_history:=public.wms_production_wip_history_secure(v_issue_line);
 if jsonb_array_length(v_history)=0 then
   raise exception 'Ordinary own-tenant audit history not returned';
 end if;
 perform set_config('request.jwt.claims','{}',true);
 v_denied:=false;
 begin
   perform public.wms_project_material_wip_page_secure(v_wo.project_id,null,null,0,20);
 exception when insufficient_privilege then v_denied:=true;
 end;
 if not v_denied then raise exception 'Anonymous read WIP'; end if;
end $security$;

-- Exercise the editable work-order-type setting through the ordinary role and RLS.
do $grant_wip_setting$
declare
  v_tenant_id uuid;
  v_type_id uuid;
  v_other_type_id uuid;
  v_other_tenant_id uuid;
  v_user_id uuid;
  v_role_id uuid;
  v_menu_id uuid;
  v_permission text;
begin
  select wo.tenant_id,wo.work_order_type_id into strict v_tenant_id,v_type_id
  from public.mes_work_order wo
  where exists (
    select 1 from public.wms_production_material_line line
    join public.wms_production_material_document doc on doc.id=line.document_id
    where doc.kind='issue' and line.movement_id is not null
      and coalesce(line.work_order_id,doc.work_order_id)=wo.id
  ) order by wo.id limit 1;
  select u.auth_user_id,role.id into strict v_user_id,v_role_id
  from public.sys_user u
  join public.sys_role role on role.tenant_id=u.tenant_id
    and role.role_code=any(u.user_roles) and role.enabled
  where u.tenant_id=v_tenant_id and u.status='1'
    and u.user_type='2' and u.auth_user_id is not null
    and role.builtin_type is distinct from 'platform_super'
  order by u.id limit 1;
  select id,tenant_id into strict v_other_type_id,v_other_tenant_id
  from public.mdm_document_type where tenant_id<>v_tenant_id
  order by tenant_id,id limit 1;
  foreach v_permission in array array['MdmDocumentType:View','MdmDocumentType:Edit'] loop
    select id into strict v_menu_id from public.sys_menu
    where name=v_permission and type='button' limit 1;
    if not exists(select 1 from public.sys_role_menu
      where tenant_id=v_tenant_id and role_id=v_role_id and menu_id=v_menu_id) then
      insert into public.sys_role_menu(tenant_id,role_id,menu_id,create_by)
      values(v_tenant_id,v_role_id,v_menu_id,'system');
    end if;
  end loop;
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',v_user_id,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  perform set_config('app.wip_test_type_id',v_type_id::text,true);
  perform set_config('app.wip_test_other_type_id',v_other_type_id::text,true);
  perform set_config('app.wip_test_other_tenant_id',v_other_tenant_id::text,true);
end $grant_wip_setting$;

set local role authenticated;
do $ordinary_wip_setting$
declare
  v_type_id uuid;
  v_previous text;
  v_current text;
begin
  v_type_id:=current_setting('app.wip_test_type_id')::uuid;
  select production_wip_deduction_timing into strict v_previous
  from public.mdm_document_type where id=v_type_id;
  update public.mdm_document_type set production_wip_deduction_timing='none'
  where id=v_type_id;
  if not found then raise exception 'Ordinary user could not save own-tenant WIP timing'; end if;
  select production_wip_deduction_timing into strict v_current
  from public.mdm_document_type where id=v_type_id;
  if v_current<>'none' then raise exception 'WIP timing save was not visible to ordinary user'; end if;
  perform set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope',
      current_setting('app.wip_test_other_tenant_id'))::text,true);
  update public.mdm_document_type set production_wip_deduction_timing='none'
  where id=current_setting('app.wip_test_other_type_id')::uuid;
  if found then raise exception 'Forged tenant header edited a foreign WIP setting'; end if;
  perform set_config('request.headers','{}',true);
  update public.mdm_document_type set production_wip_deduction_timing=v_previous
  where id=v_type_id;
end $ordinary_wip_setting$;
reset role;

rollback;

