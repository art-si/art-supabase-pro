-- Candidate eligibility must agree with return-leg creation: only an
-- already allocated main trip can receive return cargo.
begin;
set local role authenticated;

do $test$
declare
  v_candidates jsonb;
  v_candidate jsonb;
  v_qa_tenant uuid := '7529f951-938e-4e2c-ac0d-316c136ae1f9';
  v_other_tenant uuid := '6675a0d6-3ff6-4ab7-bb09-232d85ae96ad';
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',
    true
  );
  perform set_config('request.headers', '{}', true);

  v_candidates := public.tms_list_return_trip_candidates_secure(
    '981ddaae-11fe-415c-886a-28e2f4ec0057'
  );
  v_candidate := (
    select item from jsonb_array_elements(v_candidates) item
    where item->>'id' = 'a57530d2-b6d7-43e7-89f6-048a32a5891f'
  );
  if v_candidate->>'hasReturnLeg' <> 'true'
    or v_candidate->>'hasForwardAllocation' <> 'false'
    or v_candidate->>'canAddReturn' <> 'false' then
    raise exception 'Existing unallocated return master must be ineligible';
  end if;

  v_candidates := public.tms_list_return_trip_candidates_secure(
    'eb1070bd-ecbb-476b-b0bb-45e650b7f476'
  );
  v_candidate := (
    select item from jsonb_array_elements(v_candidates) item
    where item->>'id' = '8be0adc5-10ab-48b0-bc40-8ebceaeb9065'
  );
  if v_candidate->>'hasReturnLeg' <> 'false'
    or v_candidate->>'hasForwardAllocation' <> 'false'
    or v_candidate->>'canAddReturn' <> 'false' then
    raise exception 'Unallocated placeholder must be disabled before return';
  end if;

  v_candidates := public.tms_list_return_trip_candidates_secure(
    'a9fc0005-1023-4620-9220-000000000008'
  );
  v_candidate := (
    select item from jsonb_array_elements(v_candidates) item
    where item->>'id' = 'a9fc0006-1023-4620-9220-000000000008'
  );
  if v_candidate->>'hasReturnLeg' <> 'false'
    or v_candidate->>'hasForwardAllocation' <> 'true'
    or v_candidate->>'canAddReturn' <> 'true' then
    raise exception 'Allocated active master must remain selectable';
  end if;

  perform set_config(
    'request.headers',
    jsonb_build_object('x-art-tenant-scope', v_other_tenant)::text,
    true
  );
  begin
    perform public.tms_list_return_trip_candidates_secure(
      'eb1070bd-ecbb-476b-b0bb-45e650b7f476'
    );
    raise exception 'Platform-selected cross-tenant candidates leaked';
  exception when insufficient_privilege then null;
  end;

  perform set_config(
    'request.jwt.claims',
    '{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',
    true
  );
  -- A forged header never changes an ordinary user's own-tenant read scope.
  v_candidates := public.tms_list_return_trip_candidates_secure(
    'eb1070bd-ecbb-476b-b0bb-45e650b7f476'
  );
  if jsonb_array_length(v_candidates) <> 1
    or v_candidates->0->>'canAddReturn' <> 'false' then
    raise exception 'Ordinary own-tenant candidate lookup failed under forged header';
  end if;
  begin
    perform public.tms_list_return_trip_candidates_secure(
      '6b9b14f0-1e5a-4352-93bf-c7a958257e50'
    );
    raise exception 'Ordinary forged cross-tenant candidates leaked';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.headers', '{}', true);
  if not exists (
    select 1 from public.tms_order where id = 'eb1070bd-ecbb-476b-b0bb-45e650b7f476'
      and tenant_id = v_qa_tenant
  ) then raise exception 'QA tenant candidate source changed'; end if;
end $test$;

rollback;
