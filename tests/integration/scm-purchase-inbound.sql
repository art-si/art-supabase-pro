-- Run with the linked project's SQL query tool. Every fixture and role change rolls back.
begin;
do $test$
declare
  v_super uuid; v_user public.sys_user%rowtype; v_role public.sys_role%rowtype;
  v_template public.scm_purchase_document%rowtype;
  v_order uuid:=gen_random_uuid(); v_notice uuid:=gen_random_uuid();
  v_order_line uuid:=gen_random_uuid(); v_notice_line uuid:=gen_random_uuid();
  v_other uuid; v_cross_order uuid:=gen_random_uuid(); v_line jsonb; v_target jsonb; v_again jsonb; v_unit text;
  v_wms public.wms_purchase_document%rowtype; v_stock_line jsonb; v_payload jsonb;
  v_inbound uuid; v_second uuid; v_return uuid; v_over uuid; v_target_line uuid; v_batch uuid; v_unit_id uuid;
begin
  select u.auth_user_id into strict v_super from public.sys_user u
  join public.sys_role r on r.tenant_id=u.tenant_id and r.role_code=any(u.user_roles)
  where r.builtin_type='platform_super' and u.system_protected and u.status='1' limit 1;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_super,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  select * into strict v_template from public.scm_purchase_document where kind='purchase_order'
    and jsonb_array_length(lines)>0 and supplier_id is not null limit 1;
  v_template.project_id:=null;
  v_line:=(v_template.lines->0)-array['source_purchase_document_id','source_line_id',
    'source_document_no','source_line_no','pricing_contract_id','pricing_contract_line_id',
    'purchase_contract_id','purchase_contract_line_id','source_snapshot','source_sales_document_id',
    'quotation_line_id','contract_no','contract_line_no'];
  v_line:=v_line||jsonb_build_object('line_id',v_order_line,'line_no',10,'quantity',100,
    'base_quantity',round((v_line->>'base_quantity')::numeric*100/(v_line->>'quantity')::numeric,3),
    'auxiliary_quantity',round((v_line->>'auxiliary_quantity')::numeric*100/(v_line->>'quantity')::numeric,3),
    'auxiliary_quantity_2',round((v_line->>'auxiliary_quantity_2')::numeric*100/(v_line->>'quantity')::numeric,3),
    'unit_price',5,'tax_inclusive_unit_price',5.65,'tax_rate',13,'discount_rate',0,'gift',false);
  insert into public.scm_purchase_document(id,tenant_id,kind,document_no,project_id,supplier_id,lines)
  values(v_order,v_template.tenant_id,'purchase_order','QA-INBOUND-'||v_order,v_template.project_id,
    v_template.supplier_id,jsonb_build_array(v_line));
  update public.scm_purchase_document set status='submitted' where id=v_order;
  update public.scm_purchase_document set status='approved' where id=v_order;
  if (select count(*) from public.scm_purchase_line_progress_secure(array[v_order]))<>1 then
    raise exception 'platform-all source progress missing'; end if;
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',v_template.tenant_id)::text,true);
  if (select count(*) from public.scm_purchase_line_progress_secure(array[v_order]))<>1 then
    raise exception 'platform-selected source progress missing'; end if;
  select id into strict v_other from public.sys_tenant where id<>v_template.tenant_id limit 1;
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',v_other)::text,true);
  begin
    perform public.scm_purchase_line_progress_secure(array[v_order]);
    raise exception 'platform-selected leaked another tenant';
  exception when insufficient_privilege then null; end;
  perform set_config('request.headers','{}',true);
  v_line:=v_line||jsonb_build_object('line_id',v_notice_line,'quantity',60,
    'source_purchase_document_id',v_order,'source_line_id',v_order_line,
    'source_document_no','QA-INBOUND-'||v_order,'source_line_no',10);
  select coalesce(p.unit_name,b.unit_name,m.basic_unit) into v_unit
    from public.mdm_material m left join public.mdm_unit_of_measure p on p.id=m.purchase_unit_id
    left join public.mdm_unit_of_measure b on b.id=m.base_unit_id
    where m.id=(v_line->>'material_id')::uuid;
  v_line:=v_line||jsonb_build_object('unit',v_unit);
  insert into public.scm_purchase_document(id,tenant_id,kind,document_no,project_id,supplier_id,source_id,lines)
  values(v_notice,v_template.tenant_id,'receipt_notice','QA-NOTICE-'||v_notice,v_template.project_id,
    v_template.supplier_id,v_order,jsonb_build_array(v_line));
  update public.scm_purchase_document set status='submitted' where id=v_notice;
  perform public.scm_purchase_batch_secure('withdraw',jsonb_build_array(jsonb_build_object('document_id',v_notice,'line_ids',null)));
  if (select status from public.scm_purchase_document where id=v_notice)<>'draft' then
    raise exception 'unreferenced receipt withdrawal failed'; end if;
  update public.scm_purchase_document set status='submitted' where id=v_notice;
  if (select delivered_quantity from public.scm_purchase_line_progress_secure(array[v_order]))<>60 then
    raise exception 'receipt delivery aggregation incorrect'; end if;
  v_target:=public.scm_prepare_purchase_inbound_secure(jsonb_build_array(jsonb_build_object('document_id',v_notice,'line_ids',jsonb_build_array(v_notice_line))));
  v_again:=public.scm_prepare_purchase_inbound_secure(jsonb_build_array(jsonb_build_object('document_id',v_notice,'line_ids',jsonb_build_array(v_notice_line))));
  if v_target<>v_again then raise exception 'repeat push should reuse source target'; end if;
  if (select remaining_quantity from public.wms_purchase_order_target_remaining((v_target->0->>'target_id')::uuid))<>60 then
    raise exception 'receipt remaining quantity incorrect'; end if;
  if not exists(select 1 from public.scm_purchase_delete_dependencies_secure(jsonb_build_array(jsonb_build_object('document_id',v_notice,'line_ids',jsonb_build_array(v_notice_line))))) then
    raise exception 'line source reference not reported'; end if;
  begin
    perform public.scm_purchase_batch_secure('withdraw',jsonb_build_array(jsonb_build_object('document_id',v_notice,'line_ids',null)));
    raise exception 'referenced receipt withdrawal allowed';
  exception when foreign_key_violation then null; end;
  begin
    update public.scm_purchase_document set status='completed' where id=v_notice;
    raise exception 'removed receipt confirmation still allowed';
  exception when check_violation then null; end;
  -- Real WMS saves, approval and stock postings: two partial receipts and a batch-linked return.
  update public.mdm_material set inventory_unit_id=coalesce(inventory_unit_id,base_unit_id)
    where id=(v_line->>'material_id')::uuid;
  select * into strict v_wms from public.wms_purchase_document where kind='purchase_inbound'
    and tenant_id=v_template.tenant_id limit 1;
  select to_jsonb(l) into strict v_stock_line from public.wms_purchase_document_line l
    where document_id=v_wms.id limit 1;
  select id into strict v_unit_id from public.mdm_unit_of_measure where tenant_id=v_template.tenant_id
    and unit_name=v_line->>'unit' limit 1;
  select id into strict v_target_line from public.scm_order_target_line
    where target_document_id=(v_target->0->>'target_id')::uuid and source_line_id=v_notice_line;
  v_stock_line:=v_stock_line||jsonb_build_object('line_no',10,'material_id',v_line->>'material_id',
    'project_id',v_template.project_id,'construction_no',null,'inventory_unit_id',v_unit_id,'quantity',3,
    'base_unit_id',(select base_unit_id from public.mdm_material where id=(v_line->>'material_id')::uuid),
    'unit_price',5,'tax_inclusive_unit_price',5.65,'tax_rate',13,'discount_method','none',
    'unit_discount_rate',0,'unit_discount_amount',0,'gift',false,'stock_type','normal',
    'owner_type','self','owner_id',null,'source_batch_id',null,'source_order_target_line_id',v_target_line,
    'batch_no','QA-'||v_notice,'serial_nos','[]'::jsonb,'source_document','QA-NOTICE-'||v_notice,
    'source_line_no','10');
  v_payload:=(to_jsonb(v_wms)-'id')||jsonb_build_object('supplier_id',v_template.supplier_id,
    'business_date',current_date,'lines',jsonb_build_array(v_stock_line));
  v_inbound:=public.wms_save_purchase_document_secure(v_payload);
  perform public.wms_change_purchase_document_status_secure(v_inbound,'submit');
  perform public.wms_change_purchase_document_status_secure(v_inbound,'approve');
  v_second:=public.wms_save_purchase_document_secure(v_payload||jsonb_build_object('lines',
    jsonb_build_array(v_stock_line||jsonb_build_object('quantity',2,'batch_no','QA-SECOND-'||v_notice))));
  perform public.wms_change_purchase_document_status_secure(v_second,'submit');
  perform public.wms_change_purchase_document_status_secure(v_second,'approve');
  if (select received_quantity from public.scm_purchase_line_progress_secure(array[v_order]))<>5
    or (select received_quantity from public.scm_purchase_line_progress_secure(array[v_notice]))<>5 then
    raise exception 'actual partial WMS quantities not mapped to notice and order'; end if;
  select movement.target_batch_id into strict v_batch from public.wms_purchase_document_line l
    join public.wms_inventory_movement movement on movement.id=l.movement_id where l.document_id=v_inbound;
  v_return:=public.wms_save_purchase_document_secure(v_payload||jsonb_build_object('kind','purchase_return',
    'warehouse_id',v_stock_line->'warehouse_id',
    'document_type_id',(select document_type_id from public.wms_purchase_document where kind='purchase_return' and tenant_id=v_wms.tenant_id limit 1),
    'business_type_id',(select business_type_id from public.wms_purchase_document where kind='purchase_return' and tenant_id=v_wms.tenant_id limit 1),
    'lines',jsonb_build_array(v_stock_line||jsonb_build_object('quantity',-1,'source_batch_id',v_batch,
      'source_order_target_line_id',null,'source_document',null,'source_line_no',null))));
  perform public.wms_change_purchase_document_status_secure(v_return,'submit');
  perform public.wms_change_purchase_document_status_secure(v_return,'approve');
  if (select returned_quantity from public.scm_purchase_line_progress_secure(array[v_order]))<>1
    or (select returned_quantity from public.scm_purchase_line_progress_secure(array[v_notice]))<>1 then
    raise exception 'batch-linked actual return not mapped to notice and order'; end if;
  if (select remaining_quantity from public.wms_purchase_order_target_remaining((v_target->0->>'target_id')::uuid))<>55 then
    raise exception 'notice remaining quantity incorrectly deducted returns'; end if;
  v_again:=public.scm_prepare_purchase_inbound_secure(jsonb_build_array(jsonb_build_object('document_id',v_order,'line_ids',null)));
  if (select remaining_quantity from public.wms_purchase_order_target_remaining((v_again->0->>'target_id')::uuid))<>94 then
    raise exception 'order remaining quantity must deduct actual receipts and returns'; end if;
  select id into strict v_target_line from public.scm_order_target_line
    where target_document_id=(v_again->0->>'target_id')::uuid and source_line_id=v_order_line;
  v_over:=public.wms_save_purchase_document_secure(v_payload||jsonb_build_object('lines',
    jsonb_build_array(v_stock_line||jsonb_build_object('quantity',95,'source_order_target_line_id',v_target_line))));
  perform public.wms_change_purchase_document_status_secure(v_over,'submit');
  begin
    perform public.wms_change_purchase_document_status_secure(v_over,'approve');
    raise exception 'direct order inbound ignored previous notice receipts and returns';
  exception when check_violation then null; end;
  -- Ordinary identity: temporarily assign a tenant-local role and only required read rights.
  select u.* into strict v_user from public.sys_user u where u.auth_user_id is not null and u.status='1'
    and u.deleted_at is null and not exists(select 1 from public.sys_role r where r.tenant_id=u.tenant_id
      and r.role_code=any(u.user_roles) and r.builtin_type='platform_super')
    and exists(select 1 from public.scm_purchase_document d where d.tenant_id=u.tenant_id and d.kind='purchase_order')
    and exists(select 1 from public.sys_role r where r.tenant_id=u.tenant_id and r.enabled) limit 1;
  select * into strict v_role from public.sys_role where tenant_id=v_user.tenant_id and enabled
    and builtin_type is distinct from 'platform_super' limit 1;
  insert into public.sys_role_menu(role_id,menu_id,tenant_id,create_by)
    select v_role.id,m.id,v_role.tenant_id,'rollback integration test' from public.sys_menu m
    where m.name in ('ScmPurchaseOrder:View','ScmPurchaseOrder:Push','WmsPurchaseInbound:Add') and not exists(select 1 from public.sys_role_menu rm
      where rm.role_id=v_role.id and rm.menu_id=m.id);
  update public.sys_user set user_roles=array[v_role.role_code] where id=v_user.id;
  insert into public.scm_purchase_document(id,tenant_id,kind,document_no,supplier_id,lines)
    select v_cross_order,s.tenant_id,'purchase_order','QA-CROSS-'||v_cross_order,s.id,'[]'::jsonb
    from public.mdm_supplier s where s.tenant_id<>v_user.tenant_id limit 1;
  if not found then raise exception 'cross tenant supplier fixture unavailable'; end if;
  select * into strict v_template from public.scm_purchase_document where kind='purchase_order'
    and tenant_id=v_user.tenant_id and jsonb_array_length(lines)>0 limit 1;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_user.auth_user_id,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  if (select count(*) from public.scm_purchase_line_progress_secure(array[v_template.id]))<>jsonb_array_length(v_template.lines) then
    raise exception 'ordinary own tenant source progress missing'; end if;
  if v_user.tenant_id<>(select tenant_id from public.scm_purchase_document where id=v_order) then
    raise exception 'ordinary mutation fixture must share source tenant'; end if;
  v_target:=public.scm_prepare_purchase_inbound_secure(jsonb_build_array(jsonb_build_object('document_id',v_order,'line_ids',null)));
  if jsonb_array_length(v_target)<>1 then raise exception 'ordinary own source push failed'; end if;
  select id into strict v_other from public.sys_tenant where id<>v_user.tenant_id limit 1;
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',v_other)::text,true);
  if (select count(*) from public.scm_purchase_line_progress_secure(array[v_template.id]))<>jsonb_array_length(v_template.lines) then
    raise exception 'forged header changed ordinary own tenant reads'; end if;
  v_again:=public.scm_prepare_purchase_inbound_secure(jsonb_build_array(jsonb_build_object('document_id',v_order,'line_ids',null)));
  if v_target<>v_again then raise exception 'forged header changed ordinary own source push'; end if;
  begin
    perform public.scm_purchase_line_progress_secure(array[v_cross_order]);
    raise exception 'ordinary forged header leaked cross tenant source';
  exception when insufficient_privilege then null; end;
  begin
    perform public.scm_prepare_purchase_inbound_secure(jsonb_build_array(jsonb_build_object('document_id',v_cross_order,'line_ids',null)));
    raise exception 'ordinary forged header allowed cross tenant source push';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims','{}',true);
  begin
    perform public.scm_purchase_line_progress_secure(array[v_order]);
    raise exception 'anonymous progress allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.scm_prepare_purchase_inbound_secure(jsonb_build_array(jsonb_build_object('document_id',v_order,'line_ids',null)));
    raise exception 'anonymous push allowed';
  exception when insufficient_privilege then null; end;
end $test$;
rollback;
