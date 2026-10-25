-- Incomplete source master data must disable its own row without failing the picker.
begin;
do $test$
declare super_id uuid;source record;warehouse record;result jsonb;
begin
 select u.auth_user_id into strict super_id from public.sys_user u join public.sys_role r on r.tenant_id=u.tenant_id and r.role_code=any(u.user_roles) where r.builtin_type='platform_super' and u.system_protected and u.status='1' limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',super_id,'role','authenticated')::text,true);
 perform set_config('request.headers','{}',true);
 select d.tenant_id,d.id as document_id,m.id as material_id,l->>'sales_unit' as sales_unit into strict source
 from public.scm_sales_document d cross join lateral jsonb_array_elements(d.lines) l
 join public.mdm_material m on m.id=(l->>'material_id')::uuid and m.tenant_id=d.tenant_id
 where d.kind='sales_order' and d.status in ('approved','effective','fulfilling','shipped','APRV','PRUN','PDEL','FDEL') and m.inventory_unit_id is null limit 1;
 select id,organization_id into strict warehouse from public.mdm_warehouse where tenant_id=source.tenant_id and status='enabled' limit 1;
 result:=public.wms_sales_choices_secure('sales_order',source.tenant_id,warehouse.organization_id,warehouse.id,null,100,0,null);
 if not exists(select 1 from jsonb_array_elements(result->'data') x where x->>'source_document_id'=source.document_id::text and (x->>'selection_disabled')::boolean and nullif(x->>'selection_hint','') is not null and (x->>'deliverable_quantity')::numeric=0) then raise exception 'incomplete source row was not visibly disabled';end if;
 begin perform app_private.wms_sales_inventory_factor(source.material_id,source.sales_unit);raise exception 'invalid source was allowed by strict write conversion';exception when check_violation then null;end;
 if has_function_privilege('anon','app_private.wms_sales_inventory_factor_for_choice(uuid,text)','execute') then raise exception 'anonymous conversion access';end if;
end $test$;
rollback;
