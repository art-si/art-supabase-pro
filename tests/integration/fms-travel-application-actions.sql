-- Application copies, permission grants and all fixture changes are rolled back.
begin;
select set_config('request.jwt.claims','{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
select set_config('request.headers','{}',true);
set local role authenticated;
do $test$
declare
  v_source public.fms_travel_application%rowtype;
  v_lines jsonb;
  v_result jsonb;
  v_new uuid;
  v_ids uuid[] := '{}';
  v_claim text;
  v_scope text;
begin
  select * into strict v_source from public.fms_travel_application
    where tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9' and application_no='CCSQ202610-002';
  select jsonb_agg(to_jsonb(i) order by line_no) into v_lines from public.fms_travel_itinerary i where application_id=v_source.id;
  foreach v_claim in array array['0a872664-874c-447d-a256-d0dbdca6ed45','ab881b32-87d4-4dce-9014-ce488b8069df'] loop
    foreach v_scope in array array['','7529f951-938e-4e2c-ac0d-316c136ae1f9','6675a0d6-3ff6-4ab7-bb09-232d85ae96ad'] loop
      perform set_config('request.jwt.claims',jsonb_build_object('sub',v_claim,'role','authenticated')::text,true);
      perform set_config('request.headers',case when v_scope='' then '{}' else jsonb_build_object('x-art-tenant-scope',v_scope)::text end,true);
      begin
        v_result := public.copy_fms_travel_application_draft_secure(v_source.id,to_jsonb(v_source)-'id',v_lines);
        if v_claim='0a872664-874c-447d-a256-d0dbdca6ed45' and v_scope='6675a0d6-3ff6-4ab7-bb09-232d85ae96ad' then
          raise exception 'Selected foreign tenant copied an application';
        end if;
        v_new := (v_result->>'id')::uuid;
        v_ids := array_append(v_ids,v_new);
        if not exists(select 1 from public.fms_travel_application where id=v_new and tenant_id=v_source.tenant_id
          and status='draft' and application_no<>v_source.application_no and requested_amount=v_source.requested_amount
          and estimated_days=v_source.estimated_days) then raise exception 'Copy lost scope, totals or numbering'; end if;
        if (select count(*) from public.fms_travel_itinerary where application_id=v_new)<>jsonb_array_length(v_lines)
          or exists(select 1 from public.fms_travel_itinerary where application_id=v_new and create_by is null)
          then raise exception 'Copy lost itinerary composition/audit'; end if;
        if exists(select 1 from public.get_fms_travel_application_delete_dependencies_secure(array[v_new::text],null)) then
          raise exception 'Composition children unexpectedly block draft deletion'; end if;
      exception when insufficient_privilege then
        if not(v_claim='0a872664-874c-447d-a256-d0dbdca6ed45' and v_scope='6675a0d6-3ff6-4ab7-bb09-232d85ae96ad') then raise; end if;
      end;
    end loop;
  end loop;
  if cardinality(v_ids)<>5 then raise exception 'Missing tenant scope copy cases'; end if;
  perform set_config('request.jwt.claims','{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
  perform set_config('request.headers','{}',true);
  perform set_config('test.application_ids',array_to_json(v_ids)::text,true);
end $test$;
reset role;
-- Only the isolated copy is moved to a locked state to verify atomic batch rejection.
update public.fms_travel_application set status='approved'
  where id=(current_setting('test.application_ids')::jsonb->>0)::uuid;
set local role authenticated;
do $test$
declare v_ids uuid[];
begin
  select array_agg(value::uuid) into v_ids from jsonb_array_elements_text(current_setting('test.application_ids')::jsonb);
  begin
    perform public.delete_fms_travel_applications_secure(v_ids);
    raise exception 'Locked application accepted deletion';
  exception when invalid_parameter_value then
    if sqlerrm not like '%只能删除出差申请草稿%' then raise; end if;
  end;
  if (select count(*) from public.fms_travel_application where id=any(v_ids))<>5 then
    raise exception 'Mixed-state batch deletion was not atomic'; end if;
  if public.delete_fms_travel_applications_secure(v_ids[2:5])<>4 then raise exception 'Draft deletion failed'; end if;
  if exists(select 1 from public.fms_travel_itinerary where application_id=any(v_ids[2:5])) then
    raise exception 'Draft deletion left orphan itineraries'; end if;
end $test$;
reset role;
do $acl$
begin
  if has_function_privilege('anon','public.copy_fms_travel_application_draft_secure(uuid,jsonb,jsonb)','execute')
    or has_function_privilege('anon','public.delete_fms_travel_applications_secure(uuid[])','execute')
    or has_function_privilege('anon','public.get_fms_travel_application_delete_dependencies_secure(text[],text)','execute')
    then raise exception 'Anonymous access to application actions'; end if;
end $acl$;
select 'application copy scope, itinerary totals, guarded atomic deletion and ACL passed' result;
rollback;
