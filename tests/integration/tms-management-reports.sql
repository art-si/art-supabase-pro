BEGIN;
DO $test$
DECLARE actor uuid; ordinary uuid; tenant_a uuid; tenant_b uuid; slug text; result jsonb; own_result jsonb; forged_result jsonb; expected bigint; actual bigint; unit_result jsonb; grade_result jsonb;
BEGIN
 IF (SELECT count(*) FROM public.sys_menu m JOIN public.sys_menu f ON f.id=m.parent_id JOIN public.sys_menu root ON root.id=f.parent_id WHERE m.name LIKE 'TmsReport%' AND m.app_code='tms' AND f.name IN ('TmsBusinessDecision','TmsOperationsAnalysis') AND root.path='/tms' AND m.component='/tms/'||f.path||'/'||m.path)<>15 THEN RAISE EXCEPTION 'TMS menu, full route and component paths are inconsistent'; END IF;
 IF EXISTS(SELECT 1 FROM public.sys_menu WHERE name LIKE 'VmsReport%' OR component LIKE '/vms/business-decision/%' OR component LIKE '/vms/operations-analysis/%') THEN RAISE EXCEPTION 'Old VMS report menu remains'; END IF;
 IF to_regprocedure('public.vms_management_report(text,date,date,text,integer,integer)') IS NOT NULL THEN RAISE EXCEPTION 'Old VMS RPC remains'; END IF;
 IF has_function_privilege('authenticated','app_private.tms_operational_report_rows(text,date,date,text)','EXECUTE') THEN RAISE EXCEPTION 'Private projection exposed directly'; END IF;
 SELECT auth_user_id INTO actor FROM public.sys_user WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1;
 SELECT u.auth_user_id,u.tenant_id INTO ordinary,tenant_a FROM public.sys_user u WHERE u.auth_user_id='ab881b32-87d4-4dce-9014-ce488b8069df' AND NOT u.user_roles @> ARRAY['R_SUPER'];
 SELECT id INTO tenant_b FROM public.sys_tenant WHERE id<>tenant_a AND status='1' LIMIT 1;
 IF actor IS NULL OR ordinary IS NULL OR tenant_b IS NULL THEN RAISE EXCEPTION 'Scope test actors unavailable'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 FOREACH slug IN ARRAY ARRAY['monthly-overview','receivables','vehicle-profit','route-profit','driver-productivity','order-profit','customer-profit','business-risk','operations-kpi','order-transit','vehicle-dispatch','driver-operations','order-exceptions','receipt-tracking','carrier-performance'] LOOP
   result:=public.tms_management_report(slug,'2026-10-01','2026-10-23',null,0,200);
   IF jsonb_typeof(result->'records')<>'array' OR NOT result ? 'summary' THEN RAISE EXCEPTION 'Invalid report %',slug; END IF;
 END LOOP;
 FOREACH slug IN ARRAY ARRAY['all','selected'] LOOP
   PERFORM set_config('request.headers',CASE WHEN slug='all' THEN '{}' ELSE jsonb_build_object('x-art-tenant-scope',tenant_a)::text END,true);
   result:=public.tms_management_report('receipt-tracking','2026-10-01','2026-10-23',null,0,200);
   actual:=(result->>'total')::bigint;
   SELECT count(*) INTO expected FROM public.tms_order WHERE app_private.tenant_in_current_read_scope(tenant_id) AND order_status<>'cancelled' AND create_time>='2026-10-01'::timestamp AT TIME ZONE 'Asia/Shanghai' AND create_time<'2026-10-24'::timestamp AT TIME ZONE 'Asia/Shanghai';
   IF actual<>expected THEN RAISE EXCEPTION 'Scope totals mismatch %',slug; END IF;
 END LOOP;
 PERFORM set_config('request.headers','{}',true);
 result:=public.tms_management_report('vehicle-profit','2026-10-01','2026-10-23',null,0,200);
 IF (SELECT coalesce(sum((j->>'fuel_cost')::numeric),0) FROM jsonb_array_elements(result->'records') j) IS DISTINCT FROM (SELECT coalesce(sum(c.amount),0) FROM public.tms_waybill_cost c JOIN public.tms_waybill w ON w.id=c.waybill_id AND w.tenant_id=c.tenant_id JOIN public.tms_order o ON o.id=w.order_id AND o.tenant_id=w.tenant_id WHERE app_private.tenant_in_current_read_scope(c.tenant_id) AND c.audit_status='approved' AND c.cost_type='fuel' AND w.status<>'cancelled' AND o.order_status<>'cancelled' AND o.create_time>='2026-10-01'::timestamp AT TIME ZONE 'Asia/Shanghai' AND o.create_time<'2026-10-24'::timestamp AT TIME ZONE 'Asia/Shanghai') THEN RAISE EXCEPTION 'Fuel breakdown differs from approved expense source'; END IF;
 IF (SELECT coalesce(sum((j->>'toll_cost')::numeric),0) FROM jsonb_array_elements(result->'records') j) IS DISTINCT FROM (SELECT coalesce(sum(c.amount),0) FROM public.tms_waybill_cost c JOIN public.tms_waybill w ON w.id=c.waybill_id AND w.tenant_id=c.tenant_id JOIN public.tms_order o ON o.id=w.order_id AND o.tenant_id=w.tenant_id WHERE app_private.tenant_in_current_read_scope(c.tenant_id) AND c.audit_status='approved' AND c.cost_type='toll' AND w.status<>'cancelled' AND o.order_status<>'cancelled' AND o.create_time>='2026-10-01'::timestamp AT TIME ZONE 'Asia/Shanghai' AND o.create_time<'2026-10-24'::timestamp AT TIME ZONE 'Asia/Shanghai') THEN RAISE EXCEPTION 'Toll breakdown differs from approved expense source'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ordinary,'role','authenticated')::text,true);
 PERFORM set_config('request.headers','{}',true);
 BEGIN own_result:=public.tms_management_report('operations-kpi','2026-10-01','2026-10-23',null,0,200); EXCEPTION WHEN insufficient_privilege THEN own_result:='{"denied":true}'; END;
 -- Positive ordinary-user checks use the explicitly marked acceptance dataset.
 IF own_result ? 'denied' THEN RAISE EXCEPTION 'Acceptance actor lacks the expected report access'; END IF;
 FOREACH slug IN ARRAY ARRAY['monthly-overview','receivables','vehicle-profit','route-profit','driver-productivity','order-profit','customer-profit','business-risk','operations-kpi','order-transit','vehicle-dispatch','driver-operations','order-exceptions','receipt-tracking','carrier-performance'] LOOP
   result:=public.tms_management_report(slug,'2026-09-01','2026-10-23','报表验收',0,200);
   IF slug<>'receivables' AND (result->>'total')::integer<2 THEN RAISE EXCEPTION 'Insufficient acceptance records %',slug; END IF;
 END LOOP;
 result:=public.tms_management_report('monthly-overview','2026-09-01','2026-10-23','报表验收',0,200);
 IF (result#>>'{summary,revenue}')::numeric<>80000 OR (result#>>'{summary,cost}')::numeric<>74300 OR (result#>>'{summary,profit}')::numeric<>5700 THEN RAISE EXCEPTION 'Financial de-duplication totals mismatch'; END IF;
 IF (SELECT sum((j->>'weight_tons')::numeric) FROM jsonb_array_elements(result->'records') j)<>80 OR (SELECT sum((j->>'volume')::numeric) FROM jsonb_array_elements(result->'records') j)<>160 THEN RAISE EXCEPTION 'Monthly order tonnage/volume mismatch'; END IF;
 result:=public.tms_management_report('monthly-overview','2026-10-01','2026-10-23',null,0,200);
 SELECT count(*) INTO expected FROM public.tms_order o WHERE app_private.tenant_in_current_read_scope(o.tenant_id) AND o.order_status<>'cancelled' AND o.create_time>='2026-10-01'::timestamp AT TIME ZONE 'Asia/Shanghai' AND o.create_time<'2026-10-24'::timestamp AT TIME ZONE 'Asia/Shanghai';
 IF (result#>>'{summary,orders}')::bigint<>expected THEN RAISE EXCEPTION 'Monthly overview omits orders without execution waybills'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(result->'records') j WHERE (j->>'undispatched')::integer>0 AND (j->>'cost' IS NOT NULL OR j->>'profit' IS NOT NULL)) THEN RAISE EXCEPTION 'Unassigned transport cost shown as known'; END IF;
 FOREACH slug IN ARRAY ARRAY['customer-profit','route-profit','order-profit','vehicle-profit','driver-productivity'] LOOP
   result:=public.tms_management_report(slug,'2026-09-01','2026-10-23','报表验收',0,200);
   IF (SELECT sum((j->>'weight_tons')::numeric) FROM jsonb_array_elements(result->'records') j) IS DISTINCT FROM 80::numeric OR (SELECT sum((j->>'volume')::numeric) FROM jsonb_array_elements(result->'records') j) IS DISTINCT FROM 160::numeric THEN RAISE EXCEPTION 'Order cargo aggregation mismatch %',slug; END IF;
 END LOOP;
 result:=public.tms_management_report('vehicle-profit','2026-09-01','2026-10-23','测A验收001',0,200);
 unit_result:=public.tms_management_report('route-profit','2026-09-01','2026-10-23','报表验收',0,200);
 grade_result:=public.tms_management_report('customer-profit','2026-09-01','2026-10-23','报表验收',0,200);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(grade_result->'records') j JOIN public.mdm_customer c ON c.id::text=j->>'group_key' WHERE j->>'customer_level' IS DISTINCT FROM c.customer_level) THEN RAISE EXCEPTION 'Customer grade differs from master data'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(unit_result->'records') j WHERE (j->>'unit_revenue')::numeric IS DISTINCT FROM round((j->>'revenue')::numeric/nullif((j->>'weight_tons')::numeric,0),2) OR (j->>'unit_cost')::numeric IS DISTINCT FROM round((j->>'cost')::numeric/nullif((j->>'weight_tons')::numeric,0),2)) THEN RAISE EXCEPTION 'Route unit economics mismatch'; END IF;
 IF (result->>'total')::integer<>1 OR (result#>>'{summary,revenue}')::numeric<>48000 THEN RAISE EXCEPTION 'Execution vehicle drill-through filter mismatch'; END IF;
 result:=public.tms_management_report('operations-kpi','2026-09-01','2026-10-23','报表验收',0,200);
 IF (result->>'total')::integer<>6 OR (result#>>'{summary,available}')::integer<>4 OR (result#>>'{summary,pending}')::integer<>2 THEN RAISE EXCEPTION 'KPI target/unknown semantics mismatch'; END IF;
 result:=public.tms_management_report('vehicle-dispatch','2026-09-01','2026-10-23','报表验收',0,200);
 IF (result->>'total')::integer<>2 OR (SELECT count(distinct j->>'vehicle_id') FROM jsonb_array_elements(result->'records')j)<>2 THEN RAISE EXCEPTION 'Vehicle ledger is not one row per vehicle'; END IF;
 result:=public.tms_management_report('business-risk','2026-08-01','2026-08-31',null,0,200);
 SELECT count(*) INTO expected FROM public.vehicle_accident_record a WHERE app_private.tenant_in_current_read_scope(a.tenant_id) AND a.accident_time>='2026-08-01'::timestamp AT TIME ZONE 'Asia/Shanghai' AND a.accident_time<'2026-09-01'::timestamp AT TIME ZONE 'Asia/Shanghai';
 SELECT count(*) INTO actual FROM jsonb_array_elements(result->'records') j WHERE j->>'risk_type'='车辆事故';
 IF actual<>expected OR actual<1 THEN RAISE EXCEPTION 'Accident risk source missing'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(result->'records') j JOIN public.vehicle_accident_record a ON j->>'exception_id'='车辆事故:'||a.id::text CROSS JOIN LATERAL (SELECT app_private.vehicle_accident_to_secure_json(a,null) s) secure WHERE j->>'driver' IS DISTINCT FROM s->>'driver_name' OR j->'risk_amount' IS DISTINCT FROM CASE WHEN jsonb_typeof(s->'company_bear_amount')='number' THEN s->'company_bear_amount' ELSE 'null'::jsonb END) THEN RAISE EXCEPTION 'Accident risk bypasses field projection'; END IF;
 PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',tenant_b)::text,true);
 IF app_private.current_read_tenant_id() IS DISTINCT FROM tenant_a THEN RAISE EXCEPTION 'Forged tenant header accepted'; END IF;
 BEGIN forged_result:=public.tms_management_report('operations-kpi','2026-10-01','2026-10-23',null,0,200); EXCEPTION WHEN insufficient_privilege THEN forged_result:='{"denied":true}'; END;
 IF own_result IS DISTINCT FROM forged_result THEN RAISE EXCEPTION 'Ordinary forged header changes report'; END IF;
 result:=public.tms_management_report('business-risk','2026-10-01','2026-10-24','[TMS报表验收20261024]',0,200);
 IF (result->>'total')::integer<>2 OR (SELECT sum((j->>'risk_amount')::numeric) FROM jsonb_array_elements(result->'records') j)<>300 OR (SELECT count(distinct j->>'status') FROM jsonb_array_elements(result->'records') j)<>2 THEN RAISE EXCEPTION 'Violation amount/status or forged tenant projection mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(result->'records') j WHERE j->>'order_id' IS NOT NULL OR j->>'customer' IS NOT NULL) THEN RAISE EXCEPTION 'Violation assigned to an unrelated order or customer'; END IF;
 PERFORM set_config('request.jwt.claims','{}',true);
 BEGIN PERFORM public.tms_management_report('operations-kpi','2026-10-01','2026-10-23'); RAISE EXCEPTION 'Anonymous access accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
-- Financial receivables use the existing two complete transport → estimate → financial
-- → receipt → refund scenarios, in their original tenant, rather than statement fixtures.
DO $ar_test$
DECLARE actor uuid; scoped_tenant uuid; result jsonb; ordinary_result jsonb; row_data jsonb;
BEGIN
 SELECT auth_user_id INTO actor FROM public.sys_user WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 PERFORM set_config('request.headers','{}',true);
 result:=public.tms_management_report('receivables','2026-10-01','2026-10-23','TEST-AR-WAYBILL',0,200);
 IF (result->>'total')::integer<>2 THEN RAISE EXCEPTION 'Transport financial receivable scenarios missing'; END IF;
 IF (result#>>'{summary,amount}')::numeric<>1350 OR (result#>>'{summary,received_amount}')::numeric<>1650 OR (result#>>'{summary,total_amount}')::numeric<>3000 THEN RAISE EXCEPTION 'Receipts/refunds or financial balance mismatch'; END IF;
 FOR row_data IN SELECT value FROM jsonb_array_elements(result->'records') LOOP
   IF (row_data->>'days')::integer<>1 OR row_data->>'overdue_amount' IS DISTINCT FROM row_data->>'amount' THEN RAISE EXCEPTION 'Due-date overdue semantics mismatch'; END IF;
   IF (row_data->>'total_amount')::numeric<>(row_data->>'received_amount')::numeric+(row_data->>'other_applied_amount')::numeric+(row_data->>'amount')::numeric THEN RAISE EXCEPTION 'Receivable reconciliation mismatch'; END IF;
 END LOOP;
 SELECT tenant_id INTO scoped_tenant FROM public.fms_receivable_document WHERE id=(result#>>'{records,0,statement_id}')::uuid;
 PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',scoped_tenant)::text,true);
 IF public.tms_management_report('receivables','2026-10-01','2026-10-23','TEST-AR-WAYBILL',0,200) IS DISTINCT FROM result THEN RAISE EXCEPTION 'Selected AR tenant mismatch'; END IF;
 PERFORM set_config('request.headers','{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}',true);
 IF (public.tms_management_report('receivables','2026-10-01','2026-10-23','TEST-AR-WAYBILL',0,200)->>'total')::integer<>0 THEN RAISE EXCEPTION 'Cross-tenant AR leak'; END IF;
 PERFORM set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
 PERFORM set_config('request.headers','{}',true);
 ordinary_result:=public.tms_management_report('receivables','2026-10-01','2026-10-23',null,0,200);
 PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',scoped_tenant)::text,true);
 IF public.tms_management_report('receivables','2026-10-01','2026-10-23',null,0,200) IS DISTINCT FROM ordinary_result THEN RAISE EXCEPTION 'Forged AR tenant changes data'; END IF;
END $ar_test$;
DO $risk_ar_test$
DECLARE actor uuid; risk jsonb; receivable jsonb;
BEGIN
 SELECT auth_user_id INTO actor FROM public.sys_user WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 PERFORM set_config('request.headers','{}',true);
 risk:=public.tms_management_report('business-risk','2026-10-01','2026-10-23','TEST-AR-WAYBILL',0,200);
 receivable:=public.tms_management_report('receivables','2026-10-01','2026-10-23','TEST-AR-WAYBILL',0,200);
 IF (SELECT count(*) FROM jsonb_array_elements(risk->'records') r WHERE r->>'risk_type'='应收逾期')<>2 THEN RAISE EXCEPTION 'Overdue risk scenarios missing'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(receivable->'records') a LEFT JOIN LATERAL (SELECT r FROM jsonb_array_elements(risk->'records') r WHERE r->>'exception_id'='应收逾期:'||(a->>'statement_id')) found ON true WHERE found.r IS NULL OR found.r->'risk_amount' IS DISTINCT FROM a->'overdue_amount' OR found.r->'currency' IS DISTINCT FROM a->'currency' OR found.r->'order_id' IS DISTINCT FROM a->'order_id' OR found.r->>'status'<>'逾期未结') THEN RAISE EXCEPTION 'Receivable risk disagrees with financial projection'; END IF;
 PERFORM set_config('request.headers','{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}',true);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.tms_management_report('business-risk','2026-10-01','2026-10-23','TEST-AR-WAYBILL',0,200)->'records') r WHERE r->>'risk_type'='应收逾期') THEN RAISE EXCEPTION 'Cross-tenant overdue risk leak'; END IF;
 IF has_function_privilege('authenticated','app_private.tms_receivable_report_rows(date,date,text)','EXECUTE') THEN RAISE EXCEPTION 'Private receivable projection exposed'; END IF;
END $risk_ar_test$;
DO $year_summary_test$
DECLARE actor uuid; limited jsonb; full_year jsonb; period jsonb;
BEGIN
 SELECT auth_user_id INTO actor FROM public.sys_user WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 PERFORM set_config('request.headers','{}',true);
 limited:=public.tms_management_report('monthly-overview','2026-01-01','2026-10-23','报表验收',0,1);
 full_year:=public.tms_management_report('monthly-overview','2026-01-01','2026-10-23','报表验收',0,200);
 period:=public.tms_management_report('monthly-overview','2026-10-01','2026-10-23','报表验收',0,200);
 IF jsonb_array_length(limited->'records')<>1 OR (full_year->>'total')::integer<2 THEN RAISE EXCEPTION 'Year summary acceptance rows missing'; END IF;
 IF limited->'summary' IS DISTINCT FROM full_year->'summary' THEN RAISE EXCEPTION 'Year summary depends on page size'; END IF;
 IF (limited#>>'{summary,revenue}')::numeric<>80000 OR (limited#>>'{summary,cost}')::numeric<>74300 OR (limited#>>'{summary,profit}')::numeric<>5700 THEN RAISE EXCEPTION 'Year summary does not match acceptance ledger'; END IF;
 IF (period#>>'{summary,revenue}')::numeric >= (limited#>>'{summary,revenue}')::numeric THEN RAISE EXCEPTION 'Year summary failed to include earlier months'; END IF;
END $year_summary_test$;
ROLLBACK;

