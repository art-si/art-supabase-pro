begin;
do $test$
declare
 platform_user uuid:='0a872664-874c-447d-a256-d0dbdca6ed45';
 ordinary_user uuid:='ab881b32-87d4-4dce-9014-ce488b8069df';
 qa_tenant uuid:='2824c2b5-2774-4781-b995-f55e8bcee920';
 own_tenant uuid:='7529f951-938e-4e2c-ac0d-316c136ae1f9';
 vehicle uuid;owner_employee uuid;card uuid;entry uuid;other_waybill uuid;linked public.vms_fuel_card_entry%rowtype;
 result jsonb;rejected boolean;
begin
 select v.id,d.employee_id into vehicle,owner_employee from public.mdm_vehicle v
 join public.mdm_driver d on d.id=v.primary_driver_id and d.tenant_id=v.tenant_id
 where v.id='d7670b37-2283-433e-95d2-7315829b0edc';
 if vehicle is null or owner_employee is null then raise exception 'QA vehicle/employee unavailable';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',platform_user,'role','authenticated')::text,true);
 perform set_config('request.headers','{}',true);
 rejected:=false;
 begin
   perform public.vms_create_fuel_card_v2(
     p_card_no:='QA-VMS-FUEL-FORGED-IMAGE',p_vehicle_id:=vehicle,
     p_image_path:=own_tenant::text||'/'||platform_user::text||'/00000000-0000-0000-0000-000000000001.png');
 exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'Forged card image path accepted';end if;
 card:=public.vms_create_fuel_card_v2('QA-VMS-FUEL-V2-ROLLBACK',vehicle,'QA','rollback',100,null,'diesel_0',null,owner_employee);
 result:=public.vms_list_fuel_cards_secure(p_ids:=array[card]);
 if result->'records'->0->>'ownerEmployeeId'<>owner_employee::text
   or result->'records'->0->>'openerEmployeeId'<>owner_employee::text then
   raise exception 'Owner default or opener missing'; end if;
 perform public.vms_update_fuel_card(card,null,'gasoline_92',owner_employee,owner_employee,'QA edited','rollback edit');
 result:=public.vms_list_fuel_cards_secure(p_ids:=array[card]);
 if result->'records'->0->>'fuelType'<>'gasoline_92'
   or result->'records'->0->>'issuer'<>'QA edited'
   or (result->'records'->0->>'balance')::numeric<>100 then
   raise exception 'Card metadata edit changed balance or failed';end if;
 if (public.vms_list_fuel_card_driver_options_secure(card)->>'total')::int<1 then
   raise exception 'Card driver options missing';end if;
 entry:=public.vms_record_fuel_card_transaction_v3(
   p_card_id:=card,p_entry_type:='consume',p_amount:=20,p_occurred_on:=current_date,
   p_station_name:='QA Station',p_liters:=2,p_unit_price:=10,
   p_payment_method:='fuel_card',p_expense_location:='QA Location',p_odometer_km:=100);
 rejected:=false;
 begin
   perform public.vms_record_fuel_card_transaction_v3(
     p_card_id:=card,p_entry_type:='consume',p_amount:=1,p_occurred_on:=current_date,
     p_payment_method:='electric_card');
 exception when check_violation then rejected:=true;end;
 if not rejected then raise exception 'Electric card payment decremented fuel card';end if;
 rejected:=false;
 begin
   perform public.vms_record_fuel_card_transaction_v2(
     p_card_id:=card,p_entry_type:='consume',p_amount:=1,p_occurred_on:=current_date,
     p_payment_method:='cash');
 exception when check_violation then rejected:=true;end;
 if not rejected then raise exception 'Cash payment decremented fuel card';end if;
 if (select count(*) from public.vms_fuel_card_entry where card_id=card)<>2
   or (select sum(signed_amount) from public.vms_fuel_card_entry where card_id=card)<>80 then
   raise exception 'Rejected payments altered the fuel card ledger';end if;
 if exists(select 1 from public.vms_fuel_card_entry where card_id=card and entry_type='consume'
   and payment_method is distinct from 'fuel_card') then
   raise exception 'Fuel consumption payment method was not normalized';end if;
 rejected:=false;
 begin
   perform public.vms_record_fuel_card_transaction_v3(
     p_card_id:=card,p_entry_type:='consume',p_amount:=1,p_occurred_on:=current_date,
     p_voucher_paths:=array[own_tenant::text||'/'||platform_user::text||'/00000000-0000-0000-0000-000000000002.png']);
 exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'Forged fuel receipt path accepted';end if;
 select w.id into other_waybill from public.tms_waybill w
 where w.tenant_id=own_tenant and w.vehicle_id is not null and w.vehicle_id<>vehicle limit 1;
 if other_waybill is null then raise exception 'Cross-vehicle QA waybill missing';end if;
 rejected:=false;
 begin
   perform public.vms_record_fuel_card_transaction_v3(
     p_card_id:=card,p_entry_type:='consume',p_amount:=1,p_occurred_on:=current_date,
     p_waybill_id:=other_waybill);
 exception when foreign_key_violation then rejected:=true;end;
 if not rejected then raise exception 'Other vehicle waybill linked to fuel card';end if;
 result:=public.vms_list_fuel_card_entries_secure(p_ids:=array[entry]);
 if result->'records'->0->>'driverId' is null
   or result->'records'->0->>'stationName'<>'QA Station'
   or result->'records'->0->>'expenseLocation'<>'QA Location'
   or (result->'records'->0->>'balanceAfter')::numeric<>80 then
   raise exception 'Entry data/balance missing';end if;
 perform public.vms_set_fuel_card_status(card,'lost');
 rejected:=false;
 begin perform public.vms_record_fuel_card_transaction_v3(card,'consume',1,current_date);
 exception when check_violation then rejected:=true;end;
 if not rejected then raise exception 'Lost card accepted consumption';end if;
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',qa_tenant)::text,true);
 if (public.vms_list_fuel_cards_secure(p_ids:=array[card])->>'total')::int<>0 then
   raise exception 'Selected tenant leaked card';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ordinary_user,'role','authenticated')::text,true);
 if (public.vms_list_fuel_cards_secure(p_ids:=array[card])->>'total')::int<>1 then
   raise exception 'Forged header changed ordinary scope';end if;
 if (public.vms_list_fuel_card_employee_options_secure(p_tenant_id:=qa_tenant)->>'total')::int<>0 then
   raise exception 'Employee option leaked';end if;
 if jsonb_typeof(public.vms_list_fuel_card_waybill_options_secure(card)->'records')<>'array' then
   raise exception 'Card waybill option failed';end if;
 select * into linked from public.vms_fuel_card_entry where source_cost_id is not null limit 1;
 if linked.id is null then raise exception 'Linked QA entry missing';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',platform_user,'role','authenticated')::text,true);
 perform set_config('request.headers','{}',true);
 rejected:=false;
 begin perform public.vms_record_fuel_card_transaction(
   linked.card_id,'reversal',linked.amount,current_date,'QA-REVERSAL','',linked.id);
 exception when check_violation then rejected:=true;end;
 if not rejected then raise exception 'Linked FMS cost was manually reversed';end if;
end $test$;
select 'fuel-v2-v3-security-passed' as result;
rollback;

-- Direct Data API reads must require both tenant scope and business permission.
begin;
create temp table fuel_rls_probe(label text primary key,card_count int,entry_count int) on commit drop;
grant insert on fuel_rls_probe to authenticated;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub','ab881b32-87d4-4dce-9014-ce488b8069df','role','authenticated')::text,true);
select set_config('request.headers',jsonb_build_object('x-art-tenant-scope','2824c2b5-2774-4781-b995-f55e8bcee920')::text,true);
insert into fuel_rls_probe select 'ordinary-forged',(select count(*) from vms_fuel_card),(select count(*) from vms_fuel_card_entry);
select set_config('request.jwt.claims',jsonb_build_object('sub','0a872664-874c-447d-a256-d0dbdca6ed45','role','authenticated')::text,true);
insert into fuel_rls_probe select 'super-selected',(select count(*) from vms_fuel_card),(select count(*) from vms_fuel_card_entry);
select set_config('request.headers','{}',true);
insert into fuel_rls_probe select 'super-all',(select count(*) from vms_fuel_card),(select count(*) from vms_fuel_card_entry);
select set_config('request.jwt.claims',jsonb_build_object('sub','9850d41a-77e9-40a7-b2cb-0ad02ac01440','role','authenticated')::text,true);
insert into fuel_rls_probe select 'no-role',(select count(*) from vms_fuel_card),(select count(*) from vms_fuel_card_entry);
reset role;
do $rls$
begin
 if (select card_count from fuel_rls_probe where label='ordinary-forged')<>2
   or (select entry_count from fuel_rls_probe where label='ordinary-forged')<2
   or (select card_count from fuel_rls_probe where label='super-selected')<>0
   or (select entry_count from fuel_rls_probe where label='super-selected')<>0
   or (select card_count from fuel_rls_probe where label='super-all')<>2
   or (select card_count from fuel_rls_probe where label='no-role')<>0
   or (select entry_count from fuel_rls_probe where label='no-role')<>0 then
   raise exception 'Fuel-card direct RLS scope or permission regression';
 end if;
end $rls$;
rollback;
