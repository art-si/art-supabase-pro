-- Submit-return certification state must agree with the list contract.
-- The four QA rows are changed only inside this rolled-back transaction.
BEGIN;
UPDATE public.tms_company_certification_request
SET status = 'approved',
    reviewed_by = submitted_by,
    reviewed_at = now(),
    review_note = '事务内接口回归样例'
WHERE id IN (
  'ad6b49b2-62ee-41fa-8cc7-34dcb192e814',
  '5d9d3f95-d8bc-4c94-a94a-effb77dbc357',
  'e48ea794-d4bc-4a26-af0e-904f47941db0',
  'f70740c8-db62-426c-b75d-55d2297bc023'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '0a872664-874c-447d-a256-d0dbdca6ed45', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',
  true
);
SELECT set_config('request.headers', '{}', true);

DO $$
DECLARE
  v_result jsonb;
  v_payload jsonb;
  v_section text;
  v_tenant uuid;
  v_expected boolean;
  v_list_effective boolean;
BEGIN
  FOR v_section, v_tenant, v_expected IN
    SELECT * FROM (VALUES
      ('account', '2824c2b5-2774-4781-b995-f55e8bcee920'::uuid, false),
      ('e_signature', '111e83d3-190e-4405-84c8-440d484d13a6'::uuid, false),
      ('enterprise', '2824c2b5-2774-4781-b995-f55e8bcee920'::uuid, true),
      ('road_permit', '2824c2b5-2774-4781-b995-f55e8bcee920'::uuid, true)
    ) AS fixture(section, tenant_id, expected)
  LOOP
    SELECT x.payload INTO v_payload
    FROM jsonb_to_recordset(public.tms_list_company_certification_secure(v_tenant))
      AS x(section text, payload jsonb)
    WHERE x.section = v_section;
    IF v_payload IS NULL THEN
      RAISE EXCEPTION 'Fixture payload missing for %', v_section;
    END IF;

    v_result := public.tms_submit_company_certification_secure(v_tenant, v_section, v_payload);
    IF v_result->>'status' <> 'pending'
      OR (v_result->>'effective_certified')::boolean IS DISTINCT FROM v_expected THEN
      RAISE EXCEPTION 'Submit certification state mismatch for %', v_section;
    END IF;

    SELECT x.effective_certified INTO v_list_effective
    FROM jsonb_to_recordset(public.tms_list_company_certification_secure(v_tenant))
      AS x(section text, effective_certified boolean)
    WHERE x.section = v_section;
    IF v_list_effective IS DISTINCT FROM v_expected THEN
      RAISE EXCEPTION 'List certification state mismatch for %', v_section;
    END IF;
  END LOOP;
END $$;

SELECT 'company certification submit/list status regression passed' AS result;
ROLLBACK;
