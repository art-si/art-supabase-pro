-- Platform actors retain their real identity on selected-tenant transport records.
-- Root creates follow the selected tenant; ordinary headers cannot select another tenant.
-- All writes are rolled back after assertions.
BEGIN;
DO $audit$
DECLARE
  v_payload jsonb := '{"origin_station":"QA预检起点","destination_station":"QA预检终点","transfer_station_ids":[],"delivery_method":"door","shipping_contact_name":"QA发货","shipping_contact_phone":"10000000001","shipping_address_detail":"QA演示地址1","receiving_contact_name":"QA收货","receiving_contact_phone":"10000000002","receiving_address_detail":"QA演示地址2","cargo_items":[{"cargo_name":"QA演示货物"}],"payment_method":"collect","transport_mode":"road","order_remark":"QA演示·creator预检","order_config":{"load_type":"ltl","vehicle_type":"冷藏车","billing_mode":"quantity","cargo_category":"general","packaging":"bulk","transport_requirements":[],"attachment_urls":[]}}'::jsonb;
  v_no_refs jsonb;
  v_result jsonb;
  v_id uuid;
  v_qa_id uuid;
  v_waybill_id uuid;
  v_tenant uuid;
  v_creator uuid;
BEGIN
  v_no_refs := v_payload - 'origin_station_id' - 'destination_station_id'
    - 'transfer_station_id' - 'transfer_station_ids' - 'transfer_station';
  v_no_refs := v_no_refs || jsonb_build_object('origin_station','QA演示起点','destination_station','QA演示终点');
  PERFORM set_config('request.jwt.claims','{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
  PERFORM set_config('request.headers','{}',true);
  v_result := public.tms_create_order_secure(v_no_refs);
  v_id := (v_result->>'id')::uuid;
  SELECT tenant_id,created_by_user_id INTO v_tenant,v_creator FROM public.tms_order WHERE id=v_id;
  IF v_tenant<>'028e6a68-a9db-4055-974c-1e05bfe94b0f' OR v_creator<>'51760251-629d-4561-aeb8-0fbe62352494' THEN
    RAISE EXCEPTION 'platform all wrong root tenant/creator %, %',v_tenant,v_creator;
  END IF;
  PERFORM set_config('request.headers','{"x-art-tenant-scope":"2824c2b5-2774-4781-b995-f55e8bcee920"}',true);
  v_result := public.tms_create_order_secure(v_payload);
  v_qa_id := (v_result->>'id')::uuid;
  SELECT tenant_id,created_by_user_id INTO v_tenant,v_creator FROM public.tms_order WHERE id=v_qa_id;
  IF v_tenant<>'2824c2b5-2774-4781-b995-f55e8bcee920' OR v_creator<>'51760251-629d-4561-aeb8-0fbe62352494' THEN
    RAISE EXCEPTION 'platform selected wrong root tenant/creator %, %',v_tenant,v_creator;
  END IF;
  BEGIN
    UPDATE public.tms_order SET created_by_user_id='93f2f1e8-a3dc-4f5a-999b-6c8c02d0c7e9' WHERE id=v_qa_id;
    RAISE EXCEPTION 'creator rewrite unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.tms_order SET tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9' WHERE id=v_qa_id;
    RAISE EXCEPTION 'tenant rewrite unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  INSERT INTO public.tms_waybill(tenant_id,waybill_no,origin_city,destination_city,shipper_address,receiver_address,cargo_name,order_id)
  VALUES ('2824c2b5-2774-4781-b995-f55e8bcee920',
    'QA-CREATOR-ROLLBACK-'||substring(gen_random_uuid()::text from 1 for 8),'济南','青岛','QA地址1','QA地址2','QA货物',v_qa_id)
  RETURNING id,tenant_id,created_by_user_id INTO v_waybill_id,v_tenant,v_creator;
  IF v_tenant<>'2824c2b5-2774-4781-b995-f55e8bcee920' OR v_creator<>'51760251-629d-4561-aeb8-0fbe62352494' THEN
    RAISE EXCEPTION 'waybill wrong tenant/creator %, %',v_tenant,v_creator;
  END IF;
  BEGIN
    UPDATE public.tms_waybill SET created_by_user_id='93f2f1e8-a3dc-4f5a-999b-6c8c02d0c7e9' WHERE id=v_waybill_id;
    RAISE EXCEPTION 'waybill creator rewrite unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.tms_waybill SET tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9' WHERE id=v_waybill_id;
    RAISE EXCEPTION 'waybill tenant rewrite unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
  PERFORM set_config('request.headers','{}',true);
  v_result := public.tms_create_order_secure(v_no_refs);
  v_id := (v_result->>'id')::uuid;
  SELECT tenant_id,created_by_user_id INTO v_tenant,v_creator FROM public.tms_order WHERE id=v_id;
  IF v_tenant<>'7529f951-938e-4e2c-ac0d-316c136ae1f9' OR v_creator<>'93f2f1e8-a3dc-4f5a-999b-6c8c02d0c7e9' THEN
    RAISE EXCEPTION 'ordinary own wrong root tenant/creator %, %',v_tenant,v_creator;
  END IF;
  PERFORM set_config('request.headers','{"x-art-tenant-scope":"2824c2b5-2774-4781-b995-f55e8bcee920"}',true);
  v_result := public.tms_create_order_secure(v_no_refs);
  v_id := (v_result->>'id')::uuid;
  SELECT tenant_id,created_by_user_id INTO v_tenant,v_creator FROM public.tms_order WHERE id=v_id;
  IF v_tenant<>'7529f951-938e-4e2c-ac0d-316c136ae1f9' OR v_creator<>'93f2f1e8-a3dc-4f5a-999b-6c8c02d0c7e9' THEN
    RAISE EXCEPTION 'ordinary forged changed root tenant/creator %, %',v_tenant,v_creator;
  END IF;
  BEGIN
    INSERT INTO public.tms_waybill(tenant_id,waybill_no,origin_city,destination_city,shipper_address,receiver_address,cargo_name,order_id)
    VALUES ('2824c2b5-2774-4781-b995-f55e8bcee920','QA-FORGED-ROLLBACK-'||substring(gen_random_uuid()::text from 1 for 8),
      '济南','青岛','QA地址1','QA地址2','QA货物',v_qa_id);
    RAISE EXCEPTION 'ordinary forged waybill insert unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM set_config('request.jwt.claims','{}',true);
  PERFORM set_config('request.headers','{}',true);
  INSERT INTO public.tms_order(
    tenant_id,created_by_user_id,order_no,order_status,origin_station,destination_station,
    delivery_method,shipping_contact_name,shipping_contact_phone,shipping_address_detail,
    receiving_contact_name,receiving_contact_phone,receiving_address_detail,
    payment_method,order_config
  ) VALUES (
    '7529f951-938e-4e2c-ac0d-316c136ae1f9',
    '93f2f1e8-a3dc-4f5a-999b-6c8c02d0c7e9',
    'QA-SYSTEM-ROLLBACK-'||substring(gen_random_uuid()::text from 1 for 8),
    'pending_load','QA系统起点','QA系统终点','door',
    'QA发货','10000000001','QA地址1','QA收货','10000000002','QA地址2','collect',
    v_no_refs->'order_config'
  ) RETURNING id INTO v_id;
  IF NOT EXISTS (
    SELECT 1 FROM public.tms_order
    WHERE id=v_id AND created_by_user_id='93f2f1e8-a3dc-4f5a-999b-6c8c02d0c7e9'
  ) THEN
    RAISE EXCEPTION 'unauthenticated same-tenant import lost creator';
  END IF;
  BEGIN
    INSERT INTO public.tms_order(
      tenant_id,created_by_user_id,order_no,order_status,origin_station,destination_station,
      delivery_method,shipping_contact_name,shipping_contact_phone,shipping_address_detail,
      receiving_contact_name,receiving_contact_phone,receiving_address_detail,
      payment_method,order_config
    ) VALUES (
      '2824c2b5-2774-4781-b995-f55e8bcee920',
      '93f2f1e8-a3dc-4f5a-999b-6c8c02d0c7e9',
      'QA-SYSTEM-FORGED-'||substring(gen_random_uuid()::text from 1 for 8),
      'pending_load','QA系统起点','QA系统终点','door',
      'QA发货','10000000001','QA地址1','QA收货','10000000002','QA地址2','collect',
      v_no_refs->'order_config'
    );
    RAISE EXCEPTION 'unauthenticated cross-tenant creator unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  INSERT INTO public.tms_waybill(
    tenant_id,waybill_no,origin_city,destination_city,shipper_address,receiver_address,
    cargo_name,order_id
  ) VALUES (
    '2824c2b5-2774-4781-b995-f55e8bcee920',
    'QA-SYSTEM-WAYBILL-'||substring(gen_random_uuid()::text from 1 for 8),
    '济南','青岛','QA地址1','QA地址2','QA货物',v_qa_id
  ) RETURNING created_by_user_id INTO v_creator;
  IF v_creator IS NOT NULL THEN
    RAISE EXCEPTION 'unauthenticated waybill import should retain nullable creator';
  END IF;
END $audit$;
SET LOCAL ROLE authenticated;
DO $scope$
DECLARE
  qa_order uuid := 'cb964bbf-8153-40ec-a88c-0f97f5b84e12';
  own_order uuid := 'a9fc0005-1023-4620-9220-000000000008';
  result jsonb;
  workbench jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
  PERFORM set_config('request.headers','{}',true);
  result:=public.tms_get_order_detail_secure(qa_order);
  IF result IS NULL OR nullif(result->>'created_by_name','') IS NULL
    OR result ? 'created_by_user_id' THEN
    RAISE EXCEPTION 'platform all cannot read safe QA creator display';
  END IF;
  PERFORM set_config('request.headers','{"x-art-tenant-scope":"2824c2b5-2774-4781-b995-f55e8bcee920"}',true);
  result:=public.tms_get_order_detail_secure(qa_order);
  IF result IS NULL OR nullif(result->>'created_by_name','') IS NULL THEN
    RAISE EXCEPTION 'platform selected QA creator display missing';
  END IF;
  workbench:=public.tms_list_dispatch_workbench_secure(
    'pending',0,50,false,
    jsonb_build_object('record_id',qa_order)
  );
  IF nullif(workbench->'records'->0->>'created_by_name','') IS NULL THEN
    RAISE EXCEPTION 'pending workbench creator display missing';
  END IF;
  IF public.tms_get_order_detail_secure(own_order) IS NOT NULL THEN
    RAISE EXCEPTION 'platform selected tenant leaked another order';
  END IF;
  PERFORM set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
  PERFORM set_config('request.headers','{}',true);
  result:=public.tms_get_order_detail_secure(own_order);
  IF result IS NULL OR nullif(result->>'created_by_name','') IS NULL THEN
    RAISE EXCEPTION 'ordinary own order creator display missing';
  END IF;
  IF public.tms_get_order_detail_secure(qa_order) IS NOT NULL THEN
    RAISE EXCEPTION 'ordinary user reads QA order';
  END IF;
  PERFORM set_config('request.headers','{"x-art-tenant-scope":"2824c2b5-2774-4781-b995-f55e8bcee920"}',true);
  IF public.tms_get_order_detail_secure(own_order) IS NULL
    OR public.tms_get_order_detail_secure(qa_order) IS NOT NULL THEN
    RAISE EXCEPTION 'forged ordinary tenant header changed order scope';
  END IF;
END $scope$;
ROLLBACK;
