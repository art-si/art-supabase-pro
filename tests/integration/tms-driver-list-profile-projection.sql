BEGIN;

DO $test$
DECLARE
  sample_driver public.mdm_driver;
  projected jsonb;
BEGIN
  SELECT * INTO sample_driver FROM public.mdm_driver LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Driver profile projection test needs a driver'; END IF;

  projected := app_private.tms_driver_with_relations_to_secure_json(sample_driver);
  IF NOT (projected ?& ARRAY[
    'driver_ownership', 'company_name', 'registration_status',
    'identity_auth_status', 'license_auth_status', 'qualification_auth_status',
    'portrait_url'
  ]) THEN
    RAISE EXCEPTION 'Driver list profile fields are incomplete';
  END IF;
  IF projected->>'portrait_url' IS NOT NULL THEN
    RAISE EXCEPTION 'Unauthenticated projection exposed a private driver portrait';
  END IF;
END;
$test$;

ROLLBACK;
