begin;

-- The detail action is assignable and belongs to the existing, unchanged year-inspection menu.
select 1 / case when count(*) = 1 then 1 else 0 end as inspection_view_registered
from public.sys_menu b
join public.sys_menu p on p.id = b.parent_id
where b.name = 'VehicleInspection:View'
  and b.type = 'button'
  and b.app_code = p.app_code
  and p.name = 'VehicleInspection'
  and p.component = '/vms/vehicle-manage/vehicle-inspection';

-- Restoring read access must not create a grant for a role that cannot already access the page.
select 1 / case when not exists (
  select 1 from public.sys_role_menu granted
  join public.sys_menu b on b.id = granted.menu_id and b.name = 'VehicleInspection:View'
  where not exists (
    select 1 from public.sys_role_menu page_grant
    where page_grant.role_id = granted.role_id and page_grant.menu_id = b.parent_id
      and page_grant.tenant_id = granted.tenant_id
  )
) then 1 else 0 end as no_new_page_or_tenant_access;

select 1 / case when not exists (
  select 1 from public.sys_role_menu page_grant
  join public.sys_menu p on p.id = page_grant.menu_id and p.name = 'VehicleInspection'
  where not exists (
    select 1 from public.sys_role_menu detail_grant
    join public.sys_menu b on b.id = detail_grant.menu_id and b.name = 'VehicleInspection:View'
    where detail_grant.role_id = page_grant.role_id
      and detail_grant.tenant_id = page_grant.tenant_id
      and detail_grant.permission = page_grant.permission
  )
) then 1 else 0 end as existing_page_readers_keep_detail_access;

rollback;
