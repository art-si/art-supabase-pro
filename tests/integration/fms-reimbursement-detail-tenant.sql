-- The detail RPC supplies tenant identity only after its existing permission and scope checks.
begin;
set local role authenticated;

do $test$
declare
  v_id uuid := 'b59d39b6-4d43-4d64-a995-4309488b3bb9';
  v_own_tenant text := '7529f951-938e-4e2c-ac0d-316c136ae1f9';
  v_foreign_tenant text := '6675a0d6-3ff6-4ab7-bb09-232d85ae96ad';
begin
  perform set_config('request.jwt.claims',
    '{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}', true);
  perform set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope', v_own_tenant)::text, true);
  if public.tms_get_expense_reimbursement_secure(v_id)->>'tenant_id'
    is distinct from v_own_tenant then
    raise exception 'Platform selected tenant detail missing';
  end if;

  perform set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope', v_foreign_tenant)::text, true);
  if public.tms_get_expense_reimbursement_secure(v_id) is not null then
    raise exception 'Platform selected foreign tenant leaked detail';
  end if;

  perform set_config('request.headers', '{}', true);
  if public.tms_get_expense_reimbursement_secure(v_id)->>'tenant_id'
    is distinct from v_own_tenant then
    raise exception 'Platform all tenant detail missing';
  end if;

  perform set_config('request.jwt.claims',
    '{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}', true);
  if public.tms_get_expense_reimbursement_secure(v_id)->>'tenant_id'
    is distinct from v_own_tenant then
    raise exception 'Ordinary own tenant detail missing';
  end if;

  perform set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope', v_foreign_tenant)::text, true);
  if public.tms_get_expense_reimbursement_secure(v_id)->>'tenant_id'
    is distinct from v_own_tenant then
    raise exception 'Forged tenant header changed ordinary detail scope';
  end if;
end $test$;

select 'reimbursement detail tenant and four read scopes passed' result;
rollback;
