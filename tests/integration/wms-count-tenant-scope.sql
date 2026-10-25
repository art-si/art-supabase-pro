begin;

select set_config(
  'app.test.super_id',
  (
    select u.auth_user_id::text
    from public.sys_user u
    join public.sys_tenant t on t.id = u.tenant_id
    join public.sys_role r on r.tenant_id = u.tenant_id
      and r.role_code = any(u.user_roles)
      and r.builtin_type = 'platform_super'
    where t.builtin_type = 'platform'
      and u.status = '1'
      and u.system_protected
      and u.deleted_at is null
    limit 1
  ),
  true
);
select set_config(
  'app.test.ordinary_id',
  (
    select u.auth_user_id::text
    from public.sys_user u
    join public.sys_role r on r.tenant_id = u.tenant_id
      and r.role_code = any(u.user_roles)
    join public.sys_role_menu rm on rm.role_id = r.id
    join public.sys_menu m on m.id = rm.menu_id
    where u.tenant_id = '7529f951-938e-4e2c-ac0d-316c136ae1f9'
      and m.name = 'WmsCountSheet:View'
      and u.status = '1'
      and u.auth_user_id is not null
    limit 1
  ),
  true
);
select set_config(
  'app.test.other_tenant',
  (
    select id::text
    from public.sys_tenant
    where id <> '7529f951-938e-4e2c-ac0d-316c136ae1f9'
      and status = '1'
      and builtin_type is distinct from 'platform'
      and (service_start_date is null or service_start_date <= (now() at time zone 'Asia/Shanghai')::date)
      and (service_end_date is null or service_end_date >= (now() at time zone 'Asia/Shanghai')::date)
    limit 1
  ),
  true
);

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('app.test.super_id'), true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', current_setting('app.test.super_id'), 'role', 'authenticated')::text,
  true
);
select set_config('request.headers', '{}', true);
select set_config(
  'app.test.platform_all',
  (select count(*)::text from public.wms_count_sheet where document_no in ('PDB202610-001', 'PDB202610-002')),
  true
);
select set_config(
  'request.headers',
  jsonb_build_object('x-art-tenant-scope', current_setting('app.test.other_tenant'))::text,
  true
);
select set_config(
  'app.test.platform_selected_other',
  (select count(*)::text from public.wms_count_sheet where document_no in ('PDB202610-001', 'PDB202610-002')),
  true
);
select set_config('request.headers', '{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}', true);
select set_config(
  'app.test.platform_selected_own',
  (select count(*)::text from public.wms_count_sheet where document_no in ('PDB202610-001', 'PDB202610-002')),
  true
);

select set_config('request.jwt.claim.sub', current_setting('app.test.ordinary_id'), true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', current_setting('app.test.ordinary_id'), 'role', 'authenticated')::text,
  true
);
select set_config(
  'request.headers',
  jsonb_build_object('x-art-tenant-scope', current_setting('app.test.other_tenant'))::text,
  true
);
select set_config(
  'app.test.ordinary_forged',
  (select count(*)::text from public.wms_count_sheet where document_no in ('PDB202610-001', 'PDB202610-002')),
  true
);

do $assert$
begin
  if current_setting('app.test.platform_all')::integer <> 2
    or current_setting('app.test.platform_selected_other')::integer <> 0
    or current_setting('app.test.platform_selected_own')::integer <> 2
    or current_setting('app.test.ordinary_forged')::integer <> 2 then
    raise exception '盘点表租户读取范围验证失败';
  end if;
end
$assert$;

select current_setting('app.test.platform_all')::integer platform_all,
  current_setting('app.test.platform_selected_other')::integer platform_selected_other,
  current_setting('app.test.platform_selected_own')::integer platform_selected_own,
  current_setting('app.test.ordinary_forged')::integer ordinary_forged;

rollback;
