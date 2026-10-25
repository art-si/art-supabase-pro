-- Transaction-only callback fixtures. Does not approve or change existing business records.
BEGIN;
DO $test$
DECLARE
  source_record public.fms_travel_application;
  fixture_id uuid;
  fixture public.fms_travel_application;
  position integer;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'This verification requires an unbound administrative SQL session';
  END IF;
  IF has_function_privilege('anon', 'public.prepare_fms_travel_application_reimbursement_secure(uuid)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'app_private.execute_fms_travel_application_workflow_callback(uuid,text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Travel workflow RPC privileges are too broad';
  END IF;
  BEGIN
    PERFORM public.prepare_fms_travel_application_reimbursement_secure(gen_random_uuid());
    RAISE EXCEPTION 'Unauthenticated preparation unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  SELECT * INTO source_record FROM public.fms_travel_application
  WHERE status='draft' AND requested_amount>0 ORDER BY id LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'A draft shape is required for transaction-only fixtures'; END IF;
  FOR position IN 1..2 LOOP
    fixture_id:=gen_random_uuid();
    INSERT INTO public.fms_travel_application
    SELECT (jsonb_populate_record(NULL::public.fms_travel_application,
      to_jsonb(source_record)||jsonb_build_object('id',fixture_id,
        'application_no','QA-WORKFLOW-'||fixture_id::text,'status','draft',
        'approved_amount',NULL,'current_handler',NULL,'rejection_opinion',NULL,
        'reason','Transaction-only travel workflow verification',
        'create_by','workflow-verification','update_by','workflow-verification'))).*;
    PERFORM app_private.execute_fms_travel_application_workflow_callback(fixture_id,'running','QA reviewer',NULL);
    SELECT * INTO fixture FROM public.fms_travel_application WHERE id=fixture_id;
    IF fixture.status<>'pending_review' OR fixture.approved_amount IS NOT NULL OR fixture.current_handler<>'QA reviewer' THEN
      RAISE EXCEPTION 'Running callback mismatch';
    END IF;
    PERFORM app_private.execute_fms_travel_application_workflow_callback(fixture_id,'rejected','QA reviewer','补齐行程依据');
    SELECT * INTO fixture FROM public.fms_travel_application WHERE id=fixture_id;
    IF fixture.status<>'rejected' OR fixture.rejection_opinion<>'补齐行程依据' OR fixture.current_handler IS NOT NULL THEN
      RAISE EXCEPTION 'Rejection callback mismatch';
    END IF;
    PERFORM app_private.execute_fms_travel_application_workflow_callback(fixture_id,'withdrawn','QA reviewer',NULL);
    SELECT * INTO fixture FROM public.fms_travel_application WHERE id=fixture_id;
    IF fixture.status<>'draft' OR fixture.rejection_opinion IS NOT NULL THEN
      RAISE EXCEPTION 'Withdrawal callback mismatch';
    END IF;
    PERFORM app_private.execute_fms_travel_application_workflow_callback(fixture_id,'running','QA reviewer',NULL);
    PERFORM app_private.execute_fms_travel_application_workflow_callback(fixture_id,'approved','QA reviewer',NULL);
    SELECT * INTO fixture FROM public.fms_travel_application WHERE id=fixture_id;
    IF fixture.status<>'approved' OR fixture.approved_amount IS DISTINCT FROM source_record.requested_amount
      OR fixture.current_handler IS NOT NULL OR fixture.rejection_opinion IS NOT NULL THEN
      RAISE EXCEPTION 'Approval callback mismatch';
    END IF;
  END LOOP;
END $test$;
SELECT 'two transaction-only travel callback fixtures passed' AS verification;
ROLLBACK;
