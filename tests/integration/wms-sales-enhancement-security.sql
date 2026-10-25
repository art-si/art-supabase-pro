-- Run against the configured project; all fixtures and role changes roll back.
begin;
do $test$
declare
 super_id uuid; u public.sys_user%rowtype; r public.sys_role%rowtype;
 d public.wms_sales_document%rowtype; l jsonb; source_id uuid; line_id uuid;
 return_id uuid; return_type uuid; return_business uuid; result jsonb; invoice_id uuid;
 other uuid; payload jsonb; remain numeric;
 b public.wms_inventory_batch%rowtype;
begin
 select x.auth_user_id into strict super_id from public.sys_user x join public.sys_role s on s.tenant_id=x.tenant_id and s.role_code=any(x.user_roles)
 where s.builtin_type='platform_super' and x.system_protected and x.status='1' limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',super_id,'role','authenticated')::text,true);
 perform set_config('request.headers','{}',true);
 select * into strict b from public.wms_inventory_batch where id='afe16e97-8462-4d7f-805d-6fe8430b4c18';
 select * into strict d from public.wms_sales_document where kind='outbound' and status='approved' and tenant_id=b.tenant_id limit 1;
 select to_jsonb(x) into strict l from public.wms_sales_document_line x join public.mdm_material m on m.id=x.material_id where x.document_id=d.id and not m.serial_management_enabled limit 1;
 l:=l||jsonb_build_object('quantity',4,'stock_batch_id',b.id,'source_document_id',null,'source_line_id',null,
 'material_id',b.material_id,'inventory_unit_id',b.display_unit_id,'base_unit_id',b.display_unit_id,
 'warehouse_id',b.warehouse_id,'bin_id',b.bin_id,'batch_no',b.batch_no,'project_id',b.project_id,'construction_no',b.construction_no,
 'stock_type',b.stock_type,'stock_status','available','owner_type',b.owner_type,'owner_id',b.owner_id);
 source_id:=public.wms_save_sales_document_secure((to_jsonb(d)-'id')||jsonb_build_object('business_date',current_date,'lines',jsonb_build_array(l,l)));
 perform public.wms_change_sales_document_status_secure(source_id,'submit');
 perform public.wms_change_sales_document_status_secure(source_id,'approve');
 select id into strict line_id from public.wms_sales_document_line where document_id=source_id order by line_no limit 1;
 select document_type_id,business_type_id into strict return_type,return_business from public.wms_sales_document where kind='return' limit 1;
 payload:=(to_jsonb(d)-'id')||jsonb_build_object('kind','return','business_date',current_date,'document_type_id',return_type,'business_type_id',return_business,
 'lines',jsonb_build_array(l||jsonb_build_object('quantity',1,'return_type','return','source_document_id',source_id,'source_line_id',line_id)));
 return_id:=public.wms_save_sales_document_secure(payload);
 result:=public.wms_sales_return_remaining_secure(array[source_id]);
 select (value->>'remaining_quantity')::numeric into remain from jsonb_array_elements(result) where value->>'line_id'=line_id::text;
 if remain<>3 then raise exception 'partial return remainder incorrect: %',remain;end if;
 begin perform public.wms_save_sales_document_secure(payload||jsonb_build_object('lines',jsonb_build_array(l||jsonb_build_object('quantity',4,'return_type','return','source_document_id',source_id,'source_line_id',line_id))));raise exception 'over-return allowed';exception when check_violation then null;end;
 perform public.wms_change_sales_document_status_secure(return_id,'submit');
 perform public.wms_change_sales_document_status_secure(return_id,'approve');
 result:=public.wms_push_sales_invoice_secure('ordinary',jsonb_build_array(jsonb_build_object('document_id',source_id,'line_ids',jsonb_build_array(line_id))));
 invoice_id:=(result->>0)::uuid;
 if (select count(*) from public.wms_sales_invoice_line where document_id=invoice_id)<>1 then raise exception 'line push selected wrong rows';end if;
 begin perform public.wms_push_sales_invoice_secure('special',jsonb_build_array(jsonb_build_object('document_id',source_id,'line_ids',jsonb_build_array(line_id))));raise exception 'duplicate invoicing allowed';exception when check_violation then null;end;
 perform public.wms_push_sales_invoice_secure('special',jsonb_build_array(jsonb_build_object('document_id',source_id,'line_ids',null)));
 result:=public.wms_push_sales_invoice_secure('ordinary',jsonb_build_array(jsonb_build_object('document_id',return_id,'line_ids',null)));
 if not exists(select 1 from public.wms_sales_invoice i join public.wms_sales_invoice_line x on x.document_id=i.id where i.id=(result->>0)::uuid and i.red_letter and x.quantity<0 and x.amount<0 and x.tax_amount<0 and x.total_amount=x.amount+x.tax_amount) then raise exception 'red invoice signs incorrect';end if;
 if not exists(select 1 from public.get_record_delete_dependency_details('wms_sales_document',array[source_id::text],null) where source_table='wms_sales_invoice') then raise exception 'invoice dependency missing';end if;
 select id into strict other from public.sys_tenant where id<>d.tenant_id limit 1;
 select * into strict u from public.sys_user x where x.tenant_id=d.tenant_id and x.auth_user_id is not null and x.status='1' and x.deleted_at is null and not exists(select 1 from public.sys_role s where s.tenant_id=x.tenant_id and s.role_code=any(x.user_roles) and s.builtin_type='platform_super') limit 1;
 select * into strict r from public.sys_role where tenant_id=d.tenant_id and enabled and builtin_type is distinct from 'platform_super' limit 1;
 insert into public.sys_role_menu(role_id,menu_id,tenant_id,create_by) select r.id,m.id,r.tenant_id,'rollback verification' from public.sys_menu m where m.name in ('WmsSalesInvoice:View','WmsSalesInvoice:Add','WmsSalesInvoice:Edit','WmsSalesOutbound:View','WmsSalesOutbound:Push','WmsSalesReturnDocument:View','WmsSalesReturnDocument:Add') on conflict do nothing;
 update public.sys_user set user_roles=array[r.role_code] where id=u.id;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u.auth_user_id,'role','authenticated')::text,true);
 perform set_config('request.headers','{}',true);
 perform public.wms_edit_sales_invoice_secure(invoice_id,current_date,'ordinary own tenant');
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other)::text,true);
 perform public.wms_edit_sales_invoice_secure(invoice_id,current_date,'forged header retains own tenant');
 begin perform public.wms_sales_choices_secure('stock',other,d.organization_id);raise exception 'ordinary cross-tenant read allowed';exception when insufficient_privilege then null;end;
 execute 'set local role authenticated';
 if (select count(*) from public.wms_sales_invoice where id=invoice_id)<>1 then raise exception 'ordinary own RLS read failed';end if;
 execute 'reset role';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',super_id,'role','authenticated')::text,true);
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other)::text,true);
 execute 'set local role authenticated';
 if exists(select 1 from public.wms_sales_invoice where id=invoice_id) then raise exception 'selected tenant RLS leaked';end if;
 execute 'reset role';
 begin perform public.wms_edit_sales_invoice_secure(invoice_id,current_date,'cross selected');raise exception 'selected cross-tenant write allowed';exception when insufficient_privilege then null;end;
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',d.tenant_id)::text,true);
 execute 'set local role authenticated';
 if (select count(*) from public.wms_sales_invoice where id=invoice_id)<>1 then raise exception 'selected own RLS read failed';end if;
 execute 'reset role';
 perform set_config('request.headers','{}',true);
 perform public.wms_edit_sales_invoice_secure(invoice_id,current_date,'platform all existing-row edit');
 execute 'set local role authenticated';
 if (select count(*) from public.wms_sales_invoice where id=invoice_id)<>1 then raise exception 'platform all RLS read failed';end if;
 execute 'reset role';
 perform set_config('request.jwt.claims','{}',true);
 begin perform public.wms_push_sales_invoice_secure('ordinary','[]');raise exception 'anonymous write allowed';exception when insufficient_privilege then null;end;
end $test$;
rollback;
