BEGIN;

DO $test$
DECLARE
  platform_user uuid;
  ordinary_user uuid;
  ordinary_tenant uuid;
  driver_id uuid;
  employee_id uuid;
  foreign_driver_id uuid;
  foreign_tenant uuid;
  own_result jsonb;
  kind text;
  denied boolean := false;
BEGIN
  IF to_regprocedure('public.tms_list_driver_finance_records_secure(uuid,text,integer,integer)') IS NULL THEN
    RAISE EXCEPTION 'Driver finance reader missing';
  END IF;
  IF has_function_privilege('anon',
      'public.tms_list_driver_finance_records_secure(uuid,text,integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous driver finance access is allowed';
  END IF;

  SELECT auth_user_id INTO platform_user FROM public.sys_user
  WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1;

  SELECT u.auth_user_id, u.tenant_id, d.id, d.employee_id
    INTO ordinary_user, ordinary_tenant, driver_id, employee_id
  FROM public.sys_user u
  JOIN public.mdm_driver d ON d.tenant_id=u.tenant_id AND d.employee_id IS NOT NULL
  WHERE u.auth_user_id IS NOT NULL AND NOT (u.user_roles @> ARRAY['R_SUPER'])
    AND EXISTS (
      SELECT 1 FROM public.sys_role r JOIN public.sys_role_menu rm
        ON rm.role_id=r.id AND rm.tenant_id=r.tenant_id
      JOIN public.sys_menu m ON m.id=rm.menu_id
      WHERE r.tenant_id=u.tenant_id AND r.role_code=ANY(u.user_roles)
        AND m.name='TmsDriverQuery:View')
    AND EXISTS (
      SELECT 1 FROM public.sys_role r JOIN public.sys_role_menu rm
        ON rm.role_id=r.id AND rm.tenant_id=r.tenant_id
      JOIN public.sys_menu m ON m.id=rm.menu_id
      WHERE r.tenant_id=u.tenant_id AND r.role_code=ANY(u.user_roles)
        AND m.name='FinanceLoanApplication:View')
    AND EXISTS (
      SELECT 1 FROM public.sys_role r JOIN public.sys_role_menu rm
        ON rm.role_id=r.id AND rm.tenant_id=r.tenant_id
      JOIN public.sys_menu m ON m.id=rm.menu_id
      WHERE r.tenant_id=u.tenant_id AND r.role_code=ANY(u.user_roles)
        AND m.name='FinanceRepayment:View')
    AND EXISTS (
      SELECT 1 FROM public.sys_role r JOIN public.sys_role_menu rm
        ON rm.role_id=r.id AND rm.tenant_id=r.tenant_id
      JOIN public.sys_menu m ON m.id=rm.menu_id
      WHERE r.tenant_id=u.tenant_id AND r.role_code=ANY(u.user_roles)
        AND m.name='FinanceExpenseReimbursement:View')
    AND EXISTS (SELECT 1 FROM public.fms_travel_loan l WHERE l.tenant_id=u.tenant_id)
    AND EXISTS (SELECT 1 FROM public.fms_travel_repayment p WHERE p.tenant_id=u.tenant_id)
    AND EXISTS (SELECT 1 FROM public.tms_expense_reimbursement e WHERE e.tenant_id=u.tenant_id)
  LIMIT 1;

  SELECT id,tenant_id INTO foreign_driver_id,foreign_tenant
  FROM public.mdm_driver WHERE tenant_id<>ordinary_tenant LIMIT 1;
  IF platform_user IS NULL OR ordinary_user IS NULL OR driver_id IS NULL OR
     employee_id IS NULL OR foreign_driver_id IS NULL THEN
    RAISE EXCEPTION 'Driver finance test actors unavailable';
  END IF;

  -- Link one existing record per source inside this rolled-back test transaction.
  UPDATE public.fms_travel_loan SET applicant_employee_id=employee_id
  WHERE id=(SELECT id FROM public.fms_travel_loan WHERE tenant_id=ordinary_tenant LIMIT 1);
  UPDATE public.fms_travel_repayment SET applicant_employee_id=employee_id
  WHERE id=(SELECT id FROM public.fms_travel_repayment WHERE tenant_id=ordinary_tenant LIMIT 1);
  UPDATE public.tms_expense_reimbursement SET applicant_employee_id=employee_id
  WHERE id=(SELECT id FROM public.tms_expense_reimbursement WHERE tenant_id=ordinary_tenant LIMIT 1);

  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub',platform_user,'role','authenticated')::text,true);
  PERFORM set_config('request.headers','{}',true);
  FOREACH kind IN ARRAY ARRAY['loan','repayment','reimbursement'] LOOP
    own_result:=public.tms_list_driver_finance_records_secure(driver_id,kind,0,0);
    IF (own_result->>'total')::integer<1 OR jsonb_array_length(own_result->'records')<>1 THEN
      RAISE EXCEPTION 'Platform-all % finance paging or exact employee join failed',kind;
    END IF;
  END LOOP;
  PERFORM set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope',ordinary_tenant)::text,true);
  BEGIN
    PERFORM public.tms_list_driver_finance_records_secure(foreign_driver_id,'loan',0,0);
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Platform-selected read crossed tenant'; END IF;

  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub',ordinary_user,'role','authenticated')::text,true);
  PERFORM set_config('request.headers','{}',true);
  own_result:=public.tms_list_driver_finance_records_secure(driver_id,'loan',0,0);
  IF (own_result->>'total')::integer<1 THEN
    RAISE EXCEPTION 'Ordinary user cannot read own linked driver loan';
  END IF;
  PERFORM set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope',foreign_tenant)::text,true);
  IF public.tms_list_driver_finance_records_secure(driver_id,'loan',0,0)
    IS DISTINCT FROM own_result THEN
    RAISE EXCEPTION 'Forged tenant header changed ordinary result';
  END IF;
  denied:=false;
  BEGIN
    PERFORM public.tms_list_driver_finance_records_secure(foreign_driver_id,'loan',0,0);
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Ordinary user read foreign driver finance'; END IF;
END;
$test$;

ROLLBACK;
