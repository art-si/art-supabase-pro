BEGIN;

DO $test$
DECLARE
  platform_user uuid;
  ordinary_user uuid;
  statement_tenant uuid;
  other_tenant uuid;
  customer_id uuid;
  result jsonb;
  expected_total integer;
BEGIN
  SELECT s.tenant_id, s.customer_id INTO statement_tenant, customer_id
  FROM public.tms_customer_statement_summary s LIMIT 1;
  SELECT id INTO other_tenant FROM public.sys_tenant
  WHERE id <> statement_tenant AND status = '1' LIMIT 1;
  SELECT auth_user_id INTO platform_user FROM public.sys_user
  WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1;
  SELECT u.auth_user_id INTO ordinary_user FROM public.sys_user u
  WHERE u.auth_user_id IS NOT NULL AND u.tenant_id = statement_tenant
    AND NOT ('R_SUPER' = ANY(u.user_roles))
    AND EXISTS (
      SELECT 1 FROM public.sys_role r
      JOIN public.sys_role_menu rm ON rm.role_id = r.id
      JOIN public.sys_menu m ON m.id = rm.menu_id
      WHERE r.role_code = ANY(u.user_roles)
        AND m.name = 'FinanceCustomerSettlement:View'
    )
  LIMIT 1;
  IF statement_tenant IS NULL OR customer_id IS NULL OR other_tenant IS NULL
    OR platform_user IS NULL OR ordinary_user IS NULL THEN
    RAISE EXCEPTION 'Customer statement scope test actors or records unavailable';
  END IF;

  SELECT count(*) INTO expected_total FROM public.tms_customer_statement_summary;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', platform_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', '{}', true);
  result := public.tms_list_customer_statements_secure(p_from => 0, p_to => 99);
  IF (result->>'total')::integer <> expected_total THEN
    RAISE EXCEPTION 'Platform all-tenant statement count wrong';
  END IF;
  result := public.tms_list_customer_statements_secure(p_customer_id => customer_id, p_from => 0, p_to => 99);
  IF (result->>'total')::integer < 1 THEN
    RAISE EXCEPTION 'Platform all-tenant customer filter failed';
  END IF;

  PERFORM set_config('request.headers', jsonb_build_object('x-art-tenant-scope', statement_tenant)::text, true);
  result := public.tms_list_customer_statements_secure(p_customer_id => customer_id, p_from => 0, p_to => 99);
  IF (result->>'total')::integer < 1 THEN
    RAISE EXCEPTION 'Platform selected-tenant statements missing';
  END IF;
  PERFORM set_config('request.headers', jsonb_build_object('x-art-tenant-scope', other_tenant)::text, true);
  result := public.tms_list_customer_statements_secure(p_from => 0, p_to => 99);
  IF (result->>'total')::integer <> 0 THEN
    RAISE EXCEPTION 'Platform selected tenant leaked statements';
  END IF;
  result := public.tms_list_customer_statements_secure(p_customer_id => customer_id, p_from => 0, p_to => 99);
  IF (result->>'total')::integer <> 0 THEN
    RAISE EXCEPTION 'Platform selected tenant leaked a mismatched customer';
  END IF;

  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', ordinary_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', '{}', true);
  result := public.tms_list_customer_statements_secure(p_customer_id => customer_id, p_from => 0, p_to => 99);
  IF (result->>'total')::integer < 1 THEN
    RAISE EXCEPTION 'Ordinary own-tenant statements missing';
  END IF;
  PERFORM set_config('request.headers', jsonb_build_object('x-art-tenant-scope', other_tenant)::text, true);
  result := public.tms_list_customer_statements_secure(p_customer_id => customer_id, p_from => 0, p_to => 99);
  IF (result->>'total')::integer < 1 THEN
    RAISE EXCEPTION 'Forged header hid ordinary own-tenant statements';
  END IF;
END;
$test$;

ROLLBACK;
