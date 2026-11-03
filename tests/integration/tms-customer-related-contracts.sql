-- Real-role checks; candidate inserts/copies and all numbering changes are rolled back.
begin;
do $test$
declare
  super_actor uuid; ordinary_actor uuid; sample public.tms_electronic_contract;
  own_customer uuid; alien_customer uuid; alien_tenant uuid;
  created_id uuid; copied_id uuid; all_count integer; own_count integer; forged_count integer;
  candidate record;
begin
  select u.auth_user_id into super_actor from public.sys_user u join public.sys_tenant t on t.id=u.tenant_id
    where t.builtin_type='platform' and u.system_protected and u.status='1' and u.deleted_at is null limit 1;
  select * into sample from public.tms_electronic_contract order by create_time limit 1;
  select id into own_customer from public.mdm_customer where tenant_id=sample.tenant_id limit 1;
  select c.id,c.tenant_id into alien_customer,alien_tenant from public.mdm_customer c join public.sys_tenant t on t.id=c.tenant_id
    where c.tenant_id<>sample.tenant_id and t.status='1' limit 1;
  if super_actor is null or sample.id is null or own_customer is null or alien_customer is null then raise exception '需要平台用户、合同和两个租户客户作为验收样本'; end if;
  for candidate in select auth_user_id from public.sys_user where tenant_id=sample.tenant_id and status='1' and deleted_at is null and auth_user_id is not null loop
    perform set_config('request.jwt.claim.sub',candidate.auth_user_id::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',candidate.auth_user_id,'role','authenticated')::text,true);
    perform set_config('request.headers','{}',true);
    if not app_private.is_platform_super() and app_private.has_permission('TmsElectronicContract:View') then ordinary_actor:=candidate.auth_user_id; exit; end if;
  end loop;
  if ordinary_actor is null then raise exception '缺少有电子合同查看权限的普通用户'; end if;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',super_actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',super_actor,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  select count(*) into all_count from public.tms_electronic_contract;
  if all_count<1 then raise exception '平台全部租户未返回合同'; end if;
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',alien_tenant::text)::text,true);
  if exists(select 1 from public.tms_electronic_contract where tenant_id=sample.tenant_id) then raise exception '平台指定租户泄漏其他租户合同'; end if;
  perform set_config('request.headers','{}',true);
  insert into public.tms_electronic_contract(tenant_id,customer_id,contract_no,contract_name,party_a_company,party_a_representative,party_a_subject,party_b_carrier_id,party_b_company,party_b_representative,party_b_subject,starts_on,ends_on,content_html,attachments,status)
    values(sample.tenant_id,own_customer,'','客户档案验收临时合同',sample.party_a_company,sample.party_a_representative,sample.party_a_subject,sample.party_b_carrier_id,sample.party_b_company,sample.party_b_representative,sample.party_b_subject,sample.starts_on,sample.ends_on,sample.content_html,sample.attachments,'pending_signed') returning id into created_id;
  copied_id:=public.tms_copy_electronic_contract(created_id);
  if not exists(select 1 from public.tms_electronic_contract where id=copied_id and customer_id=own_customer and tenant_id=sample.tenant_id) then raise exception '复制合同丢失所属客户或租户'; end if;
  begin
    insert into public.tms_electronic_contract(tenant_id,customer_id,contract_no,contract_name,party_a_company,party_a_subject,party_b_carrier_id,party_b_company,party_b_subject,starts_on,ends_on,content_html,attachments,status)
      values(sample.tenant_id,alien_customer,'','不得跨租户关联',sample.party_a_company,sample.party_a_subject,sample.party_b_carrier_id,sample.party_b_company,sample.party_b_subject,sample.starts_on,sample.ends_on,sample.content_html,sample.attachments,'pending_signed');
    raise exception '跨租户客户关联未被阻止';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub',ordinary_actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',ordinary_actor,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  select count(*) into own_count from public.tms_electronic_contract;
  if own_count<1 or exists(select 1 from public.tms_electronic_contract where tenant_id<>sample.tenant_id) then raise exception '普通用户本租户读取不正确'; end if;
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',alien_tenant::text)::text,true);
  select count(*) into forged_count from public.tms_electronic_contract;
  if own_count<>forged_count or exists(select 1 from public.tms_electronic_contract where tenant_id<>sample.tenant_id) then raise exception '伪造租户头改变普通用户范围'; end if;
  raise notice '客户电子合同：平台全部/指定、普通本租户/伪造头、按客户关联与复制均通过';
end $test$;
rollback;
