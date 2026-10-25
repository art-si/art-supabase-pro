BEGIN;
DO $test$ declare a uuid; j jsonb; expected bigint; begin
select auth_user_id into a from public.sys_user where user_roles @> ARRAY['R_SUPER'] and auth_user_id is not null limit 1;
perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
perform set_config('request.headers','{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}',true);
j:=public.tms_list_transport_events_secure(0,499);
if exists(select 1 from jsonb_array_elements(j->'records') r where r->>'tenantId'<>'7529f951-938e-4e2c-ac0d-316c136ae1f9') then raise exception 'transport event selected scope leak'; end if;
select count(*) into expected from public.tms_waybill_event e join public.tms_waybill w on w.id=e.waybill_id and w.tenant_id=e.tenant_id where e.tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9';
if (j->>'total')::bigint<>expected then raise exception 'transport event count mismatch'; end if;
select count(*) into expected from public.tms_waybill where tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9' and status=any(array['pending','accepted','loading','transporting','unloading']);
if (j->'overview'->>'activeWaybillCount')::bigint<>expected then raise exception 'transport event overview mismatch'; end if;
end $test$;
DO $test$ declare a uuid; own_result jsonb; forged_result jsonb; all_result jsonb; expected bigint; begin
select auth_user_id into a from public.sys_user where user_roles @> ARRAY['R_SUPER'] and auth_user_id is not null limit 1;
perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
perform set_config('request.headers','{}',true);
all_result:=public.tms_list_transport_events_secure(0,499);
select count(*) into expected from public.tms_waybill_event e join public.tms_waybill w on w.id=e.waybill_id and w.tenant_id=e.tenant_id;
if (all_result->>'total')::bigint<>expected then raise exception 'platform all scope mismatch'; end if;
perform set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
perform set_config('request.headers','{}',true);
own_result:=public.tms_list_transport_events_secure(0,499);
perform set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
forged_result:=public.tms_list_transport_events_secure(0,499);
if own_result is distinct from forged_result then raise exception 'forged scope changes transport events'; end if;
end $test$;
ROLLBACK;
