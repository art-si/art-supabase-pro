-- All membership changes and fixtures are rolled back.
BEGIN;
DO $test$
DECLARE
  super_uid uuid;
  actor public.sys_user;
  other_user public.sys_user;
  role_id uuid;
  super_role_id uuid;
  original_roles text[];
  role_code text := 'ROLE_USERS_TEST_' || replace(gen_random_uuid()::text, '-', '');
  result jsonb;
  blocked boolean;
BEGIN
  IF has_function_privilege('anon', 'public.system_role_users(uuid)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.system_set_role_users(uuid,uuid[],uuid[])', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.system_set_role_users(uuid,uuid[],uuid[])', 'EXECUTE')
  THEN RAISE EXCEPTION 'RPC grants invalid'; END IF;
  SELECT auth_user_id INTO super_uid FROM public.sys_user WHERE system_protected AND status='1' LIMIT 1;
  SELECT id INTO super_role_id FROM public.sys_role WHERE builtin_type='platform_super' LIMIT 1;
  SELECT u.* INTO actor FROM public.sys_user u
  WHERE u.status='1' AND u.deleted_at IS NULL AND u.system_protected IS NOT TRUE
    AND u.auth_user_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.sys_role r JOIN public.sys_role_menu rm ON rm.role_id=r.id
      JOIN public.sys_menu m ON m.id=rm.menu_id
      WHERE r.tenant_id=u.tenant_id AND r.role_code=ANY(u.user_roles) AND r.enabled
        AND m.name='System:Role:AssignUser'
    ) LIMIT 1;
  SELECT u.* INTO other_user FROM public.sys_user u
  WHERE u.tenant_id<>actor.tenant_id AND u.status='1' AND u.deleted_at IS NULL
    AND u.system_protected IS NOT TRUE LIMIT 1;
  IF super_uid IS NULL OR actor.id IS NULL OR other_user.id IS NULL THEN
    RAISE EXCEPTION 'Authorization matrix fixtures unavailable';
  END IF;
  original_roles := actor.user_roles;
  INSERT INTO public.sys_role(tenant_id,role_name,role_code,enabled)
  VALUES(actor.tenant_id,'角色分配用户回滚测试',role_code,true) RETURNING id INTO role_id;
  PERFORM set_config('role_users_test.role_id',role_id::text,true);

  PERFORM set_config('request.jwt.claim.sub',super_uid::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',super_uid,'role','authenticated')::text,true);
  PERFORM set_config('request.headers','{}',true);
  result := public.system_role_users(role_id);
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result->'records') x WHERE x->>'id'=actor.id::text)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(result->'records') x WHERE x->>'id'=other_user.id::text)
  THEN RAISE EXCEPTION 'Platform-all role candidates cross tenant boundary'; END IF;
  PERFORM public.system_set_role_users(role_id,ARRAY[actor.id],ARRAY[]::uuid[]);
  IF (SELECT user_roles FROM public.sys_user WHERE id=actor.id) IS DISTINCT FROM array_append(original_roles,role_code)
  THEN RAISE EXCEPTION 'Other roles overwritten'; END IF;
  blocked := false;
  BEGIN
    PERFORM public.system_set_role_users(role_id,ARRAY[]::uuid[],ARRAY[]::uuid[]);
  EXCEPTION WHEN serialization_failure THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Stale membership accepted'; END IF;
  PERFORM public.system_set_role_users(role_id,ARRAY[]::uuid[],ARRAY[actor.id]);
  IF (SELECT user_roles FROM public.sys_user WHERE id=actor.id) IS DISTINCT FROM original_roles
  THEN RAISE EXCEPTION 'Removal changed other roles'; END IF;
  PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',actor.tenant_id)::text,true);
  PERFORM public.system_role_users(role_id);
  PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_user.tenant_id)::text,true);
  blocked := false;
  BEGIN PERFORM public.system_role_users(role_id);
  EXCEPTION WHEN insufficient_privilege THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Platform-selected leaked another tenant'; END IF;
  blocked := false;
  BEGIN PERFORM public.system_set_role_users(role_id,ARRAY[]::uuid[],ARRAY[]::uuid[]);
  EXCEPTION WHEN insufficient_privilege THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Platform-selected wrote another tenant'; END IF;

  PERFORM set_config('request.jwt.claim.sub',actor.auth_user_id::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor.auth_user_id,'role','authenticated')::text,true);
  -- Forged header must remain bound to the authenticated tenant.
  PERFORM public.system_role_users(role_id);
  PERFORM public.system_set_role_users(role_id,ARRAY[actor.id],ARRAY[]::uuid[]);
  PERFORM set_config('request.headers','{}',true);
  PERFORM public.system_role_users(role_id);
  PERFORM public.system_set_role_users(role_id,ARRAY[]::uuid[],ARRAY[actor.id]);
  blocked := false;
  BEGIN PERFORM public.system_set_role_users(role_id,ARRAY[other_user.id],ARRAY[]::uuid[]);
  EXCEPTION WHEN insufficient_privilege THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Cross-tenant user assignment accepted'; END IF;

  -- Revoking just the new button must deny reads and writes even with the page menu.
  DELETE FROM public.sys_role_menu rm USING public.sys_role r,public.sys_menu m
  WHERE rm.role_id=r.id AND rm.menu_id=m.id AND r.tenant_id=actor.tenant_id
    AND r.role_code=ANY(actor.user_roles) AND m.name='System:Role:AssignUser';
  blocked := false;
  BEGIN PERFORM public.system_role_users(role_id);
  EXCEPTION WHEN insufficient_privilege THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Missing permission allowed read'; END IF;
  blocked := false;
  BEGIN PERFORM public.system_set_role_users(role_id,ARRAY[]::uuid[],ARRAY[]::uuid[]);
  EXCEPTION WHEN insufficient_privilege THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Missing permission allowed write'; END IF;

  PERFORM set_config('request.jwt.claim.sub',super_uid::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',super_uid,'role','authenticated')::text,true);
  PERFORM set_config('request.headers','{}',true);
  blocked := false;
  BEGIN PERFORM public.system_set_role_users(super_role_id,ARRAY[]::uuid[],ARRAY[]::uuid[]);
  EXCEPTION WHEN insufficient_privilege THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Protected role accepted'; END IF;
  UPDATE public.sys_role SET enabled=false WHERE id=role_id;
  blocked := false;
  BEGIN PERFORM public.system_set_role_users(role_id,ARRAY[actor.id],ARRAY[]::uuid[]);
  EXCEPTION WHEN invalid_parameter_value THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'Disabled role accepted new members'; END IF;
END $test$;
-- Exercise the exposed invoker wrappers with the actual API role as well.
SET LOCAL ROLE authenticated;
SELECT jsonb_array_length(public.system_role_users(
  current_setting('role_users_test.role_id')::uuid)->'records') > 0 AS authenticated_read_ok;
SELECT public.system_set_role_users(current_setting('role_users_test.role_id')::uuid,
  ARRAY[]::uuid[],ARRAY[]::uuid[]) = 0 AS authenticated_noop_ok;
RESET ROLE;
ROLLBACK;
