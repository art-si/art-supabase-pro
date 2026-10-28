BEGIN;

DO $test$
DECLARE
  qa_tenant uuid := '7529f951-938e-4e2c-ac0d-316c136ae1f9';
  super_auth uuid := '0a872664-874c-447d-a256-d0dbdca6ed45';
  super_user uuid := '51760251-629d-4561-aeb8-0fbe62352494';
  v_unprofiled uuid := gen_random_uuid();
  v_self uuid;
  v_disabled uuid;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', super_auth::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', super_auth, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', '{}', true);

  BEGIN
    PERFORM public.tms_create_driver_secure(jsonb_build_object(
      'driver_name', 'QA省略档案回滚',
      'phone', '13900002043',
      'gender', 'male',
      'id_card_no', '110101199001010013',
      'license_type', 'A2',
      'target_tenant_id', qa_tenant
    ));
    RAISE EXCEPTION 'Driver create without ownership profile succeeded';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;

  -- Privileged fixture simulates historical/imported malformed data; ordinary
  -- authenticated users have no direct INSERT grant on mdm_driver.
  INSERT INTO public.mdm_driver (
    id, tenant_id, driver_name, phone, gender, id_card_no,
    license_type, driver_type, enabled, created_by_user_id
  ) VALUES (
    v_unprofiled, qa_tenant, 'QA无档案门槛回滚', '13900002046',
    'male', '110101199001010016', 'A2', 'primary', true, super_user
  );
  IF EXISTS (SELECT 1 FROM public.tms_driver_profile
      WHERE driver_id = v_unprofiled) THEN
    RAISE EXCEPTION 'Malformed fixture unexpectedly has profile';
  END IF;
  BEGIN
    UPDATE public.tms_order
    SET dispatch_status = 'loaded', dispatch_driver_id = v_unprofiled
    WHERE id = '9a9679c3-1b4e-4e01-8012-60b1087e0fb7';
    RAISE EXCEPTION 'Unprofiled driver bypassed dispatch guard';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    IF position('档案' IN SQLERRM) = 0 THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.tms_waybill
    SET driver_id = v_unprofiled, status = 'accepted'
    WHERE id = 'baee5a01-6ac6-4fd9-858a-67ffd14e554a';
    RAISE EXCEPTION 'Unprofiled driver bypassed waybill accept guard';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    IF position('档案' IN SQLERRM) = 0 THEN RAISE; END IF;
  END;

  v_self := public.tms_create_driver_secure(jsonb_build_object(
    'driver_name', 'QA自有司机门槛回滚',
    'phone', '13900002044',
    'gender', 'male',
    'id_card_no', '110101199001010014',
    'license_type', 'A2',
    'target_tenant_id', qa_tenant,
    'profile', jsonb_build_object(
      'driver_ownership', 'self', 'driver_status', 'on_duty')
  ));
  PERFORM app_private.tms_assert_driver_certified(qa_tenant, v_self, 'self');

  v_disabled := public.tms_create_driver_secure(jsonb_build_object(
    'driver_name', 'QA停岗司机门槛回滚',
    'phone', '13900002045',
    'gender', 'male',
    'id_card_no', '110101199001010015',
    'license_type', 'A2',
    'enabled', false,
    'target_tenant_id', qa_tenant,
    'profile', jsonb_build_object(
      'driver_ownership', 'self', 'driver_status', 'suspended')
  ));
  BEGIN
    PERFORM app_private.tms_assert_driver_certified(qa_tenant, v_disabled, 'self');
    RAISE EXCEPTION 'Disabled self-owned driver bypassed availability guard';
  EXCEPTION WHEN SQLSTATE '23514' THEN NULL;
  END;
END $test$;

ROLLBACK;
