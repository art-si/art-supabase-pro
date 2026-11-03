begin;
select set_config('request.jwt.claim.sub','0a872664-874c-447d-a256-d0dbdca6ed45',true);
select set_config('request.jwt.claims','{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
select set_config('request.headers','{}',true);
do $test$
declare
 t uuid := '1d395220-49c4-4d1c-b49c-decdf21a9022';
 a uuid := 'a9fc0004-1023-4620-9220-000000000001';
 b uuid := 'a9fc0004-1023-4620-9220-000000000002';
 f uuid := '283514f3-6fac-48f0-afbe-8e893ddf2f67';
 c uuid := 'a9fc0002-1023-4620-9220-000000000001';
 org uuid := '8fbc1836-d0ea-4afd-98c6-f557ab40fe4f';
 profile uuid;
 created jsonb;
 options jsonb;
 saved jsonb;
 expected_ownership text;
 blocked boolean;
begin
 select vehicle_type_profile_id into profile from public.vehicle_trailer where id=t;
 created:=public.vms_save_trailer_secure(null,jsonb_build_object(
  'tenant_id','7529f951-938e-4e2c-ac0d-316c136ae1f9',
  'plate_no','测挂车公司编辑回滚',
  'plate_color','yellow',
  'vehicle_type_profile_id',profile,
  'owner_name','挂车公司规则验收',
  'carrier_id',c,
  'company_name','手工所属公司'
 ));
 if created->>'company_name'<>'手工所属公司' or created->>'carrier_id'<>c::text then
  raise exception 'new trailer manual company edit was overwritten';
 end if;
 perform public.vms_save_trailer_secure(t,jsonb_build_object('tractor_ids',jsonb_build_array(a,b),'default_tractor_id',a));
 if (select count(*) from public.vehicle_trailer_tractor where trailer_id=t)<>2 then raise exception 'multiple links failed'; end if;
 select vehicle_ownership into expected_ownership from public.mdm_vehicle where id=a;
 options:=public.vms_list_trailer_tractor_options_secure(t,null,'测A验收001',0,9);
 saved:=public.vms_get_trailer_secure(t);
 if (select x->>'ownership' from jsonb_array_elements(options->'records') x where x->>'id'=a::text) is distinct from expected_ownership then
  raise exception 'tractor option ownership differs from vehicle ownership';
 end if;
 if (select x->>'ownership' from jsonb_array_elements(saved->'tractors') x where x->>'id'=a::text) is distinct from expected_ownership then
  raise exception 'saved trailer tractor ownership differs from vehicle ownership';
 end if;
 perform public.vms_save_trailer_secure(t,jsonb_build_object('default_tractor_id',b));
 if (select default_tractor_id from public.vehicle_trailer where id=t)<>b then raise exception 'default change failed'; end if;
 blocked:=false;
 begin perform public.vms_save_trailer_secure(t,jsonb_build_object('tractor_ids',jsonb_build_array(a,b),'default_tractor_id',f));
 exception when sqlstate '23514' then blocked:=true; end;
 if not blocked then raise exception 'foreign default accepted'; end if;
 blocked:=false;
 begin perform public.vms_save_trailer_secure(t,jsonb_build_object('tractor_ids',jsonb_build_array(a,f),'default_tractor_id',a));
 exception when sqlstate '23514' then blocked:=true; end;
 if not blocked then raise exception 'foreign tractor accepted'; end if;
 perform public.vms_save_trailer_secure(t,jsonb_build_object('carrier_id',c));
 if (select company_name from public.vehicle_trailer where id=t)<>'报表验收·华东运力' then raise exception 'carrier initial company failed'; end if;
 perform public.vms_save_trailer_secure(t,jsonb_build_object('company_name','手工所属公司'));
 if not exists(select 1 from public.vehicle_trailer where id=t and carrier_id=c and company_organization_id is null and company_name='手工所属公司') then
  raise exception 'manual company edit detached carrier';
 end if;
 perform public.vms_save_trailer_secure(t,jsonb_build_object('company_organization_id',org,'company_name','武安市子成物流有限公司'));
 if not exists(select 1 from public.vehicle_trailer where id=t and carrier_id=c and company_organization_id=org and company_name='武安市子成物流有限公司' and ownership='carrier') then raise exception 'company edit detached carrier'; end if;
end $test$;
set local role authenticated;
do $scope$
declare
 super uuid:='0a872664-874c-447d-a256-d0dbdca6ed45';
 ordinary uuid:='ab881b32-87d4-4dce-9014-ce488b8069df';
 foreign_tenant uuid:='2824c2b5-2774-4781-b995-f55e8bcee920';
 t uuid:='1d395220-49c4-4d1c-b49c-decdf21a9022';
 actual integer;
 scope integer;
 expected integer;
 linked jsonb;
 blocked boolean;
begin
 for scope in 1..4 loop
  perform set_config('request.jwt.claim.sub',case when scope<=2 then super else ordinary end::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',case when scope<=2 then super else ordinary end,'role','authenticated')::text,true);
  perform set_config('request.headers',case when scope in (2,4) then jsonb_build_object('x-art-tenant-scope',foreign_tenant)::text else '{}' end,true);
  select count(*) into actual from public.vehicle_trailer_tractor where trailer_id=t;
  expected:=case when scope=2 then 0 else 2 end;
  if actual<>expected then raise exception 'join direct read scope % returned % expected %',scope,actual,expected; end if;
  blocked:=false;
  begin
   linked:=public.vms_list_vehicle_trailers_secure('a9fc0004-1023-4620-9220-000000000001');
  exception when sqlstate '42501' then blocked:=true; end;
  if scope=2 and not blocked then raise exception 'selected tenant RPC read leaked'; end if;
  if scope<>2 and (blocked or not exists(select 1 from jsonb_array_elements(linked) x where x->>'id'=t::text)) then
   raise exception 'authorized RPC read missing in scope %',scope;
  end if;
 end loop;
end $scope$;
rollback;
