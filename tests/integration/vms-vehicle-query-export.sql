BEGIN;

DO $test$
DECLARE
  actor uuid;
  actor_tenant uuid;
  other_tenant uuid;
  own_result jsonb;
  forged_result jsonb;
BEGIN
  SELECT u.auth_user_id, u.tenant_id
  INTO actor, actor_tenant
  FROM public.sys_user u
  JOIN public.sys_role r
    ON r.tenant_id = u.tenant_id AND r.role_code = ANY(u.user_roles)
  WHERE u.auth_user_id IS NOT NULL
    AND r.role_code NOT IN ('R_SUPER', 'R_ADMIN')
    AND EXISTS (
      SELECT 1 FROM public.sys_role_menu rm
      JOIN public.sys_menu m ON m.id = rm.menu_id
      WHERE rm.role_id = r.id AND rm.tenant_id = r.tenant_id
        AND m.name = 'VehicleQuery:View'
    )
    AND EXISTS (
      SELECT 1 FROM public.sys_role_menu rm
      JOIN public.sys_menu m ON m.id = rm.menu_id
      WHERE rm.role_id = r.id AND rm.tenant_id = r.tenant_id
        AND m.name = 'VehicleQuery:Export'
    )
  LIMIT 1;

  IF actor IS NULL THEN
    RAISE EXCEPTION 'Vehicle query export test actor unavailable';
  END IF;

  SELECT id INTO other_tenant FROM public.sys_tenant WHERE id <> actor_tenant LIMIT 1;

  DELETE FROM public.sys_role_menu rm
  USING public.sys_menu m
  WHERE rm.menu_id = m.id AND m.name = 'VehicleArchive:Export'
    AND rm.tenant_id = actor_tenant
    AND rm.role_id IN (
      SELECT r.id FROM public.sys_role r
      JOIN public.sys_user u
        ON u.tenant_id = r.tenant_id AND r.role_code = ANY(u.user_roles)
      WHERE u.auth_user_id = actor
    );

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', actor, 'role', 'authenticated')::text,
    true
  );
  PERFORM set_config('request.headers', '{}', true);

  IF app_private.can_execute_business_action(
    'VehicleArchiveManage', 'VehicleArchive:Export', NULL, false
  ) THEN
    RAISE EXCEPTION 'Archive export permission still grants access';
  END IF;

  own_result := public.vms_list_vehicle_archives_secure(p_purpose := 'export');
  IF own_result->'records' IS NULL OR own_result->>'total' IS NULL THEN
    RAISE EXCEPTION 'Vehicle query export response is incomplete';
  END IF;

  PERFORM set_config(
    'request.headers',
    jsonb_build_object('x-art-tenant-scope', other_tenant)::text,
    true
  );
  forged_result := public.vms_list_vehicle_archives_secure(p_purpose := 'export');
  IF forged_result IS DISTINCT FROM own_result THEN
    RAISE EXCEPTION 'Ordinary user forged a cross-tenant export scope';
  END IF;
END;
$test$;

ROLLBACK;
