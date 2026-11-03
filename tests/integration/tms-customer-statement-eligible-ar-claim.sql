-- Regression fixture: the VMS report-acceptance tenant has signed waybills
-- already claimed by FMS receivable estimates. The chooser must hide them,
-- while keeping genuinely unclaimed waybills available.
BEGIN;

DO $fixture$
BEGIN
  IF (SELECT count(*)
      FROM public.fms_receivable_line l
      JOIN public.fms_receivable_document d ON d.id = l.document_id
      WHERE d.kind = 'estimate'
        AND d.source_type = 'tms_signed_waybill'
        AND d.tenant_id = '7529f951-938e-4e2c-ac0d-316c136ae1f9'
        AND l.source_line_id IN (
          'a9fc0005-1023-4620-9220-000000000005',
          'a9fc0005-1023-4620-9220-000000000006'
        )) <> 2 THEN
    RAISE EXCEPTION 'Expected two FMS-claimed acceptance orders';
  END IF;
END;
$fixture$;

SET LOCAL ROLE authenticated;

DO $test$
DECLARE
  acceptance_tenant uuid := '7529f951-938e-4e2c-ac0d-316c136ae1f9';
  other_tenant uuid := '028e6a68-a9db-4055-974c-1e05bfe94b0f';
  platform_user uuid := '0a872664-874c-447d-a256-d0dbdca6ed45';
  ordinary_user uuid := 'ab881b32-87d4-4dce-9014-ce488b8069df';
  unclaimed_customer uuid := '6bdbb893-00da-4727-b50b-84378066620e';
  customer_id uuid;
  response jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', platform_user::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', platform_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', '{}', true);
  response := public.tms_list_customer_statement_eligible_waybills_secure(
    unclaimed_customer, '2026-01-01', '2027-12-31', NULL, 0, 20
  );
  IF (response->>'total')::integer <> 2
     OR jsonb_array_length(response->'records') <> 2 THEN
    RAISE EXCEPTION 'Platform all-tenant eligible list lost unclaimed rows';
  END IF;

  PERFORM set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope', acceptance_tenant)::text, true);
  response := public.tms_list_customer_statement_eligible_waybills_secure(
    unclaimed_customer, '2026-01-01', '2027-12-31', NULL, 0, 20
  );
  IF (response->>'total')::integer <> 2
     OR jsonb_array_length(response->'records') <> 2 THEN
    RAISE EXCEPTION 'Platform selected-tenant eligible list lost matching rows';
  END IF;

  PERFORM set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope', other_tenant)::text, true);
  response := public.tms_list_customer_statement_eligible_waybills_secure(
    unclaimed_customer, '2026-01-01', '2027-12-31', NULL, 0, 20
  );
  IF (response->>'total')::integer <> 0
     OR jsonb_array_length(response->'records') <> 0 THEN
    RAISE EXCEPTION 'Platform selected-tenant eligible list leaked another tenant';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', ordinary_user::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', ordinary_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', '{}', true);
  FOREACH customer_id IN ARRAY ARRAY[
    'a9fc0001-1023-4620-9220-000000000001'::uuid,
    'a9fc0001-1023-4620-9220-000000000002'::uuid
  ] LOOP
    response := public.tms_list_customer_statement_eligible_waybills_secure(
      customer_id, '2026-01-01', '2027-12-31', NULL, 0, 20
    );
    IF (response->>'total')::integer <> 0
       OR jsonb_array_length(response->'records') <> 0 THEN
      RAISE EXCEPTION 'FMS-claimed order exposed for customer %', customer_id;
    END IF;
  END LOOP;

  response := public.tms_list_customer_statement_eligible_waybills_secure(
    unclaimed_customer,
    '2026-01-01', '2027-12-31', NULL, 0, 20
  );
  IF (response->>'total')::integer <> 2
     OR jsonb_array_length(response->'records') <> 2 THEN
    RAISE EXCEPTION 'Unclaimed waybills were incorrectly hidden';
  END IF;

  PERFORM set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope', other_tenant)::text, true);
  response := public.tms_list_customer_statement_eligible_waybills_secure(
    unclaimed_customer, '2026-01-01', '2027-12-31', NULL, 0, 20
  );
  IF (response->>'total')::integer <> 2
     OR jsonb_array_length(response->'records') <> 2 THEN
    RAISE EXCEPTION 'Forged tenant header changed ordinary eligible scope';
  END IF;
END;
$test$;

ROLLBACK;
