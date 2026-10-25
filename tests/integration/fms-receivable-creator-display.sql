-- Verify the actual authenticated platform creator is recognizable in a selected tenant.
begin;
select set_config('request.jwt.claims','{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','0a872664-874c-447d-a256-d0dbdca6ed45',true);
select set_config('request.headers','{"x-art-tenant-scope":"2824c2b5-2774-4781-b995-f55e8bcee920"}',true);
select set_config('test.ar_creator_document',id::text,true) from public.fms_receivable_document where tenant_id='2824c2b5-2774-4781-b995-f55e8bcee920' and kind='estimate' and created_by_auth_user_id='0a872664-874c-447d-a256-d0dbdca6ed45' limit 1;
set local role authenticated;
do $a$
declare j jsonb;
begin
 j:=public.fms_receivable_workspace_secure('estimate',jsonb_build_object('id',current_setting('test.ar_creator_document')));
 if (j->>'total')::int<>1 or nullif(j->'records'->0->>'createdBy','') is null then raise exception 'Current authenticated creator display lost';end if;
end $a$;
reset role;
select 'current actor audit display passed' result;
rollback;
