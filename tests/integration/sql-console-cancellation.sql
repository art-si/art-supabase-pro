-- Run against the configured project after installing cancellation coordination.
-- All fixture state is rolled back; no business records are modified.
BEGIN;
DO $test$
declare v_super uuid; v_ordinary uuid; v_other_tenant uuid; v_request uuid := gen_random_uuid(); v_lease uuid := gen_random_uuid(); v_state text;
begin
 select u.auth_user_id into strict v_super from public.sys_user u join public.sys_tenant t on t.id=u.tenant_id where u.system_protected and u.deleted_at is null and u.status='1' and t.builtin_type='platform' limit 1;
 select u.auth_user_id into strict v_ordinary from public.sys_user u join public.sys_tenant t on t.id=u.tenant_id where not coalesce(u.system_protected,false) and u.deleted_at is null and u.status='1' and t.builtin_type is distinct from 'platform' and u.auth_user_id is not null limit 1;
 select id into strict v_other_tenant from public.sys_tenant where builtin_type is distinct from 'platform' and status='1' limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_super,'role','authenticated')::text,true);
 perform set_config('request.headers','{}',true);
 if public.sql_console_request_control('begin',v_request,v_lease)->>'state' <> 'running' then raise exception 'begin failed'; end if;
 if public.sql_console_request_control('begin',v_request,gen_random_uuid())->>'state' <> 'conflict' then raise exception 'duplicate accepted'; end if;
 if public.sql_console_request_control('status',v_request,gen_random_uuid())->>'state' <> 'not_running' then raise exception 'forged lease accepted'; end if;
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',v_other_tenant)::text,true);
 if public.sql_console_request_control('cancel',v_request)->>'state' <> 'not_running' then raise exception 'selected scope leaked all request'; end if;
 perform set_config('request.headers','{}',true);
 if public.sql_console_request_control('status',v_request,v_lease)->>'state' <> 'running' then raise exception 'crossscope cancelled source'; end if;
 if public.sql_console_request_control('cancel',v_request)->>'state' <> 'cancel_requested' then raise exception 'cancel failed'; end if;
 if public.sql_console_request_control('finish',v_request,v_lease,'cancelled')->>'state' <> 'cancelled' then raise exception 'finish failed'; end if;
 if public.sql_console_request_control('cancel',v_request)->>'state' <> 'finished' then raise exception 'late cancel restarted'; end if;
 v_request := gen_random_uuid(); v_lease := gen_random_uuid();
 if public.sql_console_request_control('cancel',v_request)->>'state' <> 'cancel_requested' then raise exception 'early cancel failed'; end if;
 if public.sql_console_request_control('begin',v_request,v_lease)->>'state' <> 'cancel_requested' then raise exception 'early cancel did not fence begin'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_ordinary,'role','authenticated')::text,true);
 begin
  perform public.sql_console_request_control('cancel',v_request);
  raise exception 'ordinary was authorized';
 exception when insufficient_privilege then null;
 end;
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',v_other_tenant)::text,true);
 begin
  perform public.sql_console_request_control('cancel',v_request);
  raise exception 'forged tenant elevated ordinary';
 exception when insufficient_privilege then null;
 end;
end;$test$;
ROLLBACK;
