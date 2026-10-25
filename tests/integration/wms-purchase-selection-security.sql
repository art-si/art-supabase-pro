-- Run after the enhancement schema exists. Identity and role changes are rolled back.
begin;
do $test$
declare super_id uuid; own_user public.sys_user%rowtype; own_role public.sys_role%rowtype; d public.wms_purchase_document%rowtype; other uuid; value jsonb; result_id uuid; fixture_line jsonb; fixture_id uuid;
begin
 select x.auth_user_id into strict super_id from public.sys_user x join public.sys_role r on r.tenant_id=x.tenant_id and r.role_code=any(x.user_roles)
 where r.builtin_type='platform_super' and x.system_protected and x.status='1' limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',super_id,'role','authenticated')::text,true);
 perform set_config('request.headers','{}',true);
 -- Create an isolated source instead of consuming an existing unpushed business record.
 select * into strict d from public.wms_purchase_document where kind='purchase_inbound' and status='approved' limit 1;
 select to_jsonb(l) into strict fixture_line from public.wms_purchase_document_line l join public.mdm_material m on m.id=l.material_id
 where l.document_id=d.id and not m.serial_management_enabled limit 1;
 fixture_line:=fixture_line||jsonb_build_object('quantity',1,'project_id',null,'construction_no',null,'source_order_target_line_id',null,'source_batch_id',null,'source_document',null,'source_line_no',null,'serial_nos','[]'::jsonb,'batch_no','QA-SECURITY-'||gen_random_uuid());
 fixture_id:=public.wms_save_purchase_document_secure((to_jsonb(d)-'id')||jsonb_build_object('business_date',current_date,'lines',jsonb_build_array(fixture_line)));
 perform public.wms_change_purchase_document_status_secure(fixture_id,'submit');
 perform public.wms_change_purchase_document_status_secure(fixture_id,'approve');
 select * into strict d from public.wms_purchase_document where id=fixture_id;
 select id into strict other from public.sys_tenant where id<>d.tenant_id limit 1;
 select * into strict own_user from public.sys_user u where u.tenant_id=d.tenant_id and u.auth_user_id is not null and u.status='1' and u.deleted_at is null and not exists(select 1 from public.sys_role r where r.tenant_id=u.tenant_id and r.role_code=any(u.user_roles) and r.builtin_type='platform_super') limit 1;
 select * into strict own_role from public.sys_role where tenant_id=d.tenant_id and enabled and builtin_type is distinct from 'platform_super' limit 1;
 insert into public.sys_role_menu(role_id,menu_id,tenant_id,create_by) select own_role.id,m.id,own_role.tenant_id,'rollback verification' from public.sys_menu m where m.name in ('WmsPurchaseInbound:View','WmsPurchaseInbound:Push','WmsPurchaseInbound:Add','WmsPurchaseReturn:Add','ScmPurchaseOrder:View','FinanceEstimatedPayable:View','FinancePurchasePayable:View') and not exists(select 1 from public.sys_role_menu x where x.role_id=own_role.id and x.menu_id=m.id);
 update public.sys_user set user_roles=array[own_role.role_code] where id=own_user.id;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',own_user.auth_user_id,'role','authenticated')::text,true);
 perform set_config('request.headers','{}',true);
 value:=public.wms_push_purchase_payables_secure('estimated',jsonb_build_array(jsonb_build_object('document_id',d.id,'line_ids',null)));
 result_id:=(value->0->>'id')::uuid;
 if result_id is null then raise exception 'ordinary own payable push failed'; end if;
 value:=public.fms_purchase_payable_list_secure('estimated','',result_id);
 if (value->>'total')::integer<>1 then raise exception 'ordinary own payable read failed'; end if;
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other)::text,true);
 if (public.fms_purchase_payable_list_secure('estimated','',result_id)->>'total')::integer<>1 then raise exception 'forged header changed ordinary tenant'; end if;
 begin perform public.wms_purchase_source_picker_secure('purchase_order',other,d.supplier_id,null); raise exception 'cross tenant source picker allowed'; exception when insufficient_privilege then null; end;
 begin perform public.wms_purchase_return_stock_picker_secure(other,d.organization_id,(select warehouse_id from public.wms_purchase_document_line where document_id=d.id limit 1)); raise exception 'cross tenant stock picker allowed'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',super_id,'role','authenticated')::text,true);
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',d.tenant_id)::text,true);
 if (public.fms_purchase_payable_list_secure('estimated','',result_id)->>'total')::integer<>1 then raise exception 'selected own payable missing'; end if;
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other)::text,true);
 if (public.fms_purchase_payable_list_secure('estimated','',result_id)->>'total')::integer<>0 then raise exception 'selected scope leaked payable'; end if;
 begin perform public.wms_push_purchase_payables_secure('financial',jsonb_build_array(jsonb_build_object('document_id',d.id,'line_ids',null))); raise exception 'selected cross tenant push allowed'; exception when insufficient_privilege then null; end;
 perform set_config('request.headers','{}',true);
 if (public.fms_purchase_payable_list_secure('estimated','',result_id)->>'total')::integer<>1 then raise exception 'all tenant payable missing'; end if;
 perform set_config('request.jwt.claims','{}',true);
 begin perform public.wms_purchase_source_picker_secure('purchase_order',d.tenant_id,d.supplier_id,null); raise exception 'anonymous source picker allowed'; exception when insufficient_privilege then null; end;
 begin perform public.wms_purchase_return_stock_picker_secure(d.tenant_id,d.organization_id,(select warehouse_id from public.wms_purchase_document_line where document_id=d.id limit 1)); raise exception 'anonymous stock picker allowed'; exception when insufficient_privilege then null; end;
end $test$;
rollback;
