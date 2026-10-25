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
        AND c.cost_type='cargo_damage' AND c.audit_status='approved'
        AND w.status<>'cancelled' AND o.order_status<>'cancelled'
        AND o.create_time>='2026-09-01'::timestamp AT TIME ZONE 'Asia/Shanghai'
        AND o.create_time<'2026-10-01'::timestamp AT TIME ZONE 'Asia/Shanghai';
      report:=public.tms_management_report('monthly-overview','2026-09-01','2026-09-30',null,0,1);
      IF (report->'summary'->>'damage')::numeric IS DISTINCT FROM expected THEN
        RAISE EXCEPTION 'Monthly damage does not match approved source costs'; END IF;
      report:=public.tms_management_report('monthly-overview','2026-09-01','2026-09-30','报表验收',0,1);
      IF report->'summary' ? 'damage' THEN RAISE EXCEPTION 'Unfiltered damage leaked into filtered summary'; END IF;
    END LOOP;
  END LOOP;
END $test$;
ROLLBACK;
