BEGIN;

DO $test$
DECLARE
  platform_user uuid;
  ordinary_user uuid := 'ab881b32-87d4-4dce-9014-ce488b8069df';
  ordinary_tenant uuid;
  qa_tenant uuid := '2824c2b5-2774-4781-b995-f55e8bcee920';
  qa_driver uuid := '2fcd4c03-5dbc-4c6d-8d7b-94963635b1b7';
  own_driver uuid;
  first_page jsonb;
  second_page jsonb;
  result jsonb;
  ordinary_result jsonb;
BEGIN
  IF to_regprocedure('public.tms_list_current_driver_mainline_relations_secure(uuid,integer,integer)') IS NULL THEN
    RAISE EXCEPTION 'Current driver reader is missing';
  END IF;
  IF has_function_privilege('anon', 'public.tms_list_current_driver_mainline_relations_secure(uuid,integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous role can execute the current driver reader';
  END IF;
  IF to_regprocedure('public.tms_list_transport_mainline_relations_secure(uuid[],uuid,uuid,integer,integer)') IS NULL THEN
    RAISE EXCEPTION 'Original mainline reader signature changed';
  END IF;

  SELECT auth_user_id INTO platform_user FROM public.sys_user
  WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1;
  SELECT tenant_id INTO ordinary_tenant FROM public.sys_user WHERE auth_user_id=ordinary_user;
  SELECT id INTO own_driver FROM public.mdm_driver WHERE tenant_id=ordinary_tenant LIMIT 1;
  IF platform_user IS NULL OR ordinary_tenant IS NULL OR own_driver IS NULL THEN
    RAISE EXCEPTION 'Current driver test actors unavailable';
  END IF;

  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',platform_user,'role','authenticated')::text, true);
  PERFORM set_config('request.headers','{}',true);

  UPDATE public.tms_waybill
  SET departed_at=now() - interval '1 hour'
  WHERE id IN (
    'ad93535b-5055-4064-84eb-7cdcdf34fde8'::uuid,
    '022f24c7-9854-491b-9a4e-8c85727e1b6f'::uuid
  ) AND tenant_id=qa_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Current driver QA waybills unavailable'; END IF;

  first_page := public.tms_list_current_driver_mainline_relations_secure(qa_driver,0,0);
  second_page := public.tms_list_current_driver_mainline_relations_secure(qa_driver,1,1);
  IF (first_page->>'total')::integer < 2 OR first_page->>'total' <> second_page->>'total' THEN
    RAISE EXCEPTION 'Current relations are missing or page totals differ';
  END IF;
  IF jsonb_array_length(first_page->'records') <> 1
    OR jsonb_array_length(second_page->'records') <> 1
    OR first_page->'records'->0->>'waybillId'=second_page->'records'->0->>'waybillId' THEN
    RAISE EXCEPTION 'Current-only pagination is incorrect';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(first_page->'records' || second_page->'records') row_data
    WHERE row_data->>'driverId' <> qa_driver::text
      OR row_data->>'tenantId' <> qa_tenant::text
      OR row_data->>'departedAt' IS NULL
      OR row_data->>'completedAt' IS NOT NULL
  ) THEN RAISE EXCEPTION 'Current-only result includes unrelated or completed records'; END IF;

  UPDATE public.tms_waybill SET departed_at=NULL
  WHERE id='022f24c7-9854-491b-9a4e-8c85727e1b6f'::uuid AND tenant_id=qa_tenant;
  result := public.tms_list_current_driver_mainline_relations_secure(qa_driver,0,19);
  IF (result->>'total')::integer <> (first_page->>'total')::integer - 1 THEN
    RAISE EXCEPTION 'Undeparted execution remains in current relations';
  END IF;

  PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',qa_tenant)::text,true);
  result := public.tms_list_current_driver_mainline_relations_secure(qa_driver,0,19);
  IF (result->>'total')::integer < 1 THEN RAISE EXCEPTION 'Platform selected scope hid own current driver'; END IF;
  PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',ordinary_tenant)::text,true);
  result := public.tms_list_current_driver_mainline_relations_secure(qa_driver,0,19);
  IF (result->>'total')::integer <> 0 THEN RAISE EXCEPTION 'Platform selected scope leaked QA driver'; END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ordinary_user,'role','authenticated')::text,true);
  PERFORM set_config('request.headers','{}',true);
  ordinary_result := public.tms_list_current_driver_mainline_relations_secure(own_driver,0,19);
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(ordinary_result->'records') row_data
    WHERE row_data->>'tenantId' <> ordinary_tenant::text
  ) THEN RAISE EXCEPTION 'Ordinary current-driver scope leaked'; END IF;
  PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',qa_tenant)::text,true);
  IF public.tms_list_current_driver_mainline_relations_secure(own_driver,0,19) IS DISTINCT FROM ordinary_result THEN
    RAISE EXCEPTION 'Forged header changed ordinary current-driver result';
  END IF;
  result := public.tms_list_current_driver_mainline_relations_secure(qa_driver,0,19);
  IF (result->>'total')::integer <> 0 THEN RAISE EXCEPTION 'Ordinary user saw another tenant current driver'; END IF;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub','00000000-0000-4000-8000-000000000099','role','authenticated')::text,true);
  BEGIN
    PERFORM public.tms_list_current_driver_mainline_relations_secure(qa_driver,0,19);
    RAISE EXCEPTION 'Unprivileged user read current driver relations';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END;
$test$;

ROLLBACK;
