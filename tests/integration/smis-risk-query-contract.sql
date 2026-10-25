-- Query-only scenarios require a platform write scope with no assignments/due updates.
-- Cross-tenant sort-collision fixture and all helper grants roll back.
begin isolation level repeatable read;
set local lock_timeout = '500ms';
set local statement_timeout = '20s';

do $setup$
declare definition text;
begin
  if to_regprocedure('pg_temp.risk_list_reference_api(integer,integer,text,text,text,timestamptz,timestamptz,uuid,text,text)') is null then
    definition:=pg_get_functiondef('public.smis_list_risk_inspection_tasks_secure(integer,integer,text,text,text,timestamptz,timestamptz,uuid,text,text)'::regprocedure);
    execute replace(definition,'FUNCTION public.smis_list_risk_inspection_tasks_secure(','FUNCTION pg_temp.risk_list_reference_api(');
  end if;
  execute format('grant usage on schema %I to authenticated',pg_my_temp_schema()::regnamespace::text);
end;
$setup$;
revoke all on function pg_temp.risk_list_reference_api(integer,integer,text,text,text,timestamptz,timestamptz,uuid,text,text) from public,anon,service_role;
grant execute on function pg_temp.risk_list_reference_api(integer,integer,text,text,text,timestamptz,timestamptz,uuid,text,text) to authenticated;

do $test$
declare
  uid uuid;
  platform_tenant uuid;
  denied_uid uuid;
  candidate record;
  reference jsonb;
  full_result jsonb;
  response jsonb;
  expected jsonb;
  cases jsonb;
  test_case jsonb;
  sample jsonb;
  selected_status text;
  actual_executor text;
  point_from timestamptz;
  point_to timestamptz;
  from_row integer;
  to_row integer;
  keyword text;
  risk_name text;
  risk_type text;
  responsible uuid;
  status_filter text;
  executor_filter text;
  source_task public.smis_risk_inspection_task%rowtype;
  target_task public.smis_risk_inspection_task%rowtype;
  fixture_tenant uuid;
  fixture_employee uuid;
  fixture_site uuid;
  fixture_point uuid:=gen_random_uuid();
  fixture_plan uuid:=gen_random_uuid();
  fixture_config uuid:=gen_random_uuid();
  fixture_assignment uuid:=gen_random_uuid();
  fixture_task uuid:=gen_random_uuid();
  fixture_menu uuid;
  fixture_point_no text;
  ordinal_a integer;
  ordinal_b integer;
begin
  select u.auth_user_id,u.tenant_id into uid,platform_tenant from public.sys_user u
  join public.sys_tenant t on t.id=u.tenant_id where u.system_protected and u.status='1'
    and u.deleted_at is null and t.builtin_type='platform' limit 1;
  if uid is null or exists(select 1 from public.smis_risk_control_assignment where tenant_id=platform_tenant)
    or exists(select 1 from public.smis_risk_inspection_task where tenant_id=platform_tenant
      and status in ('not_started','in_progress') and planned_end_at<now()) then
    raise exception '[risk-query] Requires an isolated platform generation scope';
  end if;
  for candidate in select u.auth_user_id from public.sys_user u join auth.users a on a.id=u.auth_user_id
    where u.status='1' and u.deleted_at is null and not u.system_protected order by u.id loop
    perform set_config('request.jwt.claim.sub',candidate.auth_user_id::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',candidate.auth_user_id,'role','authenticated')::text,true);
    perform set_config('request.headers','{}',true);
    execute 'set local role authenticated';
    if not app_private.has_permission('SmisDualControlRiskInspectionTask:View') then denied_uid:=candidate.auth_user_id;end if;
    execute 'reset role';
    exit when denied_uid is not null;
  end loop;
  if denied_uid is null then raise exception '[risk-query] Requires a denied View fixture';end if;
  perform set_config('request.jwt.claim.sub',uid::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  execute 'set local role authenticated';
  reference:=pg_temp.risk_list_reference_api(0,50000);
  full_result:=public.smis_list_risk_inspection_tasks_secure(0,2147483647);
  execute 'reset role';
  if full_result is distinct from reference then raise exception '[risk-query] Full record values or ordering changed';end if;
  if jsonb_array_length(full_result->'records')<>(full_result->>'total')::integer then
    raise exception '[risk-query] Full range did not return the total';
  end if;
  if exists(select 1 from jsonb_array_elements(full_result->'records') r where r.value ? 'tenantId') then
    raise exception '[risk-query] Internal tenant projection leaked into the DTO';
  end if;
  if exists(
    select 1 from jsonb_array_elements(full_result->'records') r
    join public.smis_risk_inspection_task t on t.id=(r.value->>'id')::uuid
    left join lateral(select count(*) as total,count(*)filter(where result<>'pending') as done,
      count(*)filter(where result='abnormal') as abnormal from public.smis_risk_inspection_task_item i
      where i.tenant_id=t.tenant_id and i.task_id=t.id) counts on true
    where (r.value->>'itemCount')::bigint<>counts.total
      or (r.value->>'completedItemCount')::bigint<>counts.done
      or (r.value->>'abnormalCount')::bigint<>counts.abnormal
  ) then raise exception '[risk-query] Item aggregates changed';end if;
  sample:=reference->'records'->0;
  if sample is null then raise exception '[risk-query] Requires existing task data';end if;
  select r.value->>'actualExecutorEmployeeNo' into actual_executor
  from jsonb_array_elements(reference->'records') r where r.value->>'actualExecutorEmployeeNo' is not null limit 1;
  cases:=jsonb_build_array(
    '{}'::jsonb,jsonb_build_object('keyword',sample->>'taskNo'),
    jsonb_build_object('keyword','  '),jsonb_build_object('riskName',sample->>'riskPointName'),
    jsonb_build_object('riskType',sample->>'riskPointType'),
    jsonb_build_object('fromDate',sample->>'plannedStartAt','toDate',sample->>'plannedEndAt'),
    jsonb_build_object('responsible',sample->>'responsibleEmployeeId'),
    jsonb_build_object('status',sample->>'status'),jsonb_build_object('status','cancelled'),
    jsonb_build_object('executor',coalesce(actual_executor,'quality-no-executor-match')),
    jsonb_build_object('keyword','quality-no-task-match'),
    jsonb_build_object('from',-20,'to',-30),jsonb_build_object('from',10,'to',9),
    jsonb_build_object('from',2147483647,'to',-2147483648),
    jsonb_build_object('from',5,'to',null)
  );
  for test_case in select value from jsonb_array_elements(cases) loop
    from_row:=case when test_case ? 'from' then (test_case->>'from')::integer else 0 end;
    to_row:=case when test_case ? 'to' then (test_case->>'to')::integer else 19 end;
    keyword:=test_case->>'keyword';risk_name:=test_case->>'riskName';risk_type:=test_case->>'riskType';
    point_from:=(test_case->>'fromDate')::timestamptz;point_to:=(test_case->>'toDate')::timestamptz;
    responsible:=(test_case->>'responsible')::uuid;status_filter:=test_case->>'status';executor_filter:=test_case->>'executor';
    with nonstatus as (
      select r.value as row_data,r.ordinality from jsonb_array_elements(reference->'records') with ordinality r
      where (keyword is null or btrim(keyword)='' or r.value->>'taskNo' ilike '%'||btrim(keyword)||'%' or r.value->>'riskPointNo' ilike '%'||btrim(keyword)||'%')
        and (risk_name is null or btrim(risk_name)='' or r.value->>'riskPointName' ilike '%'||btrim(risk_name)||'%')
        and (risk_type is null or r.value->>'riskPointType'=risk_type)
        and (point_from is null or (r.value->>'plannedStartAt')::timestamptz>=point_from)
        and (point_to is null or (r.value->>'plannedStartAt')::timestamptz<=point_to)
        and (responsible is null or (r.value->>'responsibleEmployeeId')::uuid=responsible)
        and (executor_filter is null or btrim(executor_filter)='' or r.value->>'actualExecutorEmployeeName' ilike '%'||btrim(executor_filter)||'%' or r.value->>'actualExecutorEmployeeNo' ilike '%'||btrim(executor_filter)||'%')
    ), filtered as (select * from nonstatus where status_filter is null or row_data->>'status'=status_filter),
    paged as (select * from filtered order by ordinality offset greatest(coalesce(from_row,0),0)
      limit greatest(coalesce(to_row,19)::bigint-greatest(coalesce(from_row,0),0)::bigint+1,1))
    select jsonb_build_object('records',coalesce((select jsonb_agg(row_data order by ordinality) from paged),'[]'::jsonb),
      'total',(select count(*) from filtered),'overview',jsonb_build_object(
        'total',(select count(*) from nonstatus),'notStarted',(select count(*) from nonstatus where row_data->>'status'='not_started'),
        'inProgress',(select count(*) from nonstatus where row_data->>'status'='in_progress'),
        'overdue',(select count(*) from nonstatus where row_data->>'status'='overdue'),
        'completed',(select count(*) from nonstatus where row_data->>'status'='completed'))) into expected;
    execute 'set local role authenticated';
    response:=public.smis_list_risk_inspection_tasks_secure(from_row,to_row,keyword,risk_name,risk_type,point_from,point_to,responsible,status_filter,executor_filter);
    execute 'reset role';
    if response is distinct from expected then raise exception '[risk-query] Filter/page/overview result differs for keys: %', (select string_agg(key, ',' order by key) from jsonb_object_keys(test_case) as keys(key));end if;
  end loop;
  -- Build a complete second-tenant history fixture; never weaken tenant FKs.
  select a.* into source_task from public.smis_risk_inspection_task a
  join public.sys_tenant tenant on tenant.id=a.tenant_id
  where a.tenant_id<>platform_tenant and tenant.status='1'
    and (tenant.service_start_date is null or tenant.service_start_date<=(now() at time zone 'Asia/Shanghai')::date)
    and (tenant.service_end_date is null or tenant.service_end_date>=(now() at time zone 'Asia/Shanghai')::date)
  order by a.id limit 1;
  select t.id into fixture_tenant from public.sys_tenant t
  where t.id<>source_task.tenant_id and t.id<>platform_tenant and t.status='1'
    and t.builtin_type is distinct from 'platform'
    and (t.service_start_date is null or t.service_start_date<=(now() at time zone 'Asia/Shanghai')::date)
    and (t.service_end_date is null or t.service_end_date>=(now() at time zone 'Asia/Shanghai')::date)
    and exists(select 1 from public.mdm_employee e where e.tenant_id=t.id)
    and exists(select 1 from public.mdm_site site where site.tenant_id=t.id)
  order by t.id limit 1;
  if fixture_tenant is null then raise exception '[risk-query] Requires a second tenant with employee and site references';end if;
  select id into fixture_employee from public.mdm_employee where tenant_id=fixture_tenant order by id limit 1;
  select id into fixture_site from public.mdm_site where tenant_id=fixture_tenant order by id limit 1;
  select lpad(n::text,5,'0') into fixture_point_no from generate_series(99999,99000,-1)n
  where not exists(select 1 from public.smis_risk_point p where p.tenant_id=fixture_tenant and p.point_no=lpad(n::text,5,'0')) limit 1;
  select d.menu_id into fixture_menu from public.smis_risk_control_assignment a
  join public.smis_duplicate_configuration d on d.id=a.duplicate_configuration_id and d.tenant_id=a.tenant_id where a.id=source_task.assignment_id;
  insert into public.smis_risk_point(id,tenant_id,point_no,point_name,risk_type,site_id,equipment_name,is_special_equipment,control_plan_attachment_urls,photo_urls,attachment_urls,status,sort)
  values(fixture_point,fixture_tenant,fixture_point_no,'quality sort fixture','unset',fixture_site,'quality fixture',false,'[]','[]','[]','voided',0);
  insert into public.smis_risk_control_plan(id,tenant_id,risk_point_id,control_start_at,status)
  values(fixture_plan,fixture_tenant,fixture_point,source_task.planned_start_at,'suspended');
  insert into public.smis_duplicate_configuration(id,tenant_id,menu_id,content_item,repeat_enabled,repeat_frequency,frequency_unit,calendar_type,calendar_days,status,sort,tag_style)
  values(fixture_config,fixture_tenant,fixture_menu,'quality sort '||fixture_config,false,null,null,'none','{}','disabled',0,'');
  insert into public.smis_risk_control_assignment(id,tenant_id,plan_id,control_level,responsible_employee_id,duplicate_configuration_id,status,sort)
  values(fixture_assignment,fixture_tenant,fixture_plan,'company',fixture_employee,fixture_config,'inactive',0);
  insert into public.smis_risk_inspection_task(id,tenant_id,assignment_id,risk_point_id,task_no,responsible_employee_id,assignee_employee_id,planned_start_at,planned_end_at,status)
  values(fixture_task,fixture_tenant,fixture_assignment,fixture_point,source_task.task_no,fixture_employee,fixture_employee,source_task.planned_start_at,source_task.planned_end_at,'cancelled');
  select * into target_task from public.smis_risk_inspection_task where id=fixture_task;
  execute 'set local role authenticated';full_result:=public.smis_list_risk_inspection_tasks_secure(0,2147483647);execute 'reset role';
  if full_result->'records' is distinct from (select jsonb_agg(r.value order by (r.value->>'plannedStartAt')::timestamptz desc,r.value->>'taskNo' desc,(r.value->>'id')::uuid desc) from jsonb_array_elements(full_result->'records')r) then
    raise exception '[risk-query] Stable ID tie-breaker was lost';
  end if;
  select r.ordinality::integer into ordinal_a from jsonb_array_elements(full_result->'records')with ordinality r where r.value->>'id'=source_task.id::text;
  select r.ordinality::integer into ordinal_b from jsonb_array_elements(full_result->'records')with ordinality r where r.value->>'id'=target_task.id::text;
  if ordinal_a is null or ordinal_b is null or abs(ordinal_a-ordinal_b)<>1
    or (full_result->>'total')::integer<>(reference->>'total')::integer+1 then
    raise exception '[risk-query] Cross-tenant history fixture was hidden or tied rows were not adjacent';
  end if;
  execute 'set local role authenticated';
  response:=public.smis_list_risk_inspection_tasks_secure(ordinal_a-1,ordinal_a-1);
  if response->'records'->0->>'id' is distinct from source_task.id::text then raise exception '[risk-query] First tied single-row page differs';end if;
  response:=public.smis_list_risk_inspection_tasks_secure(ordinal_b-1,ordinal_b-1);
  if response->'records'->0->>'id' is distinct from target_task.id::text then raise exception '[risk-query] Second tied single-row page differs';end if;
  execute 'reset role';
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',source_task.tenant_id)::text,true);
  execute 'set local role authenticated';response:=public.smis_list_risk_inspection_tasks_secure(0,2147483647);execute 'reset role';
  if exists(select 1 from jsonb_array_elements(response->'records')r join public.smis_risk_inspection_task t on t.id=(r.value->>'id')::uuid where t.tenant_id<>source_task.tenant_id) then
    raise exception '[risk-query] Selected tenant included the second-tenant history fixture';
  end if;
  perform set_config('request.jwt.claim.sub',denied_uid::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',denied_uid,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  begin
    perform public.smis_list_risk_inspection_tasks_secure();raise exception '[risk-query] View permission was bypassed';
  exception when insufficient_privilege then
    if sqlerrm<>'当前账号没有查看风险巡查任务的权限' then raise;end if;
  end;
  execute 'reset role';
end;
$test$;

select 'risk filters, overview, bigint ranges, stable cross-tenant pages and denied View passed' as result;
rollback;
