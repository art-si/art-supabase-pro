BEGIN;
SET LOCAL jit = off;
SET LOCAL statement_timeout = '15s';
SET LOCAL ROLE authenticated;

DO $own_vehicle_task_scope$
DECLARE
  qa_tenant constant uuid := '7529f951-938e-4e2c-ac0d-316c136ae1f9';
  other_tenant constant uuid := '2824c2b5-2774-4781-b995-f55e8bcee920';
  ordinary_actor constant uuid := 'ab881b32-87d4-4dce-9014-ce488b8069df';
  root_actor constant uuid := '0a872664-874c-447d-a256-d0dbdca6ed45';
  mode text;
  result jsonb;
  own_total integer;
BEGIN
  FOREACH mode IN ARRAY ARRAY['ordinary_own', 'ordinary_forged', 'platform_all', 'platform_selected', 'platform_other'] LOOP
    PERFORM set_config('request.jwt.claim.sub',
      CASE WHEN mode LIKE 'platform%' THEN root_actor ELSE ordinary_actor END::text, true);
    PERFORM set_config('request.jwt.claims',
      jsonb_build_object('sub', CASE WHEN mode LIKE 'platform%' THEN root_actor ELSE ordinary_actor END,
        'role', 'authenticated')::text, true);
    PERFORM set_config('request.headers',
      CASE
        WHEN mode = 'ordinary_forged' OR mode = 'platform_other'
          THEN jsonb_build_object('x-art-tenant-scope', other_tenant)::text
        WHEN mode = 'platform_selected'
          THEN jsonb_build_object('x-art-tenant-scope', qa_tenant)::text
        ELSE '{}'
      END, true);

    result := public.vms_list_own_vehicle_tasks_secure(0, 99, NULL, NULL, NULL);
    IF mode = 'ordinary_own' THEN
      own_total := (result->>'total')::integer;
      IF own_total < 2 OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(result->'records') row
        WHERE row->>'waybillNo' = 'QA-FUEL-20261027-01'
      ) OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(result->'records') row
        WHERE row->>'waybillNo' = 'QA-FUEL-20261027-02'
      ) THEN
        RAISE EXCEPTION 'Two same-tenant QA transport tasks are missing';
      END IF;
      IF NOT (result->>'canViewCosts')::boolean OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(result->'records') row
        WHERE row->>'waybillNo' = 'QA-OWN-20261027-01'
          AND (row->>'distanceKm')::numeric = 305.5
          AND (row->>'registeredTollFee')::numeric = 168
          AND (row->>'registeredOtherFee')::numeric = 45
          AND (row->>'approvedTollFee')::numeric = 0
          AND (row->>'approvedOtherFee')::numeric = 0
      ) OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(result->'records') row
        WHERE row->>'waybillNo' = 'QA-OWN-20261027-02'
          AND (row->>'distanceKm')::numeric = 352
          AND (row->>'registeredTollFee')::numeric = 205
          AND (row->>'registeredOtherFee')::numeric = 62
          AND (row->>'approvedTollFee')::numeric = 0
          AND (row->>'approvedOtherFee')::numeric = 0
      ) THEN
        RAISE EXCEPTION 'Two QA own-vehicle tasks must expose registered fees without approved-cost duplication';
      END IF;
    ELSIF mode = 'platform_other' THEN
      IF (result->>'total')::integer <> 0 THEN
        RAISE EXCEPTION 'Selected other tenant leaked own-vehicle tasks';
      END IF;
    ELSIF (result->>'total')::integer <> own_total THEN
      RAISE EXCEPTION 'Tenant scope changed expected task count in mode %', mode;
    END IF;
  END LOOP;

  PERFORM set_config('request.jwt.claim.sub', '9850d41a-77e9-40a7-b2cb-0ad02ac01440', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"9850d41a-77e9-40a7-b2cb-0ad02ac01440","role":"authenticated"}', true);
  PERFORM set_config('request.headers', '{}', true);
  BEGIN
    PERFORM public.vms_list_own_vehicle_tasks_secure(0, 0, NULL, NULL, NULL);
    RAISE EXCEPTION 'Unprivileged user could read own-vehicle tasks';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END $own_vehicle_task_scope$;

ROLLBACK;
