-- Verify WMS list views under the same tenant scopes used by PostgREST.
-- The temporary role grants and line-free document are rolled back.
begin;
set local lock_timeout = '3s';

do $setup$
declare
  platform_actor uuid;
  ordinary_actor uuid;
  ordinary_role uuid;
  target_tenant uuid;
  other_tenant uuid;
  template public.wms_production_material_document%rowtype;
  line_free_id uuid;
begin
  select u.auth_user_id into strict platform_actor
  from public.sys_user u
  join public.sys_role r on r.tenant_id = u.tenant_id and r.role_code = any(u.user_roles)
  where r.builtin_type = 'platform_super' and u.system_protected and u.status = '1'
  order by u.id limit 1;

  select d.* into strict template
  from public.wms_production_material_document d
  where exists (
    select 1 from public.sys_user u
    join public.sys_role r on r.tenant_id = u.tenant_id and r.role_code = any(u.user_roles)
    where u.tenant_id = d.tenant_id and u.auth_user_id is not null
      and u.status = '1' and u.user_type = '2'
      and r.builtin_type is distinct from 'platform_super'
      and not exists (
        select 1 from public.sys_role super_role
        where super_role.tenant_id = u.tenant_id
          and super_role.role_code = any(u.user_roles)
          and super_role.builtin_type = 'platform_super'
      )
  )
  order by (d.kind = 'issue') desc, d.id limit 1;
  target_tenant := template.tenant_id;

  select u.auth_user_id, r.id into strict ordinary_actor, ordinary_role
  from public.sys_user u
  join public.sys_role r on r.tenant_id = u.tenant_id and r.role_code = any(u.user_roles)
  where u.tenant_id = target_tenant and u.auth_user_id is not null
    and u.status = '1' and u.user_type = '2'
    and r.builtin_type is distinct from 'platform_super'
    and not exists (
      select 1 from public.sys_role super_role
      where super_role.tenant_id = u.tenant_id
        and super_role.role_code = any(u.user_roles)
        and super_role.builtin_type = 'platform_super'
    )
  order by u.id, r.id limit 1;
  select id into strict other_tenant from public.sys_tenant
  where id <> target_tenant order by id limit 1;

  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', platform_actor, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{}', true);

  insert into public.sys_role_menu (tenant_id, role_id, menu_id, create_by)
  select target_tenant, ordinary_role, m.id, 'system'
  from public.sys_menu m
  where m.name in (
    'WmsCountGain:View', 'WmsCountLoss:View',
    'WmsFinishedInbound:View', 'WmsFinishedReturn:View',
    'WmsProductionIssue:View', 'WmsProductionReturn:View',
    'WmsIssueRequest:View', 'WmsSalesOutbound:View',
    'WmsSalesReturnDocument:View', 'WmsOtherOutbound:View',
    'WmsInitialSalesOutbound:View', 'WmsInitialSalesReturn:View',
    'WmsDirectTransfer:View', 'WmsStepTransfer:View',
    'WmsTransfer:View', 'WmsStock:View'
  ) on conflict do nothing;

  insert into public.wms_production_material_document (
    tenant_id, kind, document_no, document_type_id, business_type_id,
    organization_id, warehouse_id, work_order_id, project_id, customer_id,
    demand_date, created_by
  ) values (
    template.tenant_id, template.kind, 'QA-LIST-' || gen_random_uuid(),
    template.document_type_id, template.business_type_id,
    template.organization_id, template.warehouse_id, template.work_order_id,
    template.project_id, template.customer_id, template.demand_date, platform_actor
  ) returning id into line_free_id;

  perform set_config('app.wms_list_platform_actor', platform_actor::text, true);
  perform set_config('app.wms_list_ordinary_actor', ordinary_actor::text, true);
  perform set_config('app.wms_list_target_tenant', target_tenant::text, true);
  perform set_config('app.wms_list_other_tenant', other_tenant::text, true);
  perform set_config('app.wms_list_line_free_id', line_free_id::text, true);
end
$setup$;

set local role authenticated;

do $scope$
declare
  view_name text;
  page jsonb;
  target_tenant uuid := current_setting('app.wms_list_target_tenant')::uuid;
  other_tenant uuid := current_setting('app.wms_list_other_tenant')::uuid;
  platform_actor uuid := current_setting('app.wms_list_platform_actor')::uuid;
  ordinary_actor uuid := current_setting('app.wms_list_ordinary_actor')::uuid;
  all_target_count bigint;
  selected_count bigint;
  own_count bigint;
  forged_count bigint;
begin
  foreach view_name in array array[
    'wms_count_adjustment_list', 'wms_finished_inbound_source_list',
    'wms_issue_request_list', 'wms_production_material_list',
    'wms_sales_document_list', 'wms_transfer_business_list',
    'wms_transfer_request_list'
  ] loop
    perform set_config('request.jwt.claims',
      jsonb_build_object('sub', platform_actor, 'role', 'authenticated')::text, true);
    perform set_config('request.headers', '{}', true);
    execute format('select count(*) from public.%I where tenant_id = $1', view_name)
      into all_target_count using target_tenant;
    execute format('select coalesce(jsonb_agg(to_jsonb(v)), ''[]''::jsonb)
      from (select * from public.%I limit 500) v', view_name) into page;
    if jsonb_typeof(page) <> 'array' then
      raise exception '% did not serialize a platform-all page', view_name;
    end if;

    perform set_config('request.headers',
      jsonb_build_object('x-art-tenant-scope', target_tenant)::text, true);
    execute format('select count(*) from public.%I', view_name) into selected_count;
    execute format('select coalesce(jsonb_agg(to_jsonb(v)), ''[]''::jsonb)
      from (select * from public.%I limit 500) v', view_name) into page;
    if selected_count <> all_target_count or exists (
      select 1 from jsonb_array_elements(page) row_data
      where (row_data->>'tenant_id')::uuid <> target_tenant
    ) then
      raise exception '% selected tenant list scope changed', view_name;
    end if;

    perform set_config('request.jwt.claims',
      jsonb_build_object('sub', ordinary_actor, 'role', 'authenticated')::text, true);
    perform set_config('request.headers', '{}', true);
    execute format('select count(*) from public.%I', view_name) into own_count;
    execute format('select coalesce(jsonb_agg(to_jsonb(v)), ''[]''::jsonb)
      from (select * from public.%I limit 500) v', view_name) into page;
    if exists (
      select 1 from jsonb_array_elements(page) row_data
      where (row_data->>'tenant_id')::uuid <> target_tenant
    ) then
      raise exception '% ordinary user read another tenant', view_name;
    end if;

    perform set_config('request.headers',
      jsonb_build_object('x-art-tenant-scope', other_tenant)::text, true);
    execute format('select count(*) from public.%I', view_name) into forged_count;
    execute format('select coalesce(jsonb_agg(to_jsonb(v)), ''[]''::jsonb)
      from (select * from public.%I limit 500) v', view_name) into page;
    if forged_count <> own_count or exists (
      select 1 from jsonb_array_elements(page) row_data
      where (row_data->>'tenant_id')::uuid <> target_tenant
    ) then
      raise exception '% forged header changed ordinary user scope', view_name;
    end if;
  end loop;
end
$scope$;

do $production_grain$
declare
  kind_name text;
  expected_count bigint;
  actual_count bigint;
  line_free_id uuid := current_setting('app.wms_list_line_free_id')::uuid;
  platform_actor uuid := current_setting('app.wms_list_platform_actor')::uuid;
begin
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', platform_actor, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{}', true);
  foreach kind_name in array array['issue', 'return', 'finished_inbound', 'finished_return'] loop
    select count(*) into expected_count
    from public.wms_production_material_document d
    left join public.wms_production_material_line l
      on l.document_id = d.id and l.tenant_id = d.tenant_id
    where d.kind = kind_name;
    select count(*) into actual_count from public.wms_production_material_list
    where kind = kind_name;
    if expected_count <> actual_count or exists (
      (select d.id as document_id, coalesce(l.id, d.id) as line_id
       from public.wms_production_material_document d
       left join public.wms_production_material_line l
         on l.document_id = d.id and l.tenant_id = d.tenant_id
       where d.kind = kind_name
       except
       select v.document_id, v.line_id from public.wms_production_material_list v
       where v.kind = kind_name)
      union all
      (select v.document_id, v.line_id from public.wms_production_material_list v
       where v.kind = kind_name
       except
       select d.id, coalesce(l.id, d.id)
       from public.wms_production_material_document d
       left join public.wms_production_material_line l
         on l.document_id = d.id and l.tenant_id = d.tenant_id
       where d.kind = kind_name)
    ) then
      raise exception '% list document/line grain changed', kind_name;
    end if;
  end loop;
  if not exists (
    select 1 from public.wms_production_material_list
    where document_id = line_free_id and line_id = line_free_id
  ) then
    raise exception 'Production list omitted a parent document without lines';
  end if;
end
$production_grain$;

-- The representative PostgREST-shaped page and exact count must fit its 8 s budget.
-- This setting is transaction-local; it changes no project or server-wide timeout.
set local statement_timeout = '8s';
do $page_budget$
declare
  page jsonb;
  row_total bigint;
  actor_id uuid;
begin
  foreach actor_id in array array[
    current_setting('app.wms_list_platform_actor')::uuid,
    current_setting('app.wms_list_ordinary_actor')::uuid
  ] loop
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', actor_id, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', jsonb_build_object(
    'x-art-tenant-scope', current_setting('app.wms_list_target_tenant')::uuid
  )::text, true);
  select count(*) into row_total from public.wms_production_material_list
  where kind = 'finished_inbound'
    and tenant_id = current_setting('app.wms_list_target_tenant')::uuid;
  select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) into page
  from (
    select * from public.wms_production_material_list
    where kind = 'finished_inbound'
      and tenant_id = current_setting('app.wms_list_target_tenant')::uuid
    order by created_at desc, line_no, document_id, line_id
    limit 500 offset 0
  ) v;
  if row_total < jsonb_array_length(page) then
    raise exception 'Production list page exceeds its exact count';
  end if;
  end loop;
end
$page_budget$;

rollback;
