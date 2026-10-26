BEGIN;

DO $test$
DECLARE
  platform_user uuid;
  ordinary_user uuid := 'ab881b32-87d4-4dce-9014-ce488b8069df';
  ordinary_tenant uuid;
  other_tenant uuid;
  first_vehicle uuid;
  second_vehicle uuid;
  cross_tenant_vehicle uuid;
  tested_vehicle uuid;
  result jsonb;
BEGIN
  IF to_regprocedure('public.tms_list_mainline_costs_secure(uuid,uuid,integer,integer)') IS NULL
     OR to_regprocedure('public.vms_list_vehicle_fuel_execution_secure(uuid,integer,integer)') IS NULL THEN
    RAISE EXCEPTION 'Mainline operating readers are missing';
  END IF;
  IF has_function_privilege('anon','public.tms_list_mainline_costs_secure(uuid,uuid,integer,integer)','EXECUTE')
     OR has_function_privilege('anon','public.vms_list_vehicle_fuel_execution_secure(uuid,integer,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous role can execute a mainline operating reader';
  END IF;

  SELECT auth_user_id INTO platform_user FROM public.sys_user
  WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1;
  SELECT tenant_id INTO ordinary_tenant FROM public.sys_user WHERE auth_user_id=ordinary_user;
  SELECT id INTO other_tenant FROM public.sys_tenant
  WHERE id<>ordinary_tenant AND status='1' LIMIT 1;
  SELECT id INTO cross_tenant_vehicle FROM public.mdm_vehicle
  WHERE tenant_id=other_tenant LIMIT 1;
  SELECT v.id INTO first_vehicle FROM public.mdm_vehicle v
  JOIN public.tms_waybill w ON w.vehicle_id=v.id AND w.tenant_id=v.tenant_id
  JOIN public.tms_waybill_execution_record e ON e.waybill_id=w.id AND e.tenant_id=w.tenant_id
  WHERE v.tenant_id=ordinary_tenant GROUP BY v.id ORDER BY count(*) DESC LIMIT 1;
  SELECT v.id INTO second_vehicle FROM public.mdm_vehicle v
  JOIN public.tms_waybill w ON w.vehicle_id=v.id AND w.tenant_id=v.tenant_id
  JOIN public.tms_waybill_execution_record e ON e.waybill_id=w.id AND e.tenant_id=w.tenant_id
  WHERE v.tenant_id=ordinary_tenant AND v.id<>first_vehicle
  GROUP BY v.id ORDER BY count(*) DESC LIMIT 1;
  IF platform_user IS NULL OR ordinary_tenant IS NULL OR other_tenant IS NULL
     OR first_vehicle IS NULL OR second_vehicle IS NULL OR cross_tenant_vehicle IS NULL THEN
    RAISE EXCEPTION 'Two vehicle records or test actors are unavailable';
  END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',platform_user,'role','authenticated')::text,true);
  PERFORM set_config('request.headers','{}',true);
  FOREACH tested_vehicle IN ARRAY ARRAY[first_vehicle,second_vehicle] LOOP
    result := public.vms_list_vehicle_fuel_execution_secure(tested_vehicle,0,1);
    IF (result->>'total')::integer < 1 OR jsonb_array_length(result->'records') <> 2 THEN
      RAISE EXCEPTION 'Vehicle fuel records are missing for %',tested_vehicle;
    END IF;
    result := public.tms_list_mainline_costs_secure(tested_vehicle,null,0,1);
    IF (result->>'total')::integer < 1 OR jsonb_array_length(result->'records') <> 2 THEN
      RAISE EXCEPTION 'Vehicle cost records are missing for %',tested_vehicle;
    END IF;
  END LOOP;

  PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
  IF (public.vms_list_vehicle_fuel_execution_secure(first_vehicle,0,19)->>'total')::integer <> 0
     OR (public.tms_list_mainline_costs_secure(first_vehicle,null,0,19)->>'total')::integer <> 0 THEN
    RAISE EXCEPTION 'Platform selected-tenant scope leaked';
  END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ordinary_user,'role','authenticated')::text,true);
  PERFORM set_config('request.headers','{}',true);
  IF (public.vms_list_vehicle_fuel_execution_secure(first_vehicle,0,19)->>'total')::integer < 1
     OR (public.tms_list_mainline_costs_secure(first_vehicle,null,0,19)->>'total')::integer < 1 THEN
    RAISE EXCEPTION 'Ordinary own-tenant vehicle records are unavailable';
  END IF;
  PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
  IF (public.vms_list_vehicle_fuel_execution_secure(cross_tenant_vehicle,0,19)->>'total')::integer <> 0
     OR (public.tms_list_mainline_costs_secure(cross_tenant_vehicle,null,0,19)->>'total')::integer <> 0 THEN
    RAISE EXCEPTION 'Forged tenant header revealed cross-tenant vehicle records';
  END IF;
END;
$test$;

ROLLBACK;
