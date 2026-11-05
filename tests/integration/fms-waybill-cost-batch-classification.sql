-- Batch cost regression against two real waybills; all four lines roll back.
BEGIN;
DO $test$
DECLARE
  v_user public.sys_user%rowtype;
  v_waybill uuid;
  v_item uuid;
  v_saved jsonb;
  v_group uuid;
  v_identity jsonb;
  v_option jsonb;
  v_waybill_no text;
  v_driver_ownership text;
  v_company_name text;
  v_carrier_name text;
  v_count integer := 0;
BEGIN
  SELECT * INTO STRICT v_user FROM public.sys_user
  WHERE user_roles @> ARRAY['R_SUPER'] AND deleted_at IS NULL LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub', v_user.auth_user_id::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', v_user.auth_user_id, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', '{}', true);
  SELECT id INTO STRICT v_item FROM public.tms_expense_item
  WHERE tenant_id = '7529f951-938e-4e2c-ac0d-316c136ae1f9'
    AND item_code = 'FYXM-CYF';

  FOR v_waybill IN SELECT id FROM public.tms_waybill WHERE id IN
    ('a9fc0006-1023-4620-9220-000000000001',
     'a9fc0006-1023-4620-9220-000000000002') LOOP
    SELECT w.waybill_no, p.driver_ownership, v.company_name, c.company_name
    INTO STRICT v_waybill_no, v_driver_ownership, v_company_name, v_carrier_name
    FROM public.tms_waybill w
    LEFT JOIN public.tms_driver_profile p ON p.driver_id=w.driver_id AND p.tenant_id=w.tenant_id
    LEFT JOIN public.mdm_vehicle v ON v.id=w.vehicle_id AND v.tenant_id=w.tenant_id
    LEFT JOIN public.mdm_carrier c ON c.id=w.carrier_id AND c.tenant_id=w.tenant_id
    WHERE w.id=v_waybill;
    SELECT item INTO v_option
    FROM jsonb_array_elements(public.tms_list_waybill_cost_options_secure(0, 9, v_waybill_no, null)->'records') item
    WHERE item->>'id'=v_waybill::text;
    IF v_option IS NULL OR NOT (v_option ?& array['driver_ownership','company_name','carrier_name'])
       OR v_option->>'driver_ownership' IS DISTINCT FROM v_driver_ownership
       OR v_option->>'company_name' IS DISTINCT FROM v_company_name
       OR v_option->>'carrier_name' IS DISTINCT FROM v_carrier_name THEN
      RAISE EXCEPTION 'Waybill cost option identity mismatch for %', v_waybill_no;
    END IF;
    v_saved := public.tms_save_waybill_cost_batch_secure(
      jsonb_build_object('waybill_id', v_waybill),
      jsonb_build_array(
        jsonb_build_object('expense_item_id', v_item, 'amount', 100,
          'occurred_on', '2026-11-05', 'expense_classification', 'normal'),
        jsonb_build_object('expense_item_id', v_item, 'amount', 20,
          'occurred_on', '2026-11-05', 'expense_classification', 'abnormal')));
    IF jsonb_array_length(v_saved) <> 2
      OR (v_saved->0->>'line_no')::integer <> 10
      OR (v_saved->1->>'line_no')::integer <> 20 THEN
      RAISE EXCEPTION 'Batch line numbering failed';
    END IF;
    v_identity := app_private.tms_waybill_cost_raw_json((v_saved->0->>'id')::uuid)->'waybill';
    IF v_identity IS NULL OR NOT (v_identity ?& array['driver_ownership','company_name','carrier_name'])
       OR v_identity->>'driver_ownership' IS DISTINCT FROM v_driver_ownership
       OR v_identity->>'company_name' IS DISTINCT FROM v_company_name
       OR v_identity->>'carrier_name' IS DISTINCT FROM v_carrier_name THEN
      RAISE EXCEPTION 'Waybill cost detail identity mismatch for %', v_waybill_no;
    END IF;
    v_group := (v_saved->0->>'expense_batch_id')::uuid;
    IF (v_saved->1->>'expense_batch_id')::uuid <> v_group THEN
      RAISE EXCEPTION 'Batch grouping failed';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.tms_waybill_cost
      WHERE id = (v_saved->1->>'id')::uuid
        AND tenant_id = '7529f951-938e-4e2c-ac0d-316c136ae1f9'
        AND expense_classification = 'abnormal') THEN
      RAISE EXCEPTION 'Expense classification was not persisted';
    END IF;
    v_count := v_count + 1;
  END LOOP;
  IF v_count <> 2 THEN RAISE EXCEPTION 'Expected two real waybills'; END IF;
END $test$;
ROLLBACK;
