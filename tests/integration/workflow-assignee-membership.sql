-- A cross-tenant approver exists only through an active explicit membership.
begin;

do $resolver$
declare
  v_node jsonb := '{"assignee":{"type":"users","userIds":["51760251-629d-4561-aeb8-0fbe62352494"]},"allowSelfApproval":true}'::jsonb;
  v_count integer;
begin
  select count(*) into v_count
  from app_private.resolve_workflow_assignees(
    '2824c2b5-2774-4781-b995-f55e8bcee920',
    v_node,
    '51760251-629d-4561-aeb8-0fbe62352494'
  );
  if v_count <> 1 then raise exception 'active QA membership did not resolve'; end if;

  select count(*) into v_count
  from app_private.resolve_workflow_assignment(
    '2824c2b5-2774-4781-b995-f55e8bcee920',
    '51760251-629d-4561-aeb8-0fbe62352494',
    now()
  );
  if v_count <> 1 then raise exception 'active QA membership did not create assignment'; end if;

  if app_private.enqueue_user_notification(
    '51760251-629d-4561-aeb8-0fbe62352494',
    '2824c2b5-2774-4781-b995-f55e8bcee920',
    'todo', 'QA vehicle workflow notification', 'QA membership test', 'info',
    'workflow_task', 'c3333333-3333-4333-8333-333333333333'
  ) is null then
    raise exception 'active QA member notification failed';
  end if;

  select count(*) into v_count
  from app_private.resolve_workflow_assignees(
    '7529f951-938e-4e2c-ac0d-316c136ae1f9',
    v_node,
    '51760251-629d-4561-aeb8-0fbe62352494'
  );
  if v_count <> 0 then raise exception 'QA membership leaked to another tenant'; end if;

  select count(*) into v_count
  from app_private.resolve_workflow_assignees(
    '2824c2b5-2774-4781-b995-f55e8bcee920',
    jsonb_set(v_node, '{allowSelfApproval}', 'false'::jsonb),
    '51760251-629d-4561-aeb8-0fbe62352494'
  );
  if v_count <> 0 then raise exception 'disabled self approval was bypassed'; end if;

  update public.sys_user_tenant
  set status = '0'
  where user_id = '51760251-629d-4561-aeb8-0fbe62352494'
    and tenant_id = '2824c2b5-2774-4781-b995-f55e8bcee920';
  select count(*) into v_count
  from app_private.resolve_workflow_assignees(
    '2824c2b5-2774-4781-b995-f55e8bcee920',
    v_node,
    '51760251-629d-4561-aeb8-0fbe62352494'
  );
  if v_count <> 0 then raise exception 'disabled membership still resolved'; end if;
  select count(*) into v_count
  from app_private.resolve_workflow_assignment(
    '2824c2b5-2774-4781-b995-f55e8bcee920',
    '51760251-629d-4561-aeb8-0fbe62352494',
    now()
  );
  if v_count <> 0 then raise exception 'disabled membership still created assignment'; end if;
  begin
    perform app_private.enqueue_user_notification(
      '51760251-629d-4561-aeb8-0fbe62352494',
      '2824c2b5-2774-4781-b995-f55e8bcee920',
      'todo', 'QA disabled member', 'QA membership test', 'info',
      'workflow_task', 'c4444444-4444-4444-8444-444444444444'
    );
    raise exception 'disabled QA member received a notification';
  exception when others then
    if sqlerrm not like '%通知接收人不存在%' then raise; end if;
  end;
  update public.sys_user_tenant
  set status = '1'
  where user_id = '51760251-629d-4561-aeb8-0fbe62352494'
    and tenant_id = '2824c2b5-2774-4781-b995-f55e8bcee920';
end;
$resolver$;

set local role authenticated;

do $options$
declare v_count integer;
begin
  perform set_config('request.jwt.claim.sub', '0a872664-874c-447d-a256-d0dbdca6ed45', true);
  perform set_config(
    'request.jwt.claims',
    '{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',
    true
  );
  perform set_config(
    'request.headers',
    '{"x-art-tenant-scope":"2824c2b5-2774-4781-b995-f55e8bcee920"}',
    true
  );
  select count(*) into v_count
  from public.list_workflow_user_options_secure('2824c2b5-2774-4781-b995-f55e8bcee920')
  where id = '51760251-629d-4561-aeb8-0fbe62352494';
  if v_count <> 1 then raise exception 'QA member missing from designer candidates'; end if;

  perform set_config(
    'request.headers',
    '{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}',
    true
  );
  begin
    perform * from public.list_workflow_user_options_secure('2824c2b5-2774-4781-b995-f55e8bcee920');
    raise exception 'platform selected tenant could list another tenant';
  exception when sqlstate '42501' then null;
  end;

  perform set_config('request.jwt.claim.sub', 'ab881b32-87d4-4dce-9014-ce488b8069df', true);
  perform set_config(
    'request.jwt.claims',
    '{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',
    true
  );
  perform set_config(
    'request.headers',
    '{"x-art-tenant-scope":"2824c2b5-2774-4781-b995-f55e8bcee920"}',
    true
  );
  begin
    perform * from public.list_workflow_user_options_secure('2824c2b5-2774-4781-b995-f55e8bcee920');
    raise exception 'ordinary forged tenant could list QA members';
  exception when sqlstate '42501' then null;
  end;

  select count(*) into v_count
  from public.list_workflow_user_options_secure('7529f951-938e-4e2c-ac0d-316c136ae1f9')
  where id = '93f2f1e8-a3dc-4f5a-999b-6c8c02d0c7e9';
  if v_count <> 1 then raise exception 'existing own-tenant user option changed'; end if;
end;
$options$;

rollback;
