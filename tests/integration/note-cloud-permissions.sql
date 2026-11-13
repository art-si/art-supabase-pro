begin;
-- Rollback-only; identifiers are selected in the target database and never printed.
do $$
declare
  admin uuid;
  ordinary uuid;
  ordinary_profile uuid;
  ordinary_tenant uuid;
  other_tenant uuid;
  other_user uuid;
  old_count integer;
  selected_count integer;
  affected integer;
  test_note uuid;
  stamp timestamptz;
  initial_stamp timestamptz;
  status text;
begin
  select u.auth_user_id into strict admin from public.sys_user u join public.sys_role r
    on r.tenant_id=u.tenant_id and r.role_code=any(u.user_roles) and r.enabled
    where u.status='1' and u.system_protected and u.deleted_at is null
      and r.builtin_type='platform_super' limit 1;
  select u.auth_user_id,u.id,u.tenant_id into strict ordinary,ordinary_profile,ordinary_tenant
    from public.sys_user u join public.sys_tenant t on t.id=u.tenant_id and t.status='1'
    where u.status='1' and u.deleted_at is null and u.auth_user_id is not null and u.auth_user_id<>admin
      and u.tenant_id<>app_private.platform_tenant_id() limit 1;
  select t.id into strict other_tenant from public.sys_tenant t where t.status='1' and t.id<>ordinary_tenant limit 1;
  select auth_user_id into other_user from public.sys_user where auth_user_id is not null and auth_user_id<>ordinary and id<>ordinary_profile limit 1;
  select count(*) into old_count from public.notes;
  select count(*) into selected_count from public.notes n
  where exists(select 1 from public.sys_user u where u.auth_user_id=n.user_id
    and u.tenant_id=ordinary_tenant and u.deleted_at is null);

  perform set_config('request.headers','{}',true);
  perform set_config('request.jwt.claims','{}',true);
  execute 'set local role anon';
  if public.get_note_cloud_access() not in ('login','closed') then raise exception 'anonymous leaked eligibility'; end if;
  if has_function_privilege('public.get_note_cloud_settings()','EXECUTE') then raise exception 'anon can read settings'; end if;
  if has_function_privilege('public.save_note_cloud_settings(text,uuid[],timestamptz)','EXECUTE') then raise exception 'anon can write settings'; end if;
  execute 'reset role';

  perform set_config('request.jwt.claims',json_build_object('sub',admin,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  select (public.get_note_cloud_settings()->>'updated_at')::timestamptz into initial_stamp;
  perform set_config('request.headers',json_build_object('x-art-tenant-scope',ordinary_tenant)::text,true);
  if (select count(*) from public.notes) <> selected_count then
    raise exception 'platform selected tenant read escaped its scope';
  end if;
  begin
    perform public.save_note_cloud_settings('closed','{}',initial_stamp);
    raise exception 'selected tenant can overwrite the global policy';
  exception when insufficient_privilege then null; end;
  perform set_config('request.headers','{}',true);
  select (public.save_note_cloud_settings('closed','{}',initial_stamp)->>'updated_at')::timestamptz into stamp;
  if public.get_note_cloud_access() <> 'closed' then raise exception 'closed switch ignored'; end if;
  if (select count(*) from public.notes) <> old_count then raise exception 'platform admin lost management visibility'; end if;
  begin
    perform public.save_note_cloud_settings('all','{}',initial_stamp);
    raise exception 'stale save accepted';
  exception when serialization_failure then null; end;

  perform set_config('request.jwt.claims',json_build_object('sub',ordinary,'role','authenticated')::text,true);
  if public.get_note_cloud_access() <> 'closed' or exists (select 1 from public.notes) then raise exception 'closed gate failed'; end if;
  begin
    perform public.get_note_cloud_settings();
    raise exception 'ordinary user can read allowlist';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_note_cloud_settings('all','{}',stamp);
    raise exception 'ordinary user can change allowlist';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.notes(user_id,content) values(ordinary,'ACL rollback only');
    raise exception 'ungranted note creation accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects(bucket_id,name) values('note-images',ordinary::text||'/note-cloud-acl-rollback.png');
    raise exception 'ungranted image creation accepted';
  exception when insufficient_privilege then null; end;

  perform set_config('request.jwt.claims',json_build_object('sub',admin,'role','authenticated')::text,true);
  select (public.save_note_cloud_settings('tenants',array[other_tenant],stamp)->>'updated_at')::timestamptz into stamp;
  perform set_config('request.jwt.claims',json_build_object('sub',ordinary,'role','authenticated')::text,true);
  perform set_config('request.headers',json_build_object('x-art-tenant-scope',other_tenant)::text,true);
  if public.get_note_cloud_access() <> 'denied' or exists (select 1 from public.notes) then raise exception 'forged tenant bypassed gate'; end if;
  perform set_config('request.headers','{}',true);

  perform set_config('request.jwt.claims',json_build_object('sub',admin,'role','authenticated')::text,true);
  select (public.save_note_cloud_settings('tenants',array[ordinary_tenant],stamp)->>'updated_at')::timestamptz into stamp;
  perform set_config('request.jwt.claims',json_build_object('sub',ordinary,'role','authenticated')::text,true);
  if public.get_note_cloud_access() <> 'allowed' then raise exception 'matching tenant denied'; end if;
  insert into public.notes(user_id,content) values(ordinary,'ACL rollback only') returning id into test_note;
  insert into storage.objects(bucket_id,name) values('note-images',ordinary::text||'/note-cloud-acl-rollback.png');
  if exists (select 1 from public.notes where user_id<>ordinary)
    or not exists (select 1 from public.notes where id=test_note)
    or not exists (select 1 from storage.objects where bucket_id='note-images'
      and name=ordinary::text||'/note-cloud-acl-rollback.png') then raise exception 'tenant grant broke owner isolation'; end if;
  begin
    insert into storage.objects(bucket_id,name) values('note-images',other_user::text||'/note-cloud-acl-rollback.png');
    raise exception 'foreign image path accepted';
  exception when insufficient_privilege then null; end;

  perform set_config('request.jwt.claims',json_build_object('sub',admin,'role','authenticated')::text,true);
  select (public.save_note_cloud_settings('users',array[ordinary_profile],stamp)->>'updated_at')::timestamptz into stamp;
  perform set_config('request.jwt.claims',json_build_object('sub',ordinary,'role','authenticated')::text,true);
  if public.get_note_cloud_access() <> 'allowed' then raise exception 'assigned user denied'; end if;
  update public.notes set content='ACL rollback only (updated)' where id=test_note;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'assigned owner cannot update note'; end if;
  perform set_config('request.jwt.claims',json_build_object('sub',other_user,'role','authenticated')::text,true);
  if public.get_note_cloud_access() <> 'denied' then raise exception 'unassigned user granted access'; end if;
  perform set_config('request.jwt.claims',json_build_object('sub',ordinary,'role','authenticated')::text,true);
  delete from public.notes where id=test_note;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'assigned owner cannot delete note'; end if;

  perform set_config('request.jwt.claims',json_build_object('sub',admin,'role','authenticated')::text,true);
  select (public.save_note_cloud_settings('closed','{}',stamp)->>'updated_at')::timestamptz into stamp;
  perform set_config('request.jwt.claims',json_build_object('sub',ordinary,'role','authenticated')::text,true);
  if exists (select 1 from storage.objects where bucket_id='note-images') then raise exception 'revoked user still reads images'; end if;
  perform set_config('request.jwt.claims',json_build_object('sub',admin,'role','authenticated')::text,true);
  select (public.save_note_cloud_settings('all','{}',stamp)->>'updated_at')::timestamptz into stamp;
  perform set_config('request.jwt.claims',json_build_object('sub',ordinary,'role','authenticated')::text,true);
  if public.get_note_cloud_access() <> 'allowed' then raise exception 'enabled account denied in all mode'; end if;
  execute 'reset role';
end
$$;
rollback;
select 'note cloud permission scenarios passed' as result;
