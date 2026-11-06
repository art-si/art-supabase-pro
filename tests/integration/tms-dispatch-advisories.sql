-- Planning risks are advisory in dispatch / split / merge, not tenant/auth bypasses.
-- Test records and risk flags are always rolled back.
BEGIN;
DO $test$
DECLARE
  reviewer uuid;
  actor uuid;
  tenant uuid;
  source public.tms_order%rowtype;
  vehicle public.mdm_vehicle%rowtype;
  driver public.mdm_driver%rowtype;
  created jsonb;
  ids uuid[] := '{}';
  execution jsonb;
  executions jsonb;
  result jsonb;
  warnings jsonb;
  i integer;
  kind text;
  denied boolean;
BEGIN
  SELECT auth_user_id INTO STRICT reviewer FROM public.sys_user
    WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1;
  SELECT auth_user_id,tenant_id INTO STRICT actor,tenant FROM public.sys_user
    WHERE user_email='3@qq.com' AND auth_user_id IS NOT NULL LIMIT 1;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'role','authenticated')::text,true);
  PERFORM set_config('request.headers','{}',true);
  SELECT * INTO STRICT source FROM public.tms_order
    WHERE tenant_id=tenant AND jsonb_array_length(cargo_items)>0
      AND shipping_customer_id IS NOT NULL AND receiving_customer_id IS NOT NULL
    ORDER BY create_time DESC LIMIT 1;
  SELECT * INTO STRICT vehicle FROM public.mdm_vehicle
    WHERE tenant_id=tenant AND vehicle_ownership='self_operated'
      AND load_tons>0 AND volume_m3>0 AND load_tons<200 AND volume_m3<2000 LIMIT 1;
  SELECT * INTO STRICT driver FROM public.mdm_driver
    WHERE tenant_id=tenant AND NOT is_blacklisted
      AND NOT EXISTS(SELECT 1 FROM public.tms_driver_blacklist b
        WHERE b.driver_id=mdm_driver.id AND b.released_at IS NULL)
    ORDER BY id LIMIT 1;
  UPDATE public.mdm_driver SET enabled=false WHERE id=driver.id;
  PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',tenant)::text,true);

  FOR i IN 1..4 LOOP
    created:=public.tms_create_order_with_contract_secure(jsonb_build_object(
      'order_no','','order_status','pending_load',
      'origin_station',source.origin_station,'destination_station',source.destination_station,
      'delivery_method',source.delivery_method,
      'shipping_customer_id',source.shipping_customer_id,'receiving_customer_id',source.receiving_customer_id,
      'shipping_contact_name',source.shipping_contact_name,'shipping_contact_phone',source.shipping_contact_phone,
      'shipping_address_detail',source.shipping_address_detail,
      'receiving_contact_name',source.receiving_contact_name,'receiving_contact_phone',source.receiving_contact_phone,
      'receiving_address_detail',source.receiving_address_detail,
      'cargo_items',jsonb_build_array(jsonb_build_object('cargo_name','风险提醒回滚测试','quantity',2,'weight_kg',200000,'volume_m3',2000)),
      'cargo_quantity_total',2,'cargo_weight_total',200000,'cargo_volume_total',2000,
      'transport_fee',100,'total_fee',100,'payment_method',source.payment_method,
      'transport_mode',coalesce(source.transport_mode,'road'),
      'order_config',coalesce(source.order_config,'{}')||'{"allow_consolidation":true}'::jsonb
    ),null);
    ids:=array_append(ids,(created->>'id')::uuid);
  END LOOP;

  -- Platform all and selected tenants retain the canonical scope contract.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'role','authenticated')::text,true);
  PERFORM set_config('request.headers','{}',true);
  PERFORM public.tms_check_dispatch_advisories_secure(ids[1],vehicle.id,driver.id);
  PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',tenant)::text,true);
  PERFORM public.tms_check_dispatch_advisories_secure(ids[1],vehicle.id,driver.id);
  PERFORM set_config('request.headers','{"x-art-tenant-scope":"2824c2b5-2774-4781-b995-f55e8bcee920"}',true);
  denied:=false;
  BEGIN PERFORM public.tms_check_dispatch_advisories_secure(ids[1],vehicle.id,driver.id);
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION '平台选定租户的风险读取越界'; END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  PERFORM set_config('request.headers','{}',true);
  PERFORM public.tms_check_dispatch_advisories_secure(ids[1],vehicle.id,driver.id);
  -- Forged header must not change an ordinary user's tenant, including risk reads.
  PERFORM set_config('request.headers','{"x-art-tenant-scope":"2824c2b5-2774-4781-b995-f55e8bcee920"}',true);
  warnings:=public.tms_check_dispatch_advisories_secure(ids[1],vehicle.id,driver.id);
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(warnings) w
      WHERE w->>'subject_label'=driver.driver_name AND w->>'message'='司机已停用')
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(warnings) w WHERE w->>'message'='司机在黑名单中') THEN
    RAISE EXCEPTION '司机具名风险提醒缺失：%',warnings;
  END IF;
  denied:=false;
  BEGIN
    PERFORM public.tms_check_dispatch_advisories_secure(ids[1],
      (SELECT id FROM public.mdm_vehicle WHERE tenant_id<>tenant LIMIT 1),driver.id);
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION '风险提醒读取绕过了车辆租户边界'; END IF;

  FOREACH kind IN ARRAY ARRAY['single','split','merge'] LOOP
    execution:=jsonb_build_object('dispatch_mode','legacy_vehicle',
      'dispatch_vehicle_id',vehicle.id,'dispatch_driver_id',driver.id,
      'planned_departure_time',now()+interval '1 day','planned_arrival_time',now()+interval '2 days');
    IF kind='split' THEN
      execution:=execution||jsonb_build_object('allocations',jsonb_build_array(jsonb_build_object('order_id',ids[2],
        'lines',jsonb_build_array(jsonb_build_object('line_index',0,'quantity',1,'weight_kg',100000,'volume_m3',1000)))));
      executions:=jsonb_build_array(execution,execution);
    ELSIF kind='merge' THEN
      execution:=execution||jsonb_build_object('allocations',jsonb_build_array(
        jsonb_build_object('order_id',ids[3],'lines',jsonb_build_array(jsonb_build_object('line_index',0,'quantity',2,'weight_kg',200000,'volume_m3',2000))),
        jsonb_build_object('order_id',ids[4],'lines',jsonb_build_array(jsonb_build_object('line_index',0,'quantity',2,'weight_kg',200000,'volume_m3',2000)))));
      executions:=jsonb_build_array(execution);
    ELSE
      execution:=execution||jsonb_build_object('allocations',jsonb_build_array(jsonb_build_object('order_id',ids[1],
        'lines',jsonb_build_array(jsonb_build_object('line_index',0,'quantity',2,'weight_kg',200000,'volume_m3',2000)))));
      executions:=jsonb_build_array(execution);
    END IF;
    result:=public.tms_create_dispatch_plan_secure(jsonb_build_object('kind',kind,'executions',executions));
    IF jsonb_array_length(result->'waybill_ids')<>jsonb_array_length(executions)
      OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result->'warnings') w WHERE w->>'subject_label'=driver.driver_name)
      OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result->'warnings') w WHERE w->>'message' LIKE '%核载吨位%')
      OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result->'warnings') w WHERE w->>'message' LIKE '%车辆容积%') THEN
      RAISE EXCEPTION '% 未完成带风险配载或提醒缺失：%',kind,result;
    END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM app_private.tms_dispatch_batch_driver_context WHERE transaction_id=txid_current()) THEN
    RAISE EXCEPTION '调度计划的内部上下文未清理';
  END IF;
  IF has_function_privilege('anon','public.tms_check_dispatch_advisories_secure(uuid,uuid,uuid)','EXECUTE')
    OR has_table_privilege('authenticated','app_private.tms_dispatch_batch_driver_context','INSERT') THEN
    RAISE EXCEPTION '调度风险检查或上下文错误地开放了匿名/直接写权限';
  END IF;
  -- The planning exception is not a global relaxation of actual driver acceptance.
  denied:=false;
  BEGIN PERFORM app_private.tms_assert_driver_certified(tenant,driver.id,'self_operated');
  EXCEPTION WHEN check_violation THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION '计划配载修改意外放宽了其他司机状态检查'; END IF;
END $test$;
ROLLBACK;
