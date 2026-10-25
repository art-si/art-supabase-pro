-- Run against the candidate or deployed monthly-plan functions; never retain fixtures.
BEGIN;
INSERT INTO public.sys_role_menu(role_id,menu_id,tenant_id)
SELECT r.id,m.id,r.tenant_id FROM public.sys_role r
JOIN public.sys_user u ON u.tenant_id=r.tenant_id AND r.role_code=ANY(u.user_roles)
CROSS JOIN public.sys_menu m
WHERE u.auth_user_id='ab881b32-87d4-4dce-9014-ce488b8069df'
AND m.name='TmsReportMonthlyOverview:MaintainBudget'
ON CONFLICT DO NOTHING;
DO $test$
DECLARE j jsonb; actor uuid; platform_tenant uuid; amount numeric;
  own_tenant uuid:='7529f951-938e-4e2c-ac0d-316c136ae1f9';
  other_tenant uuid:='6675a0d6-3ff6-4ab7-bb09-232d85ae96ad';
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
  PERFORM set_config('request.headers','{}',true);
  j:=public.tms_save_monthly_plan_secure('2099-09-01','revenue',20000,25000,'事务验收');
  IF j->>'tenant_id' IS DISTINCT FROM own_tenant::text OR (j->>'revision')::int<>1 THEN
    RAISE EXCEPTION 'Create tenant/revision mismatch'; END IF;
  j:=public.tms_save_monthly_plan_secure('2099-09-01','profit',-1000,0,'允许负毛利预算');
  IF (j->>'budget')::numeric<>-1000 THEN RAISE EXCEPTION 'Negative profit lost'; END IF;
  PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
  j:=public.tms_save_monthly_plan_secure('2099-09-01','revenue',21000,26000,'伪造头仍归属自身',null,1);
  IF j->>'tenant_id' IS DISTINCT FROM own_tenant::text OR (j->>'revision')::int<>2 THEN
    RAISE EXCEPTION 'Forged header changed ownership'; END IF;
  BEGIN
    PERFORM public.tms_save_monthly_plan_secure('2099-09-01','revenue',1,1,'陈旧版本',null,1);
    RAISE EXCEPTION 'Stale revision accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN
    PERFORM public.tms_save_monthly_plan_secure('2099-09-01','revenue',1,1,'越权',other_tenant);
    RAISE EXCEPTION 'Ordinary cross tenant write accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  FOREACH amount IN ARRAY ARRAY[-1,101,'NaN'::numeric,'Infinity'::numeric] LOOP
    BEGIN
      PERFORM public.tms_save_monthly_plan_secure('2099-09-01','loading',amount,85);
      RAISE EXCEPTION 'Invalid percentage accepted: %',amount;
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  END LOOP;
  j:=public.tms_get_monthly_plans_secure('2099-09-01');
  IF jsonb_array_length(j->'metrics')<>16 OR jsonb_array_length(j->'records')<>2 THEN
    RAISE EXCEPTION 'Metric catalogue or own records mismatch'; END IF;

  SELECT auth_user_id,tenant_id INTO STRICT actor,platform_tenant FROM public.sys_user
  WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  PERFORM set_config('request.headers','{}',true);
  j:=public.tms_save_monthly_plan_secure('2099-09-01','revenue',100,200);
  IF j->>'tenant_id' IS DISTINCT FROM platform_tenant::text THEN RAISE EXCEPTION 'Platform root default mismatch'; END IF;
  j:=public.tms_save_monthly_plan_secure('2099-09-01','revenue',300,400,'明确目标',other_tenant);
  j:=public.tms_save_monthly_plan_secure('2099-09-01','revenue',301,401,'全部租户编辑',other_tenant,1);
  IF j->>'tenant_id' IS DISTINCT FROM other_tenant::text OR (j->>'revision')::int<>2 THEN
    RAISE EXCEPTION 'Platform all edit mismatch'; END IF;
  j:=public.tms_get_monthly_plans_secure('2099-09-01');
  IF jsonb_array_length(j->'records')<>4 THEN RAISE EXCEPTION 'Platform all read mismatch'; END IF;
  PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
  j:=public.tms_get_monthly_plans_secure('2099-09-01');
  IF jsonb_array_length(j->'records')<>1 THEN RAISE EXCEPTION 'Selected scope leaked'; END IF;
  BEGIN
    PERFORM public.tms_save_monthly_plan_secure('2099-09-01','revenue',1,1,'错误目标',own_tenant,2);
    RAISE EXCEPTION 'Platform selected foreign write accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  PERFORM set_config('request.jwt.claims','{"sub":"9850d41a-77e9-40a7-b2cb-0ad02ac01440","role":"authenticated"}',true);
  PERFORM set_config('request.headers','{}',true);
  BEGIN
    PERFORM public.tms_save_monthly_plan_secure('2099-09-01','revenue',1,1);
    RAISE EXCEPTION 'Unauthorized budget write accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF has_function_privilege('anon','public.tms_save_monthly_plan_secure(date,text,numeric,numeric,text,uuid,integer)','EXECUTE')
    OR has_table_privilege('authenticated','public.tms_monthly_plan','INSERT') THEN
    RAISE EXCEPTION 'Uncontrolled write grant'; END IF;
END $test$;
ROLLBACK;
