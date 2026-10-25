BEGIN;
DO $test$
DECLARE report jsonb; expected numeric; actor uuid; header jsonb;
BEGIN
  FOREACH actor IN ARRAY ARRAY['ab881b32-87d4-4dce-9014-ce488b8069df'::uuid,
    (SELECT auth_user_id FROM public.sys_user WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1)] LOOP
    IF actor IS NULL THEN RAISE EXCEPTION 'Missing test actor'; END IF;
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
    FOR header IN SELECT value FROM jsonb_array_elements('[{}, {"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}, {"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}]'::jsonb) LOOP
      PERFORM set_config('request.headers',header::text,true);
      SELECT coalesce(sum(c.amount),0) INTO expected
      FROM public.tms_waybill_cost c
      JOIN public.tms_waybill w ON w.id=c.waybill_id AND w.tenant_id=c.tenant_id
      JOIN public.tms_order o ON o.id=w.order_id AND o.tenant_id=w.tenant_id
      WHERE app_private.tenant_in_current_read_scope(c.tenant_id)
        AND c.cost_type='carrier_freight' AND c.audit_status='approved'
        AND w.status<>'cancelled' AND o.order_status<>'cancelled'
        AND o.create_time>='2026-09-01'::timestamp AT TIME ZONE 'Asia/Shanghai'
        AND o.create_time<'2026-10-01'::timestamp AT TIME ZONE 'Asia/Shanghai';
      report:=public.tms_management_report('monthly-overview','2026-09-01','2026-09-30',null,0,1);
      IF (report->'summary'->>'outsourced_cost')::numeric IS DISTINCT FROM expected THEN
        RAISE EXCEPTION 'Monthly outsourced cost does not match approved source costs'; END IF;
      report:=public.tms_management_report('monthly-overview','2026-09-01','2026-09-30','报表验收',0,1);
      IF report->'summary' ? 'outsourced_cost' THEN RAISE EXCEPTION 'Unfiltered outsourced cost leaked into filtered summary'; END IF;
    END LOOP;
  END LOOP;
END $test$;
DO $approval$
DECLARE item uuid; result jsonb; cid uuid; before_total numeric; after_total numeric; attempt int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
  PERFORM set_config('request.headers','{}',true);
  SELECT id INTO STRICT item FROM public.tms_expense_item WHERE tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9' AND business_category='carrier_freight' AND is_selectable;
  before_total:=(public.tms_management_report('monthly-overview','2026-09-01','2026-10-31',null,0,1)->'summary'->>'outsourced_cost')::numeric;
  result:=public.tms_save_waybill_cost_secure(null,jsonb_build_object('waybill_id','a9fc0006-1023-4620-9220-000000000001','expense_item_id',item,'amount',123,'occurred_on','2026-09-18','remark','外包成本事务验证'));
  cid:=(result->>'id')::uuid;
  after_total:=(public.tms_management_report('monthly-overview','2026-09-01','2026-10-31',null,0,1)->'summary'->>'outsourced_cost')::numeric;
  IF after_total IS DISTINCT FROM before_total THEN RAISE EXCEPTION 'Draft carrier freight included'; END IF;
  PERFORM public.start_workflow('tms_waybill_cost',cid,'外包成本事务回归','{}'::jsonb,gen_random_uuid()::text);
  FOR attempt IN 1..5 LOOP
    EXIT WHEN (SELECT audit_status FROM public.tms_waybill_cost WHERE id=cid)='approved';
    PERFORM public.act_workflow_by_business('tms_waybill_cost',cid,'approve','事务回归',gen_random_uuid()::text);
  END LOOP;
  after_total:=(public.tms_management_report('monthly-overview','2026-09-01','2026-10-31',null,0,1)->'summary'->>'outsourced_cost')::numeric;
  IF after_total IS DISTINCT FROM before_total+123 THEN RAISE EXCEPTION 'Approved carrier freight missing'; END IF;
END $approval$;
DO $field_access$
DECLARE app_user uuid; resource uuid; field uuid; access_mode text; report jsonb;
BEGIN
  SELECT id INTO STRICT app_user FROM public.sys_user WHERE auth_user_id='ab881b32-87d4-4dce-9014-ce488b8069df';
  SELECT r.id,f.id INTO STRICT resource,field
  FROM public.sys_permission_resource r JOIN public.sys_permission_field f ON f.resource_id=r.id AND f.tenant_id=r.tenant_id
  WHERE r.tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9' AND r.resource_key='tms.waybill_cost' AND f.field_key='costAmounts';
  FOREACH access_mode IN ARRAY ARRAY['hidden','masked'] LOOP
    UPDATE public.sys_user_field_permission SET access_level=access_mode
    WHERE tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9' AND user_id=app_user AND field_id=field AND resource_id=resource;
    IF NOT FOUND THEN
      INSERT INTO public.sys_user_field_permission(tenant_id,user_id,resource_id,field_id,access_level,create_by)
      VALUES('7529f951-938e-4e2c-ac0d-316c136ae1f9',app_user,resource,field,access_mode,'报表权限事务回归');
    END IF;
    IF app_private.resolve_field_access('tms.waybill_cost','costAmounts',null) IS DISTINCT FROM access_mode THEN
      RAISE EXCEPTION 'Field permission fixture ineffective'; END IF;
    report:=public.tms_management_report('monthly-overview','2026-09-01','2026-10-31',null,0,1);
    IF report->'summary'->>'outsourced_cost' IS NOT NULL THEN RAISE EXCEPTION 'Restricted cost exposed by aggregate'; END IF;
  END LOOP;
END $field_access$;
ROLLBACK;
