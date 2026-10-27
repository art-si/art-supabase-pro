BEGIN;
do $test$
declare
 v_ordinary uuid := 'ab881b32-87d4-4dce-9014-ce488b8069df';
 v_super uuid := '0a872664-874c-447d-a256-d0dbdca6ed45';
 v_tenant uuid := '7529f951-938e-4e2c-ac0d-316c136ae1f9';
 v_other uuid := '2824c2b5-2774-4781-b995-f55e8bcee920';
 v_vehicle uuid := 'a9fc0004-1023-4620-9220-000000000001';
 v_trailer uuid := '1d395220-49c4-4d1c-b49c-decdf21a9022';
 v_vehicle_path text := '7529f951-938e-4e2c-ac0d-316c136ae1f9/ab881b32-87d4-4dce-9014-ce488b8069df/60fe50bf-c2ae-4301-8ebf-924594848d8c.png';
 v_trailer_path text := '7529f951-938e-4e2c-ac0d-316c136ae1f9/ab881b32-87d4-4dce-9014-ce488b8069df/60fe50bf-c2ae-4301-8ebf-924594848d8d.png';
begin
 perform set_config('request.jwt.claim.sub',v_ordinary::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_ordinary,'role','authenticated')::text,true);
 perform set_config('request.headers','{}',true);
 if not app_private.vms_vehicle_private_upload_allowed(v_vehicle_path)
   or not app_private.vms_trailer_private_upload_allowed(v_trailer_path)
   or app_private.vms_vehicle_private_upload_allowed(replace(v_vehicle_path,v_tenant::text,v_other::text))
   or app_private.vms_trailer_private_upload_allowed(replace(v_trailer_path,v_tenant::text,v_other::text)) then
  raise exception 'ordinary scope invalid';
 end if;
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',v_other)::text,true);
 if app_private.vms_vehicle_private_upload_allowed(replace(v_vehicle_path,v_tenant::text,v_other::text))
   or not app_private.vms_vehicle_private_upload_allowed(v_vehicle_path) then raise exception 'forged header accepted'; end if;
 perform set_config('request.jwt.claim.sub',v_super::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_super,'role','authenticated')::text,true);
 perform set_config('request.headers','{}',true);
 if not app_private.vms_vehicle_private_upload_allowed(replace(replace(v_vehicle_path,v_tenant::text,v_other::text),v_ordinary::text,v_super::text))
   or not app_private.vms_trailer_private_upload_allowed(replace(replace(v_trailer_path,v_tenant::text,v_other::text),v_ordinary::text,v_super::text)) then raise exception 'platform all explicit target denied'; end if;
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',v_tenant)::text,true);
 if app_private.vms_vehicle_private_upload_allowed(replace(replace(v_vehicle_path,v_tenant::text,v_other::text),v_ordinary::text,v_super::text)) then raise exception 'platform selected scope leaked'; end if;
 insert into storage.objects(bucket_id,name,owner_id) values
   ('vms-vehicle-private',v_vehicle_path,v_ordinary::text),
   ('vms-trailer-private',v_trailer_path,v_ordinary::text);
 perform set_config('request.jwt.claim.sub',v_ordinary::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_ordinary,'role','authenticated')::text,true);
 perform set_config('request.headers','{}',true);
 update public.mdm_vehicle set driving_license_front_url=v_vehicle_path where id=v_vehicle;
 update public.vehicle_trailer set license_front_url=v_trailer_path where id=v_trailer;
 insert into public.mdm_vehicle
 select (jsonb_populate_record(v,jsonb_build_object(
   'id',gen_random_uuid(),'plate_no','测私有插入001',
   'driving_license_front_url',null,'attachments','[]'::jsonb))).*
 from public.mdm_vehicle v where v.id=v_vehicle;
 insert into public.vehicle_trailer
 select (jsonb_populate_record(t,jsonb_build_object(
   'id',gen_random_uuid(),'plate_no','测私有挂001',
   'default_tractor_id',null,'license_front_url',null))).*
 from public.vehicle_trailer t where t.id=v_trailer;
 if not app_private.vms_vehicle_private_read_allowed(v_vehicle_path)
    or not app_private.vms_trailer_private_read_allowed(v_trailer_path) then raise exception 'referenced private read denied'; end if;
 perform set_config('request.jwt.claim.sub','2e294b61-24a9-4eaf-8fac-1daffc1e6131',true);
 perform set_config('request.jwt.claims','{"sub":"2e294b61-24a9-4eaf-8fac-1daffc1e6131","role":"authenticated"}',true);
 if not app_private.vms_vehicle_private_read_allowed(v_vehicle_path)
    or not app_private.vms_trailer_private_read_allowed(v_trailer_path)
 then raise exception 'authorized non-owner document view denied'; end if;
 perform set_config('request.jwt.claim.sub',v_ordinary::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_ordinary,'role','authenticated')::text,true);
 begin
  update public.mdm_vehicle set driving_license_front_url='https://example.test/public.png' where id=v_vehicle;
  raise exception 'vehicle public URL accepted';
 exception when sqlstate '42501' then null; end;
 begin
  update public.vehicle_trailer set license_front_url='https://example.test/public.png' where id=v_trailer;
  raise exception 'trailer public URL accepted';
 exception when sqlstate '42501' then null; end;
 if (select driving_license_front_url from public.mdm_vehicle where id=v_vehicle)<>v_vehicle_path
    or (select license_front_url from public.vehicle_trailer where id=v_trailer)<>v_trailer_path then raise exception 'rejected update mutated row'; end if;
end $test$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','ab881b32-87d4-4dce-9014-ce488b8069df',true);
SELECT set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
SELECT set_config('request.headers','{}',true);
INSERT INTO storage.objects(bucket_id,name,owner_id,owner,metadata) VALUES
('vms-vehicle-private','7529f951-938e-4e2c-ac0d-316c136ae1f9/ab881b32-87d4-4dce-9014-ce488b8069df/34f44960-d3ea-4e88-893e-f0eb9ec8910a.png','ab881b32-87d4-4dce-9014-ce488b8069df','ab881b32-87d4-4dce-9014-ce488b8069df','{"mimetype":"image/png","size":100}'::jsonb),
('vms-trailer-private','7529f951-938e-4e2c-ac0d-316c136ae1f9/ab881b32-87d4-4dce-9014-ce488b8069df/34f44960-d3ea-4e88-893e-f0eb9ec8910b.png','ab881b32-87d4-4dce-9014-ce488b8069df','ab881b32-87d4-4dce-9014-ce488b8069df','{"mimetype":"image/png","size":100}'::jsonb);
SELECT set_config('storage.operation','object.sign',true);
DO $read$
BEGIN
  IF (SELECT count(*) FROM storage.objects WHERE bucket_id IN ('vms-vehicle-private','vms-trailer-private'))<>4
  THEN RAISE EXCEPTION 'Authenticated private image upload/sign denied'; END IF;
END;
$read$;
ROLLBACK;
