begin;
select set_config('request.jwt.claims',jsonb_build_object('sub','0a872664-874c-447d-a256-d0dbdca6ed45','role','authenticated')::text,true);
select set_config('request.headers','{}',true);
do $test$
declare w uuid;w2 uuid;e uuid;v uuid:='d7670b37-2283-433e-95d2-7315829b0edc';
begin
 insert into public.tms_waybill(tenant_id,waybill_no,status,vehicle_id,origin_city,destination_city,shipper_address,receiver_address,cargo_name,create_by)
 values('7529f951-938e-4e2c-ac0d-316c136ae1f9','QA-FUEL-RATE-ROLLBACK','completed',v,'QA起点','QA终点','QA起点','QA终点','QA货物','fuel-rate-test')
 returning id into w;
 insert into public.tms_waybill_execution_record(tenant_id,waybill_id,departure_time,return_time,departure_odometer_km,return_odometer_km,departure_fuel_liters,refueled_liters,return_fuel_liters,departure_photo_urls,return_photo_urls,departure_recorded_at,completion_recorded_at,create_by)
 values('7529f951-938e-4e2c-ac0d-316c136ae1f9',w,'2025-01-01T00:00:00Z','2025-01-02T00:00:00Z',1000,1200,80,20,50,'["https://example.com/tms-test-departure.jpg"]'::jsonb,'["https://example.com/tms-test-return.jpg"]'::jsonb,now(),now(),'fuel-rate-test');
 e:=public.vms_record_fuel_card_transaction_v3(p_card_id:='4dd0014c-cb7a-45dd-aa5f-efff5bcc89cb',p_entry_type:='consume',p_amount:=20,p_occurred_on:=current_date,p_waybill_id:=w,p_liters:=20,p_unit_price:=1);
 if (public.vms_list_fuel_card_entries_secure(p_ids:=array[e])->'records'->0->>'tripFuelPer100Km')::numeric<>25 then
   raise exception 'Trip fuel rate missing';end if;
 update public.tms_waybill_execution_record set return_fuel_liters=null where waybill_id=w;
 if public.vms_list_fuel_card_entries_secure(p_ids:=array[e])->'records'->0->>'tripFuelPer100Km' is not null then
   raise exception 'Incomplete fuel readings produced a rate';end if;
 update public.tms_waybill_execution_record set return_fuel_liters=50 where waybill_id=w;
 insert into public.tms_waybill(tenant_id,waybill_no,status,vehicle_id,origin_city,destination_city,shipper_address,receiver_address,cargo_name,create_by)
 values('7529f951-938e-4e2c-ac0d-316c136ae1f9','QA-FUEL-RATE-OVERLAP-ROLLBACK','completed',v,'QA起点','QA终点','QA起点','QA终点','QA货物','fuel-rate-test') returning id into w2;
 insert into public.tms_waybill_execution_record(tenant_id,waybill_id,departure_time,return_time,departure_odometer_km,return_odometer_km,departure_fuel_liters,refueled_liters,return_fuel_liters,departure_photo_urls,return_photo_urls,departure_recorded_at,completion_recorded_at,create_by)
 values('7529f951-938e-4e2c-ac0d-316c136ae1f9',w2,'2025-01-01T12:00:00Z','2025-01-02T12:00:00Z',1200,1300,50,10,30,'["https://example.com/tms-test-departure.jpg"]'::jsonb,'["https://example.com/tms-test-return.jpg"]'::jsonb,now(),now(),'fuel-rate-test');
 if public.vms_list_fuel_card_entries_secure(p_ids:=array[e])->'records'->0->>'tripFuelPer100Km' is not null then
   raise exception 'Overlapping trip readings produced a rate';end if;
end $test$;
select 'rate-pass' as result;
rollback;
