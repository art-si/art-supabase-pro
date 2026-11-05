-- Live project fixture. Every role change and appointment insert is rolled back.
-- The ordinary carrier administrator owns the loaded page; these checks isolate
-- the new loaded-page action from the standalone pickup appointment permissions.
begin;
do $grant$
begin
  if (select count(*) from public.sys_menu
      where name='TmsLoadedWaybillList:PickupAppointment' and type='button'
        and parent_id=(select id from public.sys_menu where name='TmsLoadedWaybillList'))<>1
  then raise exception 'Loaded pickup action is not under its page'; end if;
  if exists (
    select 1 from public.sys_role_menu grant_row
    join public.sys_menu button on button.id=grant_row.menu_id
      and button.name='TmsLoadedWaybillList:PickupAppointment'
    where not exists (
      select 1 from public.sys_role_menu page_grant
      join public.sys_menu page on page.id=page_grant.menu_id
        and page.name='TmsLoadedWaybillList'
      where page_grant.role_id=grant_row.role_id
        and page_grant.tenant_id=grant_row.tenant_id
    )
  ) then raise exception 'Loaded pickup action granted without page'; end if;
end $grant$;
delete from public.sys_role_menu rm using public.sys_menu menu
where rm.menu_id=menu.id and rm.role_id='ae3ce695-ba09-4cb5-afae-6ca9249ba05b'
  and (menu.name='TmsPickupAppointment'
    or menu.name like 'TmsPickupAppointment:%');
select set_config('request.jwt.claims',
  '{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
select set_config('request.headers','{}',true);
do $isolated_permission$
begin
  if not app_private.can_access_business_menu('TmsLoadedWaybillList')
    or not app_private.has_permission('TmsLoadedWaybillList:PickupAppointment')
    or app_private.can_access_business_menu('TmsPickupAppointment')
    or app_private.has_permission('TmsPickupAppointment:Add')
  then raise exception 'Loaded action was not isolated from standalone pickup access'; end if;
end $isolated_permission$;
set local role authenticated;
do $pickup$
declare
  own_waybill uuid := '017818b2-69c3-4e28-9185-99cd72014abb';
  foreign_waybill uuid := 'd76b90ef-9d02-4799-a73f-7b01fed18584';
  snapshot jsonb;
  payload jsonb;
  created_id uuid;
  denied boolean;
begin
  if jsonb_typeof(public.tms_list_waybill_appointments_secure('pickup',array[own_waybill]))<>'array'
    or jsonb_typeof(public.tms_list_appointment_candidates_secure(own_waybill))<>'array'
  then raise exception 'Loaded pickup reads failed'; end if;
  snapshot:=public.tms_get_appointment_dispatch_snapshot_secure('pickup',own_waybill);
  payload:=jsonb_build_object(
    'kind','pickup','anchor_waybill_id',own_waybill,
    'selected_waybill_ids',jsonb_build_array(own_waybill),
    'driver_name',snapshot->>'driverName','driver_phone',snapshot->>'driverPhone',
    'plate_no',snapshot->>'plateNo','scheduled_at',now()+interval '1 day'
  );
  created_id:=public.tms_save_waybill_appointment_secure(payload);
  if created_id is null then raise exception 'Loaded pickup creation failed'; end if;
  denied:=false;
  begin
    perform public.tms_save_waybill_appointment_secure(
      payload || jsonb_build_object(
        'anchor_waybill_id','b93ee3e0-cc55-4b39-ab4a-70dd1e39166d',
        'selected_waybill_ids',jsonb_build_array('b93ee3e0-cc55-4b39-ab4a-70dd1e39166d')
      )
    );
  exception when check_violation then denied:=true;
  end;
  if not denied then raise exception 'Loaded pickup created before acceptance'; end if;

  perform set_config('request.headers',
    '{"x-art-tenant-scope":"2824c2b5-2774-4781-b995-f55e8bcee920"}',true);
  denied:=false;
  begin
    perform public.tms_get_appointment_dispatch_snapshot_secure('pickup',foreign_waybill);
  exception when insufficient_privilege then denied:=true;
  end;
  if not denied then raise exception 'Forged header read foreign snapshot'; end if;
  denied:=false;
  begin
    perform public.tms_save_waybill_appointment_secure(
      payload || jsonb_build_object(
        'anchor_waybill_id',foreign_waybill,
        'selected_waybill_ids',jsonb_build_array(foreign_waybill)
      )
    );
  exception when insufficient_privilege then denied:=true;
  end;
  if not denied then raise exception 'Forged header wrote foreign appointment'; end if;
end $pickup$;
rollback;

begin;
delete from public.sys_role_menu rm using public.sys_menu menu
where rm.menu_id=menu.id and rm.role_id='ae3ce695-ba09-4cb5-afae-6ca9249ba05b'
  and (menu.name='TmsPickupAppointment'
    or menu.name like 'TmsPickupAppointment:%'
    or menu.name='TmsLoadedWaybillList:PickupAppointment');
select set_config('request.jwt.claims',
  '{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
select set_config('request.headers','{}',true);
set local role authenticated;
do $denied$
declare
  own_waybill uuid := '017818b2-69c3-4e28-9185-99cd72014abb';
  denied boolean;
begin
  denied:=false;
  begin
    perform public.tms_list_waybill_appointments_secure('pickup',array[own_waybill]);
  exception when insufficient_privilege then denied:=true;
  end;
  if not denied then raise exception 'Appointment read succeeded without either permission'; end if;
  denied:=false;
  begin
    perform public.tms_get_appointment_dispatch_snapshot_secure('pickup',own_waybill);
  exception when insufficient_privilege then denied:=true;
  end;
  if not denied then raise exception 'Snapshot read succeeded without either permission'; end if;
  denied:=false;
  begin
    perform public.tms_save_waybill_appointment_secure(jsonb_build_object(
      'kind','pickup','anchor_waybill_id',own_waybill,
      'selected_waybill_ids',jsonb_build_array(own_waybill),
      'driver_name','验收司机','driver_phone','13900000000',
      'plate_no','冀D12345','scheduled_at',now()+interval '1 day'
    ));
  exception when insufficient_privilege then denied:=true;
  end;
  if not denied then raise exception 'Appointment write succeeded without either permission'; end if;
end $denied$;
rollback;
