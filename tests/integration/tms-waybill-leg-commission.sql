-- Forward and return commission edits share one audited contract without sharing values.
begin;

do $test$
begin
  if to_regprocedure('public.tms_get_waybill_leg_commission_secure(uuid,text)') is null
    or to_regprocedure('public.tms_override_waybill_leg_commission_secure(uuid,text,numeric,text)') is null
  then raise exception 'Leg commission RPCs are missing'; end if;
  if has_function_privilege('anon',
      'public.tms_get_waybill_leg_commission_secure(uuid,text)', 'execute')
    or has_function_privilege('anon',
      'public.tms_override_waybill_leg_commission_secure(uuid,text,numeric,text)', 'execute')
  then raise exception 'Anonymous role can access commission RPCs'; end if;
end $test$;

-- Set up an isolated matched-rule base without changing persisted data.
update public.tms_waybill_leg set commission_estimate = jsonb_build_object(
  'matched', false, 'amount', null, 'snapshot', null
) where waybill_id = 'ad93535b-5055-4064-84eb-7cdcdf34fde8' and leg_kind = 'return';

update public.tms_waybill_leg set commission_estimate = jsonb_build_object(
  'matched', true, 'amount', 500,
  'snapshot', jsonb_build_object(
    'ruleId', '63352b5c-519b-486d-bcaa-9dc11a41e8c5', 'versionNo', 1
  )
) where waybill_id = '022f24c7-9854-491b-9a4e-8c85727e1b6f' and leg_kind = 'return';

set local role authenticated;
do $test$
declare
  qa_waybill uuid := 'ad93535b-5055-4064-84eb-7cdcdf34fde8';
  matched_waybill uuid := '022f24c7-9854-491b-9a4e-8c85727e1b6f';
  ordinary_waybill uuid := 'a9fc0006-1023-4620-9220-000000000007';
  forward_before jsonb;
  return_before jsonb;
  return_base jsonb;
  result jsonb;
  audit_before integer;
  forward_audit_before integer;
  forward_history jsonb;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}', true);
  perform set_config('request.headers', '{}', true);
  result := public.tms_get_waybill_leg_commission_secure(qa_waybill, 'return');
  if result->>'legKind' <> 'return'
    or result->'availableLegKinds' <> '["forward","return"]'::jsonb
    or result->>'waybillNo' <> 'QA-MAIN-WB-20261026-01'
  then raise exception 'Platform-all return summary failed'; end if;
  forward_history := public.tms_get_waybill_leg_commission_secure(
    qa_waybill, 'forward')->'history';
  if exists(select 1 from jsonb_array_elements(result->'history') as r(item)
    join jsonb_array_elements(forward_history) as f(item)
      on r.item->>'id' = f.item->>'id')
  then raise exception 'Existing forward history leaked to return leg'; end if;

  perform set_config('request.headers',
    '{"x-art-tenant-scope":"2824c2b5-2774-4781-b995-f55e8bcee920"}', true);
  perform public.tms_get_waybill_leg_commission_secure(qa_waybill, 'return');
  perform set_config('request.headers',
    '{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}', true);
  begin
    perform public.tms_get_waybill_leg_commission_secure(qa_waybill, 'return');
    raise exception 'Platform-selected cross-tenant read succeeded';
  exception when insufficient_privilege then null; end;
  begin
    perform public.tms_override_waybill_leg_commission_secure(
      qa_waybill, 'return', 123, '跨租户调整返程提成');
    raise exception 'Platform-selected cross-tenant write succeeded';
  exception when insufficient_privilege then null; end;

  perform set_config('request.jwt.claims',
    '{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}', true);
  perform set_config('request.headers', '{}', true);
  result := public.tms_get_waybill_leg_commission_secure(ordinary_waybill, 'forward');
  if result->>'waybillNo' <> 'VMS-QA-YD7' then
    raise exception 'Ordinary-own commission read failed'; end if;
  perform public.tms_override_waybill_leg_commission_secure(
    ordinary_waybill, 'forward', 77, '本租户司机提成调整');
  perform set_config('request.headers',
    '{"x-art-tenant-scope":"2824c2b5-2774-4781-b995-f55e8bcee920"}', true);
  perform public.tms_get_waybill_leg_commission_secure(ordinary_waybill, 'forward');
  begin
    perform public.tms_get_waybill_leg_commission_secure(qa_waybill, 'return');
    raise exception 'Forged ordinary header read another tenant';
  exception when insufficient_privilege then null; end;
  begin
    perform public.tms_override_waybill_leg_commission_secure(
      qa_waybill, 'return', 123, '伪造租户调整返程提成');
    raise exception 'Forged ordinary header wrote another tenant';
  exception when insufficient_privilege then null; end;

  perform set_config('request.jwt.claims',
    '{"sub":"5774aa51-3bbb-4da5-abd4-7ea44b44ea6a","role":"authenticated"}', true);
  perform set_config('request.headers', '{}', true);
  begin
    perform public.tms_override_waybill_leg_commission_secure(
      qa_waybill, 'return', 123, '未授权调整返程提成');
    raise exception 'Unassigned user changed commission';
  exception when insufficient_privilege then null; end;

  perform set_config('request.jwt.claims',
    '{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}', true);
  perform set_config('request.headers',
    '{"x-art-tenant-scope":"2824c2b5-2774-4781-b995-f55e8bcee920"}', true);
  return_before := public.tms_get_waybill_leg_commission_secure(
    qa_waybill, 'return')->'estimate';
  forward_before := public.tms_get_waybill_leg_commission_secure(
    qa_waybill, 'forward')->'estimate';
  audit_before := jsonb_array_length(public.tms_get_waybill_leg_commission_secure(
    qa_waybill, 'return')->'history');
  forward_audit_before := jsonb_array_length(forward_history);
  result := public.tms_override_waybill_leg_commission_secure(
    qa_waybill, 'return', 510, '返程运费变化调整提成');
  if result->>'legKind' <> 'return'
    or (result->'estimate'->>'amount')::numeric <> 510
    or result->'estimate'->>'matched' <> 'false'
    or result->'estimate'->'baseEstimate' is distinct from to_jsonb(return_before)
  then raise exception 'Unmatched return base estimate was not preserved'; end if;
  result := public.tms_override_waybill_leg_commission_secure(
    qa_waybill, 'return', 530, '返程线路复核再次调整');
  if result->'estimate'->'baseEstimate' is distinct from to_jsonb(return_before)
    or result->'estimate'->>'matched' <> 'false'
  then raise exception 'Repeated return override lost original base'; end if;
  if jsonb_array_length(public.tms_get_waybill_leg_commission_secure(
      qa_waybill, 'return')->'history') <> audit_before + 2
    or jsonb_array_length(public.tms_get_waybill_commission_secure(
      qa_waybill)->'history') <> forward_audit_before
    or public.tms_get_waybill_commission_secure(qa_waybill)->'history'
      is distinct from forward_history
    or public.tms_get_waybill_leg_commission_secure(
      qa_waybill, 'forward')->'estimate' is distinct from forward_before
  then raise exception 'Return audit or forward isolation failed'; end if;

  return_base := jsonb_build_object('matched', true, 'amount', 500,
    'snapshot', jsonb_build_object('ruleId', '63352b5c-519b-486d-bcaa-9dc11a41e8c5',
      'versionNo', 1));
  result := public.tms_override_waybill_leg_commission_secure(
    matched_waybill, 'return', 545, '匹配规则后返程金额调整');
  if result->'estimate'->'baseEstimate' <> return_base
    or result->'estimate'->>'matched' <> 'true'
    or result->'estimate'->'snapshot' <> return_base->'snapshot'
  then raise exception 'Matched rule snapshot lost during override'; end if;
  result := public.tms_override_waybill_leg_commission_secure(
    matched_waybill, 'return', 555, '二次调整仍保留规则快照');
  if result->'estimate'->'baseEstimate' <> return_base
    or result->'estimate'->'snapshot' <> return_base->'snapshot'
  then raise exception 'Second override lost matched rule snapshot'; end if;

  begin
    perform public.tms_override_waybill_leg_commission_secure(
      qa_waybill, 'wrong', 5, '货单方向非法调整');
    raise exception 'Invalid leg kind accepted';
  exception when invalid_parameter_value then null; end;
  perform set_config('request.headers',
    '{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}', true);
  begin
    perform public.tms_override_waybill_leg_commission_secure(
      ordinary_waybill, 'return', 5, '缺失返程货单调整');
    raise exception 'Missing return leg accepted';
  exception when check_violation then null; end;
  begin
    perform public.tms_override_waybill_leg_commission_secure(
      'a9fc0006-1023-4620-9220-000000000001', 'forward', 5, '已完成任务调整司机提成');
    raise exception 'Completed task override accepted';
  exception when check_violation then null; end;
  perform set_config('request.headers',
    '{"x-art-tenant-scope":"2824c2b5-2774-4781-b995-f55e8bcee920"}', true);
  begin
    perform public.tms_override_waybill_leg_commission_secure(
      qa_waybill, 'return', -1, '负数提成金额非法');
    raise exception 'Negative override accepted';
  exception when invalid_parameter_value then null; end;
end $test$;

reset role;
do $test$
begin
  if (select count(*) from public.tms_waybill_commission_override_audit a
      join public.tms_waybill_leg l on l.id = a.leg_id
      where a.waybill_id in (
        'ad93535b-5055-4064-84eb-7cdcdf34fde8',
        '022f24c7-9854-491b-9a4e-8c85727e1b6f'
      ) and a.reason in (
        '返程运费变化调整提成', '返程线路复核再次调整',
        '匹配规则后返程金额调整', '二次调整仍保留规则快照'
      ) and l.leg_kind = 'return' and l.waybill_id = a.waybill_id
        and l.tenant_id = a.tenant_id) <> 4
  then raise exception 'Return adjustments were not linked to the return child leg'; end if;
end $test$;
rollback;
