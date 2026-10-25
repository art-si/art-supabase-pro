-- Candidate report contract; fixture changes roll back.
BEGIN;
DO $test$
DECLARE report jsonb; actual numeric;
BEGIN
 PERFORM set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
 PERFORM set_config('request.headers','{}',true);
 UPDATE public.tms_waybill_execution_record SET departure_fuel_liters=100,refueled_liters=30,return_fuel_liters=100 WHERE waybill_id='a9fc0006-1023-4620-9220-000000000001';
 UPDATE public.tms_waybill_execution_record SET departure_fuel_liters=100,refueled_liters=50,return_fuel_liters=100 WHERE waybill_id='a9fc0006-1023-4620-9220-000000000002';
 report:=public.tms_management_report('vehicle-profit','2026-09-01','2026-09-30','报表验收',0,200);
 SELECT (r->>'fuel_per_100km')::numeric INTO actual FROM jsonb_array_elements(report->'records') r WHERE r->>'label'='测A验收001';
 IF actual IS DISTINCT FROM 30::numeric THEN RAISE EXCEPTION 'Vehicle one fuel mismatch: %',actual; END IF;
 SELECT (r->>'fuel_per_100km')::numeric INTO actual FROM jsonb_array_elements(report->'records') r WHERE r->>'label'='测A验收002';
 IF actual IS DISTINCT FROM 25::numeric THEN RAISE EXCEPTION 'Vehicle two fuel mismatch: %',actual; END IF;
 UPDATE public.tms_waybill SET vehicle_id='a9fc0004-1023-4620-9220-000000000001' WHERE id='a9fc0006-1023-4620-9220-000000000002';
 UPDATE public.tms_waybill_execution_record SET departure_odometer_km=1050,return_odometer_km=1250 WHERE waybill_id='a9fc0006-1023-4620-9220-000000000002';
 report:=public.tms_management_report('vehicle-profit','2026-09-01','2026-09-30','报表验收',0,200);
 SELECT (r->>'fuel_per_100km')::numeric INTO actual FROM jsonb_array_elements(report->'records') r WHERE r->>'label'='测A验收001';
 IF actual IS NOT NULL THEN RAISE EXCEPTION 'Overlapping mileage was aggregated'; END IF;
 UPDATE public.tms_waybill_execution_record SET departure_odometer_km=1100,return_odometer_km=1300 WHERE waybill_id='a9fc0006-1023-4620-9220-000000000002';
 report:=public.tms_management_report('vehicle-profit','2026-09-01','2026-09-30','报表验收',0,200);
 SELECT (r->>'fuel_per_100km')::numeric INTO actual FROM jsonb_array_elements(report->'records') r WHERE r->>'label'='测A验收001';
 IF actual IS DISTINCT FROM 26.67::numeric THEN RAISE EXCEPTION 'Adjacent mileage must use weighted fuel, got %',actual; END IF;
 UPDATE public.tms_waybill SET vehicle_id='a9fc0004-1023-4620-9220-000000000002' WHERE id='a9fc0006-1023-4620-9220-000000000002';
 UPDATE public.tms_waybill_execution_record SET departure_odometer_km=2000,return_odometer_km=2200 WHERE waybill_id='a9fc0006-1023-4620-9220-000000000002';
 UPDATE public.tms_waybill_execution_record SET refueled_liters=NULL WHERE waybill_id='a9fc0006-1023-4620-9220-000000000001';
 report:=public.tms_management_report('vehicle-profit','2026-09-01','2026-09-30','报表验收',0,200);
 SELECT (r->>'fuel_per_100km')::numeric INTO actual FROM jsonb_array_elements(report->'records') r WHERE r->>'label'='测A验收001';
 IF actual IS NOT NULL THEN RAISE EXCEPTION 'Unknown fuel calculated'; END IF;
END $test$;
ROLLBACK;
