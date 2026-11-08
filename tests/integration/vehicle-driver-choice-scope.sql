-- Read-only selector contract: all test fixtures and mutations are rolled back.
BEGIN;
DO $audit$
DECLARE
 platform_user uuid; ordinary_user uuid := 'ab881b32-87d4-4dce-9014-ce488b8069df';
 own_tenant uuid; other_tenant uuid; parent_vehicle uuid; parent_carrier uuid; asset_account uuid;
 result jsonb; original jsonb; second_page jsonb; target uuid;
BEGIN
 SELECT auth_user_id INTO platform_user FROM public.sys_user WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1;
 SELECT tenant_id INTO own_tenant FROM public.sys_user WHERE auth_user_id=ordinary_user;
 SELECT id INTO parent_vehicle FROM public.mdm_vehicle WHERE tenant_id=own_tenant LIMIT 1;
 SELECT id INTO other_tenant FROM public.sys_tenant WHERE id<>own_tenant AND status='1' AND (service_start_date IS NULL OR service_start_date<=current_date) AND (service_end_date IS NULL OR service_end_date>=current_date) LIMIT 1;
 IF platform_user IS NULL OR own_tenant IS NULL OR parent_vehicle IS NULL OR other_tenant IS NULL THEN RAISE EXCEPTION 'Selector scope fixtures missing'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',platform_user,'role','authenticated')::text,true);
 PERFORM set_config('request.jwt.claim.sub',platform_user::text,true);
 PERFORM set_config('request.headers','{}',true);
 INSERT INTO public.mdm_vehicle(tenant_id,plate_no,vehicle_type,audit_status)
 SELECT own_tenant,'QA-CHOICE-'||lpad(i::text,4,'0'),'truck','approved' FROM generate_series(1,205) i;
 INSERT INTO public.mdm_vehicle(tenant_id,plate_no,vehicle_type,audit_status) VALUES(other_tenant,'QA-CHOICE-FOREIGN','truck','approved');
 INSERT INTO public.mdm_driver
 SELECT (jsonb_populate_record(NULL::public.mdm_driver,to_jsonb(seed)||jsonb_build_object('id',gen_random_uuid(),'tenant_id',own_tenant,'employee_id',NULL,'carrier_id',NULL,'driver_name','QA-DRIVER-'||lpad(i::text,4,'0'),'phone','19988'||lpad(i::text,6,'0'),'id_card_no','13000020000101'||lpad(i::text,4,'0'),'driver_type','primary','enabled',true,'is_blacklisted',false))).*
 FROM generate_series(1,205) i CROSS JOIN (SELECT * FROM public.mdm_driver WHERE tenant_id=own_tenant LIMIT 1) seed;
 result := public.list_vehicle_driver_choices_secure('approved_vehicle',200,209,'QA-CHOICE-',jsonb_build_object('tenantId',own_tenant));
 IF (result->>'total')::integer<>205 OR jsonb_array_length(result->'records')<>5 THEN RAISE EXCEPTION 'Vehicle pagination truncated after 200: %',result->>'total'; END IF;
 result := public.list_vehicle_driver_choices_secure('vehicle_driver',200,209,'QA-DRIVER-',jsonb_build_object('vehicleId',parent_vehicle));
 IF (result->>'total')::integer<>205 OR jsonb_array_length(result->'records')<>5 THEN RAISE EXCEPTION 'Driver pagination truncated after 200'; END IF;
 result := public.list_vehicle_driver_choices_secure('approved_vehicle',0,9,'QA-CHOICE-');
 IF (result->>'total')::integer<>206 THEN RAISE EXCEPTION 'Platform all scope incomplete'; END IF;
 PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',own_tenant)::text,true);
 original := public.list_vehicle_driver_choices_secure('approved_vehicle',0,9,'QA-CHOICE-');
 IF (original->>'total')::integer<>205 THEN RAISE EXCEPTION 'Platform-selected scope leak'; END IF;
 BEGIN
   PERFORM public.list_vehicle_driver_choices_secure('commission_vehicle',0,9,NULL,jsonb_build_object('tenantId',other_tenant));
   RAISE EXCEPTION 'Platform-selected foreign target accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ordinary_user,'role','authenticated')::text,true);
 PERFORM set_config('request.jwt.claim.sub',ordinary_user::text,true);
 PERFORM set_config('request.headers','{}',true);
 original := public.list_vehicle_driver_choices_secure('approved_vehicle',0,9,'QA-CHOICE-');
 IF (original->>'total')::integer<>205 THEN RAISE EXCEPTION 'Ordinary own scope wrong'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(original->'records') r WHERE r->>'tenant_id' IS DISTINCT FROM own_tenant::text) THEN RAISE EXCEPTION 'Vehicle choices must carry their authoritative parent tenant for child creation'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(original->'records') r JOIN public.mdm_vehicle v ON v.id=(r->>'id')::uuid WHERE v.tenant_id<>own_tenant) THEN RAISE EXCEPTION 'Ordinary cross-tenant vehicle'; END IF;
 PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
 result := public.list_vehicle_driver_choices_secure('approved_vehicle',0,9,'QA-CHOICE-');
 IF result IS DISTINCT FROM original THEN RAISE EXCEPTION 'Forged header changed ordinary results'; END IF;
 BEGIN
   PERFORM public.list_vehicle_driver_choices_secure('commission_vehicle',0,9,NULL,jsonb_build_object('tenantId',other_tenant));
   RAISE EXCEPTION 'Ordinary forged target accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 result := public.list_vehicle_driver_choices_secure('vehicle_driver',0,9,'QA-DRIVER-',jsonb_build_object('vehicleId',parent_vehicle));
 IF (result->>'total')::integer<>205 THEN RAISE EXCEPTION 'Ordinary driver scope wrong'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(result->'records') r JOIN public.mdm_driver d ON d.id=(r->>'id')::uuid WHERE r->'phone' IS DISTINCT FROM coalesce(app_private.tms_driver_to_secure_json(d)->'phone','null'::jsonb)) THEN RAISE EXCEPTION 'Phone field masking changed'; END IF;
 IF has_function_privilege('anon','public.list_vehicle_driver_choices_secure(text,integer,integer,text,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Anonymous candidate reader exposed'; END IF;
 IF has_function_privilege('authenticated','app_private.vehicle_driver_choice_json(public.mdm_driver)','EXECUTE') OR has_function_privilege('authenticated','app_private.vehicle_choice_json(public.mdm_vehicle)','EXECUTE') THEN RAISE EXCEPTION 'Private serializer executable directly'; END IF;
END $audit$;
ROLLBACK;
