-- Read-only regression checks for tenant scope and business write permissions.
-- A permissive FOR ALL policy also grants SELECT, so a restrictive SELECT policy
-- must enforce the selected tenant even when the user is platform super.
do $tenant_scope_test$
declare
  v_missing text[];
  v_invalid text[];
begin
  select array_agg(p.tablename order by p.tablename)
    into v_missing
  from pg_policies p
  where p.schemaname = 'public'
    and p.policyname = 'canonical_platform_super_write'
    and p.cmd = 'ALL'
    and not exists (
      select 1
      from pg_policies scope
      where scope.schemaname = p.schemaname
        and scope.tablename = p.tablename
        and scope.policyname = 'canonical_tenant_read_scope'
        and scope.permissive = 'RESTRICTIVE'
        and scope.cmd = 'SELECT'
        and scope.roles = '{authenticated}'::name[]
    );

  if v_missing is not null then
    raise exception 'Tenant SELECT guard missing on: %', array_to_string(v_missing, ', ');
  end if;

  select array_agg(scope.tablename order by scope.tablename)
    into v_invalid
  from pg_policies scope
  where scope.schemaname = 'public'
    and scope.policyname = 'canonical_tenant_read_scope'
    and scope.permissive = 'RESTRICTIVE'
    and scope.cmd = 'SELECT'
    and (
      (scope.qual not like '%tenant_in_current_read_scope%'
        and scope.qual not like '%current_read_tenant_id%')
      or scope.qual ~* 'is_platform_super'
    );

  if v_invalid is not null then
    raise exception 'Tenant SELECT guard can bypass selected scope on: %',
      array_to_string(v_invalid, ', ');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'mdm_cargo'
      and policyname = 'tenant_insert' and cmd = 'INSERT'
      and roles = '{authenticated}'::name[]
      and with_check like '%current_user_tenant_id%'
      and with_check like '%TmsCargo:Add%'
      and with_check like '%TmsCargo:Import%'
  ) or not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'mdm_cargo'
      and policyname = 'tenant_update' and cmd = 'UPDATE'
      and roles = '{authenticated}'::name[]
      and qual like '%current_user_tenant_id%'
      and qual like '%TmsCargo:Edit%'
      and with_check like '%TmsCargo:Edit%'
  ) or not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'mdm_cargo'
      and policyname = 'tenant_delete' and cmd = 'DELETE'
      and roles = '{authenticated}'::name[]
      and qual like '%current_user_tenant_id%'
      and qual like '%TmsCargo:Delete%'
  ) then
    raise exception 'TMS cargo write permissions are incomplete';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'mdm_cargo'
      and cmd in ('ALL', 'INSERT', 'UPDATE', 'DELETE')
      and permissive = 'PERMISSIVE'
      and policyname not in (
        'canonical_platform_super_write', 'tenant_insert', 'tenant_update', 'tenant_delete'
      )
  ) then
    raise exception 'Unexpected permissive TMS cargo write policy';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'mdm_station'
      and policyname = 'tenant_insert' and cmd = 'INSERT'
      and roles = '{authenticated}'::name[]
      and with_check like '%TmsStation:Add%'
      and with_check like '%TmsStation:Import%'
  ) or not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'mdm_station'
      and policyname = 'tenant_update' and cmd = 'UPDATE'
      and roles = '{authenticated}'::name[]
      and qual like '%TmsStation:Edit%'
      and qual like '%TmsStation:Import%'
      and qual like '%TmsStation:Toggle%'
      and with_check like '%TmsStation:Toggle%'
  ) or not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'mdm_station'
      and policyname = 'tenant_delete' and cmd = 'DELETE'
      and roles = '{authenticated}'::name[]
      and qual like '%TmsStation:Delete%'
  ) then
    raise exception 'TMS station write permissions are incomplete';
  end if;

  if has_table_privilege('authenticated', 'public.tms_station_role', 'INSERT')
    or has_table_privilege('authenticated', 'public.tms_station_role', 'UPDATE')
    or has_table_privilege('authenticated', 'public.tms_station_role', 'DELETE')
    or not has_function_privilege(
      'authenticated', 'public.save_tms_station(jsonb,text[])', 'EXECUTE'
    )
    or has_function_privilege('anon', 'public.save_tms_station(jsonb,text[])', 'EXECUTE')
    or not (
      select prosecdef from pg_proc
      where oid = 'public.save_tms_station(jsonb,text[])'::regprocedure
    )
    or not exists (
      select 1 from pg_trigger
      where tgrelid = 'public.mdm_station'::regclass
        and tgname = 'tms_station_sync_primary_role_insert'
    )
    or not exists (
      select 1 from pg_trigger
      where tgrelid = 'public.mdm_station'::regclass
        and tgname = 'tms_station_permission_guard'
    )
    or not exists (
      select 1 from pg_trigger
      where tgrelid = 'public.mdm_station'::regclass
        and tgname = 'tms_station_delete_guard'
        and (tgtype & 8) = 8
    )
    or not has_function_privilege(
      'authenticated', 'public.get_tms_station_delete_dependency_details(uuid[])', 'EXECUTE'
    )
    or has_function_privilege(
      'anon', 'public.get_tms_station_delete_dependency_details(uuid[])', 'EXECUTE'
    )
    or not (
      select prosecdef from pg_proc
      where oid = 'public.get_tms_station_delete_dependency_details(uuid[])'::regprocedure
    ) then
    raise exception 'TMS station RPC/role/delete boundary is incomplete';
  end if;

  if not has_function_privilege(
    'authenticated', 'public.create_ai_order_master_data(jsonb)', 'EXECUTE'
  )
    or has_function_privilege(
      'anon', 'public.create_ai_order_master_data(jsonb)', 'EXECUTE'
    )
    or (
      select prosecdef or pg_get_functiondef(oid) ~* 'is_platform_super|current_is_super'
      from pg_proc
      where oid = 'public.create_ai_order_master_data(jsonb)'::regprocedure
    )
    or not (
      select pg_get_functiondef(oid) like '%TmsOrderOpen:AiFill%'
        and pg_get_functiondef(oid) like '%TmsStation:Add%'
        and pg_get_functiondef(oid) like '%TmsCustomer:Add%'
        and pg_get_functiondef(oid) like '%TmsCustomerAddress:Add%'
        and pg_get_functiondef(oid) like '%TmsCargo:Add%'
        and pg_get_functiondef(oid) like '%current_read_tenant_id%'
      from pg_proc
      where oid = 'public.create_ai_order_master_data(jsonb)'::regprocedure
    )
    or not (
      select pg_get_functiondef(oid) like '%join public.sys_role_menu%'
        and pg_get_functiondef(oid) like '%current_user_row.auth_user_id = auth.uid()%'
      from pg_proc
      where oid = 'app_private.has_permission(text)'::regprocedure
    )
    or not (
      select pg_get_functiondef(oid) like '%if not app_private.is_platform_super() then%'
        and pg_get_functiondef(oid) like '%app_private.auth_user_tenant_id()%'
      from pg_proc
      where oid = 'app_private.current_read_tenant_id()'::regprocedure
    ) then
    raise exception 'AI master-data RPC ordinary-user permission or tenant boundary is incomplete';
  end if;
end
$tenant_scope_test$;

select count(*) as protected_tenant_tables
from pg_policies
where schemaname = 'public'
  and policyname = 'canonical_tenant_read_scope'
  and permissive = 'RESTRICTIVE'
  and cmd = 'SELECT';

-- MDM business types can belong to several document types; WMS writes must check
-- the selected document against that set and its menu assignment.
do $wms_business_document_assignment_test$
declare
  v_function_name text;
begin
  if exists (
    select 1 from public.mdm_business_type b
    where b.document_type_ids is null
      or cardinality(b.document_type_ids) = 0
      or b.document_type_ids[1] is distinct from b.document_type_id
      or cardinality(b.document_type_ids) <> (
        select count(distinct id) from unnest(b.document_type_ids) id
      )
  ) then
    raise exception 'MDM business type multi-document assignment is inconsistent';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'mdm_business_type'
      and policyname = 'tenant_select'
      and qual like '%tenant_in_current_read_scope%'
  ) then
    raise exception 'MDM business type selected tenant read scope is missing';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'mdm_document_type'
      and policyname = 'wms_document_type_read'
      and qual like '%tenant_in_current_read_scope%'
      and qual like '%WmsInitialSalesOutbound:View%'
      and qual like '%WmsTransfer:View%'
  ) then
    raise exception 'WMS document type read permission is incomplete';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.copy_mdm_business_type_with_menus_multi(uuid,uuid,text,text,boolean,uuid,text,text,boolean,text,integer,text,text,boolean,text,uuid[],uuid[])',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.copy_mdm_business_type_with_menus_multi(uuid,uuid,text,text,boolean,uuid,text,text,boolean,text,integer,text,text,boolean,text,uuid[],uuid[])',
    'EXECUTE'
  ) then
    raise exception 'MDM multi-document copy permission boundary is incomplete';
  end if;

  foreach v_function_name in array array[
    'wms_save_count_adjustment_secure',
    'wms_save_initial_stock_secure',
    'wms_save_production_material_secure',
    'wms_save_purchase_document_secure',
    'wms_save_sales_document_secure',
    'wms_save_transfer_request_secure'
  ] loop
    if not exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = v_function_name
        and pg_get_functiondef(p.oid) like '%document_type_ids%'
        and pg_get_functiondef(p.oid) like '%menu_ids%'
    ) then
      raise exception 'WMS write assignment validation missing in %', v_function_name;
    end if;
  end loop;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.mdm_document_type'::regclass
      and tgname = 'mdm_document_type_secondary_reference_guard'
      and (tgtype & 8) = 8
  ) then
    raise exception 'Secondary MDM document type delete guard is missing';
  end if;

  foreach v_function_name in array array[
    'wms_create_issue_request_secure',
    'wms_create_transfer_secure',
    'wms_post_inventory_movement_secure'
  ] loop
    if not exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = v_function_name
        and (
          (
            pg_get_functiondef(p.oid) like '%document_type_ids%'
            and pg_get_functiondef(p.oid) like '%menu_ids%'
            and pg_get_functiondef(p.oid) like '%wms_inventory_initialization%'
          )
          or exists (
            select 1 from pg_proc internal
            join pg_namespace private_ns on private_ns.oid = internal.pronamespace
            where private_ns.nspname = 'app_private'
              and internal.proname = regexp_replace(v_function_name, '_secure$', '_internal')
              and pg_get_functiondef(p.oid) like '%' || internal.proname || '%'
              and pg_get_functiondef(internal.oid) like '%document_type_ids%'
              and pg_get_functiondef(internal.oid) like '%menu_ids%'
              and pg_get_functiondef(internal.oid) like '%wms_inventory_initialization%'
              and not has_function_privilege('authenticated', internal.oid, 'EXECUTE')
          )
        )
    ) then
      raise exception 'WMS special workflow master-data validation missing in %', v_function_name;
    end if;
  end loop;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'mdm_document_type'
      and policyname = 'wms_special_document_type_read'
      and qual like '%tenant_in_current_read_scope%'
      and qual like '%WmsDirectTransfer:View%'
      and qual like '%WmsStockOperation:View%'
  ) or not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'mdm_business_type'
      and policyname = 'wms_special_business_type_read'
      and qual like '%tenant_in_current_read_scope%'
      and qual like '%WmsStepTransfer:View%'
  ) then
    raise exception 'WMS special workflow master-data read permission is incomplete';
  end if;

  if exists (
    select 1 from (values
      ('wms_transfer_document'::text),
      ('wms_inventory_movement'::text)
    ) as tables(table_name)
    cross join (values ('document_type_id'::text), ('business_type_id'::text)) as columns(column_name)
    where not exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = tables.table_name
        and c.column_name = columns.column_name
    )
  ) then
    raise exception 'WMS transfer master-data columns are missing';
  end if;

  if exists (
    select 1 from pg_constraint c
    where c.conrelid in ('public.wms_transfer_document'::regclass, 'public.wms_inventory_movement'::regclass)
      and c.contype = 'f'
      and c.confrelid in ('public.mdm_document_type'::regclass, 'public.mdm_business_type'::regclass)
      and cardinality(c.conkey) <> 2
  ) then
    raise exception 'WMS transfer master-data foreign keys must enforce tenant scope';
  end if;
end
$wms_business_document_assignment_test$;
