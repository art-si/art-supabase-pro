BEGIN;
DO $test$ declare a uuid; result jsonb; begin
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
perform set_config('request.jwt.claims','{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
perform set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
begin
 perform public.tms_complete_waybill_execution('a9fc0006-1023-4620-9220-000000000001','2026-09-13',1100,'["https://example.com/test-return.jpg"]',null,10);
 raise exception 'Foreign selected completion accepted';
exception when insufficient_privilege then null; end;
if exists(select 1 from public.tms_waybill_execution_record where waybill_id='a9fc0006-1023-4620-9220-000000000001' and completion_recorded_at is not null) then raise exception 'Denied completion wrote state'; end if;
perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
perform set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
result:=public.tms_complete_waybill_execution('a9fc0006-1023-4620-9220-000000000001','2026-09-13',1100,'["https://example.com/test-return.jpg"]',null,10);
if (result->'record'->>'emptyMileageKm')::numeric is distinct from 10::numeric then raise exception 'empty mileage roundtrip failed'; end if;
end $test$;
ROLLBACK;
