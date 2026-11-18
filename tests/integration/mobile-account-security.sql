begin;

-- Exercise the live database contract without retaining test users or business data.
do $test$
declare
 v_super uuid; v_ordinary public.sys_user%rowtype;
 v_binding app_private.driver_accounts%rowtype;
 v_foreign_tenant uuid; v_role uuid:=gen_random_uuid();
 v_role_code text:='qa_mobile_'||replace(gen_random_uuid()::text,'-','');
 v_account jsonb; v_result jsonb; v_previous_phone text;
 v_customer uuid; v_auth uuid:=gen_random_uuid(); v_email text;
 v_rejected boolean; v_driver uuid; v_super_session uuid:=gen_random_uuid(); v_actor_session uuid:=gen_random_uuid(); v_customer_session uuid:=gen_random_uuid();
begin
 select auth_user_id into strict v_super from public.sys_user where system_protected and status='1' and deleted_at is null;
 select b.* into strict v_binding from app_private.driver_accounts b join public.sys_user u on u.id=b.user_id where u.account_identity_type='external' order by b.auth_user_id limit 1;
 select * into strict v_ordinary from public.sys_user where id=v_binding.user_id;
 select id into strict v_foreign_tenant from public.sys_tenant where id<>v_binding.tenant_id and status='1' limit 1;
 select id into strict v_customer from public.mdm_customer where tenant_id=v_binding.tenant_id and enabled limit 1;

 insert into auth.sessions(id,user_id,created_at,updated_at) values(v_super_session,v_super,now(),now()),(v_actor_session,v_ordinary.auth_user_id,now(),now());
 perform set_config('request.jwt.claims','{}',true);
 v_rejected:=false;
 begin perform public.system_list_mobile_accounts(); exception when insufficient_privilege then v_rejected:=true; end;
 if not v_rejected then raise exception 'Anonymous mobile management was allowed'; end if;
 if has_function_privilege('anon','public.mobile_account_login_candidates(text,text)','execute')
 or has_function_privilege('authenticated','public.mobile_driver_account_identity(uuid,uuid)','execute') then
  raise exception 'Private identity lookup was exposed'; end if;

 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_super,'role','authenticated','session_id',v_super_session)::text,true);
 perform set_config('request.headers','{}',true);
 if not exists(select 1 from public.get_governed_delete_dependency_details('driver',array[v_binding.driver_id]) d
  where d.dependency_code='driver_mobile_account' and d.target_id=v_binding.auth_user_id and not d.cleanup_allowed) then
  raise exception 'Driver mobile account was missing from delete references'; end if;
 v_result:=public.system_list_mobile_accounts();
 if (v_result->>'total')::integer<4 then raise exception 'Existing driver accounts were not preserved'; end if;
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',v_foreign_tenant)::text,true);
 v_result:=public.system_list_mobile_accounts();
 if exists(select 1 from jsonb_array_elements(v_result->'records') r where (r->>'tenantId')::uuid<>v_foreign_tenant) then
  raise exception 'Platform selected tenant leaked records'; end if;

 perform set_config('request.headers','{}',true);
 insert into public.sys_role(id,role_code,role_name,enabled,tenant_id)
 values(v_role,v_role_code,'移动账号事务验收角色',true,v_binding.tenant_id);
 insert into public.sys_role_menu(role_id,menu_id,tenant_id)
 select v_role,m.id,v_binding.tenant_id from public.sys_menu m
 where m.name in ('User','System:User:ManageMobile','System:User:Add','System:User:ResetPassword');
 update public.sys_user set user_roles=array_append(coalesce(user_roles,array[]::text[]),v_role_code) where id=v_ordinary.id;

 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_ordinary.auth_user_id,'role','authenticated','session_id',v_actor_session)::text,true);
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',v_foreign_tenant)::text,true);
 v_result:=public.system_list_mobile_accounts();
 if exists(select 1 from jsonb_array_elements(v_result->'records') r where (r->>'tenantId')::uuid<>v_binding.tenant_id) then
  raise exception 'Forged ordinary tenant header leaked records'; end if;
 v_rejected:=false;
 begin perform public.system_mobile_account_workspace(v_foreign_tenant); exception when insufficient_privilege then v_rejected:=true; end;
 if not v_rejected then raise exception 'Cross-tenant account maintenance was allowed'; end if;

 v_account:=app_private.mobile_account_json(v_binding.auth_user_id,'driver');
 v_rejected:=false;
 begin perform public.system_save_mobile_account(v_account||jsonb_build_object('expectedVersion','stale'));
 exception when serialization_failure then v_rejected:=true; end;
 if not v_rejected then raise exception 'Stale binding update was allowed'; end if;
 v_result:=public.system_save_mobile_account(v_account||jsonb_build_object('expectedVersion',v_account->>'version'));
 if (v_result->>'driverId')::uuid<>v_binding.driver_id then raise exception 'Driver identity was changed'; end if;

 v_result:=public.system_save_mobile_account(v_result||jsonb_build_object('enabled',false,'driverId',null,'expectedVersion',v_result->>'version'));
 if v_result->>'driverId' is not null then raise exception 'Explicit driver unlink retained the old reference'; end if;
 v_result:=public.system_save_mobile_account(v_result||jsonb_build_object('enabled',true,'driverId',v_binding.driver_id,'expectedVersion',v_result->>'version'));
 v_previous_phone:=v_ordinary.user_phone;
 update public.sys_user set user_phone=null where id=v_ordinary.id;
 v_driver:=public.mobile_driver_account_identity(v_ordinary.auth_user_id,v_binding.tenant_id);
 if v_driver is distinct from v_binding.driver_id then raise exception 'Changing contact phone changed driver identity'; end if;
 update public.sys_user set user_phone=v_previous_phone where id=v_ordinary.id;
 update app_private.driver_accounts set enabled=false where auth_user_id=v_binding.auth_user_id;
 if public.mobile_driver_account_identity(v_binding.auth_user_id) is not null then raise exception 'Disabled driver account was admitted'; end if;
 update app_private.driver_accounts set enabled=true where auth_user_id=v_binding.auth_user_id;
 update public.sys_user set status='2' where id=v_ordinary.id;
 if public.mobile_driver_account_identity(v_binding.auth_user_id) is not null then raise exception 'Disabled system user was admitted'; end if;
 update public.sys_user set status='1' where id=v_ordinary.id;

 v_email:='mobile-sql-'||v_auth::text||'@example.invalid';
 insert into auth.users(id,email,aud,role,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
 values(v_auth,v_email,'authenticated','authenticated',now(),
 jsonb_build_object('mobile_tenant_id',v_binding.tenant_id,'mobile_account_kind','shipper'),'{}'::jsonb);
 v_result:=public.system_save_mobile_account(jsonb_build_object(
 'authUserId',v_auth,'tenantId',v_binding.tenant_id,'kind','shipper','displayName','货主事务验收',
 'phone',null,'enabled',true,'customerId',v_customer,'orderActorId',v_ordinary.id,'expectedVersion',null));
 if (v_result->>'customerId')::uuid<>v_customer or exists(select 1 from public.sys_user where auth_user_id=v_auth) then
  raise exception 'Shipper identity received an internal system account'; end if;
 if not exists(select 1 from public.mobile_account_login_candidates('shipper',v_email) where auth_user_id=v_auth) then
  raise exception 'Enabled shipper could not resolve its login account'; end if;
 v_result:=public.tms_shipper_mobile(v_auth,'profile','{}');
 if v_result->>'customerName' is distinct from (select customer_name from public.mdm_customer where id=v_customer) then
  raise exception 'Shipper profile used a different customer'; end if;
 if v_result->>'canCreate'<>'true' then raise exception 'Configured shipper could not create orders'; end if;
 update tms_shipper_private.accounts set order_actor_id=null where auth_user_id=v_auth;
 if public.tms_shipper_mobile(v_auth,'profile','{}')->>'canCreate'<>'false' then raise exception 'Read-only shipper could create orders'; end if;
 v_rejected:=false;
 begin perform public.tms_shipper_mobile(v_auth,'create','{"requestId":"qa-read-only-order"}'::jsonb); exception when insufficient_privilege then v_rejected:=true; end;
 if not v_rejected then raise exception 'Read-only shipper write was allowed'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_super,'role','authenticated','session_id',v_super_session)::text,true);
 perform set_config('request.headers','{}',true);
 if not exists(select 1 from public.get_mdm_customer_delete_dependency_details_secure(array[v_customer::text]) d
  where d.source_table='mobile_shipper_account' and d.target_id=v_auth::text) then raise exception 'Customer mobile account was missing from delete references'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_ordinary.auth_user_id,'role','authenticated','session_id',v_actor_session)::text,true);
 insert into auth.sessions(id,user_id,created_at,updated_at) values(v_customer_session,v_auth,now(),now());
 perform public.system_mobile_account_password_changed(v_auth);
 if public.mobile_account_session_active(v_auth,v_customer_session) then raise exception 'Password reset retained the previous mobile session'; end if;
 update tms_shipper_private.accounts set enabled=false where auth_user_id=v_auth;
 v_rejected:=false;
 begin perform public.tms_shipper_mobile(v_auth,'profile','{}'); exception when insufficient_privilege then v_rejected:=true; end;
 if not v_rejected then raise exception 'Disabled shipper could still access business data'; end if;

 delete from public.sys_role_menu where role_id=v_role;
 v_rejected:=false;
 begin perform public.system_list_mobile_accounts(); exception when insufficient_privilege then v_rejected:=true; end;
 if not v_rejected then raise exception 'Account without management permission could read accounts'; end if;
 -- Exercise the actual Edge Function database role as well as postgres. The
 -- service-only dispatcher needs its guarded definer boundary to inspect Auth.
 update tms_shipper_private.accounts set enabled=true where auth_user_id=v_auth;
 perform set_config('qa.mobile_auth',v_auth::text,true);
end
$test$;

set local role service_role;
select public.tms_shipper_mobile(current_setting('qa.mobile_auth')::uuid,'profile','{}');

rollback;
