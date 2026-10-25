begin;

do $setup$
declare
 tenant constant uuid:='111e83d3-190e-4405-84c8-440d484d13a6';actor constant uuid:='a9eeb9b7-e474-43e3-9cc2-c2f46c0f0ec3';
 role_ident uuid;platform_actor uuid;supplier uuid;material uuid;unit_id uuid;finance_type uuid;application_type uuid;
 term_id uuid;purpose_id uuid;method_id uuid;unused_id uuid;foreign_id uuid;document jsonb;index_value integer;
begin
 if not exists(select 1 from public.sys_tenant where id=tenant and tenant_code='qa-payable-20261022') then raise exception 'Acceptance tenant missing';end if;
 select id into role_ident from public.sys_role where tenant_id=tenant and role_code='QA_AP_ACCEPTANCE_01A15DAD';
 insert into public.sys_role_menu(tenant_id,role_id,menu_id) select tenant,role_ident,id from public.sys_menu where name in('MdmPaymentTerm:Delete','MdmPaymentPurpose:Delete','MdmSettlementMethod:Delete') on conflict do nothing;
 select auth_user_id into platform_actor from public.sys_user where user_roles @>array['R_SUPER'] and auth_user_id is not null limit 1;
 select id into supplier from public.mdm_supplier where tenant_id=tenant limit 1;
 select id,inventory_unit_id into material,unit_id from public.mdm_material where tenant_id=tenant and inventory_unit_id is not null limit 1;
 select id into finance_type from public.mdm_document_type where tenant_id=tenant and document_type_code='AP_FIN_OTHER';
 select id into application_type from public.mdm_document_type where tenant_id=tenant and document_type_code='AP_APP_PURCHASE';
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers','{}',true);
 for index_value in 1..2 loop
  term_id:=public.mdm_save_payment_term_secure(jsonb_build_object('code','DEL_TERM_'||left(gen_random_uuid()::text,20),'name','付款条件引用回归'||index_value,'days',index_value));
  purpose_id:=public.fms_save_payable_reference_secure('purpose',jsonb_build_object('code','DEL_PURPOSE_'||left(gen_random_uuid()::text,20),'name','用途引用回归'||index_value,'business_type','purchase'));
  method_id:=public.fms_save_payable_reference_secure('method',jsonb_build_object('code','DEL_METHOD_'||left(gen_random_uuid()::text,20),'name','结算方式引用回归'||index_value,'category','virtual','cash_method','other'));
  document:=public.fms_save_purchase_payable_secure(jsonb_build_object('kind','financial','business_date',current_date,'document_type_id',finance_type,'supplier_id',supplier,'payment_term_id',term_id,'remark','PRIVATE FINANCE CONTENT','lines',jsonb_build_array(jsonb_build_object('material_id',material,'inventory_unit_id',unit_id,'quantity',1,'unit_price',12345.67,'tax_rate',13))));
  document:=public.fms_save_payable_settlement_secure(jsonb_build_object('kind','application','document_type_id',application_type,'reason','PRIVATE PAYMENT CONTENT','lines',jsonb_build_array(jsonb_build_object('supplier_id',supplier,'purpose_id',purpose_id,'settlement_method_id',method_id,'amount',12345.67,'approved_amount',12345.67,'planned_amount',12345.67))));
 end loop;
 unused_id:=public.mdm_save_payment_term_secure(jsonb_build_object('code','DEL_UNUSED_'||left(gen_random_uuid()::text,20),'name','无引用条件','days',1));
 select id into foreign_id from public.mdm_payment_term where tenant_id<>tenant limit 1;
 perform set_config('qa.delete_foreign_tenant',(select tenant_id::text from public.mdm_payment_term where id=foreign_id),true);
 perform set_config('qa.delete_platform',platform_actor::text,true);perform set_config('qa.delete_unused',unused_id::text,true);perform set_config('qa.delete_foreign',foreign_id::text,true);perform set_config('qa.delete_role',role_ident::text,true);
end $setup$;

set local role authenticated;

do $audit$
declare source_table text;identifiers text[];foreign_id text:=current_setting('qa.delete_foreign');unused_id text:=current_setting('qa.delete_unused');references_json jsonb;blocked boolean;affected integer;
begin
 foreach source_table in array array['mdm_payment_term','mdm_payment_purpose','mdm_settlement_method'] loop
  execute format('select array_agg(id::text) from public.%I where name like $1 and tenant_id=$2',source_table) into identifiers using case source_table when 'mdm_payment_term' then '付款条件引用回归%' when 'mdm_payment_purpose' then '用途引用回归%' else '结算方式引用回归%' end,'111e83d3-190e-4405-84c8-440d484d13a6'::uuid;
  if cardinality(identifiers)<>2 then raise exception 'Two reference fixtures missing';end if;
  perform set_config('request.jwt.claim.sub',current_setting('qa.delete_platform'),true);perform set_config('request.headers','{}',true);
  select jsonb_agg(to_jsonb(reference)) into references_json from public.get_mdm_payable_master_delete_dependencies_secure(source_table,identifiers,null) reference;
  if jsonb_array_length(references_json)<>2 then raise exception 'Platform-all references missing';end if;
  perform set_config('request.headers','{"x-art-tenant-scope":"111e83d3-190e-4405-84c8-440d484d13a6"}',true);
  if (select count(*) from public.get_mdm_payable_master_delete_dependencies_secure(source_table,identifiers,null))<>2 then raise exception 'Platform-selected references missing';end if;
  if source_table='mdm_payment_term' then
   blocked:=false;begin perform public.get_mdm_payable_master_delete_dependencies_secure(source_table,array[foreign_id],null);exception when insufficient_privilege then blocked:=true;end;
   if not blocked then raise exception 'Platform-selected inspection crossed scope';end if;
  end if;
  perform set_config('request.jwt.claim.sub','a9eeb9b7-e474-43e3-9cc2-c2f46c0f0ec3',true);perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',current_setting('qa.delete_foreign_tenant'))::text,true);
  select jsonb_agg(to_jsonb(reference)) into references_json from public.get_mdm_payable_master_delete_dependencies_secure(source_table,identifiers,null) reference;
  if jsonb_array_length(references_json)<>2 or exists(select 1 from jsonb_array_elements(references_json) reference where reference->>'record_status'<>'draft' or reference->>'record_no' is null or reference->>'target_id' is null or reference->>'record_summary'<>'财务资料关联记录') then raise exception 'Ordinary reference identity/status lost';end if;
  if references_json::text like '%PRIVATE %' or references_json::text like '%12345.67%' then raise exception 'Reference reader disclosed finance content';end if;
  blocked:=false;begin perform public.mdm_delete_payable_masters_secure(source_table,identifiers);exception when foreign_key_violation then blocked:=true;end;
  if not blocked then raise exception 'Referenced financial master deleted';end if;
 end loop;
 blocked:=false;begin perform public.mdm_delete_payable_masters_secure('mdm_payment_term',array[unused_id,foreign_id]);exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Mixed-tenant delete accepted';end if;
 blocked:=false;begin perform public.get_mdm_payable_master_delete_dependencies_secure('mdm_supplier',array[unused_id],null);exception when invalid_parameter_value then blocked:=true;end;
 if not blocked then raise exception 'Unexpected table inspection accepted';end if;
 blocked:=false;begin perform public.get_mdm_payable_master_delete_dependencies_secure('mdm_payment_term',array[unused_id],'invalid_constraint');exception when invalid_parameter_value then blocked:=true;end;
 if not blocked then raise exception 'Unexpected constraint inspection accepted';end if;
 if has_function_privilege('anon','public.mdm_delete_payable_masters_secure(text,text[])','EXECUTE') or has_function_privilege('anon','public.get_mdm_payable_master_delete_dependencies_secure(text,text[],text)','EXECUTE') or has_function_privilege('authenticated','app_private.assert_payable_master_delete_access(text,text[])','EXECUTE') then raise exception 'Master deletion private/anonymous execution exposed';end if;
 affected:=public.mdm_delete_payable_masters_secure('mdm_payment_term',array[unused_id]);
 if affected<>1 then raise exception 'Unused term not deleted';end if;
 perform set_config('request.headers','{}',true);
end $audit$;

reset role;
do $permission$
declare source_table text;identifier text;blocked boolean;
begin
 delete from public.sys_role_menu where role_id=current_setting('qa.delete_role')::uuid and menu_id in(select id from public.sys_menu where name in('MdmPaymentTerm:Delete','MdmPaymentPurpose:Delete','MdmSettlementMethod:Delete'));
 foreach source_table in array array['mdm_payment_term','mdm_payment_purpose','mdm_settlement_method'] loop
  execute format('select id::text from public.%I where tenant_id=$1 limit 1',source_table) into identifier using '111e83d3-190e-4405-84c8-440d484d13a6'::uuid;
  blocked:=false;begin perform public.mdm_delete_payable_masters_secure(source_table,array[identifier]);exception when insufficient_privilege then blocked:=true;end;
  if not blocked then raise exception 'Missing exact Delete permission accepted';end if;
 end loop;
end $permission$;

do $view_permission$
declare identifier text;blocked boolean;
begin
 insert into public.sys_role_menu(tenant_id,role_id,menu_id) select '111e83d3-190e-4405-84c8-440d484d13a6',current_setting('qa.delete_role')::uuid,id from public.sys_menu where name='MdmPaymentTerm:Delete' on conflict do nothing;
 delete from public.sys_role_menu where role_id=current_setting('qa.delete_role')::uuid and menu_id in(select id from public.sys_menu where name='MdmPaymentTerm:View');
 select id::text into identifier from public.mdm_payment_term where tenant_id='111e83d3-190e-4405-84c8-440d484d13a6' limit 1;
 blocked:=false;begin perform public.get_mdm_payable_master_delete_dependencies_secure('mdm_payment_term',array[identifier],null);exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Delete-only role inspected protected references';end if;
end $view_permission$;

rollback;
