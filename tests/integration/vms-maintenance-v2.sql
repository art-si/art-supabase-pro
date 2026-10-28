BEGIN;
SET LOCAL ROLE authenticated;
DO $test$
DECLARE
  actor uuid := 'ab881b32-87d4-4dce-9014-ce488b8069df';
  own_tenant uuid := '7529f951-938e-4e2c-ac0d-316c136ae1f9';
  foreign_tenant uuid := '6675a0d6-3ff6-4ab7-bb09-232d85ae96ad';
  super_actor uuid := '0a872664-874c-447d-a256-d0dbdca6ed45';
  time_id uuid := '5ded2af6-3f83-4643-b265-9b4aebf2654f';
  mileage_id uuid := 'b3679345-0b3e-4890-b85c-825cdabdc3d4';
  workshop_id uuid := 'aba62324-9491-468d-a43b-708fa5c71c10';
  v jsonb; ledger jsonb; created uuid; reminder_count integer;
BEGIN
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  PERFORM set_config('request.headers','{}',true);

  v := public.vms_get_vehicle_maintenance_secure(time_id);
  IF v->>'service_date'<>'2026-10-24' OR v->>'reminder_mode'<>'time'
    OR v->>'next_maintenance_date'<>'2027-01-24' OR (v->>'cost_amount')::numeric<>520 THEN
    RAISE EXCEPTION 'Time-mode read/total mismatch: %',v;
  END IF;
  v := public.vms_get_vehicle_maintenance_secure(mileage_id);
  IF v->>'reminder_mode'<>'mileage' OR (v->>'next_maintenance_mileage')::numeric<>41500
    OR v->>'next_maintenance_date' IS NOT NULL OR (v->>'cost_amount')::numeric<>1180 THEN
    RAISE EXCEPTION 'Mileage-mode read/total mismatch: %',v;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.vehicle_reminder_maintenance_expiry r
    WHERE r.source_id=time_id AND r.next_maintenance_date='2027-01-24'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.vehicle_reminder_maintenance_expiry r
    WHERE r.source_id=mileage_id AND r.next_maintenance_mileage=41500
  ) THEN
    RAISE EXCEPTION 'Reminder view is missing derived service thresholds';
  END IF;

  v := public.vms_list_maintenance_workshops_secure('QA验收',50,own_tenant);
  IF NOT (v->'records' @> jsonb_build_array(jsonb_build_object('id',workshop_id))) THEN
    RAISE EXCEPTION 'Filtered workshop missing: %',v;
  END IF;
  v := public.vms_list_maintenance_workshops_secure('QA验收',50,foreign_tenant);
  IF jsonb_array_length(v->'records')<>0 THEN
    RAISE EXCEPTION 'Ordinary user forged workshop target tenant';
  END IF;
  BEGIN
    PERFORM public.vms_update_vehicle_maintenance_secure(time_id,jsonb_build_object(
      'workshop_supplier_id','70673e08-9851-438d-840e-d9caa6da2638'));
    RAISE EXCEPTION 'Non-workshop supplier was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.vms_update_vehicle_maintenance_secure(time_id,jsonb_build_object(
      'workshop_supplier_id','85fdad9c-261f-489b-89a9-2e2fde27c00e'));
    RAISE EXCEPTION 'Foreign-tenant supplier was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  ledger := public.vms_list_vehicle_maintenance_cost_ledger_secure(
    p_vehicle_id=>'a9fc0004-1023-4620-9220-000000000001');
  IF (ledger->>'pending_amount')::numeric<>520
     OR (ledger->>'approved_linked_amount')::numeric<>600
     OR (ledger->>'pending_count')::int<>1
     OR (ledger->>'approved_linked_count')::int<>1 THEN
    RAISE EXCEPTION 'Source-cost ledger double-counted or omitted: %',ledger;
  END IF;

  BEGIN
    PERFORM public.vms_update_vehicle_maintenance_secure(time_id,'{"cost_amount":9999}'::jsonb);
    RAISE EXCEPTION 'Direct total-cost edit was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  v := public.vms_update_vehicle_maintenance_secure(time_id,jsonb_build_object(
    'items',jsonb_build_array(jsonb_build_object('item_name','QA 事务改价','total_amount',650))));
  IF (v->>'cost_amount')::numeric<>650 THEN
    RAISE EXCEPTION 'Item sum did not recalculate: %',v;
  END IF;

  BEGIN
    PERFORM public.vms_create_vehicle_maintenance_secure(jsonb_build_object(
      'vehicle_id','a9fc0004-1023-4620-9220-000000000001',
      'maintenance_type','repair','start_time','2026-10-27T08:00:00+08:00',
      'external_repair',false,'items','[]'::jsonb));
    RAISE EXCEPTION 'Missing current odometer was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  created := public.vms_create_vehicle_maintenance_secure(jsonb_build_object(
    'vehicle_id','a9fc0004-1023-4620-9220-000000000001',
    'maintenance_type','accident','start_time','2026-10-27T08:00:00+08:00',
    'current_odometer_km',27500,'reminder_mode','mileage','external_repair',false,
    'cost_amount',9999,
    'items',jsonb_build_array(jsonb_build_object('item_name','QA 事务项目','total_amount',150))));
  v := public.vms_get_vehicle_maintenance_secure(created);
  IF (v->>'cost_amount')::numeric<>150 OR (v->>'next_maintenance_mileage')::numeric<>37500
    OR v->>'service_date' IS NULL THEN
    RAISE EXCEPTION 'Create derivation/default failed: %',v;
  END IF;

  PERFORM set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope',foreign_tenant)::text,true);
  IF public.vms_get_vehicle_maintenance_secure(time_id) IS NULL THEN
    RAISE EXCEPTION 'Ordinary forged header hid own maintenance';
  END IF;
  SELECT count(*) INTO reminder_count
    FROM public.vehicle_reminder_maintenance_expiry
    WHERE plate_no IN ('测A验收001','测A验收002');
  IF reminder_count<>2 THEN
    RAISE EXCEPTION 'Ordinary forged header altered own reminder scope';
  END IF;
  PERFORM set_config('request.headers','{}',true);

  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub',super_actor,'role','authenticated')::text,true);
  ledger := public.vms_list_vehicle_maintenance_cost_ledger_secure(p_maintenance_id=>time_id);
  IF (ledger->>'total')::int<>1 THEN
    RAISE EXCEPTION 'Platform all lost source row';
  END IF;
  SELECT count(*) INTO reminder_count FROM public.vehicle_reminder_maintenance_expiry
    WHERE plate_no IN ('测A验收001','测A验收002');
  IF reminder_count<>2 THEN RAISE EXCEPTION 'Platform all lost reminder rows'; END IF;
  PERFORM set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope',own_tenant)::text,true);
  ledger := public.vms_list_vehicle_maintenance_cost_ledger_secure(p_maintenance_id=>time_id);
  IF (ledger->>'total')::int<>1 THEN
    RAISE EXCEPTION 'Platform selected own tenant lost source row';
  END IF;
  SELECT count(*) INTO reminder_count FROM public.vehicle_reminder_maintenance_expiry
    WHERE plate_no IN ('测A验收001','测A验收002');
  IF reminder_count<>2 THEN RAISE EXCEPTION 'Platform selected own reminder scope failed'; END IF;
  PERFORM set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope',foreign_tenant)::text,true);
  ledger := public.vms_list_vehicle_maintenance_cost_ledger_secure(p_maintenance_id=>time_id);
  IF (ledger->>'total')::int<>0 THEN
    RAISE EXCEPTION 'Platform selected tenant leaked source row';
  END IF;
  SELECT count(*) INTO reminder_count FROM public.vehicle_reminder_maintenance_expiry
    WHERE plate_no IN ('测A验收001','测A验收002');
  IF reminder_count<>0 THEN RAISE EXCEPTION 'Platform selected tenant leaked reminder rows'; END IF;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"9850d41a-77e9-40a7-b2cb-0ad02ac01440","role":"authenticated"}',true);
  PERFORM set_config('request.headers','{}',true);
  BEGIN
    PERFORM count(*) FROM public.vehicle_reminder_maintenance_expiry;
    RAISE EXCEPTION 'Unauthorized reminder read accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $test$;
ROLLBACK;
