-- Run on the scoped project. Trigger behavior is exercised on disposable rows;
-- Posting-event, financial-document, and voucher creator triggers are checked;
-- no invoice, voucher, workflow, user permission, or posting event is persisted.
begin;
create temporary table posting_creator_users as select id,tenant_id from public.sys_user;
alter table posting_creator_users add primary key (id,tenant_id);
create temporary table posting_creator_probe (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  created_by_user_id uuid,
  create_by text,
  foreign key (created_by_user_id, tenant_id) references posting_creator_users(id, tenant_id)
);
do $test$
declare
  admin_user public.sys_user%rowtype;
  ordinary_user public.sys_user%rowtype;
  probe_id uuid;
  actual_creator uuid;
  audit_actor text;
  trigger_function text;
begin
  foreach trigger_function in array array[
    'app_private.set_fms_auto_posting_creator_identity',
    'app_private.set_tms_financial_document_creator_identity',
    'app_private.set_fms_voucher_creator_identity'
  ] loop
  truncate posting_creator_probe;
  execute 'drop trigger if exists posting_creator_probe_identity on posting_creator_probe';
  execute format('create trigger posting_creator_probe_identity before insert or update on posting_creator_probe for each row execute function %s()', trigger_function);
  select * into strict admin_user from public.sys_user
    where id='51760251-629d-4561-aeb8-0fbe62352494';
  select * into strict ordinary_user from public.sys_user
    where id='93f2f1e8-a3dc-4f5a-999b-6c8c02d0c7e9';

  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_user.auth_user_id,'role','authenticated','email',admin_user.user_email)::text,true);
  perform set_config('request.headers','{}',true);
  if not app_private.is_platform_super() then raise exception 'Expected protected platform administrator fixture'; end if;
  insert into posting_creator_probe(tenant_id,create_by)
    values(admin_user.tenant_id,admin_user.user_email) returning created_by_user_id into actual_creator;
  if actual_creator is distinct from admin_user.id then raise exception 'Own-tenant creator identity missing'; end if;
  insert into posting_creator_probe(tenant_id,create_by)
    values(ordinary_user.tenant_id,admin_user.user_email)
    returning id,created_by_user_id,create_by into probe_id,actual_creator,audit_actor;
  if actual_creator is not null or audit_actor is distinct from admin_user.user_email then
    raise exception 'Cross-tenant administrator audit attribution incorrect';
  end if;
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',ordinary_user.tenant_id)::text,true);
  insert into posting_creator_probe(tenant_id,created_by_user_id,create_by)
    values(ordinary_user.tenant_id,admin_user.id,admin_user.user_email)
    returning created_by_user_id into actual_creator;
  if actual_creator is not null then raise exception 'Selected-tenant creator FK should remain tenant-local'; end if;
  if trigger_function in ('app_private.set_tms_financial_document_creator_identity', 'app_private.set_fms_voucher_creator_identity') then
    begin
      insert into posting_creator_probe(tenant_id,create_by)
        values(admin_user.tenant_id,admin_user.user_email);
      raise exception 'Platform selected-scope mismatch was accepted';
    exception when insufficient_privilege then null;
    end;
    perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',ordinary_user.tenant_id)::text,true);
  end if;
  begin
    insert into posting_creator_probe(tenant_id,created_by_user_id,create_by)
      values(ordinary_user.tenant_id,ordinary_user.id,admin_user.user_email);
    raise exception 'Creator impersonation was accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    update posting_creator_probe set created_by_user_id=ordinary_user.id where id=probe_id;
    raise exception 'Creator mutation was accepted';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',ordinary_user.auth_user_id,'role','authenticated','email',ordinary_user.user_email)::text,true);
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',ordinary_user.tenant_id)::text,true);
  if app_private.is_platform_super() then raise exception 'Ordinary fixture unexpectedly has platform authority'; end if;
  insert into posting_creator_probe(tenant_id,create_by)
    values(ordinary_user.tenant_id,ordinary_user.user_email) returning created_by_user_id into actual_creator;
  if actual_creator is distinct from ordinary_user.id then raise exception 'Ordinary own-tenant attribution missing'; end if;
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',admin_user.tenant_id)::text,true);
  insert into posting_creator_probe(tenant_id,create_by)
    values(ordinary_user.tenant_id,ordinary_user.user_email) returning created_by_user_id into actual_creator;
  if actual_creator is distinct from ordinary_user.id then raise exception 'Forged header changed creator attribution'; end if;
  begin
    insert into posting_creator_probe(tenant_id,create_by)
      values(admin_user.tenant_id,ordinary_user.user_email);
    raise exception 'Ordinary cross-tenant write was accepted';
  exception when insufficient_privilege then null;
  end;
  end loop;
end
$test$;
select 'posting, financial and voucher creator identity: all/selected/ordinary/forged/impersonation/immutable passed' as result;
rollback;
