-- Run after deploying get_tms_customer_statement_delete_dependencies_secure.
-- This transaction creates a valid temporary receipt/allocation against an
-- existing confirmed statement; all financial changes are rolled back.
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'ab881b32-87d4-4dce-9014-ce488b8069df', true);

DO $fixture$
DECLARE
  receipt_id uuid;
BEGIN
  INSERT INTO public.tms_cash_transaction(
    tenant_id, transaction_no, direction, customer_id,
    counterparty_name_snapshot, amount, allocated_amount,
    payment_method, status, remark
  ) VALUES (
    '7529f951-938e-4e2c-ac0d-316c136ae1f9', '', 'receipt',
    '6bdbb893-00da-4727-b50b-84378066620e',
    '平顶山富鑫选煤有限公司', 1, 0, 'bank_transfer',
    'pending_allocation', '验收临时核销引用检查'
  ) RETURNING id INTO receipt_id;

  INSERT INTO public.tms_cash_allocation(
    tenant_id, transaction_id, statement_id, customer_id, allocated_amount
  ) VALUES (
    '7529f951-938e-4e2c-ac0d-316c136ae1f9', receipt_id,
    'f0e9c9fe-0923-4c8b-b040-b8b8c404750e',
    '6bdbb893-00da-4727-b50b-84378066620e', 1
  );
END;
$fixture$;

SET LOCAL ROLE authenticated;
DO $test$
DECLARE
  platform_user uuid := '0a872664-874c-447d-a256-d0dbdca6ed45';
  ordinary_user uuid := 'ab881b32-87d4-4dce-9014-ce488b8069df';
  no_delete_user uuid := '543f8dea-2e27-4fe0-b009-f80d86155be6';
  own_tenant uuid := '7529f951-938e-4e2c-ac0d-316c136ae1f9';
  other_tenant uuid := '028e6a68-a9db-4055-974c-1e05bfe94b0f';
  statement_id text := 'f0e9c9fe-0923-4c8b-b040-b8b8c404750e';
  n integer;
  denied boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', platform_user::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', platform_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', '{}', true);
  SELECT count(*) INTO n
  FROM public.get_tms_customer_statement_delete_dependencies_secure(ARRAY[statement_id], NULL)
  WHERE source_table = 'tms_cash_allocation'
    AND record_no IS NOT NULL AND record_status = 'active';
  IF n <> 1 THEN RAISE EXCEPTION 'Platform all-tenant allocation reference missing'; END IF;

  PERFORM set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope', own_tenant)::text, true);
  SELECT count(*) INTO n
  FROM public.get_tms_customer_statement_delete_dependencies_secure(ARRAY[statement_id], NULL);
  IF n <> 1 THEN RAISE EXCEPTION 'Platform selected own tenant mismatch'; END IF;
  PERFORM set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope', other_tenant)::text, true);
  denied := false;
  BEGIN
    PERFORM 1 FROM public.get_tms_customer_statement_delete_dependencies_secure(ARRAY[statement_id], NULL);
  EXCEPTION WHEN SQLSTATE '42501' THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Platform selected other tenant accessed statement'; END IF;

  PERFORM set_config('request.jwt.claim.sub', ordinary_user::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', ordinary_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', '{}', true);
  SELECT count(*) INTO n
  FROM public.get_tms_customer_statement_delete_dependencies_secure(ARRAY[statement_id], NULL);
  IF n <> 1 THEN RAISE EXCEPTION 'Ordinary own-tenant reference missing'; END IF;
  SELECT count(*) INTO n
  FROM public.get_tms_customer_statement_delete_dependencies_secure(
    ARRAY[statement_id], 'tms_cash_allocation_statement_id_fkey'
  );
  IF n <> 1 THEN RAISE EXCEPTION 'Constraint-filtered allocation reference missing'; END IF;
  SELECT count(*) INTO n
  FROM public.get_tms_customer_statement_delete_dependencies_secure(
    ARRAY['3635b7e9-2198-4116-8800-3c7e4d7caeca'], NULL
  );
  IF n <> 0 THEN RAISE EXCEPTION 'Unreferenced draft statement has blockers'; END IF;
  IF (SELECT count(*) FROM public.get_tms_customer_statement_delete_dependencies_secure(
    ARRAY[]::text[], NULL
  )) <> 0 THEN RAISE EXCEPTION 'Empty statement input returned references'; END IF;

  PERFORM set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope', other_tenant)::text, true);
  SELECT count(*) INTO n
  FROM public.get_tms_customer_statement_delete_dependencies_secure(ARRAY[statement_id], NULL);
  IF n <> 1 THEN RAISE EXCEPTION 'Forged header changed ordinary statement scope'; END IF;

  PERFORM set_config('request.jwt.claim.sub', no_delete_user::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', no_delete_user, 'role', 'authenticated')::text, true);
  denied := false;
  BEGIN
    PERFORM 1 FROM public.get_tms_customer_statement_delete_dependencies_secure(ARRAY[statement_id], NULL);
  EXCEPTION WHEN SQLSTATE '42501' THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'User without Delete read statement dependencies'; END IF;
END;
$test$;

ROLLBACK;
