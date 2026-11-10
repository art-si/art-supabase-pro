-- A missing published workflow must block submission and roll back the draft.
BEGIN;
DO $test$
DECLARE
  actor public.sys_user%rowtype;
  target_order public.tms_order%rowtype;
  expense_item uuid;
  before_count integer;
  after_count integer;
  blocked boolean := false;
BEGIN
  SELECT * INTO STRICT actor
  FROM public.sys_user
  WHERE user_roles @> ARRAY['R_SUPER'] AND deleted_at IS NULL
  ORDER BY id
  LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub', actor.auth_user_id::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', actor.auth_user_id, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', '{}', true);

  SELECT o.* INTO STRICT target_order
  FROM public.tms_order o
  WHERE o.order_status <> 'cancelled'
    AND NOT EXISTS (
      SELECT 1 FROM public.wf_definition w
      WHERE w.tenant_id = o.tenant_id
        AND w.business_type = 'tms_abnormal_freight'
        AND w.status = 'published'
    )
    AND EXISTS (
      SELECT 1 FROM public.tms_expense_item i
      WHERE i.tenant_id = o.tenant_id AND i.is_enabled AND i.is_selectable
    )
  ORDER BY o.create_time DESC
  LIMIT 1;
  SELECT i.id INTO STRICT expense_item
  FROM public.tms_expense_item i
  WHERE i.tenant_id = target_order.tenant_id AND i.is_enabled AND i.is_selectable
  ORDER BY i.sort, i.item_code
  LIMIT 1;
  SELECT count(*) INTO before_count
  FROM public.tms_abnormal_freight WHERE order_id = target_order.id;

  BEGIN
    PERFORM public.tms_save_abnormal_freight_secure(
      target_order.id,
      jsonb_build_object(
        'ownership', 'own',
        'lines', jsonb_build_array(jsonb_build_object(
          'expense_item_id', expense_item,
          'amount', 1,
          'description', 'workflow-required regression',
          'occurred_at', now(),
          'attachments', '[]'::jsonb
        ))
      ),
      true
    );
  EXCEPTION WHEN check_violation THEN
    blocked := SQLERRM = '当前租户尚未配置已发布的异常费用审批流，请先配置并发布审批流程';
  END;

  IF NOT blocked THEN
    RAISE EXCEPTION 'Submission without a published workflow was not rejected';
  END IF;
  SELECT count(*) INTO after_count
  FROM public.tms_abnormal_freight WHERE order_id = target_order.id;
  IF after_count <> before_count THEN
    RAISE EXCEPTION 'Blocked submission left a persisted abnormal freight draft';
  END IF;
END
$test$;
ROLLBACK;
