-- Run after deploying tms_get_customer_address_delete_dependencies_secure.
-- All temporary address creation/deletion is rolled back.
BEGIN;
SET LOCAL ROLE authenticated;

DO $test$
DECLARE
  platform_user uuid := '0a872664-874c-447d-a256-d0dbdca6ed45';
  ordinary_user uuid := 'ab881b32-87d4-4dce-9014-ce488b8069df';
  no_delete_user uuid := '543f8dea-2e27-4fe0-b009-f80d86155be6';
  own_tenant uuid := '7529f951-938e-4e2c-ac0d-316c136ae1f9';
  other_tenant uuid := '028e6a68-a9db-4055-974c-1e05bfe94b0f';
  referenced_address uuid := '1035d8b1-0385-43b3-81c2-715ff1466d52';
  price_address uuid := '74c64a43-fd95-4da8-ae3a-ef11d4208771';
  foreign_address uuid := '4ba5fab0-6bdc-4c37-b699-240fe9e07f92';
  temporary_address uuid;
  expected_count integer;
  n integer;
  denied boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', platform_user::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', platform_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', '{}', true);
  SELECT count(*) INTO expected_count
  FROM public.tms_get_customer_address_delete_dependencies_secure(ARRAY[referenced_address]);
  IF expected_count < 3 THEN RAISE EXCEPTION 'Platform all-tenant address references missing'; END IF;

  PERFORM set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope', own_tenant)::text, true);
  SELECT count(*) INTO n
  FROM public.tms_get_customer_address_delete_dependencies_secure(ARRAY[referenced_address]);
  IF n <> expected_count THEN RAISE EXCEPTION 'Platform selected own-tenant mismatch'; END IF;
  PERFORM set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope', other_tenant)::text, true);
  denied := false;
  BEGIN
    PERFORM 1 FROM public.tms_get_customer_address_delete_dependencies_secure(ARRAY[referenced_address]);
  EXCEPTION WHEN SQLSTATE '42501' THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Platform selected other tenant accessed address'; END IF;

  PERFORM set_config('request.jwt.claim.sub', ordinary_user::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', ordinary_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', '{}', true);
  SELECT count(*) INTO n
  FROM public.tms_get_customer_address_delete_dependencies_secure(ARRAY[referenced_address]);
  IF n <> expected_count THEN RAISE EXCEPTION 'Ordinary own-tenant address references missing'; END IF;
  IF (SELECT count(*) FROM public.tms_get_customer_address_delete_dependencies_secure(
    ARRAY[price_address]
  ) WHERE dependency_code = 'address_customer_price') < 1 THEN
    RAISE EXCEPTION 'SET NULL customer-price reference was missed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.tms_get_customer_address_delete_dependencies_secure(ARRAY[referenced_address])
    WHERE record_amount IS NOT NULL OR cleanup_allowed
  ) THEN
    RAISE EXCEPTION 'Address reader leaked amounts or allowed dependent cleanup';
  END IF;
  IF (SELECT count(*) FROM public.tms_get_customer_address_delete_dependencies_secure(
    ARRAY[]::uuid[]
  )) <> 0 THEN RAISE EXCEPTION 'Empty address request returned dependencies'; END IF;

  PERFORM set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope', other_tenant)::text, true);
  SELECT count(*) INTO n
  FROM public.tms_get_customer_address_delete_dependencies_secure(ARRAY[referenced_address]);
  IF n <> expected_count THEN RAISE EXCEPTION 'Forged header changed ordinary address scope'; END IF;
  denied := false;
  BEGIN
    PERFORM 1 FROM public.tms_get_customer_address_delete_dependencies_secure(ARRAY[foreign_address]);
  EXCEPTION WHEN SQLSTATE '42501' THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Ordinary user accessed foreign address'; END IF;

  PERFORM set_config('request.headers', '{}', true);
  temporary_address := public.tms_create_customer_address_secure(
    '{"customer_id":"a9fc0001-1023-4620-9220-000000000001","address_type":"shipping","party_name":"验收临时客户地址","address_short_name":"删除守卫预演","contact_name":"验收联系人","contact_phone":"13900009999","region":"河北省/邯郸市/武安市","address_detail":"验收临时地址 1 号","is_default":false}'::jsonb
  );
  IF (SELECT count(*) FROM public.tms_get_customer_address_delete_dependencies_secure(
    ARRAY[temporary_address]
  )) <> 0 THEN RAISE EXCEPTION 'Temporary address unexpectedly referenced'; END IF;
  IF NOT public.tms_delete_customer_address_secure(temporary_address) THEN
    RAISE EXCEPTION 'Authorized no-reference address deletion failed';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', no_delete_user::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', no_delete_user, 'role', 'authenticated')::text, true);
  denied := false;
  BEGIN
    PERFORM 1 FROM public.tms_get_customer_address_delete_dependencies_secure(ARRAY[referenced_address]);
  EXCEPTION WHEN SQLSTATE '42501' THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'User without Delete read address dependencies'; END IF;
END;
$test$;

ROLLBACK;
