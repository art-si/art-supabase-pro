BEGIN;

DO $test$
DECLARE
  platform_user uuid;
  ordinary_user uuid;
  own_tenant uuid;
  other_tenant uuid;
  result jsonb;
  selected_result jsonb;
  own_result jsonb;
  forged_result jsonb;
BEGIN
  IF to_regprocedure('public.tms_list_transport_mainline_relations_secure(uuid[],uuid,uuid,integer,integer)') IS NULL THEN
    RAISE EXCEPTION 'Transport mainline reader is missing';
  END IF;
  IF has_function_privilege('anon', 'public.tms_list_transport_mainline_relations_secure(uuid[],uuid,uuid,integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous role can execute the mainline reader';
  END IF;

  SELECT auth_user_id INTO platform_user
  FROM public.sys_user
  WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1;
  SELECT auth_user_id, tenant_id INTO ordinary_user, own_tenant
  FROM public.sys_user
  WHERE auth_user_id = 'ab881b32-87d4-4dce-9014-ce488b8069df';
  SELECT id INTO other_tenant
  FROM public.sys_tenant
  WHERE id <> own_tenant AND status = '1' LIMIT 1;
  IF platform_user IS NULL OR ordinary_user IS NULL OR other_tenant IS NULL THEN
    RAISE EXCEPTION 'Transport mainline test actors unavailable';
  END IF;

  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', platform_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', '{}', true);
  result := public.tms_list_transport_mainline_relations_secure(NULL, NULL, NULL, 0, 99);
  IF (result->>'total')::integer < (SELECT count(*) FROM public.tms_order) THEN
    RAISE EXCEPTION 'Orders without dispatch are missing';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(result->'records') row_data
    GROUP BY row_data->>'orderId', row_data->>'waybillId'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate order-to-waybill relation';
  END IF;
  IF (public.tms_list_transport_mainline_relations_secure(NULL, NULL, NULL, 0, 0)->'records') IS NULL THEN
    RAISE EXCEPTION 'Pagination response is missing';
  END IF;

  PERFORM set_config('request.headers', jsonb_build_object('x-art-tenant-scope', own_tenant)::text, true);
  selected_result := public.tms_list_transport_mainline_relations_secure(NULL, NULL, NULL, 0, 99);
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(selected_result->'records') row_data
    WHERE row_data->>'tenantId' <> own_tenant::text
  ) THEN
    RAISE EXCEPTION 'Platform selected-tenant scope leaked';
  END IF;

  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', ordinary_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', '{}', true);
  own_result := public.tms_list_transport_mainline_relations_secure(NULL, NULL, NULL, 0, 99);
  PERFORM set_config('request.headers', jsonb_build_object('x-art-tenant-scope', other_tenant)::text, true);
  forged_result := public.tms_list_transport_mainline_relations_secure(NULL, NULL, NULL, 0, 99);
  IF forged_result IS DISTINCT FROM own_result THEN
    RAISE EXCEPTION 'Ordinary user forged a cross-tenant scope';
  END IF;
END;
$test$;

ROLLBACK;
