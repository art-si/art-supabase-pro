-- Finance regression against two existing dispatched orders. All writes roll back.
BEGIN;
DO $test$
DECLARE
  v_order public.tms_order%rowtype;
  v_quote_id uuid;
  v_abnormal_id uuid;
  v_carrier_id uuid;
  v_own_id uuid;
  v_result public.tms_order%rowtype;
  v_secure jsonb;
  v_actor public.sys_user%rowtype;
  v_count integer := 0;
  v_blocked boolean;
BEGIN
  SELECT * INTO STRICT v_actor FROM public.sys_user
  WHERE user_roles @> ARRAY['R_SUPER'] AND deleted_at IS NULL LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub', v_actor.auth_user_id::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', v_actor.auth_user_id, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', '{}', true);

  FOR v_order IN SELECT * FROM public.tms_order
    WHERE order_no IN ('YD202609-005', 'YD202608-013') FOR UPDATE LOOP
    INSERT INTO public.tms_abnormal_freight
      (tenant_id, order_id, document_no, ownership, lines, total_amount,
       order_no_snapshot, created_by_user_id)
    VALUES (v_order.tenant_id, v_order.id, 'TEST-' || v_order.order_no,
      'customer_receivable', '[]'::jsonb, 40, v_order.order_no, v_actor.id)
    RETURNING id INTO v_abnormal_id;

    IF v_order.order_no = 'YD202609-005' THEN
      PERFORM app_private.tms_apply_abnormal_freight_status(v_abnormal_id, 'approved');
    END IF;

    INSERT INTO public.tms_order_quote
      (tenant_id, order_id, transport_fee, unloading_fee, delivery_fee,
       insurance_fee, tax_fee, supplementary_items, total_amount,
       created_by_user_id, updated_by_user_id)
    VALUES (v_order.tenant_id, v_order.id, 1000, 200, 300, 10, 50,
      '[{"amount":25}]'::jsonb, 1585, v_actor.id, v_actor.id)
    RETURNING id INTO v_quote_id;
    PERFORM app_private.tms_apply_order_quote_status(v_quote_id, 'approved');

    IF v_order.order_no = 'YD202608-013' THEN
      PERFORM app_private.tms_apply_abnormal_freight_status(v_abnormal_id, 'approved');
    END IF;

    INSERT INTO public.tms_abnormal_freight
      (tenant_id, order_id, document_no, ownership, lines, total_amount,
       order_no_snapshot, created_by_user_id)
    VALUES (v_order.tenant_id, v_order.id, 'TEST-C-' || v_order.order_no,
      'carrier_deduction', '[]'::jsonb, 30, v_order.order_no, v_actor.id)
    RETURNING id INTO v_carrier_id;
    INSERT INTO public.tms_abnormal_freight
      (tenant_id, order_id, document_no, ownership, lines, total_amount,
       order_no_snapshot, created_by_user_id)
    VALUES (v_order.tenant_id, v_order.id, 'TEST-O-' || v_order.order_no,
      'own', '[]'::jsonb, 20, v_order.order_no, v_actor.id)
    RETURNING id INTO v_own_id;
    PERFORM app_private.tms_apply_abnormal_freight_status(v_carrier_id, 'approved');
    PERFORM app_private.tms_apply_abnormal_freight_status(v_own_id, 'approved');

    SELECT * INTO v_result FROM public.tms_order WHERE id = v_order.id;
    IF (v_result.transport_fee, v_result.unloading_fee, v_result.delivery_fee,
        v_result.insurance_fee, v_result.other_fee, v_result.total_fee,
        v_result.package_fee, v_result.handling_fee, v_result.transfer_fee,
        v_result.collect_payment_fee, v_result.approved_quote_id,
        v_result.carrier_deduction_fee, v_result.own_abnormal_cost)
       IS DISTINCT FROM
       (1000::numeric, 200::numeric, 300::numeric, 10::numeric, 115::numeric,
        1625::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric, v_quote_id,
        coalesce(v_order.carrier_deduction_fee, 0) + 30,
        coalesce(v_order.own_abnormal_cost, 0) + 20) THEN
      RAISE EXCEPTION 'Finance approval totals are wrong for %', v_order.order_no;
    END IF;
    v_secure := app_private.tms_order_to_secure_json(
      v_result,'tms.order',jsonb_build_object('freightAmounts','hidden'),null
    );
    IF v_secure ? 'carrier_deduction_fee' OR v_secure ? 'own_abnormal_cost' THEN
      RAISE EXCEPTION 'Internal abnormal costs leaked for %', v_order.order_no;
    END IF;
    v_secure := app_private.tms_order_to_secure_json(
      v_result,'tms.order',jsonb_build_object('freightAmounts','read'),null
    );
    IF (v_secure->>'carrier_deduction_fee')::numeric
         IS DISTINCT FROM coalesce(v_order.carrier_deduction_fee,0)+30
      OR (v_secure->>'own_abnormal_cost')::numeric
         IS DISTINCT FROM coalesce(v_order.own_abnormal_cost,0)+20 THEN
      RAISE EXCEPTION 'Approved abnormal costs missing from secure order for %',v_order.order_no;
    END IF;

    PERFORM app_private.tms_apply_order_quote_status(v_quote_id, 'approved');
    PERFORM app_private.tms_apply_abnormal_freight_status(v_abnormal_id, 'approved');
    PERFORM app_private.tms_apply_abnormal_freight_status(v_carrier_id, 'approved');
    PERFORM app_private.tms_apply_abnormal_freight_status(v_own_id, 'approved');
    IF (SELECT total_fee FROM public.tms_order WHERE id = v_order.id) <> 1625 THEN
      RAISE EXCEPTION 'Repeat approval changed total for %', v_order.order_no;
    END IF;
    IF (SELECT carrier_deduction_fee FROM public.tms_order WHERE id = v_order.id)
       <> coalesce(v_order.carrier_deduction_fee, 0) + 30
       OR (SELECT own_abnormal_cost FROM public.tms_order WHERE id = v_order.id)
       <> coalesce(v_order.own_abnormal_cost, 0) + 20 THEN
      RAISE EXCEPTION 'Repeat approval changed non-customer costs for %', v_order.order_no;
    END IF;

    v_blocked := false;
    BEGIN
      UPDATE public.tms_order SET other_fee = other_fee + 1 WHERE id = v_order.id;
    EXCEPTION WHEN check_violation THEN v_blocked := true;
    END;
    IF NOT v_blocked THEN
      RAISE EXCEPTION 'Direct dispatched fee edit was allowed for %', v_order.order_no;
    END IF;
    v_count := v_count + 1;
  END LOOP;
  IF v_count <> 2 THEN RAISE EXCEPTION 'Expected two existing orders'; END IF;
END $test$;
ROLLBACK;
