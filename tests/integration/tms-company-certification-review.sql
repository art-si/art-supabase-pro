BEGIN;
-- Restore the two QA requests to a pending fixture only inside this rolled-back test.
UPDATE public.tms_company_certification_request
SET status = 'pending', reviewed_by = NULL, reviewed_at = NULL, review_note = NULL
WHERE id IN (
  'ad6b49b2-62ee-41fa-8cc7-34dcb192e814',
  '5d9d3f95-d8bc-4c94-a94a-effb77dbc357'
);
-- An approved document followed by a pending change keeps the prior effective state.
UPDATE public.tms_company_certification_request
SET status = 'approved', reviewed_by = submitted_by, reviewed_at = now(), review_note = '验收样例旧版本'
WHERE id = 'e48ea794-d4bc-4a26-af0e-904f47941db0';
INSERT INTO public.tms_company_certification_request
  (tenant_id, section, status, payload, submitted_by)
SELECT tenant_id, section, 'pending', payload, submitted_by
FROM public.tms_company_certification_request
WHERE id = 'e48ea794-d4bc-4a26-af0e-904f47941db0';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','0a872664-874c-447d-a256-d0dbdca6ed45',true);
SELECT set_config('request.jwt.claims','{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
SELECT set_config('request.headers','{}',true);
DO $$
DECLARE v_result jsonb; v_count int; v_status text; v_effective boolean;
BEGIN
 SELECT x.status, x.effective_certified INTO v_status, v_effective
 FROM jsonb_to_recordset(public.tms_list_company_certification_secure(NULL))
  AS x(tenant_id uuid, section text, status text, effective_certified boolean)
 WHERE x.tenant_id = '2824c2b5-2774-4781-b995-f55e8bcee920' AND x.section = 'enterprise';
 IF v_status <> 'pending' OR NOT v_effective THEN
  RAISE EXCEPTION 'Approved document was not preserved during change review';
 END IF;
 v_result := public.tms_review_company_certification_secure('ad6b49b2-62ee-41fa-8cc7-34dcb192e814','approved','验收样例：仅内部资料审核，不代表钱包开户');
 IF v_result->>'status' <> 'approved' OR (v_result->>'effective_certified')::boolean THEN
  RAISE EXCEPTION 'Provider-dependent approval incorrectly certified';
 END IF;
 v_result := public.tms_review_company_certification_secure('5d9d3f95-d8bc-4c94-a94a-effb77dbc357','rejected','验收样例：签章服务尚未接入，请补充正式协议');
 IF v_result->>'status' <> 'rejected' THEN RAISE EXCEPTION 'Rejection failed'; END IF;
 SELECT jsonb_array_length(public.tms_list_company_certification_history_secure('2824c2b5-2774-4781-b995-f55e8bcee920','account')) INTO v_count;
 IF v_count < 1 THEN RAISE EXCEPTION 'History missing'; END IF;
 BEGIN
  PERFORM public.tms_review_company_certification_secure('ad6b49b2-62ee-41fa-8cc7-34dcb192e814','approved',NULL);
  RAISE EXCEPTION 'Repeat review unexpectedly allowed';
 EXCEPTION WHEN check_violation THEN NULL; END;
 PERFORM set_config('request.headers','{"x-art-tenant-scope":"111e83d3-190e-4405-84c8-440d484d13a6"}',true);
 IF jsonb_array_length(public.tms_list_company_certification_history_secure(
   '111e83d3-190e-4405-84c8-440d484d13a6','e_signature'
 )) < 1 THEN RAISE EXCEPTION 'Platform-selected own-scope history missing'; END IF;
 BEGIN
  PERFORM public.tms_list_company_certification_history_secure('2824c2b5-2774-4781-b995-f55e8bcee920','account');
  RAISE EXCEPTION 'Selected tenant cross-read unexpectedly allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.tms_review_company_certification_secure('ad6b49b2-62ee-41fa-8cc7-34dcb192e814','approved',NULL);
  RAISE EXCEPTION 'Selected tenant cross-review unexpectedly allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claim.sub','5774aa51-3bbb-4da5-abd4-7ea44b44ea6a',true);
 PERFORM set_config('request.jwt.claims','{"sub":"5774aa51-3bbb-4da5-abd4-7ea44b44ea6a","role":"authenticated"}',true);
 PERFORM set_config('request.headers','{"x-art-tenant-scope":"2824c2b5-2774-4781-b995-f55e8bcee920"}',true);
 IF public.tms_list_company_certification_history_secure(
   '7529f951-938e-4e2c-ac0d-316c136ae1f9','account'
 ) <> '[]'::jsonb THEN RAISE EXCEPTION 'Ordinary own-scope history failed'; END IF;
 BEGIN
  PERFORM public.tms_list_company_certification_history_secure(
   '2824c2b5-2774-4781-b995-f55e8bcee920','account'
  );
  RAISE EXCEPTION 'Ordinary forged-header cross-read unexpectedly allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.tms_review_company_certification_secure('ad6b49b2-62ee-41fa-8cc7-34dcb192e814','approved',NULL);
  RAISE EXCEPTION 'Ordinary review unexpectedly allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT 'certification review security passed' AS result;
ROLLBACK;
