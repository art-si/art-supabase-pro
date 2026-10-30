BEGIN;
SET LOCAL jit = off;
SET LOCAL statement_timeout = '15s';
SET LOCAL ROLE authenticated;

DO $own_vehicle_task_scope$
DECLARE
  home_tenant constant uuid := '7529f951-938e-4e2c-ac0d-316c136ae1f9';
  qa_tenant constant uuid := '2824c2b5-2774-4781-b995-f55e8bcee920';
  ordinary_actor constant uuid := 'ab881b32-87d4-4dce-9014-ce488b8069df';
  root_actor constant uuid := '0a872664-874c-447d-a256-d0dbdca6ed45';
  mode text;
  result jsonb;
  own_total integer;
  qa_total integer;
  qa_72_accepted boolean;
  qa_73_accepted boolean;
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
          THEN jsonb_build_object('x-art-tenant-scope', qa_tenant)::text
        WHEN mode = 'platform_selected'
          THEN jsonb_build_object('x-art-tenant-scope', home_tenant)::text
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
        WHERE row->>'waybillNo' = 'QA-OWN-20261027-01'
      ) THEN
        RAISE EXCEPTION 'Two same-tenant self-operated transport tasks are missing';
      END IF;
      IF NOT (result->>'canViewCosts')::boolean OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(result->'records') row
        WHERE row->>'waybillNo' = 'QA-OWN-20261027-01'
          AND (row->>'distanceKm')::numeric = 305.5
          AND (row->>'registeredTollFee')::numeric = 168
          AND (row->>'registeredOtherFee')::numeric = 45
          AND (row->>'approvedTollFee')::numeric = 0
          AND (row->>'approvedOtherFee')::numeric = 0
      ) THEN
        RAISE EXCEPTION 'Self-operated task must expose registered fees without approved-cost duplication';
      END IF;
    ELSIF mode = 'platform_all' THEN
      IF (result->>'total')::integer < own_total + 2
        OR NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(result->'records') row
          WHERE row->>'waybillNo' = 'YWD2026102800000072'
        )
        OR NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(result->'records') row
          WHERE row->>'waybillNo' = 'YWD2026102800000073'
        ) THEN
        RAISE EXCEPTION 'Platform-all omitted accepted QA self-operated tasks';
      END IF;
    ELSIF mode = 'platform_other' THEN
      qa_total := (result->>'total')::integer;
      IF qa_total < 2
        OR NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(result->'records') row
          WHERE row->>'waybillNo' = 'YWD2026102800000072'
        )
        OR NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(result->'records') row
          WHERE row->>'waybillNo' = 'YWD2026102800000073'
        ) THEN
        RAISE EXCEPTION 'Selected QA tenant omitted self-operated tasks';
      END IF;
      SELECT EXISTS (
        SELECT 1 FROM jsonb_array_elements(result->'records') row
        WHERE row->>'waybillNo' = 'YWD2026102800000072'
          AND row->>'status' = 'accepted'
      ) INTO qa_72_accepted;
      SELECT EXISTS (
        SELECT 1 FROM jsonb_array_elements(result->'records') row
        WHERE row->>'waybillNo' = 'YWD2026102800000073'
          AND row->>'status' = 'accepted'
      ) INTO qa_73_accepted;
      result := public.vms_list_own_vehicle_tasks_secure(0, 99, NULL, NULL, 'accepted');
      IF (qa_72_accepted AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(result->'records') row
        WHERE row->>'waybillNo' = 'YWD2026102800000072'
      )) OR (qa_73_accepted AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(result->'records') row
        WHERE row->>'waybillNo' = 'YWD2026102800000073'
      )) OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(result->'records') row
        WHERE row->>'status' <> 'accepted'
      ) THEN
        RAISE EXCEPTION 'Accepted status filter omitted or misclassified QA self-operated tasks';
      END IF;
    ELSIF (result->>'total')::integer <> own_total THEN
      RAISE EXCEPTION 'Tenant scope changed expected task count in mode %', mode;
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(result->'records') row
      WHERE row->>'waybillNo' IN (
        'QA-FUEL-20261027-02', 'QA-OWN-20261027-02', 'YD202608-002'
      )
    ) THEN
      RAISE EXCEPTION 'Non-self vehicle leaked into own-vehicle tasks in mode %', mode;
    END IF;
    IF mode IN ('ordinary_own', 'ordinary_forged', 'platform_selected')
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(result->'records') row
        WHERE row->>'waybillNo' IN ('YWD2026102800000072', 'YWD2026102800000073')
      ) THEN
      RAISE EXCEPTION 'QA tenant task leaked into home scope in mode %', mode;
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
