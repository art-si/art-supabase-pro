-- Protected reimbursement tables stay private; the scoped reader exposes only deletion references.
-- All data and role context changes roll back.
begin;
set local role authenticated;
do $test$
declare actor text; scope text; n integer;
begin
  if has_table_privilege('authenticated','public.tms_expense_reimbursement','SELECT') then
    raise exception 'Protected reimbursement table was exposed';
  end if;
  if has_function_privilege('anon','public.get_fms_reimbursement_delete_dependencies_secure(text[],text)','EXECUTE') then
    raise exception 'Anonymous deletion inspection exposed';
  end if;
  foreach actor in array array['0a872664-874c-447d-a256-d0dbdca6ed45','ab881b32-87d4-4dce-9014-ce488b8069df'] loop
    foreach scope in array array['','7529f951-938e-4e2c-ac0d-316c136ae1f9','6675a0d6-3ff6-4ab7-bb09-232d85ae96ad'] loop
      perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
      perform set_config('request.headers',case when scope='' then '{}' else jsonb_build_object('x-art-tenant-scope',scope)::text end,true);
      begin
        select count(*) into n from public.get_fms_reimbursement_delete_dependencies_secure(array['db6f27f8-7331-4fc7-8e4f-f459d0fe3dfa']);
        if actor='0a872664-874c-447d-a256-d0dbdca6ed45' and scope='6675a0d6-3ff6-4ab7-bb09-232d85ae96ad' then
          raise exception 'Selected foreign tenant leaked reimbursement references';
        end if;
        if n<>2 then raise exception 'Payment and workflow references were not both returned'; end if;
        if not exists(select 1 from public.get_fms_reimbursement_delete_dependencies_secure(array['db6f27f8-7331-4fc7-8e4f-f459d0fe3dfa'])
          where source_table='tms_expense_payment' and record_no='FYZF202610-0003' and target_id='db6f27f8-7331-4fc7-8e4f-f459d0fe3dfa') then
          raise exception 'Recognizable payment number or navigation target lost';
        end if;
      exception when insufficient_privilege then
        if not(actor='0a872664-874c-447d-a256-d0dbdca6ed45' and scope='6675a0d6-3ff6-4ab7-bb09-232d85ae96ad') then raise; end if;
      end;
    end loop;
  end loop;
  perform set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
  perform set_config('request.headers','{}',true);
  begin
    perform public.get_fms_reimbursement_delete_dependencies_secure(array['db6f27f8-7331-4fc7-8e4f-f459d0fe3dfa','00000000-0000-0000-0000-000000000000']);
    raise exception 'Mixed unavailable records did not fail closed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.get_fms_reimbursement_delete_dependencies_secure(array['']);
    raise exception 'Invalid record identifier was accepted';
  exception when invalid_parameter_value then null; end;
  perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}',true);
  begin
    perform public.get_fms_reimbursement_delete_dependencies_secure(array['db6f27f8-7331-4fc7-8e4f-f459d0fe3dfa']);
    raise exception 'Unbound actor read reimbursement references';
  exception when insufficient_privilege then null; end;
end $test$;
select 'all, selected, own, forged-header, mixed-record and anonymous deletion inspection passed' result;
rollback;
