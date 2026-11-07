-- Exercise real dispatch snapshots and appointment saves; all fixture changes roll back.
begin;

do $test$
declare
  waybill public.tms_waybill%rowtype;
  candidate record;
  super_actor uuid;
  own_actor uuid;
  actor uuid;
  profile_id uuid;
  other_tenant uuid;
  foreign_waybill uuid;
  snapshot jsonb;
  payload jsonb;
  saved_id uuid;
  saved jsonb;
  appointment_kind text;
  scenario integer;
begin
  select w.* into strict waybill from public.tms_waybill w
    join public.mdm_vehicle v on v.id=w.vehicle_id and v.tenant_id=w.tenant_id
    join public.mdm_driver d on d.id=w.driver_id and d.tenant_id=w.tenant_id
    where w.status='accepted' and v.vehicle_type_profile_id is not null
      and d.phone ~ '^[+0-9() -]{6,24}$'
    order by w.id limit 1;
  select vehicle_type_profile_id into strict profile_id from public.mdm_vehicle where id=waybill.vehicle_id;
  select u.auth_user_id into strict super_actor from public.sys_user u
    join public.sys_role r on r.tenant_id=u.tenant_id and r.role_code=any(u.user_roles)
    where u.system_protected and u.status='1' and u.deleted_at is null
      and r.builtin_type='platform_super' and r.enabled limit 1;
  select id,tenant_id into strict foreign_waybill,other_tenant from public.tms_waybill
    where tenant_id<>waybill.tenant_id and status<>'cancelled' limit 1;
  for candidate in select auth_user_id from public.sys_user
    where tenant_id=waybill.tenant_id and auth_user_id is not null and deleted_at is null and status='1'
  loop
    perform set_config('request.jwt.claims',jsonb_build_object('sub',candidate.auth_user_id,'role','authenticated')::text,true);
    if not app_private.is_platform_super()
      and app_private.has_permission('TmsPickupAppointment:Add')
      and app_private.has_permission('TmsDeliveryAppointment:Add')
      and app_private.can_access_business_menu('TmsPickupAppointment')
      and app_private.can_access_business_menu('TmsDeliveryAppointment') then
      own_actor:=candidate.auth_user_id;
      exit;
    end if;
  end loop;
  if own_actor is null then raise exception 'Appointment ordinary actor fixture missing'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',super_actor,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  update public.vehicle_type_profile set load_tons=12.75,length_m=9.65 where id=profile_id;
  -- Saving a selected model copies its business specifications to the vehicle archive.
  update public.mdm_vehicle set vehicle_type_profile_id=profile_id,
    approved_load_mass=16000,overall_length=11500 where id=waybill.vehicle_id;

  for scenario in 1..4 loop
    actor:=case when scenario<=2 then super_actor else own_actor end;
    perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
    perform set_config('request.headers',case scenario
      when 2 then jsonb_build_object('x-art-tenant-scope',waybill.tenant_id)::text
      when 4 then jsonb_build_object('x-art-tenant-scope',other_tenant)::text
      else '{}' end,true);
    execute 'set local role authenticated';
    foreach appointment_kind in array array['pickup','delivery'] loop
      snapshot:=public.tms_get_appointment_dispatch_snapshot_secure(appointment_kind,waybill.id);
      if (snapshot->>'loadCapacityTon')::numeric is distinct from 12.75
        or (snapshot->>'vehicleLengthM')::numeric is distinct from 9.65 then
        raise exception 'Appointment model specifications missing or certificate fields took priority';
      end if;
      payload:=jsonb_build_object('kind',appointment_kind,'anchor_waybill_id',waybill.id,
        'selected_waybill_ids',jsonb_build_array(waybill.id),
        'driver_name',snapshot->>'driverName','driver_phone',snapshot->>'driverPhone',
        'plate_no',snapshot->>'plateNo','load_capacity_ton',snapshot->'loadCapacityTon',
        'vehicle_length_m',snapshot->'vehicleLengthM','scheduled_at',now()+interval '1 day');
      saved_id:=public.tms_save_waybill_appointment_secure(payload);
      select item into strict saved from jsonb_array_elements(
        public.tms_list_waybill_appointments_secure(appointment_kind,array[waybill.id])) item
        where item->>'id'=saved_id::text;
      if saved->>'anchorWaybillId' is distinct from waybill.id::text
        or (saved->>'loadCapacityTon')::numeric is distinct from 12.75
        or (saved->>'vehicleLengthM')::numeric is distinct from 9.65 then
        raise exception 'Appointment save lost vehicle specifications';
      end if;
      begin
        perform public.tms_save_waybill_appointment_secure(payload||'{"load_capacity_ton":99}'::jsonb);
        raise exception 'Forged appointment vehicle specification accepted';
      exception when check_violation then null;
      end;
      if scenario>=3 then
        begin
          perform public.tms_get_appointment_dispatch_snapshot_secure(appointment_kind,foreign_waybill);
          raise exception 'Ordinary actor read foreign vehicle snapshot';
        exception when insufficient_privilege then null;
        end;
      end if;
    end loop;
    execute 'reset role';
  end loop;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',super_actor,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  update public.mdm_vehicle set vehicle_type_profile_id=null where id=waybill.vehicle_id;
  update public.mdm_vehicle set load_tons=7.25,spec_length_m=6.8 where id=waybill.vehicle_id;
  snapshot:=public.tms_get_appointment_dispatch_snapshot_secure('pickup',waybill.id);
  if (snapshot->>'loadCapacityTon')::numeric is distinct from 7.25
    or (snapshot->>'vehicleLengthM')::numeric is distinct from 6.8 then
    raise exception 'Legacy business vehicle specifications were ignored';
  end if;
  update public.mdm_vehicle set load_tons=null,spec_length_m=null where id=waybill.vehicle_id;
  snapshot:=public.tms_get_appointment_dispatch_snapshot_secure('delivery',waybill.id);
  if (snapshot->>'loadCapacityTon')::numeric is distinct from 16
    or (snapshot->>'vehicleLengthM')::numeric is distinct from 11.5 then
    raise exception 'Certificate fallback did not convert kilograms and millimetres';
  end if;
  update public.vehicle_type_profile set load_tons=null,length_m=null where id=profile_id;
  update public.mdm_vehicle set vehicle_type_profile_id=profile_id where id=waybill.vehicle_id;
  update public.vehicle_type_profile set load_tons=14.25,length_m=12.35 where id=profile_id;
  if exists(select 1 from public.mdm_vehicle where id=waybill.vehicle_id
    and (load_tons is not null or spec_length_m is not null)) then
    raise exception 'Model fallback fixture must have missing archive specifications';
  end if;
  snapshot:=public.tms_get_appointment_dispatch_snapshot_secure('pickup',waybill.id);
  if (snapshot->>'loadCapacityTon')::numeric is distinct from 14.25
    or (snapshot->>'vehicleLengthM')::numeric is distinct from 12.35 then
    raise exception 'Missing archive specifications did not fall back to the linked model';
  end if;
  update public.mdm_vehicle set vehicle_type_profile_id=null where id=waybill.vehicle_id;
  update public.mdm_vehicle set approved_load_mass=null,overall_length=null where id=waybill.vehicle_id;
  snapshot:=public.tms_get_appointment_dispatch_snapshot_secure('delivery',waybill.id);
  if snapshot->>'loadCapacityTon' is not null or snapshot->>'vehicleLengthM' is not null then
    raise exception 'Unavailable vehicle specifications must remain null';
  end if;
end $test$;

rollback;
