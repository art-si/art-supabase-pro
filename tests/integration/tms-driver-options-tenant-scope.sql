-- Driver selectors honor selected tenant and ignore forged ordinary-user scope headers.
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
 SELECT d.tenant_id INTO other_tenant FROM public.mdm_driver d JOIN public.sys_tenant t ON t.id=d.tenant_id
 WHERE d.tenant_id<>own_tenant AND t.status='1' AND (t.service_start_date IS NULL OR t.service_start_date<=current_date)
 AND (t.service_end_date IS NULL OR t.service_end_date>=current_date) LIMIT 1;
 IF platform_user IS NULL OR own_tenant IS NULL OR other_tenant IS NULL THEN RAISE EXCEPTION 'Scope fixtures missing'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',platform_user,'role','authenticated')::text,true);
 PERFORM set_config('request.headers','{}',true);
 result:=public.tms_list_driver_options_secure(p_max_rows=>1000);
 IF (SELECT count(distinct d.tenant_id) FROM jsonb_array_elements(result) r JOIN public.mdm_driver d ON d.id=(r->>'id')::uuid)<2
 THEN RAISE EXCEPTION 'Platform all scope incomplete'; END IF;
 PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',own_tenant)::text,true);
 result:=public.tms_list_driver_options_secure(p_max_rows=>1000);
 IF jsonb_array_length(result)=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(result) r JOIN public.mdm_driver d ON d.id=(r->>'id')::uuid WHERE d.tenant_id<>own_tenant)
 THEN RAISE EXCEPTION 'Platform selected scope leaks'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ordinary_user,'role','authenticated')::text,true);
 PERFORM set_config('request.headers','{}',true);
 result:=public.tms_list_driver_options_secure(p_max_rows=>1000);
 IF jsonb_array_length(result)=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(result) r JOIN public.mdm_driver d ON d.id=(r->>'id')::uuid WHERE d.tenant_id<>own_tenant)
 THEN RAISE EXCEPTION 'Ordinary own scope leaks'; END IF;
 PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
 IF public.tms_list_driver_options_secure(p_max_rows=>1000) IS DISTINCT FROM result
 THEN RAISE EXCEPTION 'Forged header changed ordinary scope'; END IF;
END $audit$;

ROLLBACK;
