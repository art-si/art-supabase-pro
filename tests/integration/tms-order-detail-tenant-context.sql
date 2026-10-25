BEGIN;
DO $t$ DECLARE j jsonb; s uuid; foreign_id uuid; BEGIN
select auth_user_id into s from public.sys_user where user_roles @> ARRAY['R_SUPER'] and auth_user_id is not null limit 1;
select id into foreign_id from public.tms_order where tenant_id<>'7529f951-938e-4e2c-ac0d-316c136ae1f9' limit 1;
perform set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
perform set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
j:=public.tms_get_order_detail_secure('a9fc0005-1023-4620-9220-000000000007');
if j->>'tenant_id' is distinct from '7529f951-938e-4e2c-ac0d-316c136ae1f9' then raise exception 'Missing owner tenant'; end if;
if public.tms_get_order_detail_secure(foreign_id) is not null then raise exception 'Ordinary cross tenant read'; end if;
perform set_config('request.jwt.claims',jsonb_build_object('sub',s,'role','authenticated')::text,true);
perform set_config('request.headers','{}',true);
if public.tms_get_order_detail_secure(foreign_id) is null then raise exception 'All tenant read unavailable'; end if;
perform set_config('request.headers','{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}',true);
if public.tms_get_order_detail_secure(foreign_id) is not null then raise exception 'Selected scope leaked'; end if;
END $t$;
ROLLBACK;
