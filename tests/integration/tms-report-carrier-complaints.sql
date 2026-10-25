BEGIN;
DO $test$
DECLARE actor uuid; result jsonb; customer_result jsonb;
BEGIN
 SELECT auth_user_id INTO actor FROM public.sys_user WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 PERFORM set_config('request.headers','{}',true);
 INSERT INTO public.tms_service_case(id,tenant_id,service_no,organization_name,service_type,title,waybill_no,contact_name,contact_phone,content,submitted_at)
 SELECT w.id,w.tenant_id,'REPORT-COMPLAINT-TEST-'||w.id::text,'报表测试','complaint','报表投诉归集回归',w.waybill_no,'测试人员','13800000000','事务回滚，不代表真实投诉','2026-10-23 09:00+08'
 FROM public.tms_waybill w WHERE w.id IN ('a9fc0006-1023-4620-9220-000000000003','a9fc0006-1023-4620-9220-000000000004');
 UPDATE public.tms_service_case SET submitted_at='2026-10-23 09:00+08' WHERE id IN ('a9fc0006-1023-4620-9220-000000000003','a9fc0006-1023-4620-9220-000000000004');
 result:=public.tms_management_report('carrier-performance','2026-09-01','2026-10-23','报表验收',0,200);
 IF (SELECT sum((j->>'complaints')::numeric) FROM jsonb_array_elements(result->'records') j) IS DISTINCT FROM 2::numeric THEN RAISE EXCEPTION 'Two linked complaints not counted'; END IF;
 customer_result:=public.tms_management_report('customer-profit','2026-09-01','2026-10-23','报表验收',0,200);
 IF (SELECT sum((j->>'complaints')::numeric) FROM jsonb_array_elements(customer_result->'records') j) IS DISTINCT FROM 2::numeric THEN RAISE EXCEPTION 'Customer complaints not attributed'; END IF;
 IF has_function_privilege('authenticated','app_private.tms_report_complaint_counts(date,date)','EXECUTE') THEN RAISE EXCEPTION 'Private complaint helper exposed'; END IF;
 UPDATE public.tms_service_case SET service_type='consultation' WHERE id='a9fc0006-1023-4620-9220-000000000003';

 result:=public.tms_management_report('carrier-performance','2026-09-01','2026-10-23','报表验收',0,200);
 IF (SELECT sum((j->>'complaints')::numeric) FROM jsonb_array_elements(result->'records') j) IS DISTINCT FROM 1::numeric THEN RAISE EXCEPTION 'Consultation counted as complaint'; END IF;
 UPDATE public.tms_service_case SET waybill_no=null WHERE id IN ('a9fc0006-1023-4620-9220-000000000003','a9fc0006-1023-4620-9220-000000000004');

 result:=public.tms_management_report('carrier-performance','2026-09-01','2026-10-23','报表验收',0,200);
 IF (SELECT sum((j->>'complaints')::numeric) FROM jsonb_array_elements(result->'records') j) IS DISTINCT FROM 0::numeric THEN RAISE EXCEPTION 'Unlinked complaint guessed into carrier'; END IF;
 UPDATE public.tms_service_case s SET service_type='complaint',waybill_no=w.waybill_no FROM public.tms_waybill w WHERE s.id=w.id AND s.id IN ('a9fc0006-1023-4620-9220-000000000003','a9fc0006-1023-4620-9220-000000000004');
 INSERT INTO public.tms_waybill_order_allocation(tenant_id,waybill_id,order_id,quantity,weight_kg,volume_m3)
 SELECT tenant_id,'a9fc0006-1023-4620-9220-000000000003',order_id,1,1000,1 FROM public.tms_waybill WHERE id='a9fc0006-1023-4620-9220-000000000004';
 customer_result:=public.tms_management_report('customer-profit','2026-09-01','2026-10-23','报表验收',0,200);
 IF (SELECT sum((j->>'complaints')::numeric) FROM jsonb_array_elements(customer_result->'records') j) IS DISTINCT FROM 1::numeric THEN RAISE EXCEPTION 'Multi-customer waybill complaint guessed into a customer'; END IF;
 UPDATE public.tms_waybill SET status='cancelled',waybill_no=(SELECT waybill_no FROM public.tms_waybill WHERE id='a9fc0006-1023-4620-9220-000000000003') WHERE id='a9fc0006-1023-4620-9220-000000000004';
 result:=public.tms_management_report('carrier-performance','2026-09-01','2026-10-23','报表验收',0,200);
 IF (SELECT sum((j->>'complaints')::numeric) FROM jsonb_array_elements(result->'records') j) IS DISTINCT FROM 0::numeric THEN RAISE EXCEPTION 'Ambiguous waybill number attributed to a carrier'; END IF;
END $test$;
ROLLBACK;
