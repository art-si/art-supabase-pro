-- Real database triggers; all six fixtures and related workflow rows are rolled back.
BEGIN;
DO $test$
DECLARE
  source_instance public.wf_instance;
  source_task public.wf_task;
  source_json jsonb;
  target_table text;
  business_type text;
  number_column text;
  business_id uuid;
  instance_id uuid;
  task_id uuid;
  actual_handler text;
  position integer;
BEGIN
  IF auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'Requires unbound administrative session'; END IF;
  SELECT i.* INTO source_instance FROM public.wf_instance i
  WHERE i.business_type='fms_travel_application' AND i.status='running' ORDER BY i.id LIMIT 1;
  SELECT t.* INTO source_task FROM public.wf_task t WHERE t.instance_id=source_instance.id
    AND t.status='pending' ORDER BY t.id LIMIT 1;
  IF source_task.id IS NULL THEN RAISE EXCEPTION 'Running workflow fixture shape required'; END IF;
  IF has_function_privilege('authenticated','app_private.sync_fms_workflow_current_handler(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Internal synchronization helper must not be browser callable'; END IF;
  FOREACH target_table IN ARRAY ARRAY['fms_travel_application','fms_travel_loan','fms_travel_repayment'] LOOP
    business_type:=target_table;
    number_column:=CASE target_table WHEN 'fms_travel_application' THEN 'application_no'
      WHEN 'fms_travel_loan' THEN 'loan_no' ELSE 'repayment_no' END;
    EXECUTE format('select to_jsonb(s) from public.%I s where tenant_id=$1 order by id limit 1',target_table)
      INTO source_json USING source_instance.tenant_id;
    IF source_json IS NULL THEN RAISE EXCEPTION 'Missing source shape: %',target_table; END IF;
    FOR position IN 1..2 LOOP
      business_id:=gen_random_uuid(); instance_id:=gen_random_uuid(); task_id:=gen_random_uuid();
      EXECUTE format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',target_table,target_table)
      USING source_json||jsonb_build_object('id',business_id,number_column,'QA-HANDLER-'||business_id::text,
        'current_handler','错误的操作人');
      INSERT INTO public.wf_instance
      SELECT (jsonb_populate_record(NULL::public.wf_instance,to_jsonb(source_instance)||
        jsonb_build_object('id',instance_id,'business_id',business_id,'business_type',business_type,
          'current_node_key','handler-review'))).*;
      INSERT INTO public.wf_task
      SELECT (jsonb_populate_record(NULL::public.wf_task,to_jsonb(source_task)||
        jsonb_build_object('id',task_id,'instance_id',instance_id,'node_key','handler-review',
          'assignee_name_snapshot','验收审批人甲'))).*;
      EXECUTE format('select current_handler from public.%I where id=$1',target_table) INTO actual_handler USING business_id;
      IF actual_handler IS DISTINCT FROM '验收审批人甲' THEN RAISE EXCEPTION '% initial assignment mismatch',target_table; END IF;
      UPDATE public.wf_task SET assignee_name_snapshot='验收审批人乙' WHERE id=task_id;
      EXECUTE format('select current_handler from public.%I where id=$1',target_table) INTO actual_handler USING business_id;
      IF actual_handler IS DISTINCT FROM '验收审批人乙' THEN RAISE EXCEPTION '% reassignment mismatch',target_table; END IF;
      UPDATE public.wf_task SET status='approved' WHERE id=task_id;
      EXECUTE format('select current_handler from public.%I where id=$1',target_table) INTO actual_handler USING business_id;
      IF actual_handler IS NOT NULL THEN RAISE EXCEPTION '% completed task retained handler',target_table; END IF;
      UPDATE public.wf_task SET status='pending' WHERE id=task_id;
      UPDATE public.wf_instance SET current_node_key='handler-next' WHERE id=instance_id;
      EXECUTE format('select current_handler from public.%I where id=$1',target_table) INTO actual_handler USING business_id;
      IF actual_handler IS NOT NULL THEN RAISE EXCEPTION '% previous node leaked handler',target_table; END IF;
      UPDATE public.wf_task SET node_key='handler-next' WHERE id=task_id;
      EXECUTE format('select current_handler from public.%I where id=$1',target_table) INTO actual_handler USING business_id;
      IF actual_handler IS DISTINCT FROM '验收审批人乙' THEN RAISE EXCEPTION '% next node mismatch',target_table; END IF;
      UPDATE public.wf_instance SET status='approved' WHERE id=instance_id;
      EXECUTE format('select current_handler from public.%I where id=$1',target_table) INTO actual_handler USING business_id;
      IF actual_handler IS NOT NULL THEN RAISE EXCEPTION '% terminal workflow retained handler',target_table; END IF;
    END LOOP;
  END LOOP;
END $test$;
ROLLBACK;
SELECT 'six fixtures: assignment, transfer, decision, next-node and completion handlers passed; rolled back' AS verification;
