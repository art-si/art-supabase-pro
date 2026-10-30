-- Contract rehearsal only: canonical rule save, order open, dispatch and return-leg
-- creation must calculate both commission snapshots for two planned trips.
-- An unmatched trip and a manually adjusted forward leg retain their snapshots.
-- The QA rules and trips are rolled back; task-number sequences still advance.
begin;
set local statement_timeout = '45000ms';

-- A permanent QA rule can overlap this fixture. Hide only this driver's rules
-- inside the rollback transaction so each match must use the temporary V1 rule.
-- The rule update and its audit trigger effects are restored by rollback.
select set_config(
  'request.jwt.claims',
  '{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',
  true
);
select set_config(
  'request.headers',
  '{"x-art-tenant-scope":"2824c2b5-2774-4781-b995-f55e8bcee920"}',
  true
);
update public.tms_driver_commission_rule
set enabled = false
where tenant_id = '2824c2b5-2774-4781-b995-f55e8bcee920'
  and driver_id = 'b29a9470-cc7a-4516-8b93-ba601f87476b'
  and enabled;

-- Start after any existing plan for this driver or vehicle, including the
-- persistent QA trips when they are added later. Unknown end times stop the test.
do $plan$
begin
  if exists (
    select 1 from public.tms_waybill w
    where w.tenant_id = '2824c2b5-2774-4781-b995-f55e8bcee920'
      and (w.driver_id = 'b29a9470-cc7a-4516-8b93-ba601f87476b'
        or w.vehicle_id = '44bb6d53-47bf-4d6e-b016-51a83985b220')
      and w.status not in ('completed','cancelled')
      and w.planned_unload_time is null
  ) then raise exception 'Existing QA resource plan has no end time'; end if;
end $plan$;
select set_config(
  'test.tms_auto_commission_first_day',
  greatest(
    date '2026-11-09',
    (now() at time zone 'Asia/Shanghai')::date + 2,
    coalesce((
      select max((w.planned_unload_time at time zone 'Asia/Shanghai')::date) + 2
      from public.tms_waybill w
      where w.tenant_id = '2824c2b5-2774-4781-b995-f55e8bcee920'
        and (w.driver_id = 'b29a9470-cc7a-4516-8b93-ba601f87476b'
          or w.vehicle_id = '44bb6d53-47bf-4d6e-b016-51a83985b220')
        and w.status not in ('completed','cancelled')
    ), date '2026-11-09')
  )::text,
  true
);

set local role authenticated;

do $qa$
declare
  v_forward_rule jsonb;
  v_return_rule jsonb;
  v_created jsonb;
  v_dispatch jsonb;
  v_forward jsonb;
  v_forward_before_return jsonb;
  v_forward_history_before_return jsonb;
  v_return jsonb;
  v_forward_after_return jsonb;
  v_order_id uuid;
  v_waybill_id uuid;
  v_day date;
  v_idx int;
  v_origin text;
  v_destination text;
  v_start timestamptz;
  v_end timestamptz;
begin
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

  v_forward_rule := public.tms_save_driver_commission_rule_secure(null,jsonb_build_object(
    'driver_id','b29a9470-cc7a-4516-8b93-ba601f87476b',
    'rule_name','QA返程司机乙·正向自动提成验收',
    'vehicle_type_profile_id','a2d5bf4a-964c-47ab-b92a-302108c8543a',
    'origin','QA上海','destination','QA广州',
    'direction','forward','effective_from','2026-10-29',
    'method','fixed_per_trip','rate',800,'enabled',true,
    'remark','QA合同演练，事务回滚'
  ));
  v_return_rule := public.tms_save_driver_commission_rule_secure(null,jsonb_build_object(
    'driver_id','b29a9470-cc7a-4516-8b93-ba601f87476b',
    'rule_name','QA返程司机乙·返程自动提成验收',
    'vehicle_type_profile_id','a2d5bf4a-964c-47ab-b92a-302108c8543a',
    'origin','QA广州','destination','QA上海',
    'direction','return','effective_from','2026-10-29',
    'method','fixed_per_trip','rate',500,'enabled',true,
    'remark','QA合同演练，事务回滚'
  ));
  if v_forward_rule->>'id' is null or v_return_rule->>'id' is null
    or (v_forward_rule->>'version_no')::int is distinct from 1
    or (v_return_rule->>'version_no')::int is distinct from 1
  then raise exception 'Rule RPC did not create V1 snapshots'; end if;

  for v_idx in 1..4 loop
    v_day := current_setting('test.tms_auto_commission_first_day')::date + (v_idx - 1) * 2;
    v_origin := case v_idx when 3 then 'QA南京' else 'QA上海' end;
    v_destination := case v_idx when 3 then 'QA苏州' else 'QA广州' end;
    v_start := (v_day::text || ' 09:00:00+08')::timestamptz;
    v_end := (v_day::text || ' 18:00:00+08')::timestamptz;
    v_created := public.tms_create_order_secure(jsonb_build_object(
      'order_status','pending_load',
      'origin_station',v_origin,'destination_station',v_destination,
      'delivery_method','door',
      'shipping_customer_id','23754bd1-d87b-4660-a45b-e69210346d01',
      'shipping_contact_name','QA发货','shipping_contact_phone','10000000001',
      'shipping_address_detail','QA上海测试地址',
      'receiving_contact_name','QA收货','receiving_contact_phone','10000000002',
      'receiving_address_detail','QA广州测试地址',
      'cargo_items',jsonb_build_array(jsonb_build_object(
        'cargo_name','QA自动提成合同演练货物','quantity',2,'weight_kg',1000,'volume_m3',3)),
      'cargo_quantity_total',2,'cargo_weight_total',1000,'cargo_volume_total',3,
      'transport_fee',1800,'total_fee',1800,
      'payment_method','collect','payment_total',1800,
      'transport_mode','road',
      'order_remark','QA自动提成事务回滚合同演练',
      'distance_km',1200,
      'order_config',jsonb_build_object(
        'load_type','ftl','packaging','bulk','truck_count',1,
        'billing_mode','quantity','billing_unit','',
        'vehicle_type','厢式货车','cargo_category','general',
        'attachment_urls',jsonb_build_array(),
        'transport_requirements',jsonb_build_array())
    ));
    v_order_id := (v_created->>'id')::uuid;
    if v_order_id is null then raise exception 'Order RPC returned no ID'; end if;

    v_dispatch := public.tms_create_dispatch_plan_secure(jsonb_build_object(
      'kind','single',
      'executions',jsonb_build_array(jsonb_build_object(
        'dispatch_mode','self_operated',
        'dispatch_vehicle_id','44bb6d53-47bf-4d6e-b016-51a83985b220',
        'dispatch_driver_id','b29a9470-cc7a-4516-8b93-ba601f87476b',
        'planned_departure_time',v_start,
        'planned_arrival_time',v_end,
        'allocations',jsonb_build_array(jsonb_build_object(
          'order_id',v_order_id,
          'lines',jsonb_build_array(jsonb_build_object(
            'line_index',0,'quantity',2,'weight_kg',1000,'volume_m3',3))
        ))
      ))
    ));
    v_waybill_id := (v_dispatch->'waybill_ids'->>0)::uuid;
    if v_waybill_id is null then raise exception 'Dispatch RPC returned no task ID'; end if;

    v_forward := public.tms_get_waybill_leg_commission_secure(v_waybill_id,'forward')->'estimate';
    if v_idx = 3 then
      if v_forward->>'matched' is distinct from 'false'
        or v_forward->'amount' is distinct from 'null'::jsonb
        or v_forward->'snapshot' is distinct from 'null'::jsonb
      then raise exception 'Unmatched forward snapshot mismatch: %',v_forward; end if;
    elsif v_forward->>'matched' is distinct from 'true'
      or (v_forward->>'amount')::numeric is distinct from 800
      or v_forward->'snapshot'->>'ruleId' is distinct from v_forward_rule->>'id'
      or (v_forward->'snapshot'->>'versionNo')::int is distinct from 1
    then raise exception 'Forward auto snapshot mismatch: %',v_forward; end if;
    if v_idx = 4 then
      perform public.tms_override_waybill_leg_commission_secure(
        v_waybill_id,'forward',825,'QA正向提成留痕回滚验证'
      );
      v_forward := public.tms_get_waybill_leg_commission_secure(v_waybill_id,'forward')->'estimate';
      v_forward_history_before_return := public.tms_get_waybill_leg_commission_secure(
        v_waybill_id,'forward')->'history';
      if (v_forward->>'amount')::numeric is distinct from 825
        or v_forward->'manualOverride' is null
        or jsonb_array_length(v_forward_history_before_return) is distinct from 1
      then raise exception 'Manual forward audit was not saved'; end if;
    end if;
    v_forward_before_return := v_forward;

    perform public.tms_create_return_leg_secure(v_waybill_id,jsonb_build_object(
      'return_customer_id','23754bd1-d87b-4660-a45b-e69210346d01',
      'origin_station',v_destination,'destination_station',v_origin,
      'planned_departure_at',v_end + interval '1 hour',
      'distance_km',1200,'cargo_weight_tons',1,'cargo_volume_m3',3,
      'freight_income',900,'information_fee',40,
      'technical_service_fee',20,'direct_toll_fee',80,
      'direct_misc_fee',10,'shared_cost_allocation_pct',0,
      'remark','QA自动提成事务回滚合同演练'
    ));
    v_forward_after_return := public.tms_get_waybill_leg_commission_secure(v_waybill_id,'forward');
    v_forward := v_forward_after_return->'estimate';
    v_return := public.tms_get_waybill_leg_commission_secure(v_waybill_id,'return')->'estimate';
    if v_forward is distinct from v_forward_before_return
    then raise exception 'Adding return rewrote the forward estimate'; end if;
    if v_idx = 4 then
      if (v_forward->>'amount')::numeric is distinct from 825
        or v_forward->'manualOverride' is null
        or v_forward_after_return->'history' is distinct from v_forward_history_before_return
      then raise exception 'Adding return changed manual forward amount or audit'; end if;
    elsif v_idx = 3 then
      if v_forward->>'matched' is distinct from 'false'
        or v_return->>'matched' is distinct from 'false'
        or v_forward->'amount' is distinct from 'null'::jsonb
        or v_return->'amount' is distinct from 'null'::jsonb
      then raise exception 'Adding return changed unmatched snapshots'; end if;
    elsif v_forward->>'matched' is distinct from 'true'
      or (v_forward->>'amount')::numeric is distinct from 800
      or v_forward->'snapshot'->>'ruleId' is distinct from v_forward_rule->>'id'
      or (v_forward->'snapshot'->>'versionNo')::int is distinct from 1
    then raise exception 'Matched forward snapshot changed'; end if;
    if v_idx <> 3 and (v_return->>'matched' is distinct from 'true'
      or (v_return->>'amount')::numeric is distinct from 500
      or v_return->'snapshot'->>'ruleId' is distinct from v_return_rule->>'id'
      or (v_return->'snapshot'->>'versionNo')::int is distinct from 1)
    then raise exception 'Both leg snapshots mismatch: forward %, return %',v_forward,v_return; end if;
  end loop;
end $qa$;

rollback;
select 'four canonical rollback flows passed: two matched trips, unmatched snapshot, and manual forward audit preserved' result;
