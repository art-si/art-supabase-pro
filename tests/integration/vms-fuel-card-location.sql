-- Oil-card location capture: map/device coordinates survive the write/read boundary.
-- Every financial trial below is rolled back; the six persistent QA rows and ¥2800 balance remain.
begin;
do $test$
declare
  actor uuid := 'ab881b32-87d4-4dce-9014-ce488b8069df';
  card uuid := '4dd0014c-cb7a-45dd-aa5f-efff5bcc89cb';
  card_balance_before numeric;
  total_balance_before numeric;
  map_entry uuid;
  device_entry uuid;
  manual_entry uuid;
  reversal_entry uuid;
  page jsonb;
  item jsonb;
  denied boolean;
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  select coalesce(sum(signed_amount),0) into card_balance_before
  from public.vms_fuel_card_entry where card_id=card;
  select coalesce(sum(signed_amount),0) into total_balance_before
  from public.vms_fuel_card_entry where tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9';
  if card_balance_before<>1615 or total_balance_before<>2800 then
    raise exception 'Fuel QA balance changed before coordinate test';end if;

  map_entry:=public.vms_record_fuel_card_transaction_v4(
    p_card_id=>card,p_entry_type=>'consume',p_amount=>1.23,
    p_occurred_on=>(now() at time zone 'Asia/Shanghai')::date,
    p_reference_no=>'QA-LOCATION-MAP-ROLLBACK',
    p_station_name=>'QA 测试加油站',p_liters=>0.2,p_unit_price=>6.15,
    p_payment_method=>'fuel_card',p_occurred_at=>now(),
    p_expense_location=>'QA 地图选点：上海市黄浦区人民广场',
    p_expense_longitude=>121.4737013,p_expense_latitude=>31.2304167,
    p_expense_coordinate_system=>'gcj02',p_expense_coordinate_source=>'map_pick',
    p_expense_coordinate_status=>'located',p_expense_geocode_provider=>'amap',
    p_expense_geocoded_at=>now());
  device_entry:=public.vms_record_fuel_card_transaction_v4(
    p_card_id=>card,p_entry_type=>'consume',p_amount=>1.23,
    p_occurred_on=>(now() at time zone 'Asia/Shanghai')::date,
    p_reference_no=>'QA-LOCATION-DEVICE-ROLLBACK',
    p_station_name=>'QA 测试加油站',p_liters=>0.2,p_unit_price=>6.15,
    p_payment_method=>'fuel_card',p_occurred_at=>now(),
    p_expense_location=>'QA 当前位置：北京市东城区天安门',
    p_expense_longitude=>116.3971280,p_expense_latitude=>39.9165270,
    p_expense_coordinate_system=>'gcj02',
    p_expense_coordinate_source=>'device_geolocation',
    p_expense_coordinate_status=>'located',p_expense_geocode_provider=>'amap',
    p_expense_geocoded_at=>now());
  manual_entry:=public.vms_record_fuel_card_transaction_v4(
    p_card_id=>card,p_entry_type=>'consume',p_amount=>0.01,
    p_occurred_on=>(now() at time zone 'Asia/Shanghai')::date,
    p_reference_no=>'QA-LOCATION-MANUAL-ROLLBACK',
    p_payment_method=>'fuel_card',p_occurred_at=>now(),
    p_expense_location=>'QA 手动改地址，无确认坐标',
    p_expense_coordinate_status=>'unconfirmed');

  page:=public.vms_list_fuel_card_entries_secure(0,99,card,null,null,null,null,false,null);
  select value into item from jsonb_array_elements(page->'records')
   where value->>'id'=map_entry::text;
  if item is null or (item->>'expenseLongitude')::numeric<>121.4737013
    or (item->>'expenseLatitude')::numeric<>31.2304167
    or item->>'expenseCoordinateSource'<>'map_pick'
    or item->>'expenseCoordinateStatus'<>'located' then
    raise exception 'Map coordinate failed write/list round trip: %',item;end if;
  select value into item from jsonb_array_elements(page->'records')
   where value->>'id'=device_entry::text;
  if item is null or (item->>'expenseLongitude')::numeric<>116.3971280
    or item->>'expenseCoordinateSource'<>'device_geolocation' then
    raise exception 'Device location failed write/list round trip: %',item;end if;
  select value into item from jsonb_array_elements(page->'records')
   where value->>'id'=manual_entry::text;
  if item is null or item->>'expenseLongitude' is not null
    or item->>'expenseLatitude' is not null
    or item->>'expenseCoordinateStatus'<>'unconfirmed' then
    raise exception 'Manual address retained a stale coordinate: %',item;end if;

  denied:=false;
  begin
    perform public.vms_record_fuel_card_transaction_v4(
      p_card_id=>card,p_entry_type=>'consume',p_amount=>1,
      p_occurred_on=>(now() at time zone 'Asia/Shanghai')::date,
      p_payment_method=>'fuel_card',p_occurred_at=>now(),
      p_expense_location=>'QA 不完整坐标',
      p_expense_longitude=>121.4737013,p_expense_coordinate_status=>'located');
  exception when invalid_parameter_value or check_violation then denied:=true;
  end;
  if not denied then raise exception 'Incomplete coordinate was accepted';end if;
  denied:=false;
  begin
    perform public.vms_record_fuel_card_transaction_v4(
      p_card_id=>card,p_entry_type=>'consume',p_amount=>1,
      p_occurred_on=>(now() at time zone 'Asia/Shanghai')::date,
      p_payment_method=>'cash',p_occurred_at=>now(),
      p_expense_location=>'QA 非油卡支付');
  exception when invalid_parameter_value or check_violation then denied:=true;
  end;
  if not denied then raise exception 'Non-fuel payment was charged to oil card';end if;
  reversal_entry:=public.vms_record_fuel_card_transaction_v4(
    p_card_id=>card,p_entry_type=>'reversal',p_amount=>1.23,
    p_occurred_on=>(now() at time zone 'Asia/Shanghai')::date,
    p_reverses_entry_id=>map_entry,p_remark=>'QA 地图流水冲正');
  if not exists(select 1 from public.vms_fuel_card_entry e
    where e.id=reversal_entry and e.reverses_entry_id=map_entry
      and e.signed_amount=1.23 and e.expense_coordinate_status='pending'
      and e.expense_longitude is null) then
    raise exception 'v4 reversal did not preserve audit trail';end if;
  if (select coalesce(sum(signed_amount),0) from public.vms_fuel_card_entry where card_id=card)
      <>card_balance_before-1.24 then
    raise exception 'Map/device/manual QA balance unexpected';end if;
  if (select coalesce(sum(signed_amount),0) from public.vms_fuel_card_entry
      where tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9')
      <>total_balance_before-1.24 then
    raise exception 'Tenant oil-card total changed unexpectedly';end if;
  execute 'reset role';
end $test$;
rollback;
