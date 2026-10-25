begin;

do $setup$
declare
 tenant constant uuid:='111e83d3-190e-4405-84c8-440d484d13a6';actor constant uuid:='a9eeb9b7-e474-43e3-9cc2-c2f46c0f0ec3';
 platform_actor uuid;foreign_type uuid;menu uuid;target_type uuid;type_id uuid;type_ids uuid[]:='{}';unused_type uuid;
 supplier uuid;material uuid;unit_id uuid;document jsonb;document_numbers text[]:='{}';role_ident uuid;role_code text:='QA_DELETE_'||upper(left(gen_random_uuid()::text,8));index_value integer;
begin
 if not exists(select 1 from public.sys_tenant where id=tenant and tenant_code='qa-payable-20261022') or not exists(select 1 from public.sys_user where auth_user_id=actor and tenant_id=tenant and not system_protected) then raise exception 'Isolated acceptance tenant missing';end if;
 select auth_user_id into platform_actor from public.sys_user where user_roles @>array['R_SUPER'] and auth_user_id is not null limit 1;
 select id into foreign_type from public.mdm_document_type where tenant_id<>tenant limit 1;
 select id into menu from public.sys_menu where name='FinanceEstimatedPayable';
 select id into target_type from public.mdm_document_type where tenant_id=tenant and document_type_code='AP_FIN_OTHER';
 select id into supplier from public.mdm_supplier where tenant_id=tenant limit 1;
 select id,inventory_unit_id into material,unit_id from public.mdm_material where tenant_id=tenant and inventory_unit_id is not null limit 1;
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers','{}',true);
 for index_value in 1..2 loop
  insert into public.mdm_document_type(tenant_id,menu_id,document_type_code,document_type_name,financial_payable_type_id) values(tenant,menu,'QA_DEL_'||upper(replace(gen_random_uuid()::text,'-','')),'删除引用回归类型'||index_value,target_type) returning id into type_id;
  type_ids:=array_append(type_ids,type_id);
  document:=public.fms_save_purchase_payable_secure(jsonb_build_object('kind','estimated','tenant_id',tenant,'document_type_id',type_id,'supplier_id',supplier,'business_date',current_date,'remark','PRIVATE REFERENCE CONTENT','lines',jsonb_build_array(jsonb_build_object('material_id',material,'inventory_unit_id',unit_id,'quantity',1,'unit_price',12345.67,'tax_rate',13))));
  document_numbers:=array_append(document_numbers,document->>'document_no');
 end loop;
 insert into public.mdm_document_type(tenant_id,menu_id,document_type_code,document_type_name,financial_payable_type_id) values(tenant,menu,'QA_UNUSED_'||upper(replace(gen_random_uuid()::text,'-','')),'无引用删除回归',target_type) returning id into unused_type;
 perform set_config('request.jwt.claim.sub','',true);
 insert into public.sys_role(tenant_id,role_code,role_name,enabled) values(tenant,role_code,'仅单据类型删除检查',true) returning id into role_ident;
 insert into public.sys_role_menu(tenant_id,role_id,menu_id) select tenant,role_ident,id from public.sys_menu where name in('MdmDocumentType:View','MdmDocumentType:Delete');
 update public.sys_user set user_roles=array[role_code] where auth_user_id=actor;
 perform set_config('qa.type_ids',to_jsonb(type_ids)::text,true);perform set_config('qa.type_numbers',to_jsonb(document_numbers)::text,true);
 perform set_config('qa.unused_type',unused_type::text,true);perform set_config('qa.foreign_type',foreign_type::text,true);perform set_config('qa.platform_actor',platform_actor::text,true);perform set_config('qa.delete_role',role_ident::text,true);
 perform set_config('qa.foreign_tenant',(select tenant_id::text from public.mdm_document_type where id=foreign_type),true);
end $setup$;

set local role authenticated;

do $audit$
declare identifiers text[];numbers text[];unused_type text:=current_setting('qa.unused_type');foreign_type text:=current_setting('qa.foreign_type');references_json jsonb;index_value integer;blocked boolean;deleted integer;
begin
 select array_agg(value) into identifiers from jsonb_array_elements_text(current_setting('qa.type_ids')::jsonb);
 select array_agg(value) into numbers from jsonb_array_elements_text(current_setting('qa.type_numbers')::jsonb);
 perform set_config('request.jwt.claim.sub',current_setting('qa.platform_actor'),true);perform set_config('request.headers','{}',true);
 select jsonb_agg(to_jsonb(reference)) into references_json from public.get_mdm_document_type_delete_dependencies_secure(identifiers,null) reference;
 if jsonb_array_length(references_json)<>2 then raise exception 'Platform-all reference check lost owned records';end if;
 perform set_config('request.headers','{"x-art-tenant-scope":"111e83d3-190e-4405-84c8-440d484d13a6"}',true);
 if exists(select 1 from public.get_mdm_document_type_delete_dependencies_secure(array[unused_type],null)) then raise exception 'Selected scope invented unused references';end if;
 blocked:=false;begin perform public.get_mdm_document_type_delete_dependencies_secure(array[foreign_type],null);exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Platform-selected reference inspection crossed scope';end if;
 perform set_config('request.jwt.claim.sub','a9eeb9b7-e474-43e3-9cc2-c2f46c0f0ec3',true);
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',current_setting('qa.foreign_tenant'))::text,true);
 if has_table_privilege('authenticated','public.fms_receivable_document','SELECT') then raise exception 'Protected receivable base table read privilege broadened';end if;
 select jsonb_agg(to_jsonb(reference)) into references_json from public.get_mdm_document_type_delete_dependencies_secure(identifiers,null) reference;
 if jsonb_array_length(references_json)<>2 then raise exception 'Ordinary forged header changed reference scope';end if;
 for index_value in 1..2 loop
  if not exists(select 1 from jsonb_array_elements(references_json) reference where reference->>'resource_id'=identifiers[index_value] and reference->>'record_no'=numbers[index_value] and reference->>'record_status'='draft') then raise exception 'Reference identity/status was lost';end if;
 end loop;
 if references_json::text like '%PRIVATE REFERENCE CONTENT%' or references_json::text like '%12345.67%' or exists(select 1 from jsonb_array_elements(references_json) reference where reference->>'record_summary'<>'单据类型关联记录' or reference?'record_amount') then raise exception 'Reference inspection disclosed financial content';end if;
 if exists(select 1 from public.get_mdm_document_type_delete_dependencies_secure(array[unused_type],null)) then raise exception 'Ordinary unused check failed';end if;
 blocked:=false;begin perform public.get_mdm_document_type_delete_dependencies_secure(array[identifiers[1],foreign_type],null);exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Mixed-tenant reference batch was partially accepted';end if;
 blocked:=false;begin perform public.get_mdm_document_type_delete_dependencies_secure(array['invalid-id'],null);exception when invalid_parameter_value then blocked:=true;end;
 if not blocked then raise exception 'Malformed identifier accepted';end if;
 blocked:=false;begin perform public.get_mdm_document_type_delete_dependencies_secure(array[unused_type],'not_a_type_reference');exception when invalid_parameter_value then blocked:=true;end;
 if not blocked then raise exception 'Foreign constraint accepted';end if;
 blocked:=false;begin delete from public.mdm_document_type where id::text=identifiers[1];exception when foreign_key_violation then blocked:=true;end;
 if not blocked then raise exception 'Business-referenced type was deleted';end if;
 delete from public.mdm_document_type where id::text=unused_type;get diagnostics deleted=row_count;
 if deleted<>1 then raise exception 'Authorized ordinary unused delete did not affect one row';end if;
 if has_function_privilege('anon','public.get_mdm_document_type_delete_dependencies_secure(text[],text)','EXECUTE') then raise exception 'Anonymous reference inspection exposed';end if;
end $audit$;

reset role;

do $no_permission$
declare blocked boolean;identifier text:=current_setting('qa.type_ids')::jsonb->>0;
begin
 perform set_config('request.jwt.claim.sub','',true);
 delete from public.sys_role_menu where role_id=current_setting('qa.delete_role')::uuid and menu_id in(select id from public.sys_menu where name='MdmDocumentType:Delete');
 perform set_config('request.jwt.claim.sub','a9eeb9b7-e474-43e3-9cc2-c2f46c0f0ec3',true);
 blocked:=false;begin perform public.get_mdm_document_type_delete_dependencies_secure(array[identifier],null);exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Missing Delete permission bypassed';end if;
 perform set_config('request.jwt.claim.sub','',true);
 insert into public.sys_role_menu(tenant_id,role_id,menu_id) select role.tenant_id,role.id,menu.id from public.sys_role role join public.sys_menu menu on menu.name='MdmDocumentType:Delete' where role.id=current_setting('qa.delete_role')::uuid;
 delete from public.sys_role_menu where role_id=current_setting('qa.delete_role')::uuid and menu_id in(select id from public.sys_menu where name='MdmDocumentType:View');
 perform set_config('request.jwt.claim.sub','a9eeb9b7-e474-43e3-9cc2-c2f46c0f0ec3',true);
 blocked:=false;begin perform public.get_mdm_document_type_delete_dependencies_secure(array[identifier],null);exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Missing View permission bypassed';end if;
end $no_permission$;

rollback;
