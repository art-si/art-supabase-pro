-- Verify parent scope metadata without changing any business rows.
begin;
do $test$
declare a public.sys_user%rowtype; u public.sys_user%rowtype; c public.tms_waybill_cost%rowtype; test_case text; payload jsonb; other_tenant uuid;
begin
select * into strict a from public.sys_user where id='51760251-629d-4561-aeb8-0fbe62352494';
select * into strict u from public.sys_user where id='93f2f1e8-a3dc-4f5a-999b-6c8c02d0c7e9';
select * into strict c from public.tms_waybill_cost where id='f2b7abfe-20c8-4697-9097-c82f0aa1d4d8';
select id into strict other_tenant from public.sys_tenant where id<>u.tenant_id and status='1' and builtin_type is distinct from 'platform' and (service_start_date is null or service_start_date<=(now() at time zone 'Asia/Shanghai')::date) and (service_end_date is null or service_end_date>=(now() at time zone 'Asia/Shanghai')::date) order by id limit 1;
foreach test_case in array array['platform_all','platform_selected','ordinary_own','ordinary_forged'] loop
perform set_config('request.jwt.claims',jsonb_build_object('sub',case when test_case like 'platform_%' then a.auth_user_id else u.auth_user_id end,'role','authenticated')::text,true);
perform set_config('request.headers',case when test_case='platform_all' then '{}' when test_case='ordinary_forged' then jsonb_build_object('x-art-tenant-scope',a.tenant_id)::text else jsonb_build_object('x-art-tenant-scope',u.tenant_id)::text end,true);
payload:=public.tms_get_waybill_cost_secure(c.id);
if payload->>'tenant_id' is distinct from c.tenant_id::text then raise exception 'Missing/wrong parent scope: %',test_case; end if;
if payload ? 'created_by_user_id' then raise exception 'Private owner exposed'; end if;
if payload->'field_access' is null then raise exception 'Field permission metadata lost'; end if;
end loop;
perform set_config('request.jwt.claims',jsonb_build_object('sub',a.auth_user_id,'role','authenticated')::text,true);
perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
if public.tms_get_waybill_cost_secure(c.id) is not null then raise exception 'Platform-selected foreign cost leaked'; end if;
perform set_config('request.jwt.claims',jsonb_build_object('sub',u.auth_user_id,'role','authenticated')::text,true);
perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',a.tenant_id)::text,true);
if exists(select 1 from public.tms_waybill_cost f where f.tenant_id<>u.tenant_id and public.tms_get_waybill_cost_secure(f.id) is not null) then raise exception 'Ordinary forged foreign cost leaked'; end if;
end $test$;
select 'waybill cost parent metadata, owner privacy, and tenant scope passed' result;
rollback;
