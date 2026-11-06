-- Unified dispatch-resource selection. Every fixture and execution is rolled back.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $test$
DECLARE
  reviewer uuid; actor uuid; tenant uuid; source public.tms_order%rowtype;
  carriers uuid[]; drivers uuid[] := '{}'; vehicles uuid[] := '{}';
  driver_id uuid; vehicle_id uuid; chosen_carrier uuid; owner_kind text; mode text;
  candidate jsonb; item jsonb; created jsonb; result jsonb; denied boolean; i integer;
BEGIN
  SELECT auth_user_id INTO STRICT reviewer FROM public.sys_user
    WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1;
  SELECT auth_user_id,tenant_id INTO STRICT actor,tenant FROM public.sys_user
    WHERE user_email='3@qq.com' AND auth_user_id IS NOT NULL LIMIT 1;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'role','authenticated')::text,true);
  PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',tenant)::text,true);
  SELECT array_agg(id) INTO carriers FROM (SELECT id FROM public.mdm_carrier WHERE tenant_id=tenant ORDER BY id LIMIT 2) c;
  IF cardinality(carriers)<>2 THEN RAISE EXCEPTION 'Test requires two tenant-owned carriers'; END IF;
  SELECT * INTO STRICT source FROM public.tms_order
    WHERE tenant_id=tenant AND shipping_customer_id IS NOT NULL AND receiving_customer_id IS NOT NULL
    ORDER BY create_time DESC LIMIT 1;
  FOR i IN 1..4 LOOP
    driver_id:=gen_random_uuid(); vehicle_id:=gen_random_uuid();
    owner_kind:=case i when 1 then 'self' when 4 then 'individual' else 'carrier' end;
    chosen_carrier:=case i when 1 then null when 3 then carriers[2] else carriers[1] end;
    INSERT INTO public.mdm_driver(id,tenant_id,driver_name,phone,gender,id_card_no,license_type,driver_type,enabled,carrier_id)
    VALUES(driver_id,tenant,'参选回归-司机-'||i,'1390000910'||i,'male','1101011990010190'||lpad(i::text,2,'0'),'A2','primary',true,chosen_carrier);
    INSERT INTO public.tms_driver_profile(driver_id,tenant_id,driver_ownership,driver_status)
    VALUES(driver_id,tenant,owner_kind,case i when 2 then 'suspended' else 'on_duty' end);
    INSERT INTO public.mdm_vehicle(id,tenant_id,plate_no,plate_color,vehicle_type,vehicle_ownership,carrier_id,primary_driver_id,company_name,load_tons,volume_m3,operation_status,audit_status)
    VALUES(vehicle_id,tenant,'测A99'||lpad(i::text,3,'0'),'blue','truck',case i when 1 then 'self_operated' when 3 then 'third_party' when 4 then 'individual_affiliation' else 'carrier' end,chosen_carrier,driver_id,case i when 1 then '参选回归自营公司' else '' end,1,1,'operating','approved');
    drivers:=array_append(drivers,driver_id); vehicles:=array_append(vehicles,vehicle_id);
  END LOOP;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  PERFORM set_config('request.headers','{}',true);
  FOREACH mode IN ARRAY ARRAY['self_driver','carrier_driver','individual_driver','vehicle','carrier_vehicle','individual_vehicle'] LOOP
    candidate:=public.tms_list_dispatch_candidates_secure(mode,tenant,'参选回归',0,99);
    IF (candidate->>'total')::integer<>(case when mode in ('carrier_driver','carrier_vehicle') then 2 else 1 end) THEN
      RAISE EXCEPTION '归属过滤错误 %：%',mode,candidate;
    END IF;
  END LOOP;
  candidate:=public.tms_list_dispatch_candidates_secure('carrier_vehicle',tenant,'参选回归',0,0);
  IF jsonb_array_length(candidate->'records')<>1 OR (candidate->>'total')::integer<>2 THEN RAISE EXCEPTION '过滤后分页计数错误'; END IF;
  candidate:=public.tms_list_dispatch_candidates_secure('carrier_driver',tenant,drivers[2]::text,0,9);
  item:=candidate->'records'->0;
  IF item->>'vehicle_id'<>vehicles[2]::text OR item->'vehicle'->>'id'<>vehicles[2]::text OR item->>'gender'<>'male' THEN
    RAISE EXCEPTION '司机关联车辆或新增资料未带出：%',item;
  END IF;
  IF item->'phone' IS DISTINCT FROM (SELECT app_private.tms_driver_to_secure_json(d,null)->'phone' FROM public.mdm_driver d WHERE d.id=drivers[2]) THEN
    RAISE EXCEPTION '司机电话绕过字段权限投影';
  END IF;
  candidate:=public.tms_list_dispatch_candidates_secure('carrier_vehicle',tenant,vehicles[2]::text,0,9);
  IF candidate->'records'->0->'primary_driver'->>'id'<>drivers[2]::text THEN RAISE EXCEPTION '车辆关联司机未带出'; END IF;
  -- Off-duty is still selectable, not silently filtered out.
  IF item->>'driver_status'<>'suspended' THEN RAISE EXCEPTION '风险状态司机未按提醒规则保留'; END IF;

  FOR i IN 1..4 LOOP
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'role','authenticated')::text,true);
    PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',tenant)::text,true);
    created:=public.tms_create_order_with_contract_secure(jsonb_build_object(
      'order_no','','order_status','pending_load','origin_station',source.origin_station,'destination_station',source.destination_station,'delivery_method',source.delivery_method,
      'shipping_customer_id',source.shipping_customer_id,'receiving_customer_id',source.receiving_customer_id,
      'shipping_contact_name',source.shipping_contact_name,'shipping_contact_phone',source.shipping_contact_phone,'shipping_address_detail',source.shipping_address_detail,
      'receiving_contact_name',source.receiving_contact_name,'receiving_contact_phone',source.receiving_contact_phone,'receiving_address_detail',source.receiving_address_detail,
      'cargo_items',jsonb_build_array(jsonb_build_object('cargo_name','参选回归货物','quantity',1,'weight_kg',100,'volume_m3',1)),
      'cargo_quantity_total',1,'cargo_weight_total',100,'cargo_volume_total',1,'transport_fee',100,'total_fee',100,'payment_method',source.payment_method,
      'transport_mode',coalesce(source.transport_mode,'road'),'order_config',coalesce(source.order_config,'{}')
    ),null);
    mode:=case i when 1 then 'self_operated' when 4 then 'individual_driver' else 'carrier' end;
    chosen_carrier:=case i when 1 then null when 3 then carriers[2] else carriers[1] end;
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
    PERFORM set_config('request.headers','{"x-art-tenant-scope":"2824c2b5-2774-4781-b995-f55e8bcee920"}',true);
    IF i=2 THEN
      denied:=false;
      BEGIN
        PERFORM public.tms_create_dispatch_plan_secure(jsonb_build_object('kind','single','executions',jsonb_build_array(jsonb_build_object(
          'dispatch_mode',mode,'dispatch_vehicle_id',vehicles[i],'dispatch_driver_id',drivers[3],'dispatch_carrier_id',chosen_carrier,
          'planned_departure_time',now()+interval '1 day','planned_arrival_time',now()+interval '2 days',
          'allocations',jsonb_build_array(jsonb_build_object('order_id',created->>'id','lines',jsonb_build_array(jsonb_build_object('line_index',0,'quantity',1,'weight_kg',100,'volume_m3',1))))))));
      EXCEPTION WHEN check_violation THEN denied:=true; END;
      IF NOT denied THEN RAISE EXCEPTION '不同承运商的司机与车辆被错误合并'; END IF;
    END IF;
    result:=public.tms_create_dispatch_plan_secure(jsonb_build_object('kind','single','executions',jsonb_build_array(jsonb_build_object(
      'dispatch_mode',mode,'dispatch_vehicle_id',vehicles[i],'dispatch_driver_id',drivers[i],'dispatch_carrier_id',chosen_carrier,
      'planned_departure_time',now()+interval '1 day','planned_arrival_time',now()+interval '2 days',
      'allocations',jsonb_build_array(jsonb_build_object('order_id',created->>'id','lines',jsonb_build_array(jsonb_build_object('line_index',0,'quantity',1,'weight_kg',100,'volume_m3',1))))))));
    IF NOT EXISTS(SELECT 1 FROM public.tms_waybill w WHERE w.id=(result->'waybill_ids'->>0)::uuid AND w.vehicle_id=vehicles[i] AND w.driver_id=drivers[i] AND w.dispatch_mode=mode AND w.carrier_id IS NOT DISTINCT FROM chosen_carrier) THEN
      RAISE EXCEPTION '参选后车辆、司机或承运商未保存：%',result;
    END IF;
  END LOOP;

  -- Same read boundary in platform-all / platform-selected / ordinary / forged headers.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',reviewer,'role','authenticated')::text,true);
  PERFORM set_config('request.headers','{}',true);
  PERFORM public.tms_list_dispatch_candidates_secure('carrier_vehicle',tenant,null,0,9);
  PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',tenant)::text,true);
  PERFORM public.tms_list_dispatch_candidates_secure('carrier_vehicle',tenant,null,0,9);
  PERFORM set_config('request.headers','{"x-art-tenant-scope":"2824c2b5-2774-4781-b995-f55e8bcee920"}',true);
  denied:=false;
  BEGIN PERFORM public.tms_list_dispatch_candidates_secure('carrier_vehicle',tenant,null,0,9);
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION '平台选定租户被绕过'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  PERFORM public.tms_list_dispatch_candidates_secure('carrier_vehicle',tenant,null,0,9);
  denied:=false;
  BEGIN PERFORM public.tms_list_dispatch_candidates_secure('carrier_vehicle','2824c2b5-2774-4781-b995-f55e8bcee920',null,0,9);
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION '普通用户伪造租户头生效'; END IF;
END $test$;
ROLLBACK;
