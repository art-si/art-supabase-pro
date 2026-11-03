begin;
do $test$
<<asset_rules>>
declare
 platform_uid uuid:='0a872664-874c-447d-a256-d0dbdca6ed45';
 ordinary_uid uuid:='ab881b32-87d4-4dce-9014-ce488b8069df';
 platform_tenant uuid:='028e6a68-a9db-4055-974c-1e05bfe94b0f';
 own_tenant uuid:='7529f951-938e-4e2c-ac0d-316c136ae1f9';
 foreign_tenant uuid:='2824c2b5-2774-4781-b995-f55e8bcee920';
 target uuid; record_id uuid; carrier_id uuid; carrier_name text; company_name text;
 refs jsonb; blocked boolean; scope integer;
begin
 for scope in 1..4 loop
  perform set_config('request.jwt.claim.sub',case when scope<=2 then platform_uid else ordinary_uid end::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',case when scope<=2 then platform_uid else ordinary_uid end,'role','authenticated')::text,true);
  perform set_config('request.headers',case when scope=2 then jsonb_build_object('x-art-tenant-scope',own_tenant)::text when scope=4 then jsonb_build_object('x-art-tenant-scope',foreign_tenant)::text else '{}' end,true);
  target:=case when scope=1 then platform_tenant else own_tenant end;
  refs:=public.vms_list_asset_carrier_options_secure();
  if exists(select 1 from jsonb_array_elements(refs) r where (r->>'tenantId')::uuid<>target) then
   raise exception 'Carrier options leaked across tenant in case %',scope;
  end if;
  refs:=public.vms_list_asset_company_options_secure();
  if jsonb_array_length(refs)>0 and (select count(*) from jsonb_array_elements(refs) r where (r->>'isDefault')::boolean)<>1 then
   raise exception 'Company default must be unique in case %',scope;
  end if;
  if scope in (3,4) then
   blocked:=false;
   begin perform public.vms_list_asset_carrier_options_secure(p_tenant_id=>foreign_tenant);
   exception when sqlstate '42501' then blocked:=true; end;
   if not blocked then raise exception 'Ordinary foreign asset references allowed'; end if;
  end if;
 end loop;
 perform set_config('request.jwt.claim.sub',platform_uid::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',platform_uid,'role','authenticated')::text,true);
 perform set_config('request.headers','{}',true);
 select c.id,c.company_name into carrier_id,carrier_name from public.mdm_carrier c where tenant_id=own_tenant and enabled order by id limit 1;
 if carrier_id is null then raise exception 'Carrier fixture missing'; end if;
 record_id:=public.vms_create_vehicle_archive_secure(jsonb_build_object(
  'tenant_id',own_tenant,'plate_no','测A资产规则回滚','vehicle_type','厢式货车',
  'carrier_id',carrier_id,'vehicle_ownership','self_operated','is_new_energy',false
 ));
 if not exists(select 1 from public.mdm_vehicle v where v.id=record_id and v.company_name=carrier_name and v.vehicle_ownership='carrier' and not v.is_new_energy) then
  raise exception 'Carrier company/ownership or energy default not applied';
 end if;
 perform public.vms_update_vehicle_archive_secure(record_id,jsonb_build_object('company_name','可编辑公司'));
 if (select v.company_name from public.mdm_vehicle v where id=record_id)<>'可编辑公司' then raise exception 'Company is not editable'; end if;
 record_id:=public.vms_create_vehicle_archive_secure(jsonb_build_object(
  'tenant_id',own_tenant,'plate_no','测A首次公司编辑回滚','vehicle_type','厢式货车',
  'carrier_id',carrier_id,'company_name','首次保存手工公司','vehicle_ownership','carrier'
 ));
 if not exists(select 1 from public.mdm_vehicle v where v.id=record_id and v.company_name='首次保存手工公司' and v.carrier_id=asset_rules.carrier_id) then
  raise exception 'Company edited before first save was overwritten or carrier detached';
 end if;
 blocked:=false;
 begin perform public.vms_update_vehicle_archive_secure(record_id,'{"is_new_energy":null}'::jsonb);
 exception when sqlstate '22023' then blocked:=true; end;
 if not blocked then raise exception 'Null energy selection accepted'; end if;
 record_id:=public.vms_create_vehicle_archive_secure(jsonb_build_object(
  'tenant_id',own_tenant,'plate_no','测A法人默认回滚','vehicle_type','厢式货车','vehicle_ownership','self_operated'
 ));
 select o.organization_name into company_name from public.mdm_organization o join public.sys_tenant t on t.id=o.tenant_id
 where o.tenant_id=own_tenant and o.organization_type='company' and o.status='1'
 order by (o.organization_name=t.tenant_name) desc,(o.parent_id is null) desc,o.sort,o.id limit 1;
 if company_name is not null and (select v.company_name from public.mdm_vehicle v where id=record_id)<>company_name then
  raise exception 'Vehicle create did not default legal company';
 end if;
 if has_function_privilege('anon','public.vms_list_asset_company_options_secure(uuid,uuid,uuid,text)','execute') then
  raise exception 'Anonymous asset reference access granted';
 end if;
end $test$;
rollback;
