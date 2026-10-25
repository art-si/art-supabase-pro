-- The approval card must count travel lines and link to the moved FMS detail route.
begin;
select set_config('request.jwt.claims',
  '{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}', true);
select set_config('request.headers',
  '{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}', true);

do $test$
declare
  v_instance_id uuid;
  v_snapshot jsonb;
begin
  select id into strict v_instance_id
  from public.wf_instance
  where business_type = 'tms_expense_reimbursement'
    and business_id = 'b59d39b6-4d43-4d64-a995-4309488b3bb9'
    and status = 'approved';
  v_snapshot := app_private.get_expense_reimbursement_workflow_snapshot(v_instance_id);
  if not exists (
    select 1 from jsonb_array_elements(v_snapshot->'metrics') metric
    where metric->>'label' = '费用笔数' and metric->>'value' = '2 笔'
  ) then raise exception 'Travel line count missing from approval snapshot'; end if;
  if v_snapshot->>'routePath'
    <> '/fms/everyone-expense/expense-reimbursement/detail/b59d39b6-4d43-4d64-a995-4309488b3bb9'
  then raise exception 'Approval snapshot points to an old detail route'; end if;
end $test$;

select 'travel reimbursement approval snapshot passed' result;
rollback;
