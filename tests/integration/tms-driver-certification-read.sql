-- Certification reflects reviewed documents even when dispatch enforcement is disabled.
BEGIN;
SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claim.sub', 'ab881b32-87d4-4dce-9014-ce488b8069df', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',
  true
);
SELECT set_config('request.headers', '{}', true);

DO $test$
DECLARE
  individual_id uuid;
  self_id uuid;
  individual_status jsonb;
  self_status jsonb;
BEGIN
  SELECT id INTO STRICT individual_id
  FROM public.mdm_driver
  WHERE tenant_id = '7529f951-938e-4e2c-ac0d-316c136ae1f9'
    AND driver_name = '验收-TMS-司机-20261103-02';

  SELECT id INTO STRICT self_id
  FROM public.mdm_driver
  WHERE tenant_id = '7529f951-938e-4e2c-ac0d-316c136ae1f9'
    AND driver_name = '验收-TMS-司机-20261103-01';

  individual_status := public.tms_get_driver_certification_secure(individual_id);
  self_status := public.tms_get_driver_certification_secure(self_id);

  IF individual_status->>'required' <> 'true'
    OR individual_status->>'certified' <> 'false'
    OR individual_status->>'identityStatus' <> 'unverified'
    OR nullif(individual_status->>'reason', '') IS NULL THEN
    RAISE EXCEPTION 'Unverified individual driver must not be reported as certified: %', individual_status;
  END IF;

  IF self_status->>'required' <> 'false' OR self_status->>'certified' <> 'false' THEN
    RAISE EXCEPTION 'Self-operated driver should retain the existing exemption: %', self_status;
  END IF;
END;
$test$;

ROLLBACK;
