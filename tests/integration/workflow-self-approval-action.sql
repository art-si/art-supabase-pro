-- Action-time self-approval must honor the immutable instance version even after delegation.
-- All QA definitions, instances, tasks, actions, and notifications are rolled back.
begin;

insert into public.wf_definition(id, code, name, business_type, status, tenant_id)
values (
  '6a100000-0000-4000-8000-000000000001',
  'qa_workflow_self_guard_rollback',
  'QA self approval guard',
  'qa_workflow_self_guard',
  'published',
  '2824c2b5-2774-4781-b995-f55e8bcee920'
);

insert into public.wf_version(id, definition_id, version_no, status, config, tenant_id)
select
  case allowed when false then '6a100000-0000-4000-8000-000000000002'::uuid
    else '6a100000-0000-4000-8000-000000000003'::uuid end,
  '6a100000-0000-4000-8000-000000000001'::uuid,
  case allowed when false then 1 else 2 end,
  case allowed when false then 'draft' else 'published' end,
  jsonb_build_object(
    'nodes', jsonb_build_array(
      jsonb_build_object(
        'key', 'review', 'name', 'QA review', 'order', 1,
        'assignee', jsonb_build_object(
          'type', 'users',
          'userIds', jsonb_build_array('7446b152-4057-47af-b4c1-bcbb74491880')
        ),
        'condition', jsonb_build_object('operator', 'always'),
        'dueHours', 24,
        'approvalMode', 'any',
        'approvalThresholdPercent', 100,
        'rejectVetoEnabled', true,
        'allowSelfApproval', allowed
      ),
      jsonb_build_object(
        'key', 'followup', 'name', 'QA follow-up', 'order', 2,
        'assignee', jsonb_build_object(
          'type', 'users',
          'userIds', jsonb_build_array('7446b152-4057-47af-b4c1-bcbb74491880')
        ),
        'condition', jsonb_build_object('operator', 'always'),
        'dueHours', 24,
        'approvalMode', 'any',
        'approvalThresholdPercent', 100,
        'rejectVetoEnabled', true,
        'allowSelfApproval', false
      )
    ),
    'allowAutoApprove', false
  ),
  '2824c2b5-2774-4781-b995-f55e8bcee920'::uuid
from (values (false), (true)) cases(allowed);

update public.wf_definition
set current_version_id = '6a100000-0000-4000-8000-000000000003'
where id = '6a100000-0000-4000-8000-000000000001';

insert into public.wf_instance(
  id, definition_id, version_id, business_type, business_id, business_title,
  initiator_user_id, initiator_name_snapshot, status,
  current_node_key, current_node_name, context_snapshot, row_version, tenant_id
)
select instance_id,
  '6a100000-0000-4000-8000-000000000001'::uuid,
  version_id, 'qa_workflow_self_guard', gen_random_uuid(),
  'QA self-approval guard', '51760251-629d-4561-aeb8-0fbe62352494'::uuid,
  'QA platform initiator', 'running', 'review', 'QA review', '{}'::jsonb, 1,
  '2824c2b5-2774-4781-b995-f55e8bcee920'::uuid
from (values
  ('6a100000-0000-4000-8000-000000000004'::uuid,
   '6a100000-0000-4000-8000-000000000002'::uuid),
  ('6a100000-0000-4000-8000-000000000005'::uuid,
   '6a100000-0000-4000-8000-000000000003'::uuid)
) cases(instance_id, version_id);

insert into public.wf_task(
  id, instance_id, node_key, node_name, node_order, approval_mode,
  approval_threshold_percent, reject_veto_enabled,
  assignee_user_id, assignee_name_snapshot,
  original_assignee_user_id, original_assignee_name_snapshot,
  assignment_source, tenant_id
)
select task_id, instance_id, 'review', 'QA review', 1, 'any', 1, true,
  assignee_id, 'QA approver', '7446b152-4057-47af-b4c1-bcbb74491880'::uuid,
  'QA original approver', 'direct',
  '2824c2b5-2774-4781-b995-f55e8bcee920'::uuid
from (values
  ('6a100000-0000-4000-8000-000000000006'::uuid,
   '6a100000-0000-4000-8000-000000000004'::uuid,
   '7446b152-4057-47af-b4c1-bcbb74491880'::uuid),
  ('6a100000-0000-4000-8000-000000000007'::uuid,
   '6a100000-0000-4000-8000-000000000005'::uuid,
   '51760251-629d-4561-aeb8-0fbe62352494'::uuid)
) cases(task_id, instance_id, assignee_id);

set local role authenticated;

do $cross_tenant$
begin
  perform set_config('request.jwt.claim.sub', '705ddd8d-4959-4dc1-aeb0-08caed7ab51a', true);
  perform set_config('request.jwt.claims',
    '{"sub":"705ddd8d-4959-4dc1-aeb0-08caed7ab51a","role":"authenticated"}', true);
  perform set_config('request.headers',
    '{"x-art-tenant-scope":"2824c2b5-2774-4781-b995-f55e8bcee920"}', true);
  begin
    perform public.act_workflow_task(
      '6a100000-0000-4000-8000-000000000006', 'approve', 'QA forged tenant', null);
    raise exception 'Cross-tenant ordinary user acted on QA task';
  exception when insufficient_privilege then
    if sqlerrm <> '待办不存在或当前用户不是审批人' then raise; end if;
  end;
end;
$cross_tenant$;

do $override$
begin
  perform set_config('request.jwt.claim.sub', '0a872664-874c-447d-a256-d0dbdca6ed45', true);
  perform set_config('request.jwt.claims',
    '{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}', true);
  perform set_config('request.headers', '{}', true);
  begin
    perform public.act_workflow_task(
      '6a100000-0000-4000-8000-000000000006', 'approve', 'QA override', null);
    raise exception 'No-self platform override was accepted';
  exception when insufficient_privilege then
    if sqlerrm <> '当前审批节点不允许发起人自审' then raise; end if;
  end;
end;
$override$;

reset role;
update public.wf_task
set assignee_user_id = '51760251-629d-4561-aeb8-0fbe62352494',
    assignment_source = 'delegation'
where id = '6a100000-0000-4000-8000-000000000006';
set local role authenticated;

do $delegated$
declare
  v_actions integer;
begin
  perform set_config('request.jwt.claim.sub', '0a872664-874c-447d-a256-d0dbdca6ed45', true);
  perform set_config('request.jwt.claims',
    '{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}', true);
  begin
    perform public.act_workflow_task(
      '6a100000-0000-4000-8000-000000000006', 'approve', 'QA delegated', null);
    raise exception 'No-self delegated approval was accepted';
  exception when insufficient_privilege then
    if sqlerrm <> '当前审批节点不允许发起人自审' then raise; end if;
  end;
  begin
    perform public.act_workflow_task(
      '6a100000-0000-4000-8000-000000000006', 'reject', 'QA delegated rejection', null);
    raise exception 'No-self delegated rejection was accepted';
  exception when insufficient_privilege then
    if sqlerrm <> '当前审批节点不允许发起人自审' then raise; end if;
  end;
  select count(*) into v_actions
  from public.wf_action
  where task_id = '6a100000-0000-4000-8000-000000000006';
  if v_actions <> 0 then raise exception 'Blocked approval wrote an action'; end if;
  if (select status from public.wf_task
      where id = '6a100000-0000-4000-8000-000000000006') <> 'pending' then
    raise exception 'Blocked approval changed the task';
  end if;
end;
$delegated$;

do $allowed$
declare
  v_instance_id uuid;
begin
  perform set_config('request.jwt.claim.sub', '0a872664-874c-447d-a256-d0dbdca6ed45', true);
  perform set_config('request.jwt.claims',
    '{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}', true);
  v_instance_id := public.act_workflow_task(
    '6a100000-0000-4000-8000-000000000007', 'approve', 'QA allowed self', null);
  if (select current_node_key from public.wf_instance where id = v_instance_id)
      is distinct from 'followup' then
    raise exception 'Explicitly allowed self approval did not advance';
  end if;
end;
$allowed$;

reset role;
do $qa_vehicle$
begin
  if not exists (
    select 1
    from public.wf_definition d
    join public.wf_version v on v.id = d.current_version_id
    where d.tenant_id = '7529f951-938e-4e2c-ac0d-316c136ae1f9'
      and d.business_type = 'vehicle_archive'
      and coalesce((v.config #>> '{nodes,0,allowSelfApproval}')::boolean, false)
  ) then
    raise exception 'QA vehicle workflow lost its explicit self approval rule';
  end if;
end;
$qa_vehicle$;

rollback;
