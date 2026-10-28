-- Vehicle archive workflow must resolve the business row tenant before selecting a definition.
-- Runs against the QA vehicles and rolls every temporary workflow/instance/task back.
begin;

-- Before the temporary definition is added, an unconfigured tenant must stay blocked.
-- This branch is skipped once the QA tenant has a real published workflow.
set local role authenticated;

do $no_flow$
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
  if not exists (
    select 1 from public.wf_definition
    where tenant_id = '2824c2b5-2774-4781-b995-f55e8bcee920'
      and business_type = 'vehicle_archive'
      and status = 'published'
  ) then
    begin
      perform public.start_workflow(
        'vehicle_archive',
        'bf876203-a11e-454e-b56a-72d3429dfd17',
        'unconfigured tenant vehicle',
        '{}'::jsonb,
        null
      );
      raise exception 'unconfigured vehicle workflow was accepted';
    exception when others then
      if sqlerrm not like '%当前业务类型没有已启用的审批流程%' then raise; end if;
    end;
  end if;
end;
$no_flow$;

reset role;

do $setup$
begin
  if not exists (
    select 1 from public.wf_definition
    where tenant_id = '2824c2b5-2774-4781-b995-f55e8bcee920'
      and business_type = 'vehicle_archive'
      and status = 'published'
  ) then
    insert into public.wf_definition
      (id, code, name, business_type, status, tenant_id)
    values
      ('c1111111-1111-4111-8111-111111111111',
       'qa_vehicle_archive_scope_test',
       'QA vehicle workflow scope test',
       'vehicle_archive', 'published',
       '2824c2b5-2774-4781-b995-f55e8bcee920');

    insert into public.wf_version
      (id, definition_id, version_no, status, config, tenant_id)
    select
      'c2222222-2222-4222-8222-222222222222',
      'c1111111-1111-4111-8111-111111111111',
      1,
      'published',
      jsonb_set(
        jsonb_set(
          source.config,
          '{nodes,0,assignee}',
          jsonb_build_object(
            'type', 'users',
            'userIds', jsonb_build_array('7446b152-4057-47af-b4c1-bcbb74491880'),
            'roleCodes', jsonb_build_array()
          )
        ),
        '{nodes,0,allowSelfApproval}',
        'false'::jsonb
      ),
      '2824c2b5-2774-4781-b995-f55e8bcee920'
    from public.wf_version source
    where source.id = '910f94dc-363c-4be1-b43c-79d4f9a514c6';

    update public.wf_definition
    set current_version_id = 'c2222222-2222-4222-8222-222222222222'
    where id = 'c1111111-1111-4111-8111-111111111111';
  end if;
end;
$setup$;

set local role authenticated;

do $verify$
declare
  v_instance uuid;
  v_task uuid;
  v_tenant uuid;
  v_metadata jsonb;
  v_vehicle_status text;
begin
  -- Platform administrator, all tenants: existing row decides the target tenant.
  perform set_config('request.jwt.claim.sub', '0a872664-874c-447d-a256-d0dbdca6ed45', true);
  perform set_config(
    'request.jwt.claims',
    '{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',
    true
  );
  perform set_config('request.headers', '{}', true);
  v_instance := public.start_workflow(
    'vehicle_archive',
    'bf876203-a11e-454e-b56a-72d3429dfd17',
    'QA cross-tenant vehicle',
    '{}'::jsonb,
    null
  );
  select tenant_id into v_tenant from public.wf_instance where id = v_instance;
  if v_tenant <> '2824c2b5-2774-4781-b995-f55e8bcee920' then
    raise exception 'platform-all vehicle workflow tenant mismatch: %', v_tenant;
  end if;
  select id into v_task
  from public.wf_task
  where instance_id = v_instance
    and assignee_user_id = '51760251-629d-4561-aeb8-0fbe62352494'
    and status = 'pending'
  limit 1;
  if v_task is null then raise exception 'QA self-approval task was not created'; end if;
  perform public.act_workflow_task(v_task, 'approve', 'QA workflow rollback check', null);
  select metadata into v_metadata
  from public.wf_action
  where task_id = v_task and action = 'approve'
  order by create_time desc
  limit 1;
  if v_metadata->>'operatorType' <> 'assignee'
     or v_metadata->>'source' <> 'workflow_workbench' then
    raise exception 'self-approval audit metadata is incorrect: %', v_metadata;
  end if;
  select audit_status into v_vehicle_status
  from public.mdm_vehicle
  where id = 'bf876203-a11e-454e-b56a-72d3429dfd17';
  if v_vehicle_status <> 'approved' then
    raise exception 'approved workflow did not update vehicle archive: %', v_vehicle_status;
  end if;

  -- Platform administrator, selected tenant: the same selected tenant is allowed.
  perform set_config(
    'request.headers',
    '{"x-art-tenant-scope":"2824c2b5-2774-4781-b995-f55e8bcee920"}',
    true
  );
  v_instance := public.start_workflow(
    'vehicle_archive',
    '283514f3-6fac-48f0-afbe-8e893ddf2f67',
    'QA selected vehicle',
    '{}'::jsonb,
    null
  );
  select tenant_id into v_tenant from public.wf_instance where id = v_instance;
  if v_tenant <> '2824c2b5-2774-4781-b995-f55e8bcee920' then
    raise exception 'platform-selected vehicle workflow tenant mismatch: %', v_tenant;
  end if;

  -- A different concrete selection must not access the QA row.
  perform set_config(
    'request.headers',
    '{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}',
    true
  );
  begin
    perform public.start_workflow(
      'vehicle_archive',
      'e2ea3d85-7fcd-42ba-aaca-53f8c8b8eedb',
      'out of selected scope',
      '{}'::jsonb,
      null
    );
    raise exception 'platform-selected cross-scope vehicle was accepted';
  exception when sqlstate '42501' then null;
  end;

  -- An ordinary tenant member with VehicleArchive:Submit may submit their own row.
  perform set_config('request.jwt.claim.sub', 'ab881b32-87d4-4dce-9014-ce488b8069df', true);
  perform set_config(
    'request.jwt.claims',
    '{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',
    true
  );
  perform set_config('request.headers', '{}', true);
  v_instance := public.start_workflow(
    'vehicle_archive',
    'f260529f-06ca-4b87-87de-a4695047cce9',
    'ordinary own vehicle',
    '{}'::jsonb,
    null
  );
  select tenant_id into v_tenant from public.wf_instance where id = v_instance;
  if v_tenant <> '7529f951-938e-4e2c-ac0d-316c136ae1f9' then
    raise exception 'ordinary own vehicle workflow tenant mismatch: %', v_tenant;
  end if;

  -- A forged tenant header cannot turn an ordinary member into a cross-tenant user.
  perform set_config(
    'request.headers',
    '{"x-art-tenant-scope":"2824c2b5-2774-4781-b995-f55e8bcee920"}',
    true
  );
  begin
    perform public.start_workflow(
      'vehicle_archive',
      'e2ea3d85-7fcd-42ba-aaca-53f8c8b8eedb',
      'forged cross tenant',
      '{}'::jsonb,
      null
    );
    raise exception 'ordinary forged cross-tenant vehicle was accepted';
  exception when sqlstate '42501' then null;
  end;
end;
$verify$;

rollback;
