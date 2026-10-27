-- Vehicle plate options expose the canonical type profile, and commission history stays tenant scoped.
BEGIN;

DO $audit$
DECLARE
 platform_user uuid;
 ordinary_user uuid := 'ab881b32-87d4-4dce-9014-ce488b8069df';
 own_tenant uuid;
 other_tenant uuid;
 result jsonb;
BEGIN
 SELECT auth_user_id INTO platform_user FROM public.sys_user WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1;
 SELECT tenant_id INTO own_tenant FROM public.sys_user WHERE auth_user_id=ordinary_user;
 SELECT v.tenant_id INTO other_tenant FROM public.mdm_vehicle v JOIN public.sys_tenant t ON t.id=v.tenant_id
 WHERE v.tenant_id<>own_tenant AND t.status='1' AND (t.service_start_date IS NULL OR t.service_start_date<=current_date)
 AND (t.service_end_date IS NULL OR t.service_end_date>=current_date) LIMIT 1;
 IF platform_user IS NULL OR own_tenant IS NULL OR other_tenant IS NULL THEN RAISE EXCEPTION 'Vehicle option fixtures missing'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',platform_user,'role','authenticated')::text,true);
 PERFORM set_config('request.headers','{}',true);
 result:=public.vms_list_vehicle_archive_options_secure(p_max_rows=>1000);
 IF (SELECT count(distinct v.tenant_id) FROM jsonb_array_elements(result) r JOIN public.mdm_vehicle v ON v.id=(r->>'id')::uuid)<2
 THEN RAISE EXCEPTION 'Platform all vehicle scope incomplete'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(result) r JOIN public.mdm_vehicle v ON v.id=(r->>'id')::uuid
   WHERE (r->>'vehicle_type_profile_id') IS DISTINCT FROM v.vehicle_type_profile_id::text)
 THEN RAISE EXCEPTION 'Vehicle profile identifier mismatch'; END IF;
 PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',own_tenant)::text,true);
 result:=public.vms_list_vehicle_archive_options_secure(p_max_rows=>1000);
 IF jsonb_array_length(result)=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(result) r JOIN public.mdm_vehicle v ON v.id=(r->>'id')::uuid WHERE v.tenant_id<>own_tenant)
 THEN RAISE EXCEPTION 'Selected vehicle scope leaks'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ordinary_user,'role','authenticated')::text,true);
 PERFORM set_config('request.headers','{}',true);
 result:=public.vms_list_vehicle_archive_options_secure(p_max_rows=>1000);
 IF jsonb_array_length(result)=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(result) r JOIN public.mdm_vehicle v ON v.id=(r->>'id')::uuid WHERE v.tenant_id<>own_tenant)
 THEN RAISE EXCEPTION 'Ordinary own vehicle scope leaks'; END IF;
 PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
 IF public.vms_list_vehicle_archive_options_secure(p_max_rows=>1000) IS DISTINCT FROM result
 THEN RAISE EXCEPTION 'Forged ordinary header changed vehicle scope'; END IF;
END $audit$;

DO $audit$
DECLARE
  platform_user uuid;
  ordinary_user uuid := 'ab881b32-87d4-4dce-9014-ce488b8069df';
  own_tenant uuid;
  own_driver uuid;
  own_profile uuid;
  existing_rule uuid;
  temporary_rule uuid;
  result jsonb;
  denied boolean;
BEGIN
  IF has_function_privilege('anon','public.tms_list_driver_commission_revisions_secure(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous revision read is allowed';
  END IF;
  SELECT auth_user_id INTO platform_user FROM public.sys_user
    WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1;
  SELECT tenant_id INTO own_tenant FROM public.sys_user WHERE auth_user_id=ordinary_user;
  SELECT id INTO own_driver FROM public.mdm_driver WHERE tenant_id=own_tenant LIMIT 1;
  SELECT id INTO own_profile FROM public.vehicle_type_profile
    WHERE tenant_id=own_tenant AND status='1' LIMIT 1;
  SELECT id INTO existing_rule FROM public.tms_driver_commission_rule LIMIT 1;
  IF platform_user IS NULL OR own_tenant IS NULL OR own_driver IS NULL OR own_profile IS NULL OR existing_rule IS NULL THEN
    RAISE EXCEPTION 'Commission history fixtures missing';
  END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',platform_user,'role','authenticated')::text,true);
  PERFORM set_config('request.headers','{}',true);
  result:=public.tms_list_driver_commission_revisions_secure(existing_rule);
  IF (result->>'total')::int<1 THEN RAISE EXCEPTION 'Platform all history missing'; END IF;
  PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',own_tenant)::text,true);
  denied:=false;
  BEGIN
    PERFORM public.tms_list_driver_commission_revisions_secure(existing_rule);
  EXCEPTION WHEN insufficient_privilege THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Platform selected history crossed tenant'; END IF;
  denied:=false;
  BEGIN
    PERFORM public.tms_save_driver_commission_rule_secure(NULL,jsonb_build_object(
      'driver_id',own_driver,'rule_name','QA 无车型方案应拦截',
      'direction','forward','effective_from',current_date,
      'method','fixed_per_trip','rate',800,'enabled',true
    ));
  EXCEPTION WHEN invalid_parameter_value THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'New commission rule without a vehicle type was accepted'; END IF;
  result:=public.tms_save_driver_commission_rule_secure(NULL,jsonb_build_object(
    'driver_id',own_driver,'rule_name','QA 事务内规则版本验收',
    'vehicle_type_profile_id',own_profile,
    'direction','forward','effective_from',current_date,
    'method','fixed_per_trip','rate',800,'enabled',true
  ));
  temporary_rule:=(result->>'id')::uuid;
  result:=public.tms_list_driver_commission_revisions_secure(temporary_rule);
  IF (result->>'total')::int<>1 THEN RAISE EXCEPTION 'Selected tenant did not read own revision'; END IF;
  IF (result->'records'->0->'snapshot'->>'rate')::numeric<>800 THEN
    RAISE EXCEPTION 'Revision snapshot did not preserve rate';
  END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ordinary_user,'role','authenticated')::text,true);
  PERFORM set_config('request.headers','{}',true);
  result:=public.tms_list_driver_commission_revisions_secure(temporary_rule);
  IF (result->>'total')::int<>1 THEN RAISE EXCEPTION 'Ordinary own history missing'; END IF;
  denied:=false;
  BEGIN
    PERFORM public.tms_list_driver_commission_revisions_secure(existing_rule);
  EXCEPTION WHEN insufficient_privilege THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Ordinary read crossed tenant'; END IF;
  PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',(SELECT tenant_id FROM public.tms_driver_commission_rule WHERE id=existing_rule))::text,true);
  IF public.tms_list_driver_commission_revisions_secure(temporary_rule) IS DISTINCT FROM result THEN
    RAISE EXCEPTION 'Forged ordinary header altered own history';
  END IF;
END $audit$;

DO $audit$
DECLARE
  platform_user uuid;
  ordinary_user uuid := 'ab881b32-87d4-4dce-9014-ce488b8069df';
  own_tenant uuid;
  other_tenant uuid;
  own_vehicle uuid;
  result jsonb;
  denied boolean;
BEGIN
  IF has_function_privilege('anon','public.vms_list_vehicle_archive_options_for_tenant_secure(uuid,text,uuid[],integer)','EXECUTE')
  THEN RAISE EXCEPTION 'Anonymous tenant vehicle options allowed'; END IF;
  SELECT auth_user_id INTO platform_user FROM public.sys_user WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1;
  SELECT tenant_id INTO own_tenant FROM public.sys_user WHERE auth_user_id=ordinary_user;
  SELECT id INTO own_vehicle FROM public.mdm_vehicle WHERE tenant_id=own_tenant LIMIT 1;
  SELECT v.tenant_id INTO other_tenant FROM public.mdm_vehicle v JOIN public.sys_tenant t ON t.id=v.tenant_id
    WHERE v.tenant_id<>own_tenant AND t.status='1'
    AND (t.service_start_date IS NULL OR t.service_start_date<=current_date)
    AND (t.service_end_date IS NULL OR t.service_end_date>=current_date) LIMIT 1;
  IF platform_user IS NULL OR own_tenant IS NULL OR other_tenant IS NULL OR own_vehicle IS NULL
  THEN RAISE EXCEPTION 'Vehicle option fixtures missing'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',platform_user,'role','authenticated')::text,true);
  PERFORM set_config('request.headers','{}',true);
  result:=public.vms_list_vehicle_archive_options_for_tenant_secure(own_tenant,NULL,NULL,1000);
  IF jsonb_array_length(result)=0 OR EXISTS(
    SELECT 1 FROM jsonb_array_elements(result) r JOIN public.mdm_vehicle v ON v.id=(r->>'id')::uuid
    WHERE v.tenant_id<>own_tenant OR (r->>'vehicle_type_profile_id') IS DISTINCT FROM v.vehicle_type_profile_id::text
  ) THEN RAISE EXCEPTION 'Platform all target vehicle options incorrect'; END IF;
  PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',own_tenant)::text,true);
  IF public.vms_list_vehicle_archive_options_for_tenant_secure(own_tenant,NULL,NULL,1000) IS DISTINCT FROM result
  THEN RAISE EXCEPTION 'Platform selected own vehicle options differ'; END IF;
  denied:=false;
  BEGIN
    PERFORM public.vms_list_vehicle_archive_options_for_tenant_secure(other_tenant,NULL,NULL,1000);
  EXCEPTION WHEN insufficient_privilege THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Platform selected crossed target tenant'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ordinary_user,'role','authenticated')::text,true);
  PERFORM set_config('request.headers','{}',true);
  result:=public.vms_list_vehicle_archive_options_for_tenant_secure(own_tenant,NULL,NULL,1000);
  IF jsonb_array_length(result)=0 OR EXISTS(
    SELECT 1 FROM jsonb_array_elements(result) r JOIN public.mdm_vehicle v ON v.id=(r->>'id')::uuid
    WHERE v.tenant_id<>own_tenant OR (r->>'vehicle_type_profile_id') IS DISTINCT FROM v.vehicle_type_profile_id::text
  ) THEN RAISE EXCEPTION 'Ordinary own vehicle options incorrect'; END IF;
  result:=public.vms_list_vehicle_archive_options_for_tenant_secure(own_tenant,NULL,ARRAY[own_vehicle],1000);
  IF jsonb_array_length(result)<>1 OR result->0->>'id'<>own_vehicle::text
  THEN RAISE EXCEPTION 'Explicit vehicle ID filter failed'; END IF;
  PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
  IF public.vms_list_vehicle_archive_options_for_tenant_secure(own_tenant,NULL,ARRAY[own_vehicle],1000) IS DISTINCT FROM result
  THEN RAISE EXCEPTION 'Forged header changed ordinary vehicle options'; END IF;
  denied:=false;
  BEGIN
    PERFORM public.vms_list_vehicle_archive_options_for_tenant_secure(other_tenant,NULL,NULL,1000);
  EXCEPTION WHEN insufficient_privilege THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Ordinary accessed foreign tenant vehicle options'; END IF;
END $audit$;

ROLLBACK;
