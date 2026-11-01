-- Read-only production contract assertions; no business rows are written.
BEGIN READ ONLY;

DO $test$
DECLARE v_name text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['sql_query_api','sql_query_api_call'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='app_private' AND c.relname=v_name AND c.relrowsecurity
    ) THEN RAISE EXCEPTION 'private SQL API table must enable RLS: %',v_name; END IF;
    IF has_table_privilege('anon','app_private.'||v_name,'SELECT')
       OR has_table_privilege('authenticated','app_private.'||v_name,'SELECT')
       OR has_table_privilege('authenticated','app_private.'||v_name,'INSERT')
       OR has_table_privilege('authenticated','app_private.'||v_name,'UPDATE') THEN
      RAISE EXCEPTION 'SQL API control-plane table is exposed: %',v_name;
    END IF;
  END LOOP;
END $test$;

SELECT set_config('request.jwt.claims',jsonb_build_object('sub',u.auth_user_id,'role','authenticated')::text,true),
       set_config('test.expected_tenant',u.tenant_id::text,true),
       set_config('request.headers',jsonb_build_object('x-art-tenant-scope',
         (SELECT id FROM public.sys_tenant WHERE id<>u.tenant_id AND status='1' LIMIT 1))::text,true)
FROM public.sys_user u
WHERE u.auth_user_id IS NOT NULL AND u.status='1' AND u.deleted_at IS NULL AND NOT u.system_protected
LIMIT 1;

SET LOCAL ROLE authenticated;
DO $test$
BEGIN
  IF current_setting('test.expected_tenant',true) IS NULL THEN RAISE EXCEPTION 'ordinary fixture unavailable'; END IF;
  IF current_user<>'authenticated' OR app_private.current_read_tenant_id()::text<>current_setting('test.expected_tenant') THEN
    RAISE EXCEPTION 'ordinary SQL API request escaped authenticated tenant scope';
  END IF;
  BEGIN
    UPDATE public.sys_user SET nick_name=nick_name WHERE false;
    RAISE EXCEPTION 'SQL API transaction unexpectedly allowed a write';
  EXCEPTION WHEN read_only_sql_transaction THEN NULL;
  END;
END $test$;
ROLLBACK;

BEGIN READ ONLY;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',u.auth_user_id,'role','authenticated')::text,true),
       set_config('request.headers','{}',true),
       set_config('test.selected_tenant',(SELECT id::text FROM public.sys_tenant WHERE status='1' LIMIT 1),true)
FROM public.sys_user u JOIN public.sys_tenant t ON t.id=u.tenant_id
WHERE u.auth_user_id IS NOT NULL AND u.status='1' AND u.deleted_at IS NULL AND u.system_protected
AND t.builtin_type='platform' AND EXISTS (
  SELECT 1 FROM public.sys_role r WHERE r.tenant_id=u.tenant_id AND r.builtin_type='platform_super'
  AND r.enabled AND r.role_code=ANY(u.user_roles)
) LIMIT 1;
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
  IF NOT app_private.is_platform_super() OR app_private.current_read_tenant_id() IS NOT NULL THEN
    RAISE EXCEPTION 'platform-all control-plane scope incorrect';
  END IF;
  PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',current_setting('test.selected_tenant'))::text,true);
  IF app_private.current_read_tenant_id()::text<>current_setting('test.selected_tenant') THEN
    RAISE EXCEPTION 'selected API tenant did not constrain authenticated data reads';
  END IF;
END $test$;
ROLLBACK;
