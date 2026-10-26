BEGIN;

do $setup$
declare tenant uuid:='111e83d3-190e-4405-84c8-440d484d13a6';ordinary uuid:='a9eeb9b7-e474-43e3-9cc2-c2f46c0f0ec3';root_actor uuid;
 own_configuration uuid;own_job uuid;foreign_configuration uuid;foreign_job uuid;scheme public.fms_payable_writeoff_scheme;book uuid;
begin
 select profile.auth_user_id into root_actor from public.sys_user profile join public.sys_tenant root_tenant on root_tenant.id=profile.tenant_id
 where profile.system_protected and root_tenant.builtin_type='platform' and profile.auth_user_id is not null order by profile.id limit 1;
 select id into own_configuration from public.fms_payable_writeoff_automation where tenant_id=tenant order by created_at,id limit 1;
 select id into own_job from public.fms_payable_writeoff_automation_job where automation_id=own_configuration order by created_at,id limit 1;
 if root_actor is null or own_configuration is null or own_job is null then raise exception 'Missing independent automation acceptance fixtures';end if;
 perform set_config('request.jwt.claim.sub',root_actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',root_actor,'role','authenticated')::text,true);
 perform set_config('request.headers','{}',true);
 select source.* into scheme from public.fms_payable_writeoff_scheme source where source.tenant_id<>tenant
  and exists(select 1 from public.fms_account_set where tenant_id=source.tenant_id and status='active')
  and not exists(select 1 from public.fms_payable_writeoff_automation where scheme_id=source.id)
  order by source.tenant_id,source.id limit 1;
 select id into book from public.fms_account_set where tenant_id=scheme.tenant_id and status='active' order by is_default desc,id limit 1;
 if scheme.id is null or book is null then raise exception 'Missing foreign metadata fixtures';end if;
 foreign_configuration:=public.fms_save_payable_automation_secure(jsonb_build_object('configuration_version',1,'name','RLS范围回滚配置',
  'scheme_id',scheme.id,'account_set_id',book,'enabled',false,
  'relations',jsonb_build_array(coalesce(scheme.relation_rules->0->>'relation','payable_payment'))));
 insert into public.fms_payable_writeoff_automation_job(tenant_id,automation_id,automation_version,scheme_id,scheme_version,account_set_id,job_no,relation,
  source_kind,source_side,source_id,source_document_id,source_document_no,source_revision,business_date)
 values(scheme.tenant_id,foreign_configuration,1,scheme.id,scheme.version,book,'RLS-ROLLBACK-'||gen_random_uuid(),coalesce(scheme.relation_rules->0->>'relation','payable_payment'),
  'payable','primary',gen_random_uuid(),gen_random_uuid(),'异租户范围回滚来源','rls',app_private.payable_business_date()) returning id into foreign_job;
 perform set_config('test.automation_own',own_configuration::text,true);
 perform set_config('test.automation_other',foreign_configuration::text,true);
 perform set_config('test.automation_own_job',own_job::text,true);
 perform set_config('test.automation_other_job',foreign_job::text,true);
 perform set_config('test.automation_other_tenant',scheme.tenant_id::text,true);
end $setup$;
grant select on public.fms_payable_writeoff_automation,public.fms_payable_writeoff_automation_job to authenticated;
set local role authenticated;
do $scope$
declare tenant uuid:='111e83d3-190e-4405-84c8-440d484d13a6';ordinary uuid:='a9eeb9b7-e474-43e3-9cc2-c2f46c0f0ec3';configuration_ids uuid[];
 job_ids uuid[];scope_case text;expected integer;
begin
 configuration_ids:=array[current_setting('test.automation_own')::uuid,current_setting('test.automation_other')::uuid];
 job_ids:=array[current_setting('test.automation_own_job')::uuid,current_setting('test.automation_other_job')::uuid];
 foreach scope_case in array array['platform_all','platform_selected','ordinary_own','ordinary_forged'] loop
  expected:=case when scope_case='platform_all' then 2 else 1 end;
  if scope_case='platform_selected' then perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',tenant)::text,true);
  elsif scope_case='ordinary_own' then
   perform set_config('request.jwt.claim.sub',ordinary::text,true);
   perform set_config('request.jwt.claims',jsonb_build_object('sub',ordinary,'role','authenticated')::text,true);
   perform set_config('request.headers','{}',true);
  elsif scope_case='ordinary_forged' then perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',current_setting('test.automation_other_tenant'))::text,true);end if;
  if(select count(*) from public.fms_payable_writeoff_automation where id=any(configuration_ids))<>expected then raise exception 'Configuration RLS scope failed: %',scope_case;end if;
  if(select count(*) from public.fms_payable_writeoff_automation_job where id=any(job_ids))<>expected then raise exception 'Job RLS scope failed: %',scope_case;end if;
 end loop;
end $scope$;
reset role;

ROLLBACK;

