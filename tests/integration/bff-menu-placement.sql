-- Run after registering the BFF menu in sys_menu. The URL stays stable when its view moves.
do $check$
declare
  bff record;
  data_center_id uuid;
  ordinary_grants integer;
begin
  select id into strict data_center_id from public.sys_menu
  where name = 'DataCenter' and path = '/data-center' and app_code = 'platform';

  select id, parent_id, path, component, app_code, type, meta
  into strict bff from public.sys_menu where name = 'BffIntegration';
  if bff.parent_id is distinct from data_center_id
    or bff.path is distinct from '/examples/bff-integration'
    or bff.component is distinct from '/data-center/bff-integration/index'
    or bff.app_code is distinct from 'platform'
    or bff.type is distinct from 'menu'
    or bff.meta->>'is_enable' is distinct from 'true' then
    raise exception 'BFF menu placement, URL, component, or availability is invalid';
  end if;

  select count(*) into ordinary_grants from public.sys_role_menu rm
  join public.sys_role r on r.id = rm.role_id
  where rm.menu_id = bff.id and r.enabled and r.builtin_type is distinct from 'platform_super';
  if ordinary_grants = 0 then
    raise exception 'BFF menu is not granted to ordinary roles';
  end if;
  raise notice 'bff-menu-placement-passed';
end;
$check$;
