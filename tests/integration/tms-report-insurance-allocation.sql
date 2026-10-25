BEGIN;
DO $test$
DECLARE actor uuid; report text; rows jsonb; single_row jsonb;
BEGIN
 SELECT auth_user_id INTO actor FROM public.sys_user WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 PERFORM set_config('request.headers','{}',true);
 FOREACH report IN ARRAY ARRAY['monthly-overview','vehicle-profit','driver-productivity','order-profit','route-profit','customer-profit'] LOOP
  rows:=public.tms_management_report(report,'2026-09-01','2026-09-30','报表验收',0,200)->'records';
  IF (SELECT sum((j->>'allocated_insurance')::numeric) FROM jsonb_array_elements(rows) j) IS DISTINCT FROM 990::numeric THEN RAISE EXCEPTION 'Insurance not reconciled for %',report; END IF;
 END LOOP;
 single_row:=public.tms_management_report('vehicle-profit','2026-09-01','2026-09-30','测A验收001',0,200)->'records'->0;
 IF (single_row->>'allocated_insurance')::numeric IS DISTINCT FROM 330::numeric THEN RAISE EXCEPTION 'Filter reallocates vehicle month'; END IF;
 UPDATE public.tms_order SET create_time='2026-09-01 08:00:00+08' WHERE id IN ('a9fc0005-1023-4620-9220-000000000003','a9fc0005-1023-4620-9220-000000000005','a9fc0005-1023-4620-9220-000000000007');
 INSERT INTO public.tms_waybill_execution_record(tenant_id,waybill_id,departure_odometer_km,return_odometer_km)
 SELECT w.tenant_id,w.id,0,1 FROM public.tms_waybill w WHERE w.id IN ('a9fc0006-1023-4620-9220-000000000001','a9fc0006-1023-4620-9220-000000000003','a9fc0006-1023-4620-9220-000000000005','a9fc0006-1023-4620-9220-000000000007') AND NOT EXISTS(SELECT 1 FROM public.tms_waybill_execution_record e WHERE e.waybill_id=w.id AND e.tenant_id=w.tenant_id);
 UPDATE public.tms_waybill_execution_record SET empty_mileage_km=0,departure_odometer_km=0,return_odometer_km=CASE WHEN waybill_id='a9fc0006-1023-4620-9220-000000000007' THEN 4 ELSE 1 END WHERE waybill_id IN ('a9fc0006-1023-4620-9220-000000000001','a9fc0006-1023-4620-9220-000000000003','a9fc0006-1023-4620-9220-000000000005','a9fc0006-1023-4620-9220-000000000007');
 rows:=app_private.tms_insurance_allocations('2026-09-01','2026-09-30');
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(rows) j WHERE j->>'waybill_id'='a9fc0006-1023-4620-9220-000000000007' AND j->>'basis'='里程' AND (j->>'allocated_insurance')::numeric=188.58) THEN RAISE EXCEPTION 'Mileage rounding residual incorrect'; END IF;
 UPDATE public.tms_waybill_execution_record SET empty_mileage_km=null,return_odometer_km=null WHERE waybill_id='a9fc0006-1023-4620-9220-000000000007';
 rows:=app_private.tms_insurance_allocations('2026-09-01','2026-09-30');
 IF (SELECT count(*) FROM jsonb_array_elements(rows) j WHERE j->>'vehicle_id'='a9fc0004-1023-4620-9220-000000000001' AND j->>'basis'='订单数' AND (j->>'allocated_insurance')::numeric=82.5)<>4 THEN RAISE EXCEPTION 'Incomplete mileage fallback incorrect'; END IF;
 PERFORM set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(app_private.tms_insurance_allocations('2026-09-01','2026-09-30')) j WHERE j->>'vehicle_id' IN ('a9fc0004-1023-4620-9220-000000000001','a9fc0004-1023-4620-9220-000000000002')) THEN RAISE EXCEPTION 'Cross tenant insurance allocation'; END IF;
 IF has_function_privilege('authenticated','app_private.tms_insurance_allocations(date,date)','EXECUTE') THEN RAISE EXCEPTION 'Private allocation exposed'; END IF;
END $test$;
ROLLBACK;

