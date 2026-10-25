-- Clones and every related financial write are rolled back.
begin;
select set_config('request.jwt.claims', '{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
select set_config('request.headers','{}',true);
set local role authenticated;
do $test$
declare
  v_source public.fms_travel_loan%rowtype;
  v_items jsonb;
  v_payees jsonb;
  v_result jsonb;
  v_new uuid;
  v_clones uuid[]:='{}';
  v_claim text;
  v_scope text;
begin
  select * into strict v_source from public.fms_travel_loan where id='644ccf52-45e7-46ea-b6a3-945773c7b5e8';
  select jsonb_agg(to_jsonb(i) order by line_no) into v_items from public.fms_travel_loan_item i where loan_id=v_source.id;
  select jsonb_agg(to_jsonb(p) order by line_no) into v_payees from public.fms_travel_loan_payee p where loan_id=v_source.id;
  foreach v_claim in array array['0a872664-874c-447d-a256-d0dbdca6ed45','ab881b32-87d4-4dce-9014-ce488b8069df'] loop
    foreach v_scope in array array['','7529f951-938e-4e2c-ac0d-316c136ae1f9','6675a0d6-3ff6-4ab7-bb09-232d85ae96ad'] loop
      perform set_config('request.jwt.claims',jsonb_build_object('sub',v_claim,'role','authenticated')::text,true);
      perform set_config('request.headers',case when v_scope='' then '{}' else jsonb_build_object('x-art-tenant-scope',v_scope)::text end,true);
      begin
        v_result:=public.copy_fms_travel_loan_draft_secure(v_source.id,to_jsonb(v_source)-'id',v_items,v_payees);
        if v_claim='0a872664-874c-447d-a256-d0dbdca6ed45' and v_scope='6675a0d6-3ff6-4ab7-bb09-232d85ae96ad' then
          raise exception 'Selected foreign tenant copied a loan';
        end if;
        v_new:=(v_result->>'id')::uuid;
        v_clones:=array_append(v_clones,v_new);
        if exists(select 1 from public.get_fms_travel_loan_delete_dependencies_secure(array[v_new::text],null)) then
          raise exception 'Own-scope reference check incorrectly blocked an unreferenced draft'; end if;
        if not exists(select 1 from public.fms_travel_loan where id=v_new and status='draft'
          and tenant_id=v_source.tenant_id and is_demo and coalesce(paid_amount,0)=0
          and loan_no<>v_source.loan_no) then raise exception 'Copy carried paid state or lost source scope/demo flag'; end if;
        if (select count(*) from public.fms_travel_loan_item where loan_id=v_new)<>jsonb_array_length(v_items)
          or (select count(*) from public.fms_travel_loan_payee where loan_id=v_new)<>jsonb_array_length(v_payees)
          or exists(select 1 from public.fms_travel_loan_payment where loan_id=v_new) then
          raise exception 'Copy reused child/payment history'; end if;
        if exists(select 1 from public.fms_travel_loan_item where loan_id=v_new and create_by is null)
          or exists(select 1 from public.fms_travel_loan_payee where loan_id=v_new and create_by is null) then
          raise exception 'Copied child records omitted the authenticated creator'; end if;
      exception when insufficient_privilege then
        if not(v_claim='0a872664-874c-447d-a256-d0dbdca6ed45' and v_scope='6675a0d6-3ff6-4ab7-bb09-232d85ae96ad') then raise; end if;
      end;
    end loop;
  end loop;
  perform set_config('request.jwt.claims','{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
  perform set_config('request.headers','{}',true);
  if cardinality(v_clones)<>5 then raise exception 'Missing tenant scope copy cases'; end if;
  begin
    perform public.delete_fms_travel_loans_secure(array[v_clones[1],v_source.id]);
    raise exception 'Paid loan accepted deletion';
  exception when invalid_parameter_value then
    if sqlerrm not like '%只能删除借款草稿%' then raise; end if;
  end;
  if not exists(select 1 from public.fms_travel_loan where id=v_clones[1]) then
    raise exception 'Mixed-state batch deletion was not atomic'; end if;
  if exists(select 1 from public.get_fms_travel_loan_delete_dependencies_secure(array[v_clones[1]::text],null)) then
    raise exception 'Composition-only children blocked deletion'; end if;
  if not exists(select 1 from public.get_fms_travel_loan_delete_dependencies_secure(array[v_source.id::text],null)
    where source_table='fms_travel_repayment' and record_no like 'HK%' and record_status='collected') then
    raise exception 'Repayment blocker did not expose recognizable document number/status'; end if;
  if not exists(select 1 from public.get_fms_travel_loan_delete_dependencies_secure(array[v_source.id::text],null)
    where source_table='fms_travel_loan_payment' and record_no<>'' and target_id=v_source.id::text and record_status='paid') then
    raise exception 'Payment blocker omitted payment number or parent navigation'; end if;
  if public.delete_fms_travel_loans_secure(v_clones)<>5 then raise exception 'Draft batch deletion failed'; end if;
  if exists(select 1 from public.fms_travel_loan_item where loan_id=any(v_clones))
    or exists(select 1 from public.fms_travel_loan_payee where loan_id=any(v_clones)) then
    raise exception 'Deleted draft left orphan children'; end if;
end $test$;
reset role;
select 'loan copy scope/demo isolation and guarded atomic deletion passed' result;
rollback;
