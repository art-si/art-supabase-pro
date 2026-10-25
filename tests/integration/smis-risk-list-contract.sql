-- Existing metadata supplies a valid plan and an unused control level.
-- The assignment, generated tasks/items/events/counters and all helper grants roll back.
begin isolation level repeatable read;
set local lock_timeout = '500ms';
set local statement_timeout = '60s';
set local idle_in_transaction_session_timeout = '5s';

do $setup$
declare definition text;
begin
  if to_regprocedure('pg_temp.risk_list_reference_api(integer,integer,text,text,text,timestamptz,timestamptz,uuid,text,text)') is null then
    definition := pg_get_functiondef('public.smis_list_risk_inspection_tasks_secure(integer,integer,text,text,text,timestamptz,timestamptz,uuid,text,text)'::regprocedure);
    execute replace(definition, 'FUNCTION public.smis_list_risk_inspection_tasks_secure(', 'FUNCTION pg_temp.risk_list_reference_api(');
  end if;
  execute format('grant usage on schema %I to authenticated', pg_my_temp_schema()::regnamespace::text);
end;
$setup$;
revoke all on function pg_temp.risk_list_reference_api(integer,integer,text,text,text,timestamptz,timestamptz,uuid,text,text) from public,anon,service_role;
grant execute on function pg_temp.risk_list_reference_api(integer,integer,text,text,text,timestamptz,timestamptz,uuid,text,text) to authenticated;

create function pg_temp.risk_state(existing jsonb)
returns jsonb language sql stable set search_path = pg_catalog as $snapshot$
with tasks as (
  select t.*, case when existing ? ('task:'||t.id) then t.id::text
    else 'new-task:'||t.tenant_id||':'||t.task_no end as stable_id
  from public.smis_risk_inspection_task t
), task_data as (
  select (to_jsonb(t)-'id'-'stable_id')||jsonb_build_object('id',stable_id) as data from tasks t
), item_data as (
  select (to_jsonb(i)-'id'-'task_id')||jsonb_build_object('task_id',t.stable_id,'id',
    case when existing ? ('item:'||i.id) then i.id::text else t.stable_id||':item:'||i.sort end) as data
  from public.smis_risk_inspection_task_item i join tasks t on t.id=i.task_id and t.tenant_id=i.tenant_id
), event_data as (
  select (to_jsonb(e)-'id'-'task_id')||jsonb_build_object('task_id',t.stable_id,'id',
    case when existing ? ('event:'||e.id) then e.id::text else t.stable_id||':event:'||e.event_type end) as data
  from public.smis_risk_inspection_task_event e join tasks t on t.id=e.task_id and t.tenant_id=e.tenant_id
)
select jsonb_build_object(
  'tasks',md5(coalesce((select jsonb_agg(data order by data::text)::text from task_data),'[]')),
  'items',md5(coalesce((select jsonb_agg(data order by data::text)::text from item_data),'[]')),
  'events',md5(coalesce((select jsonb_agg(data order by data::text)::text from event_data),'[]')),
  'counter',md5(coalesce((select jsonb_agg(to_jsonb(c) order by c.tenant_id,c.month_key)::text from app_private.smis_risk_inspection_task_counter c),'[]')),
  'task_count',(select count(*) from tasks),'item_count',(select count(*) from item_data),
  'event_count',(select count(*) from event_data)
);
$snapshot$;

create function pg_temp.risk_payload(payload jsonb,existing jsonb)
returns jsonb language sql stable set search_path = pg_catalog as $payload$
select jsonb_set(payload,'{records}',coalesce(jsonb_agg(r.value||jsonb_build_object('id',
  case when existing ? ('task:'||t.id) then t.id::text else 'new-task:'||t.tenant_id||':'||t.task_no end
) order by r.ordinality),'[]'::jsonb))
from jsonb_array_elements(payload->'records') with ordinality r
join public.smis_risk_inspection_task t on t.id=(r.value->>'id')::uuid;
$payload$;

do $test$
declare
  fixture public.smis_risk_control_assignment%rowtype;
  fixture_level text;
  fixture_id uuid;
  overdue_fixture uuid;
  super_uid uuid;
  ordinary_uid uuid;
  other_tenant uuid;
  candidate record;
  actor jsonb;
  existing jsonb;
  baseline jsonb;
  old_payload jsonb;
  new_payload jsonb;
  old_state jsonb;
  new_state jsonb;
  created integer;
begin
  select a.* into fixture from public.smis_risk_control_assignment a
  join public.sys_tenant tenant on tenant.id=a.tenant_id
  join public.smis_risk_control_plan p on p.id=a.plan_id and p.tenant_id=a.tenant_id
  join public.smis_duplicate_configuration d on d.id=a.duplicate_configuration_id and d.tenant_id=a.tenant_id
  join public.smis_risk_point point on point.id=p.risk_point_id and point.tenant_id=p.tenant_id
  where a.status='active' and p.status='active' and point.status='enabled' and d.status='enabled' and d.repeat_enabled
    and tenant.status='1' and tenant.builtin_type is distinct from 'platform'
    and (tenant.service_start_date is null or tenant.service_start_date<=(now() at time zone 'Asia/Shanghai')::date)
    and (tenant.service_end_date is null or tenant.service_end_date>=(now() at time zone 'Asia/Shanghai')::date)
    and app_private.smis_align_risk_task_start(greatest(p.control_start_at,date_trunc('day',now())),d.calendar_type,d.calendar_days)<=now()+interval '1 day'
    and exists(select 1 from public.smis_risk_item i where i.tenant_id=a.tenant_id and i.risk_point_id=p.risk_point_id and i.status<>'voided')
    and exists(select 1 from unnest(array['company','department','team','position']) level
      where not exists(select 1 from public.smis_risk_control_assignment x where x.tenant_id=a.tenant_id and x.plan_id=a.plan_id and x.control_level=level))
  order by a.id limit 1;
  if fixture.id is null then raise exception '[risk-contract] Requires a valid repeat plan with an unused control level';end if;
  select level into fixture_level from unnest(array['company','department','team','position']) level
  where not exists(select 1 from public.smis_risk_control_assignment x where x.tenant_id=fixture.tenant_id and x.plan_id=fixture.plan_id and x.control_level=level) limit 1;
  insert into public.smis_risk_control_assignment(tenant_id,plan_id,control_level,responsible_employee_id,duplicate_configuration_id,control_measure,status,sort)
  values(fixture.tenant_id,fixture.plan_id,fixture_level,fixture.responsible_employee_id,fixture.duplicate_configuration_id,'quality rollback fixture','active',fixture.sort)
  returning id into fixture_id;
  select t.id into overdue_fixture from public.smis_risk_inspection_task t
  where t.tenant_id=fixture.tenant_id and t.status='overdue' and t.planned_end_at<now()
    and t.actual_start_at is null and t.completed_at is null order by t.id limit 1;
  if overdue_fixture is null then raise exception '[risk-contract] Requires an unstarted overdue task fixture';end if;
  update public.smis_risk_inspection_task set status='not_started' where id=overdue_fixture;
  select u.auth_user_id into super_uid from public.sys_user u join public.sys_tenant t on t.id=u.tenant_id
  where u.status='1' and u.deleted_at is null and u.system_protected and t.builtin_type='platform' limit 1;
  select t.id into other_tenant from public.sys_tenant t where t.id<>fixture.tenant_id
    and t.builtin_type is distinct from 'platform' and t.status='1'
    and (t.service_start_date is null or t.service_start_date<=(now() at time zone 'Asia/Shanghai')::date)
    and (t.service_end_date is null or t.service_end_date>=(now() at time zone 'Asia/Shanghai')::date) order by t.id limit 1;
  for candidate in select u.auth_user_id from public.sys_user u join auth.users a on a.id=u.auth_user_id
    where u.tenant_id=fixture.tenant_id and u.status='1' and u.deleted_at is null order by u.id loop
    perform set_config('request.jwt.claim.sub',candidate.auth_user_id::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',candidate.auth_user_id,'role','authenticated')::text,true);
    perform set_config('request.headers','{}',true);
    execute 'set local role authenticated';
    if app_private.has_permission('SmisDualControlRiskInspectionTask:View') then ordinary_uid:=candidate.auth_user_id;end if;
    execute 'reset role';
    exit when ordinary_uid is not null;
  end loop;
  if super_uid is null or ordinary_uid is null or other_tenant is null then
    raise exception '[risk-contract] Requires platform/ordinary View users and two active tenants';
  end if;
  select coalesce(jsonb_object_agg(k,true),'{}'::jsonb) into existing from (
    select 'task:'||id as k from public.smis_risk_inspection_task union all
    select 'item:'||id from public.smis_risk_inspection_task_item union all
    select 'event:'||id from public.smis_risk_inspection_task_event
  ) ids;
  baseline:=pg_temp.risk_state(existing);
  for actor in select value from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('name','platform-all','uid',super_uid,'header',null,'generate',false),
    jsonb_build_object('name','platform-selected','uid',super_uid,'header',fixture.tenant_id,'generate',true),
    jsonb_build_object('name','ordinary-own','uid',ordinary_uid,'header',null,'generate',true),
    jsonb_build_object('name','ordinary-forged','uid',ordinary_uid,'header',other_tenant,'generate',true)
  )) loop
    perform set_config('request.jwt.claim.sub',actor->>'uid',true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',actor->>'uid','role','authenticated')::text,true);
    perform set_config('request.headers',case when actor->>'header' is null then '{}' else jsonb_build_object('x-art-tenant-scope',actor->>'header')::text end,true);
    old_payload:=null;old_state:=null;new_payload:=null;new_state:=null;
    begin
      execute 'set local role authenticated';
      old_payload:=pg_temp.risk_list_reference_api(0,19);
      execute 'reset role';
      old_payload:=pg_temp.risk_payload(old_payload,existing);old_state:=pg_temp.risk_state(existing);
      raise exception using errcode='ZX001',message='rollback reference side effects';
    exception when sqlstate 'ZX001' then null;
    end;
    begin
      execute 'set local role authenticated';
      new_payload:=public.smis_list_risk_inspection_tasks_secure(0,19);
      execute 'reset role';
      select count(*) into created from public.smis_risk_inspection_task where assignment_id=fixture_id;
      if (actor->>'generate')::boolean and created=0 then raise exception '[risk-contract] Positive generation fixture was not exercised';end if;
      if not (actor->>'generate')::boolean and created<>0 then raise exception '[risk-contract] Platform-all changed the generation write target';end if;
      if actor->>'name'<>'platform-all' and exists(
        select 1 from jsonb_array_elements(new_payload->'records') r
        join public.smis_risk_inspection_task t on t.id=(r.value->>'id')::uuid where t.tenant_id<>fixture.tenant_id
      ) then raise exception '[risk-contract] Read scope leaked';end if;
      new_payload:=pg_temp.risk_payload(new_payload,existing);new_state:=pg_temp.risk_state(existing);
      if (actor->>'generate')::boolean then
        if (new_state->>'task_count')::bigint <= (baseline->>'task_count')::bigint
          or (new_state->>'item_count')::bigint <= (baseline->>'item_count')::bigint
          or (new_state->>'event_count')::bigint <= (baseline->>'event_count')::bigint
          or new_state->'counter' is not distinct from baseline->'counter'
          or (select status from public.smis_risk_inspection_task where id=overdue_fixture)<>'overdue' then
          raise exception '[risk-contract] Task/item/event/number/overdue fixture was not exercised';
        end if;
      elsif (select status from public.smis_risk_inspection_task where id=overdue_fixture)<>'not_started' then
        raise exception '[risk-contract] Platform-all changed another tenant lifecycle';
      end if;
      raise exception using errcode='ZX001',message='rollback candidate side effects';
    exception when sqlstate 'ZX001' then null;
    end;
    if old_payload is null or new_payload is null or old_state is null or new_state is null
      or old_payload is distinct from new_payload or old_state is distinct from new_state then
      raise exception '[risk-contract] DTO, task/item/event/counter state differs for %',actor->>'name';
    end if;
    if pg_temp.risk_state(existing) is distinct from baseline then raise exception '[risk-contract] Nested fixture rollback failed';end if;
  end loop;
end;
$test$;

select 'four-scope risk DTO and positive task/item/event/numbering equivalence passed' as result;
rollback;
