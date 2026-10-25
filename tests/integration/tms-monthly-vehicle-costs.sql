BEGIN;
DO $test$
DECLARE result jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
  PERFORM set_config('request.headers','{}',true);
  result:=app_private.tms_monthly_vehicle_costs('2026-09-01','2026-09-30');
  IF result->>'own_vehicle_cost' IS NOT NULL
    OR (result->>'own_vehicle_covered')::integer<>2
    OR (result->>'own_vehicle_expected')::integer<>7 THEN
    RAISE EXCEPTION 'Incomplete fleet treated as complete'; END IF;
  -- Isolate two complete vehicles without deleting other business history.
  UPDATE public.mdm_vehicle SET service_start_time='2099-01-01',service_end_time='2099-12-31'
  WHERE tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9'
    AND id NOT IN ('a9fc0004-1023-4620-9220-000000000001','a9fc0004-1023-4620-9220-000000000002');
  result:=app_private.tms_monthly_vehicle_costs('2026-09-01','2026-09-30');
  IF (result->>'own_vehicle_cost')::numeric IS DISTINCT FROM 15990::numeric THEN
    RAISE EXCEPTION 'Expected insurance 990 + depreciation 13500 + maintenance 1500: %',result; END IF;
  PERFORM set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
  IF app_private.tms_monthly_vehicle_costs('2026-09-01','2026-09-30') IS DISTINCT FROM result THEN
    RAISE EXCEPTION 'Ordinary forged header changed fleet totals'; END IF;
  IF has_function_privilege('authenticated','app_private.tms_monthly_vehicle_costs(date,date)','EXECUTE') THEN
    RAISE EXCEPTION 'Private helper exposed'; END IF;
END $test$;
DO $scope$
DECLARE actor uuid; result jsonb; expected integer;
BEGIN
  SELECT auth_user_id INTO STRICT actor FROM public.sys_user WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  PERFORM set_config('request.headers','{}',true);
  SELECT count(*) INTO expected FROM public.mdm_vehicle WHERE vehicle_ownership='self_operated'
    AND (service_start_time IS NULL OR service_start_time<='2026-09-30')
    AND (service_end_time IS NULL OR service_end_time>='2026-09-01');
  result:=app_private.tms_monthly_vehicle_costs('2026-09-01','2026-09-30');
  IF (result->>'own_vehicle_expected')::integer IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Platform all fleet incomplete'; END IF;
  PERFORM set_config('request.headers','{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}',true);
  result:=app_private.tms_monthly_vehicle_costs('2026-09-01','2026-09-30');
  IF (result->>'own_vehicle_expected')::integer<>2 OR (result->>'own_vehicle_cost')::numeric IS DISTINCT FROM 15990::numeric THEN
    RAISE EXCEPTION 'Selected main tenant mismatch'; END IF;
  PERFORM set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
  SELECT count(*) INTO expected FROM public.mdm_vehicle WHERE tenant_id='6675a0d6-3ff6-4ab7-bb09-232d85ae96ad' AND vehicle_ownership='self_operated'
    AND (service_start_time IS NULL OR service_start_time<='2026-09-30')
    AND (service_end_time IS NULL OR service_end_time>='2026-09-01');
  result:=app_private.tms_monthly_vehicle_costs('2026-09-01','2026-09-30');
  IF (result->>'own_vehicle_expected')::integer IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Selected foreign tenant fleet mismatch'; END IF;
  PERFORM set_config('request.jwt.claims','{"sub":"9850d41a-77e9-40a7-b2cb-0ad02ac01440","role":"authenticated"}',true);
  result:=app_private.tms_monthly_vehicle_costs('2026-09-01','2026-09-30');
  IF result->>'own_vehicle_cost' IS NOT NULL THEN RAISE EXCEPTION 'Cost exposed without source permission'; END IF;
END $scope$;
DO $dedup$
DECLARE category text; item uuid; cost_id uuid; result jsonb; attempt integer;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
  PERFORM set_config('request.headers','{}',true);
  FOREACH category IN ARRAY ARRAY['vehicle_insurance','vehicle_depreciation'] LOOP
    SELECT id INTO STRICT item FROM public.tms_expense_item WHERE tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9' AND business_category=category AND is_selectable;
    result:=public.tms_save_waybill_cost_secure(null,jsonb_build_object('waybill_id','a9fc0006-1023-4620-9220-000000000001','expense_item_id',item,'amount',100,'occurred_on','2026-09-18','remark','自营成本去重事务回归'));
    cost_id:=(result->>'id')::uuid;
    PERFORM public.start_workflow('tms_waybill_cost',cost_id,'成本去重事务回归','{}'::jsonb,gen_random_uuid()::text);
    FOR attempt IN 1..5 LOOP
      EXIT WHEN (SELECT audit_status FROM public.tms_waybill_cost WHERE id=cost_id)='approved';
      PERFORM public.act_workflow_by_business('tms_waybill_cost',cost_id,'approve','事务回归',gen_random_uuid()::text);
    END LOOP;
    IF (SELECT audit_status FROM public.tms_waybill_cost WHERE id=cost_id) IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION 'Approval fixture incomplete'; END IF;
    result:=app_private.tms_monthly_vehicle_costs('2026-09-01','2026-09-30');
    IF (result->>'own_vehicle_cost')::numeric IS DISTINCT FROM 15990::numeric THEN RAISE EXCEPTION 'Duplicate insurance/depreciation counted'; END IF;
  END LOOP;
  UPDATE public.tms_order SET create_time='2026-08-01 00:00:00+08'
  WHERE tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9'
    AND create_time>='2026-09-01'::timestamp AT TIME ZONE 'Asia/Shanghai'
    AND create_time<'2026-10-01'::timestamp AT TIME ZONE 'Asia/Shanghai';
  result:=app_private.tms_monthly_vehicle_costs('2026-09-01','2026-09-30');
  IF (result->>'own_vehicle_cost')::numeric IS DISTINCT FROM 14490::numeric THEN RAISE EXCEPTION 'Idle fleet fixed costs lost'; END IF;
END $dedup$;
DO $field_access$
DECLARE app_user uuid; resource uuid; field uuid; access_mode text; report jsonb;
BEGIN
  SELECT id INTO STRICT app_user FROM public.sys_user WHERE auth_user_id='ab881b32-87d4-4dce-9014-ce488b8069df';
  SELECT r.id,f.id INTO STRICT resource,field
  FROM public.sys_permission_resource r JOIN public.sys_permission_field f ON f.resource_id=r.id AND f.tenant_id=r.tenant_id
  WHERE r.tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9' AND r.resource_key='tms.waybill_cost' AND f.field_key='costAmounts';
  FOREACH access_mode IN ARRAY ARRAY['hidden','masked'] LOOP
    UPDATE public.sys_user_field_permission SET access_level=access_mode
    WHERE tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9' AND user_id=app_user AND field_id=field AND resource_id=resource;
    IF NOT FOUND THEN
      INSERT INTO public.sys_user_field_permission(tenant_id,user_id,resource_id,field_id,access_level,create_by)
      VALUES('7529f951-938e-4e2c-ac0d-316c136ae1f9',app_user,resource,field,access_mode,'报表权限事务回归');
    END IF;
    IF app_private.resolve_field_access('tms.waybill_cost','costAmounts',null) IS DISTINCT FROM access_mode THEN
      RAISE EXCEPTION 'Field permission fixture ineffective'; END IF;
    report:=app_private.tms_monthly_vehicle_costs('2026-09-01','2026-09-30');
    IF report->>'own_vehicle_cost' IS NOT NULL THEN RAISE EXCEPTION 'Restricted cost exposed by aggregate'; END IF;
  END LOOP;
END $field_access$;
ROLLBACK;

