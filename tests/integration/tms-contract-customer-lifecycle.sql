-- Scoped project regression. Uses existing QA customer/contract/users; all writes roll back.
BEGIN;

DO $assert_schema$
BEGIN
  IF to_regprocedure('public.tms_copy_contract_secure(uuid)') IS NULL
     OR to_regprocedure('public.tms_terminate_contract_secure(uuid,text)') IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.sys_menu WHERE name='TmsContract:Copy')
     OR NOT EXISTS (SELECT 1 FROM public.sys_menu WHERE name='TmsContract:Submit')
     OR NOT EXISTS (SELECT 1 FROM public.sys_menu WHERE name='TmsContract:Terminate')
     OR has_function_privilege('anon','public.tms_copy_contract_secure(uuid)','EXECUTE')
     OR has_function_privilege('anon','public.tms_terminate_contract_secure(uuid,text)','EXECUTE')
  THEN RAISE EXCEPTION 'Contract lifecycle capability or API grant is missing'; END IF;
  IF EXISTS (SELECT 1 FROM public.tms_contract c JOIN public.mdm_customer u ON u.id=c.customer_id WHERE u.tenant_id<>c.tenant_id)
     OR EXISTS (SELECT 1 FROM public.tms_contract c JOIN public.mdm_carrier u ON u.id=c.carrier_id WHERE u.tenant_id<>c.tenant_id)
  THEN RAISE EXCEPTION 'Contract party tenant mismatch'; END IF;
END $assert_schema$;

-- Historical Add users received Copy; removing Add temporarily proves Copy cannot invoke arbitrary create.
DELETE FROM public.sys_role_menu
WHERE role_id='f8aedb77-7b00-4b9f-9138-1601bb897067'
  AND menu_id=(SELECT id FROM public.sys_menu WHERE name='TmsContract:Add');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','5774aa51-3bbb-4da5-abd4-7ea44b44ea6a',true);
DO $copy_only$
BEGIN
  IF NOT app_private.has_permission('TmsContract:Copy')
     OR app_private.has_permission('TmsContract:Add')
  THEN RAISE EXCEPTION 'Copy-only permission test role is invalid'; END IF;
  BEGIN
    PERFORM public.tms_create_contract_secure('{}'::jsonb);
    RAISE EXCEPTION 'Copy-only role invoked arbitrary contract creation';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END $copy_only$;
SELECT set_config('app.contract_copy_id',public.tms_copy_contract_secure('f9feeace-a487-4163-b597-9c25b5e5c645'::uuid)::text,true);
RESET ROLE;
DO $assert_copy$
DECLARE source_row public.tms_contract%ROWTYPE; copy_row public.tms_contract%ROWTYPE;
BEGIN
  SELECT * INTO source_row FROM public.tms_contract WHERE id='f9feeace-a487-4163-b597-9c25b5e5c645';
  SELECT * INTO copy_row FROM public.tms_contract WHERE id=current_setting('app.contract_copy_id')::uuid;
  IF copy_row.id IS NULL OR copy_row.tenant_id<>source_row.tenant_id
     OR copy_row.contract_status<>'draft' OR copy_row.contract_no=source_row.contract_no
     OR (copy_row.contract_amount IS NOT NULL AND copy_row.contract_amount IS DISTINCT FROM source_row.contract_amount)
     OR (copy_row.transport_unit_price IS NOT NULL AND copy_row.transport_unit_price IS DISTINCT FROM source_row.transport_unit_price)
  THEN RAISE EXCEPTION 'Copy changed tenant/status/number or fabricated protected pricing'; END IF;
END $assert_copy$;

-- A normal business user submits a copied draft through the published tenant flow.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','677f7f08-b69b-4b0e-a033-41a3f1b3011e',true);
SELECT set_config('request.headers','{}',true);
DO $submit_rights$
BEGIN
  IF app_private.is_driver_user() OR NOT app_private.has_permission('TmsContract:Submit')
  THEN RAISE EXCEPTION 'Ordinary workflow test user is not authorized'; END IF;
END $submit_rights$;
SELECT set_config('app.contract_draft_id',public.tms_copy_contract_secure('f9feeace-a487-4163-b597-9c25b5e5c645'::uuid)::text,true);
SELECT set_config('app.contract_instance_id',public.start_workflow(
  'tms_contract',current_setting('app.contract_draft_id')::uuid,'运输合同审批回归','{}'::jsonb,gen_random_uuid()::text
)::text,true);
RESET ROLE;
DO $assert_workflow$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.tms_contract c JOIN public.wf_instance w ON w.business_id=c.id AND w.business_type='tms_contract'
    WHERE c.id=current_setting('app.contract_draft_id')::uuid
      AND w.id=current_setting('app.contract_instance_id')::uuid
      AND c.contract_status='pending' AND w.status='running'
      AND (SELECT count(*) FROM public.wf_task t WHERE t.instance_id=w.id)=1
  ) THEN RAISE EXCEPTION 'Contract workflow did not enter pending with a task'; END IF;
END $assert_workflow$;

-- Platform-all child creation derives the linked customer's tenant while preserving the real creator.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','0a872664-874c-447d-a256-d0dbdca6ed45',true);
SELECT set_config('request.headers','{}',true);
SELECT set_config('app.contract_child_id',public.tms_create_contract_secure(jsonb_build_object(
  'contract_name','客户租户合同回归','business_contract_type','customer',
  'customer_id','d87b381a-658c-49b4-b5bd-d893c518ef2e',
  'billing_method','by_weight','sign_time',now(),'handler','回归经办人'
))::text,true);
RESET ROLE;
DO $assert_child$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tms_contract c
    WHERE c.id=current_setting('app.contract_child_id')::uuid
      AND c.tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9'
      AND c.created_by_user_id='51760251-629d-4561-aeb8-0fbe62352494')
  THEN RAISE EXCEPTION 'Platform-all contract child lost parent tenant or authenticated creator'; END IF;
END $assert_child$;

-- Concrete platform selection may not mutate another tenant's contract.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','0a872664-874c-447d-a256-d0dbdca6ed45',true);
SELECT set_config('request.headers','{"x-art-tenant-scope":"028e6a68-a9db-4055-974c-1e05bfe94b0f"}',true);
DO $selected_scope$
BEGIN
  BEGIN
    PERFORM public.tms_copy_contract_secure('f9feeace-a487-4163-b597-9c25b5e5c645');
    RAISE EXCEPTION 'Selected-tenant contract copy crossed scope';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
END $selected_scope$;
RESET ROLE;

-- Termination is audited and resolves reminders while preserving the source contract row.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','677f7f08-b69b-4b0e-a033-41a3f1b3011e',true);
SELECT set_config('request.headers','{"x-art-tenant-scope":"028e6a68-a9db-4055-974c-1e05bfe94b0f"}',true);
SELECT public.tms_terminate_contract_secure('f9feeace-a487-4163-b597-9c25b5e5c645'::uuid,'双方协商提前终止');
RESET ROLE;
DO $assert_termination$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tms_contract c
    WHERE c.id='f9feeace-a487-4163-b597-9c25b5e5c645'
      AND c.tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9'
      AND c.contract_status='terminated' AND c.termination_reason='双方协商提前终止'
      AND c.terminated_at IS NOT NULL AND c.terminated_by_user_id IS NOT NULL)
     OR NOT EXISTS (SELECT 1 FROM public.sys_notification_subject s
       WHERE s.business_type='tms_contract' AND s.business_id='f9feeace-a487-4163-b597-9c25b5e5c645'
         AND s.status='resolved')
  THEN RAISE EXCEPTION 'Terminated contract audit or reminder resolution is missing'; END IF;
END $assert_termination$;

ROLLBACK;
