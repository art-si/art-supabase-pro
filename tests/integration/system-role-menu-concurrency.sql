-- Exercise the authenticated RPC with synthetic roles. All fixtures are rolled back.
BEGIN;
SET LOCAL lock_timeout = '3s';

DO $fixture$
DECLARE
  super_id uuid;
  actor record;
  other_tenant_id uuid;
  test_role_id uuid;
  first_menu_id uuid;
  second_menu_id uuid;
BEGIN
  IF has_function_privilege('anon', 'public.set_role_menus(uuid,uuid[],uuid[])', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.set_role_menus(uuid,uuid[],uuid[])', 'EXECUTE')
  THEN RAISE EXCEPTION 'Role menu snapshot RPC grants invalid'; END IF;

  SELECT auth_user_id INTO STRICT super_id FROM public.sys_user
  WHERE system_protected AND status='1' AND deleted_at IS NULL;
  SELECT u.auth_user_id,u.tenant_id INTO actor FROM public.sys_user u
  WHERE u.status='1' AND u.deleted_at IS NULL AND u.system_protected IS NOT TRUE
    AND u.auth_user_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.sys_role r JOIN public.sys_role_menu rm ON rm.role_id=r.id
      JOIN public.sys_menu m ON m.id=rm.menu_id
      WHERE r.tenant_id=u.tenant_id AND r.role_code=ANY(u.user_roles) AND r.enabled
        AND m.name='System:Role:AssignPermission'
    ) ORDER BY u.id LIMIT 1;
  SELECT id INTO other_tenant_id FROM public.sys_tenant
  WHERE id<>actor.tenant_id AND status='1' ORDER BY id LIMIT 1;
  SELECT id INTO STRICT first_menu_id FROM public.sys_menu WHERE name='Role';
  SELECT id INTO STRICT second_menu_id FROM public.sys_menu WHERE name='System:Role:AssignPermission';
  IF actor.auth_user_id IS NULL OR other_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Role menu authorization fixtures unavailable';
  END IF;
  INSERT INTO public.sys_role(tenant_id,role_name,role_code,enabled)
  VALUES(actor.tenant_id,'角色授权快照回滚测试','ROLE_MENU_TEST_'||replace(gen_random_uuid()::text,'-',''),true)
  RETURNING id INTO test_role_id;

  PERFORM set_config('role_menu_test.fixture', jsonb_build_object(
    'super_id',super_id,'actor_id',actor.auth_user_id,'tenant_id',actor.tenant_id,
    'other_tenant_id',other_tenant_id,'role_id',test_role_id,
    'first_menu_id',first_menu_id,'second_menu_id',second_menu_id
  )::text, true);
END $fixture$;

SET LOCAL ROLE authenticated;
DO $test$
DECLARE
  fixture jsonb := current_setting('role_menu_test.fixture')::jsonb;
  test_role_id uuid := (fixture->>'role_id')::uuid;
  first_menu_id uuid := (fixture->>'first_menu_id')::uuid;
  second_menu_id uuid := (fixture->>'second_menu_id')::uuid;
  empty_ids constant uuid[] := ARRAY[]::uuid[];
  scope_mode text;
  account_id text;
  header_tenant_id text;
  blocked boolean;
BEGIN
  FOREACH scope_mode IN ARRAY ARRAY['platform_all','platform_selected','ordinary_own','ordinary_forged'] LOOP
    account_id := CASE WHEN scope_mode LIKE 'platform%' THEN fixture->>'super_id' ELSE fixture->>'actor_id' END;
    header_tenant_id := CASE scope_mode WHEN 'platform_selected' THEN fixture->>'tenant_id'
      WHEN 'ordinary_forged' THEN fixture->>'other_tenant_id' END;
    PERFORM set_config('request.jwt.claim.sub',account_id,true);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',account_id,'role','authenticated')::text,true);
    PERFORM set_config('request.headers',CASE WHEN header_tenant_id IS NULL THEN '{}'
      ELSE jsonb_build_object('x-art-tenant-scope',header_tenant_id)::text END,true);

    PERFORM public.set_role_menus(test_role_id,ARRAY[first_menu_id,second_menu_id],empty_ids);
    blocked := false;
    BEGIN
      PERFORM public.set_role_menus(test_role_id,empty_ids,empty_ids);
    EXCEPTION WHEN SQLSTATE 'PT409' THEN blocked := true;
    END;
    IF NOT blocked OR (SELECT count(*) FROM public.sys_role_menu WHERE role_id=test_role_id)<>2 THEN
      RAISE EXCEPTION 'Stale role grants were overwritten in %', scope_mode;
    END IF;
    PERFORM public.set_role_menus(test_role_id,empty_ids,ARRAY[second_menu_id,first_menu_id,second_menu_id]);
    IF EXISTS(SELECT 1 FROM public.sys_role_menu WHERE role_id=test_role_id) THEN
      RAISE EXCEPTION 'Current snapshot did not clear the grants in %', scope_mode;
    END IF;
  END LOOP;

  PERFORM public.set_role_menus(test_role_id, ARRAY[first_menu_id]);
  IF NOT EXISTS(SELECT 1 FROM public.sys_role_menu WHERE role_id=test_role_id AND menu_id=first_menu_id) THEN
    RAISE EXCEPTION 'Two-argument role menu writer lost compatibility';
  END IF;

  PERFORM set_config('request.jwt.claim.sub',fixture->>'super_id',true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',fixture->>'super_id','role','authenticated')::text,true);
  PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',fixture->>'other_tenant_id')::text,true);
  blocked := false;
  BEGIN
    PERFORM public.set_role_menus(test_role_id,empty_ids,ARRAY[first_menu_id]);
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Role not found or access denied' THEN RAISE; END IF;
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Platform-selected wrote to another tenant'; END IF;
END $test$;

RESET ROLE;
SELECT 'role menu snapshot and tenant assertions passed' AS result;
ROLLBACK;
