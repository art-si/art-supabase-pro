-- Uses the report-acceptance tenant's marked carrier and an ordinary owner.
-- The temporary carrier is created and deleted only inside this transaction.
BEGIN;
SET LOCAL ROLE authenticated;

DO $test$
DECLARE
  owner_user uuid := 'ab881b32-87d4-4dce-9014-ce488b8069df';
  no_delete_user uuid := '5774aa51-3bbb-4da5-abd4-7ea44b44ea6a';
  platform_user uuid := '0a872664-874c-447d-a256-d0dbdca6ed45';
  own_tenant uuid := '7529f951-938e-4e2c-ac0d-316c136ae1f9';
  other_tenant uuid := '028e6a68-a9db-4055-974c-1e05bfe94b0f';
  qa_carrier uuid := 'a9fc0002-1023-4620-9220-000000000001';
  foreign_carrier uuid := '54eaf0e7-4ecf-4fdd-a6d5-2e8583e37c87';
  temporary_carrier uuid;
  expected_count integer;
  actual_count integer;
  denied boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', platform_user::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', platform_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', '{}', true);
  SELECT count(*) INTO expected_count
  FROM public.tms_get_carrier_delete_dependencies_secure(ARRAY[qa_carrier]);
  IF expected_count < 2 THEN
    RAISE EXCEPTION 'Platform all-tenant carrier references missing';
  END IF;

  PERFORM set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope', own_tenant)::text, true);
  SELECT count(*) INTO actual_count
  FROM public.tms_get_carrier_delete_dependencies_secure(ARRAY[qa_carrier]);
  IF actual_count <> expected_count THEN
    RAISE EXCEPTION 'Platform selected own-tenant references changed';
  END IF;

  PERFORM set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope', other_tenant)::text, true);
  denied := false;
  BEGIN
    PERFORM 1 FROM public.tms_get_carrier_delete_dependencies_secure(ARRAY[qa_carrier]);
  EXCEPTION WHEN SQLSTATE '42501' THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'Platform selected other tenant accessed carrier references';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', owner_user::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', owner_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', '{}', true);
  SELECT count(*) INTO actual_count
  FROM public.tms_get_carrier_delete_dependencies_secure(ARRAY[qa_carrier]);
  IF actual_count <> expected_count THEN
    RAISE EXCEPTION 'Ordinary own-tenant carrier references missing';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.tms_get_carrier_delete_dependencies_secure(ARRAY[qa_carrier])
    WHERE record_amount IS NOT NULL OR cleanup_allowed
  ) THEN
    RAISE EXCEPTION 'Carrier dependency reader exposed amounts or invalid cleanup';
  END IF;
  IF (SELECT count(*) FROM public.tms_get_carrier_delete_dependencies_secure(ARRAY[qa_carrier])
      WHERE dependency_code = 'carrier_vehicle') < 2 THEN
    RAISE EXCEPTION 'Carrier vehicle ownership references were missed';
  END IF;

  PERFORM set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope', other_tenant)::text, true);
  SELECT count(*) INTO actual_count
  FROM public.tms_get_carrier_delete_dependencies_secure(ARRAY[qa_carrier]);
  IF actual_count <> expected_count THEN
    RAISE EXCEPTION 'Forged header changed ordinary carrier scope';
  END IF;
  denied := false;
  BEGIN
    PERFORM 1 FROM public.tms_get_carrier_delete_dependencies_secure(ARRAY[foreign_carrier]);
  EXCEPTION WHEN SQLSTATE '42501' THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'Ordinary user accessed a foreign carrier';
  END IF;

  PERFORM set_config('request.headers', '{}', true);
  IF (SELECT count(*) FROM public.tms_get_carrier_delete_dependencies_secure(ARRAY[]::uuid[])) <> 0 THEN
    RAISE EXCEPTION 'Empty carrier request returned dependencies';
  END IF;
  temporary_carrier := public.tms_create_carrier_multi_secure(
    '{"company_name":"验收临时承运商·删除守卫预演","carrier_type":"city_distribution","dispatch_channel":"offline","carrier_types":["city_distribution"],"dispatch_channels":["offline"],"enabled":true}'::jsonb
  );
  IF (SELECT count(*) FROM public.tms_get_carrier_delete_dependencies_secure(ARRAY[temporary_carrier])) <> 0 THEN
    RAISE EXCEPTION 'Temporary carrier unexpectedly has dependencies';
  END IF;
  IF NOT public.tms_delete_carrier_secure(temporary_carrier) THEN
    RAISE EXCEPTION 'Authorized no-reference carrier deletion failed';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', no_delete_user::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', no_delete_user, 'role', 'authenticated')::text, true);
  denied := false;
  BEGIN
    PERFORM 1 FROM public.tms_get_carrier_delete_dependencies_secure(ARRAY[qa_carrier]);
  EXCEPTION WHEN SQLSTATE '42501' THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'User without TmsCarrier:Delete accessed delete dependencies';
  END IF;
END;
$test$;

ROLLBACK;
