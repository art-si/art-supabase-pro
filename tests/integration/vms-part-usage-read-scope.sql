-- Two existing part-usage fixtures in different tenants. Read-only; claims are rolled back.
BEGIN;
SET LOCAL ROLE authenticated;
do $test$
declare
  r jsonb;
  own_id uuid := '90726093-88f0-429a-aab5-1d387e87e7d0';
  qa_id uuid := '7c1e4ca8-f8f7-45a9-a153-14bf2d1e6abc';
  ids uuid[] := array[own_id,qa_id];
begin
  perform set_config('request.jwt.claims','{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
  perform set_config('request.headers','{}',true);
  r := public.vms_list_vehicle_part_usages_secure(p_ids=>ids);
  if (r->>'total')::integer <> 2 then raise exception 'platform all expected two parts, got %',r->>'total'; end if;
  if public.vms_get_vehicle_part_usage_secure(own_id) is null or public.vms_get_vehicle_part_usage_secure(qa_id) is null then raise exception 'platform all detail missing'; end if;
  perform set_config('request.headers','{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}',true);
  r := public.vms_list_vehicle_part_usages_secure(p_ids=>ids);
  if (r->>'total')::integer <> 1 or (r->'records'->0->>'id')::uuid <> own_id then raise exception 'platform selected 7529 leaked or omitted part: %',r; end if;
  if public.vms_get_vehicle_part_usage_secure(qa_id) is not null then raise exception 'platform selected 7529 detail leaked QA part'; end if;
  perform set_config('request.headers','{"x-art-tenant-scope":"2824c2b5-2774-4781-b995-f55e8bcee920"}',true);
  r := public.vms_list_vehicle_part_usages_secure(p_ids=>ids);
  if (r->>'total')::integer <> 1 or (r->'records'->0->>'id')::uuid <> qa_id then raise exception 'platform selected QA leaked or omitted part: %',r; end if;
  if public.vms_get_vehicle_part_usage_secure(own_id) is not null then raise exception 'platform selected QA detail leaked 7529 part'; end if;
  perform set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
  perform set_config('request.headers','{}',true);
  r := public.vms_list_vehicle_part_usages_secure(p_ids=>ids);
  if (r->>'total')::integer <> 1 or (r->'records'->0->>'id')::uuid <> own_id then raise exception 'ordinary own scope wrong: %',r; end if;
  if public.vms_get_vehicle_part_usage_secure(qa_id) is not null then raise exception 'ordinary detail leaked QA part'; end if;
  perform set_config('request.headers','{"x-art-tenant-scope":"2824c2b5-2774-4781-b995-f55e8bcee920"}',true);
  r := public.vms_list_vehicle_part_usages_secure(p_ids=>ids);
  if (r->>'total')::integer <> 1 or (r->'records'->0->>'id')::uuid <> own_id then raise exception 'ordinary forged header changed scope: %',r; end if;
  if public.vms_get_vehicle_part_usage_secure(qa_id) is not null then raise exception 'ordinary forged header leaked detail'; end if;
end $test$;
RESET ROLE;
ROLLBACK;
