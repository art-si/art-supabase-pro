BEGIN;

DO $test$
DECLARE
  sample_driver public.mdm_driver;
  projected jsonb;
  mismatched_ownership_count integer;
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

  SELECT count(*) INTO mismatched_ownership_count
  FROM public.mdm_driver driver_row
  LEFT JOIN public.tms_driver_profile profile_row
    ON profile_row.driver_id = driver_row.id
   AND profile_row.tenant_id = driver_row.tenant_id
  WHERE app_private.tms_driver_with_relations_to_secure_json(driver_row)->>'driver_ownership'
    IS DISTINCT FROM coalesce(
      profile_row.driver_ownership,
      CASE WHEN driver_row.carrier_id IS NOT NULL THEN 'carrier' ELSE 'self' END
    );
  IF mismatched_ownership_count <> 0 THEN
    RAISE EXCEPTION 'Driver list ownership differs from profile or carrier affiliation: %',
      mismatched_ownership_count;
  END IF;
END;
$test$;

ROLLBACK;
