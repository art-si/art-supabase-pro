BEGIN;

DO $test$
DECLARE
  platform_user uuid;
  ordinary_user uuid;
  denied_user uuid;
  own_tenant uuid;
  foreign_tenant uuid;
  order_id uuid;
  second_order_id uuid;
  foreign_order_id uuid;
  v_waybill_id uuid;
  cost_id uuid;
  baseline_count integer;
  own_result jsonb;
  shared_result jsonb;
  denied boolean := false;
BEGIN
  IF to_regprocedure('public.tms_list_order_mainline_costs_secure(uuid,integer,integer)') IS NULL THEN
    RAISE EXCEPTION 'Order cost reader missing';
  END IF;
  IF has_function_privilege('anon',
      'public.tms_list_order_mainline_costs_secure(uuid,integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous order cost access is allowed';
  END IF;

  SELECT auth_user_id INTO platform_user FROM public.sys_user
  WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1;

  SELECT u.auth_user_id,u.tenant_id,a.order_id,a.waybill_id,c.id
    INTO ordinary_user,own_tenant,order_id,v_waybill_id,cost_id
  FROM public.sys_user u
  JOIN public.tms_waybill_order_allocation a ON a.tenant_id=u.tenant_id
  JOIN public.tms_waybill_cost c ON c.waybill_id=a.waybill_id AND c.tenant_id=a.tenant_id
  WHERE u.auth_user_id IS NOT NULL AND NOT (u.user_roles @> ARRAY['R_SUPER'])
    AND EXISTS (SELECT 1 FROM public.sys_role r JOIN public.sys_role_menu rm
      ON rm.role_id=r.id AND rm.tenant_id=r.tenant_id
      JOIN public.sys_menu m ON m.id=rm.menu_id
      WHERE r.tenant_id=u.tenant_id AND r.role_code=ANY(u.user_roles)
        AND m.name='TmsOrderQuery:View')
    AND EXISTS (SELECT 1 FROM public.sys_role r JOIN public.sys_role_menu rm
      ON rm.role_id=r.id AND rm.tenant_id=r.tenant_id
      JOIN public.sys_menu m ON m.id=rm.menu_id
      WHERE r.tenant_id=u.tenant_id AND r.role_code=ANY(u.user_roles)
        AND m.name='FinanceWaybillCost:View')
  LIMIT 1;

  SELECT id INTO second_order_id FROM public.tms_order
  WHERE tenant_id=own_tenant AND id<>order_id
    AND NOT EXISTS (SELECT 1 FROM public.tms_waybill_order_allocation a
      WHERE a.waybill_id=v_waybill_id AND a.order_id=tms_order.id)
  LIMIT 1;
  SELECT id,tenant_id INTO foreign_order_id,foreign_tenant FROM public.tms_order
  WHERE tenant_id<>own_tenant LIMIT 1;
  SELECT auth_user_id INTO denied_user FROM public.sys_user
  WHERE auth_user_id IS NOT NULL AND NOT (user_roles @> ARRAY['R_SUPER'])
    AND tenant_id=own_tenant
    AND NOT EXISTS (SELECT 1 FROM public.sys_role r JOIN public.sys_role_menu rm
      ON rm.role_id=r.id AND rm.tenant_id=r.tenant_id
      JOIN public.sys_menu m ON m.id=rm.menu_id
      WHERE r.tenant_id=sys_user.tenant_id AND r.role_code=ANY(sys_user.user_roles)
        AND m.name='FinanceWaybillCost:View')
  LIMIT 1;
  IF platform_user IS NULL OR ordinary_user IS NULL OR denied_user IS NULL
     OR order_id IS NULL OR second_order_id IS NULL OR foreign_order_id IS NULL THEN
    RAISE EXCEPTION 'Order cost test actors unavailable';
  END IF;

  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub',platform_user,'role','authenticated')::text,true);
  PERFORM set_config('request.headers','{}',true);
  own_result:=public.tms_list_order_mainline_costs_secure(order_id,0,0);
  baseline_count:=(own_result->>'total')::integer;
  IF baseline_count<1 OR jsonb_array_length(own_result->'records')<>1 THEN
    RAISE EXCEPTION 'Platform-all order cost pagination failed';
  END IF;

  -- A second order references the same execution waybill only in this rolled-back test.
  INSERT INTO public.tms_waybill_order_allocation
    (tenant_id,waybill_id,order_id,quantity,weight_kg,volume_m3)
  VALUES (own_tenant,v_waybill_id,second_order_id,0,0,0);
  shared_result:=public.tms_list_order_mainline_costs_secure(order_id,0,99);
  IF (shared_result->>'total')::integer<>baseline_count OR NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(shared_result->'records') item
    WHERE item->>'id'=cost_id::text AND item->>'shared'='true'
      AND (item->>'linkedOrderCount')::integer>=2
  ) THEN RAISE EXCEPTION 'Shared cost was duplicated or not marked'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(
      public.tms_list_order_mainline_costs_secure(second_order_id,0,99)->'records') item
    WHERE item->>'id'=cost_id::text AND item->>'shared'='true'
  ) THEN RAISE EXCEPTION 'Second order did not see shared execution cost'; END IF;

  PERFORM set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope',own_tenant)::text,true);
  denied:=false;
  BEGIN
    PERFORM public.tms_list_order_mainline_costs_secure(foreign_order_id,0,0);
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Platform-selected order cost crossed tenant'; END IF;

  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub',ordinary_user,'role','authenticated')::text,true);
  PERFORM set_config('request.headers','{}',true);
  own_result:=public.tms_list_order_mainline_costs_secure(order_id,0,0);
  IF (own_result->>'total')::integer<>baseline_count THEN
    RAISE EXCEPTION 'Ordinary user cannot read own order costs';
  END IF;
  PERFORM set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope',foreign_tenant)::text,true);
  IF public.tms_list_order_mainline_costs_secure(order_id,0,0) IS DISTINCT FROM own_result THEN
    RAISE EXCEPTION 'Forged tenant header changed ordinary order cost result';
  END IF;
  denied:=false;
  BEGIN
    PERFORM public.tms_list_order_mainline_costs_secure(foreign_order_id,0,0);
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Ordinary user read foreign order cost'; END IF;

  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub',denied_user,'role','authenticated')::text,true);
  PERFORM set_config('request.headers','{}',true);
  denied:=false;
  BEGIN
    PERFORM public.tms_list_order_mainline_costs_secure(order_id,0,0);
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'User without cost permission read order cost'; END IF;
END;
$test$;

ROLLBACK;
