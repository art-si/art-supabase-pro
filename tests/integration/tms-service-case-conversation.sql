BEGIN;

DO $test$
DECLARE
  platform_user uuid;
  service_case public.tms_service_case;
  reply_id uuid;
  selector_tenant uuid;
  other_tenant uuid;
  selector_result jsonb;
  mention_result jsonb;
  ordinary_user uuid;
  ordinary_tenant uuid;
  mention_user uuid;
  mention_label text;
  ordinary_reply_user uuid;
  ordinary_case_id uuid;
  ordinary_case_tenant uuid;
BEGIN
  SELECT auth_user_id INTO platform_user FROM public.sys_user
  WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1;
  SELECT * INTO service_case FROM public.tms_service_case LIMIT 1;
  IF platform_user IS NULL OR service_case.id IS NULL THEN
    RAISE EXCEPTION 'Service case test actor or record unavailable';
  END IF;

  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', platform_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', '{}', true);
  INSERT INTO public.tms_service_case_reply(tenant_id, service_case_id, content, mentions)
  VALUES(service_case.tenant_id, service_case.id, '测试沟通记录', '[]'::jsonb)
  RETURNING id INTO reply_id;
  IF NOT EXISTS (SELECT 1 FROM public.tms_service_case_reply WHERE id = reply_id AND author_user_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Reply author was not assigned';
  END IF;
  SELECT id, coalesce(nullif(nick_name, ''), user_name) INTO mention_user, mention_label
  FROM public.sys_user WHERE tenant_id = service_case.tenant_id LIMIT 1;
  INSERT INTO public.tms_service_case_reply(tenant_id, service_case_id, content, mentions)
  VALUES(service_case.tenant_id, service_case.id, '测试提及', jsonb_build_array(jsonb_build_object('kind', 'user', 'id', mention_user, 'label', '伪造名称')))
  RETURNING id INTO reply_id;
  IF (SELECT mentions->0->>'label' FROM public.tms_service_case_reply WHERE id = reply_id) <> mention_label THEN
    RAISE EXCEPTION 'Reply mention label was not canonicalized';
  END IF;

  SELECT tenant_id INTO selector_tenant FROM public.tms_waybill LIMIT 1;
  SELECT tenant_id INTO other_tenant FROM public.tms_waybill WHERE tenant_id <> selector_tenant LIMIT 1;
  selector_result := public.tms_list_service_case_waybill_options_secure(selector_tenant, NULL, 0, 9, NULL);
  IF (selector_result->>'total')::integer < 1 OR NOT ((selector_result->'records'->0) ?& ARRAY[
    'id', 'order_no', 'waybill_no', 'dispatch_mode', 'origin_station',
    'destination_station', 'dispatch_plate_no', 'dispatch_driver_name', 'dispatch_driver_phone'
  ]) THEN
    RAISE EXCEPTION 'Waybill selector did not return the required fields';
  END IF;
  mention_result := public.tms_list_service_case_mention_targets_secure(service_case.id);
  IF NOT (mention_result ?& ARRAY['users', 'organizations', 'roles']) THEN
    RAISE EXCEPTION 'Mention target groups are incomplete';
  END IF;
  IF other_tenant IS NOT NULL THEN
    PERFORM set_config('request.headers', jsonb_build_object('x-art-tenant-scope', other_tenant)::text, true);
    BEGIN
      PERFORM public.tms_list_service_case_waybill_options_secure(selector_tenant, NULL, 0, 9, NULL);
      RAISE EXCEPTION 'Selected tenant boundary failed';
    EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
    END;
    PERFORM set_config('request.headers', '{}', true);
  END IF;

  SELECT u.auth_user_id, u.tenant_id INTO ordinary_user, ordinary_tenant
  FROM public.sys_user u
  WHERE u.auth_user_id IS NOT NULL
    AND NOT ('R_SUPER' = ANY(u.user_roles))
    AND EXISTS (SELECT 1 FROM public.tms_waybill w WHERE w.tenant_id = u.tenant_id)
    AND EXISTS (
      SELECT 1 FROM public.sys_role r
      JOIN public.sys_role_menu rm ON rm.role_id = r.id
      JOIN public.sys_menu m ON m.id = rm.menu_id
      WHERE r.role_code = ANY(u.user_roles) AND m.name = 'TmsServiceCase:View'
    )
  LIMIT 1;
  IF ordinary_user IS NULL THEN RAISE EXCEPTION 'Ordinary service case test actor unavailable'; END IF;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', ordinary_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', jsonb_build_object('x-art-tenant-scope', selector_tenant)::text, true);
  selector_result := public.tms_list_service_case_waybill_options_secure(ordinary_tenant, NULL, 0, 9, NULL);
  IF (selector_result->>'total')::integer < 1 THEN RAISE EXCEPTION 'Forged header hid own-tenant waybills'; END IF;
  IF selector_tenant <> ordinary_tenant THEN
    BEGIN
      PERFORM public.tms_list_service_case_waybill_options_secure(selector_tenant, NULL, 0, 9, NULL);
      RAISE EXCEPTION 'Forged header exposed another tenant';
    EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
    END;
  END IF;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', platform_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', '{}', true);

  BEGIN
    INSERT INTO public.tms_service_case_reply(tenant_id, service_case_id, content, mentions)
    VALUES(service_case.tenant_id, service_case.id, '非法提及', jsonb_build_array(jsonb_build_object('kind', 'user', 'id', gen_random_uuid(), 'label', 'wrong')));
    RAISE EXCEPTION 'Invalid mention was accepted';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;

  SELECT u.auth_user_id, c.id, c.tenant_id
    INTO ordinary_reply_user, ordinary_case_id, ordinary_case_tenant
  FROM public.tms_service_case c
  JOIN public.sys_user u ON u.tenant_id = c.tenant_id
  WHERE u.auth_user_id IS NOT NULL AND NOT ('R_SUPER' = ANY(u.user_roles))
    AND EXISTS (
      SELECT 1 FROM public.sys_role r
      JOIN public.sys_role_menu rm ON rm.role_id = r.id
      JOIN public.sys_menu m ON m.id = rm.menu_id
      WHERE r.role_code = ANY(u.user_roles) AND m.name = 'TmsServiceCase:Reply'
    )
  LIMIT 1;
  IF ordinary_reply_user IS NULL THEN RAISE EXCEPTION 'Ordinary reply test actor unavailable'; END IF;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', ordinary_reply_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', jsonb_build_object('x-art-tenant-scope', selector_tenant)::text, true);
  mention_result := public.tms_list_service_case_mention_targets_secure(ordinary_case_id);
  IF NOT (mention_result ? 'users') THEN RAISE EXCEPTION 'Ordinary user could not load own-tenant mentions'; END IF;
  INSERT INTO public.tms_service_case_reply(tenant_id, service_case_id, content, mentions)
  VALUES(ordinary_case_tenant, ordinary_case_id, '普通用户回复', '[]'::jsonb)
  RETURNING id INTO reply_id;
  IF reply_id IS NULL THEN RAISE EXCEPTION 'Ordinary user could not reply'; END IF;
END;
$test$;

ROLLBACK;
