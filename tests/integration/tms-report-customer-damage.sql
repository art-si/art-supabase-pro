BEGIN;
DO $test$ declare a uuid; j jsonb; begin
select auth_user_id into a from public.sys_user where user_roles @> ARRAY['R_SUPER'] and auth_user_id is not null limit 1;
perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
perform set_config('request.headers','{}',true);
j:=public.tms_management_report('customer-profit','2026-09-01','2026-10-23','报表验收',0,200);
if (select sum((r->>'damage')::numeric) from jsonb_array_elements(j->'records') r) is distinct from 300::numeric then raise exception 'customer damage mismatch'; end if;
if (j->'summary'->>'cost')::numeric is distinct from 74300::numeric then raise exception 'damage counted twice'; end if;
perform set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
j:=public.tms_management_report('customer-profit','2026-09-01','2026-10-23','报表验收',0,200);
if exists(select 1 from jsonb_array_elements(j->'records') r where (r->>'damage')::numeric>0) then raise exception 'selected tenant damage leak'; end if;
perform set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
j:=public.tms_management_report('customer-profit','2026-09-01','2026-10-23','报表验收',0,200);
if (select sum((r->>'damage')::numeric) from jsonb_array_elements(j->'records') r) is distinct from 300::numeric then raise exception 'ordinary forged header changes damage scope'; end if;
end $test$;
ROLLBACK;
