-- Uses the actual save/copy RPCs and final BOM root. Every record and grant rolls back.
begin;

do $test$
declare
  actor uuid; ordinary uuid; ordinary_role uuid; no_permissions uuid; other_tenant uuid;
  template public.mes_work_order%rowtype;
  source_order public.mes_work_order%rowtype;
  actual public.mes_work_order%rowtype;
  isolated_type_id uuid; foreign_material uuid;
  v_field jsonb; expected jsonb := '{}'::jsonb; header jsonb; result jsonb; values_before jsonb;
  fresh_id uuid; second_id uuid; copied_id uuid; referenced_id uuid;
  matched uuid; manual_id uuid; scope_headers text; copied_item jsonb;
  original_ids uuid[]; original_count bigint; original_hash text; case_count integer := 0;
begin
  select array_agg(id),count(*),md5(jsonb_agg(to_jsonb(w) order by id)::text)
  into original_ids,original_count,original_hash from public.mes_work_order w;

  select u.auth_user_id into strict actor
  from public.sys_user u join public.sys_role r
    on r.tenant_id=u.tenant_id and r.role_code=any(u.user_roles)
  where r.builtin_type='platform_super' and u.system_protected and u.status='1'
  limit 1;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);

  select w.* into strict template
  from public.mes_work_order w
  join public.mdm_document_type d on d.id=w.work_order_type_id and d.tenant_id=w.tenant_id and d.enabled
  where w.deleted_at is null
    and (select count(*) from jsonb_array_elements(d.extension_fields) field
      where nullif(field->>'sourceComponentTypeId','') is not null)=3
    and exists (
      select 1 from public.mdm_bom b
      where b.material_id=w.material_id and b.tenant_id=w.tenant_id
        and (b.effective_from is null or b.effective_from<=current_date)
        and (b.effective_to is null or b.effective_to>=current_date)
        and not exists (
          select 1 from jsonb_array_elements(d.extension_fields) field
          where nullif(field->>'sourceComponentTypeId','') is not null
            and not exists(select 1 from public.mdm_bom_item i
              where i.bom_id=b.id and i.tenant_id=b.tenant_id
                and i.component_type_id::text=field->>'sourceComponentTypeId')
        )
    )
  order by w.id limit 1;

  header:=jsonb_build_object(
    'tenant_id',template.tenant_id,'work_order_type_id',template.work_order_type_id,
    'project_id',template.project_id,'construction_no',template.construction_no,
    'material_id',template.material_id,'order_quantity',1,
    'planned_start_date',current_date,'planned_end_date',current_date+7,
    'extension_values',jsonb_build_object('coreMaterial',null,'outerPanel','',
      'film','integration non-BOM value','width',1100,'thickness',50)
  );

  -- Platform-all creation is row-tenant bound and fills all three different component types.
  if app_private.current_read_tenant_id() is not null then raise exception 'Expected platform-all'; end if;
  fresh_id:=public.mes_save_work_order_with_details(null,header,'[]'::jsonb);
  select * into strict source_order from public.mes_work_order where id=fresh_id;
  for v_field in select value from jsonb_array_elements(source_order.extension_schema_snapshot)
    where nullif(value->>'sourceComponentTypeId','') is not null loop
    select i.component_material_id into strict matched
    from public.mdm_bom_item i
    join public.mdm_bom b on b.id=i.bom_id and b.tenant_id=i.tenant_id
    where b.id=(source_order.bom_snapshot#>>'{0,id}')::uuid
      and b.tenant_id=source_order.tenant_id
      and i.component_type_id::text=v_field->>'sourceComponentTypeId'
    order by i.sequence_no,i.id limit 1;
    expected:=expected||jsonb_build_object(v_field->>'key',matched::text);
  end loop;
  if (select count(*) from jsonb_object_keys(expected))<>3 or not source_order.extension_values @> expected then
    raise exception 'Create did not resolve all three BOM component types';
  end if;
  case_count:=case_count+1;

  -- Explicit manual BOM choices remain valid on new/save; unrelated parameters keep their values.
  select (expected->>'outerPanel')::uuid into manual_id;
  header:=jsonb_set(header,'{extension_values,coreMaterial}',to_jsonb(manual_id::text));
  second_id:=public.mes_save_work_order_with_details(null,header,'[]'::jsonb);
  select * into strict actual from public.mes_work_order where id=second_id;
  if actual.extension_values->>'coreMaterial'<>manual_id::text
    or actual.extension_values->>'film'<>'integration non-BOM value' then
    raise exception 'Explicit manual values were overwritten';
  end if;
  case_count:=case_count+1;

  -- Explicit cross-tenant choices are rejected before defaults can conceal an invalid input.
  select id into strict foreign_material from public.mdm_material
    where tenant_id<>template.tenant_id limit 1;
  header:=jsonb_set(header,'{extension_values,coreMaterial}',to_jsonb(foreign_material::text));
  begin
    perform public.mes_save_work_order_with_details(null,header,'[]'::jsonb);
    raise exception 'Cross-tenant manual component was accepted';
  exception when foreign_key_violation then null;
  end;
  header:=jsonb_set(header,'{extension_values,coreMaterial}',to_jsonb(manual_id::text));

  -- A plain edit (including a cleared value) is not overwritten by automatic defaults.
  header:=jsonb_set(header,'{extension_values,coreMaterial}','null'::jsonb);
  perform public.mes_save_work_order_with_details(second_id,header,'[]'::jsonb);
  select extension_values into values_before from public.mes_work_order where id=second_id;
  if values_before->'coreMaterial'<>'null'::jsonb then raise exception 'Update re-applied insert defaults'; end if;
  case_count:=case_count+1;

  -- Copy must re-resolve BOM-derived values, while retaining configured non-BOM parameters.
  header:=jsonb_set(header,'{extension_values,coreMaterial}',to_jsonb(manual_id::text));
  perform public.mes_save_work_order_with_details(second_id,header,'[]'::jsonb);
  result:=public.mes_copy_work_orders(array[second_id]);
  if jsonb_array_length(result->'successIds')<>1 or jsonb_array_length(result->'failures')<>0 then
    raise exception 'Platform-all copy failed: %',result;
  end if;
  copied_id:=(result#>>'{successIds,0}')::uuid;
  select * into strict actual from public.mes_work_order where id=copied_id;
  if not actual.extension_values @> expected
    or actual.extension_values->>'film'<>'integration non-BOM value'
    or actual.extension_values->>'width'<>'1100'
    or actual.extension_values->>'thickness'<>'50' then
    raise exception 'Copy did not refresh BOM fields and preserve non-BOM values';
  end if;
  case_count:=case_count+1;

  -- Batch reference uses the exact same RPC, including a legacy source with empty extension values.
  update public.mes_work_order set extension_values='{}'::jsonb where id=fresh_id;
  result:=public.mes_copy_work_orders(array[fresh_id,second_id]);
  if jsonb_array_length(result->'successIds')<>2 or jsonb_array_length(result->'failures')<>0 then
    raise exception 'Batch reference failed: %',result;
  end if;
  for copied_item in select value from jsonb_array_elements(result->'successIds') loop
    referenced_id:=(copied_item#>>'{}')::uuid;
    select * into strict actual from public.mes_work_order where id=referenced_id;
    if actual.tenant_id<>template.tenant_id or not actual.extension_values @> expected then
      raise exception 'Reference did not resolve BOM field defaults';
    end if;
  end loop;
  case_count:=case_count+1;

  -- Only fields sourced by this document type are filled; plain text is never interpreted by its key.
  insert into public.mdm_document_type(tenant_id,menu_id,menu_ids,document_type_code,
    document_type_name,extension_fields,packing_enabled)
  select template.tenant_id,d.menu_id,d.menu_ids,'TEST_BOM_'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)),
    'BOM integration field isolation',
    jsonb_build_array(
      jsonb_build_object('key','isolatedCore','label','隔离芯材','valueType','material',
        'sourceComponentTypeId',(select value->>'sourceComponentTypeId'
          from jsonb_array_elements(d.extension_fields) where value->>'key'='coreMaterial')),
      jsonb_build_object('key','outerPanel','label','普通文字','valueType','text',
        'sourceComponentTypeId',null)),false
  from public.mdm_document_type d where d.id=template.work_order_type_id
  returning id into isolated_type_id;
  header:=jsonb_set(header,'{work_order_type_id}',to_jsonb(isolated_type_id::text));
  header:=jsonb_set(header,'{extension_values}',jsonb_build_object('outerPanel','free text'));
  referenced_id:=public.mes_save_work_order_with_details(null,header,'[]'::jsonb);
  select * into strict actual from public.mes_work_order where id=referenced_id;
  if actual.extension_values->>'isolatedCore'<>expected->>'coreMaterial'
    or actual.extension_values->>'outerPanel'<>'free text'
    or actual.extension_values ? 'innerPanel' then
    raise exception 'Auto defaults leaked between document fields/types';
  end if;
  case_count:=case_count+1;

  -- Selected platform scope permits only that tenant.
  header:=jsonb_set(header,'{work_order_type_id}',to_jsonb(template.work_order_type_id::text));
  header:=jsonb_set(header,'{extension_values}','{}'::jsonb);
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',template.tenant_id)::text,true);
  referenced_id:=public.mes_save_work_order_with_details(null,header,'[]'::jsonb);
  result:=public.mes_copy_work_orders(array[second_id]);
  if jsonb_array_length(result->'successIds')<>1 then raise exception 'Selected platform copy failed'; end if;
  select id into strict other_tenant from public.sys_tenant
    where id<>template.tenant_id and status='1' and builtin_type is distinct from 'platform' limit 1;
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
  result:=public.mes_copy_work_orders(array[second_id]);
  if jsonb_array_length(result->'successIds')<>0 or jsonb_array_length(result->'failures')<>1 then
    raise exception 'Selected platform copy crossed tenant boundary';
  end if;
  case_count:=case_count+1;

  -- Ordinary own-tenant and a forged cross-tenant header both retain the authenticated tenant.
  perform set_config('request.headers','{}',true);
  select u.auth_user_id,r.id into strict ordinary,ordinary_role
  from public.sys_user u join public.sys_role r
    on r.tenant_id=u.tenant_id and r.role_code=any(u.user_roles) and r.enabled
  where u.tenant_id=template.tenant_id and u.status='1' and u.user_type='2'
    and u.auth_user_id is not null and r.builtin_type is distinct from 'platform_super'
  order by u.id limit 1;
  insert into public.sys_role_menu(tenant_id,role_id,menu_id,create_by)
    select template.tenant_id,ordinary_role,m.id,'system' from public.sys_menu m
    where m.name in ('MesWorkOrder:Add','MesWorkOrder:Copy','MesWorkOrder:Edit','MesWorkOrder:View')
    on conflict do nothing;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',ordinary,'role','authenticated')::text,true);
  foreach scope_headers in array array['{}',jsonb_build_object('x-art-tenant-scope',other_tenant)::text] loop
    perform set_config('request.headers',scope_headers,true);
    if app_private.current_read_tenant_id()<>template.tenant_id then raise exception 'Ordinary scope changed'; end if;
    referenced_id:=public.mes_save_work_order_with_details(null,header,'[]'::jsonb);
    select * into strict actual from public.mes_work_order where id=referenced_id;
    if not actual.extension_values @> expected then raise exception 'Ordinary add missed defaults'; end if;
    result:=public.mes_copy_work_orders(array[second_id]);
    if jsonb_array_length(result->'successIds')<>1 then raise exception 'Ordinary copy failed: %',result; end if;
    select * into strict actual from public.mes_work_order where id=(result#>>'{successIds,0}')::uuid;
    if actual.tenant_id<>template.tenant_id or not actual.extension_values @> expected then
      raise exception 'Ordinary copy missed tenant/defaults';
    end if;
    case_count:=case_count+1;
  end loop;
  header:=jsonb_set(header,'{tenant_id}',to_jsonb(other_tenant::text));
  begin
    perform public.mes_save_work_order_with_details(null,header,'[]'::jsonb);
    raise exception 'Ordinary user created a foreign work order';
  exception when insufficient_privilege then null;
  end;

  -- Users without Add/Copy permissions remain blocked; a forged scope does not grant them.
  select u.auth_user_id into strict no_permissions from public.sys_user u
  where u.tenant_id=template.tenant_id and u.status='1' and u.auth_user_id is not null
    and cardinality(u.user_roles)=0 limit 1;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',no_permissions,'role','authenticated')::text,true);
  begin
    perform public.mes_copy_work_orders(array[second_id]);
    raise exception 'Copy without permission was accepted';
  exception when insufficient_privilege then null;
  end;
  header:=jsonb_set(header,'{tenant_id}',to_jsonb(template.tenant_id::text));
  begin
    perform public.mes_save_work_order_with_details(null,header,'[]'::jsonb);
    raise exception 'Create without permission was accepted';
  exception when insufficient_privilege then null;
  end;
  case_count:=case_count+1;

  -- Existing records (excluding temporary rows) and original row payloads are unmodified.
  if (select count(*) from public.mes_work_order where id=any(original_ids))<>original_count
    or (select md5(jsonb_agg(to_jsonb(w) order by id)::text)
      from public.mes_work_order w where id=any(original_ids))<>original_hash then
    raise exception 'Existing work orders were modified';
  end if;
  if case_count<>10 then raise exception 'Expected 10 integration cases, got %',case_count; end if;
  raise notice 'BOM extension integration cases passed: %',case_count;
end;
$test$;

select '10 BOM extension integration cases passed; all writes roll back' as verification;
rollback;
