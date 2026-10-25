-- Candidate contract: fuel fields must roundtrip through completion and secure context.
BEGIN;
DO $test$ declare a uuid; result jsonb; event_count bigint; invalid numeric; begin
a:='ab881b32-87d4-4dce-9014-ce488b8069df';
perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
perform set_config('request.headers','{}',true);
insert into public.tms_waybill_execution_record(tenant_id,waybill_id,departure_time,departure_odometer_km,signed_at,departure_photo_urls,departure_recorded_at,signer_name,receipt_urls,signature_urls,signature_recorded_at)
values('7529f951-938e-4e2c-ac0d-316c136ae1f9','a9fc0006-1023-4620-9220-000000000001','2026-09-10',1000,'2026-09-12','["https://example.com/test-departure.jpg"]',now(),'测试签收人','["https://example.com/test-receipt.jpg"]','["https://example.com/test-signature.jpg"]',now())
on conflict(waybill_id) do update set departure_time=excluded.departure_time,departure_odometer_km=excluded.departure_odometer_km,signed_at=excluded.signed_at,departure_photo_urls=excluded.departure_photo_urls,departure_recorded_at=excluded.departure_recorded_at,signer_name=excluded.signer_name,receipt_urls=excluded.receipt_urls,signature_urls=excluded.signature_urls,signature_recorded_at=excluded.signature_recorded_at,return_time=null,return_odometer_km=null,empty_mileage_km=null,completion_recorded_at=null;
begin
 perform public.tms_complete_waybill_execution('a9fc0006-1023-4620-9220-000000000001','2026-09-13',1100,'["https://example.com/test-return.jpg"]',null,101);
 raise exception 'invalid empty distance accepted';
exception when check_violation then null; end;
foreach invalid in array array[-1::numeric,'NaN'::numeric,'Infinity'::numeric] loop
 begin
 perform public.tms_complete_waybill_execution('a9fc0006-1023-4620-9220-000000000001','2026-09-13',1100,'["https://example.com/test-return.jpg"]',null,10,100,invalid,100);
 raise exception 'Invalid fuel accepted: %',invalid;
 exception when check_violation then null; end;
end loop;
begin
 perform public.tms_complete_waybill_execution('a9fc0006-1023-4620-9220-000000000001','2026-09-13',1100,'["https://example.com/test-return.jpg"]',null,10,100,30,131);
 raise exception 'Negative consumed fuel accepted';
exception when check_violation then null; end;
result:=public.tms_complete_waybill_execution('a9fc0006-1023-4620-9220-000000000001','2026-09-13',1100,'["https://example.com/test-return.jpg"]',null,10,100,30,100);
if (result->'record'->>'emptyMileageKm')::numeric is distinct from 10::numeric then raise exception 'empty mileage roundtrip failed'; end if;
if (result->'record'->>'departureFuelLiters')::numeric is distinct from 100::numeric or (result->'record'->>'refueledLiters')::numeric is distinct from 30::numeric or (result->'record'->>'returnFuelLiters')::numeric is distinct from 100::numeric then raise exception 'Fuel data roundtrip failed'; end if;
select count(*) into event_count from public.tms_waybill_event where waybill_id='a9fc0006-1023-4620-9220-000000000001' and event_type='completed';
result:=public.tms_complete_waybill_execution('a9fc0006-1023-4620-9220-000000000001','2026-09-13',1100,'["https://example.com/test-return.jpg"]',null,10,200,60,200);
if (result->'record'->>'refueledLiters')::numeric is distinct from 30::numeric then raise exception 'Retry overwrote completed fuel'; end if;
if (select count(*) from public.tms_waybill_event where waybill_id='a9fc0006-1023-4620-9220-000000000001' and event_type='completed')<>event_count then raise exception 'Retry duplicated completion event'; end if;
update public.tms_waybill_execution_record set completion_recorded_at=null,return_time=null,return_odometer_km=null,empty_mileage_km=null where waybill_id='a9fc0006-1023-4620-9220-000000000001';
result:=public.tms_complete_waybill_execution('a9fc0006-1023-4620-9220-000000000001','2026-09-13',1100,'["https://example.com/test-return.jpg"]',null,10);
if result->'record'->>'departureFuelLiters' is not null or result->'record'->>'refueledLiters' is not null or result->'record'->>'returnFuelLiters' is not null then raise exception 'Legacy request invented fuel values'; end if;
end $test$;
ROLLBACK;
