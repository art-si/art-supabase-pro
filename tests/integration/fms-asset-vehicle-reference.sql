BEGIN;
DO $test$
DECLARE a public.fms_fixed_asset%rowtype; own_vehicle uuid; foreign_vehicle uuid; secured jsonb;
BEGIN
 SELECT * INTO STRICT a FROM public.fms_fixed_asset WHERE id='ffb23912-c42c-4bb3-b8b5-801d3e332b15';
 SELECT id INTO STRICT own_vehicle FROM public.mdm_vehicle WHERE tenant_id=a.tenant_id LIMIT 1;
 INSERT INTO public.mdm_vehicle(tenant_id,plate_no,vehicle_type,created_by_user_id)
 SELECT u.tenant_id,'资产关联跨租户测试',v.vehicle_type,u.id FROM public.sys_user u CROSS JOIN public.mdm_vehicle v
 WHERE u.tenant_id<>a.tenant_id AND v.id=own_vehicle LIMIT 1 RETURNING id INTO foreign_vehicle;
 IF foreign_vehicle IS NULL THEN RAISE EXCEPTION 'Foreign fixture missing'; END IF;
 UPDATE public.fms_fixed_asset SET vehicle_id=own_vehicle WHERE id=a.id;
 BEGIN
   UPDATE public.fms_fixed_asset SET vehicle_id=foreign_vehicle WHERE id=a.id;
   RAISE EXCEPTION 'Cross tenant vehicle association accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL;
 END;
 secured:=app_private.fms_fixed_asset_to_secure_json(jsonb_build_object('vehicle_id',own_vehicle),null,'{"assetReferences":"hidden"}');
 IF secured->>'vehicle_id' IS NOT NULL THEN RAISE EXCEPTION 'Hidden vehicle reference exposed'; END IF;
 secured:=app_private.fms_fixed_asset_to_secure_json(jsonb_build_object('vehicle_id',own_vehicle),null,'{"assetReferences":"read"}');
 IF secured->>'vehicle_id' IS DISTINCT FROM own_vehicle::text THEN RAISE EXCEPTION 'Readable vehicle reference missing'; END IF;
END $test$;
DO $rpc$
DECLARE actor uuid; asset public.fms_fixed_asset%rowtype; v uuid; payload jsonb; result jsonb;
BEGIN
 SELECT auth_user_id INTO actor FROM public.sys_user WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 PERFORM set_config('request.headers','{}',true);
 SELECT * INTO STRICT asset FROM public.fms_fixed_asset WHERE id='ffb23912-c42c-4bb3-b8b5-801d3e332b15';
 SELECT id INTO STRICT v FROM public.mdm_vehicle WHERE tenant_id=asset.tenant_id LIMIT 1;
 payload:=jsonb_build_object('id',asset.id,'accountSetId',asset.account_set_id,'categoryId',asset.category_id,'assetNo',asset.asset_no,'assetName',asset.asset_name,'acquisitionDate',asset.acquisition_date,'readyForUseDate',asset.ready_for_use_date,'depreciationStartDate',asset.depreciation_start_date,'originalValue',asset.original_value,'residualValue',asset.residual_value,'usefulLifeMonths',asset.useful_life_months,'vehicleId',v);
 result:=public.save_fms_fixed_asset_secure(payload);
 IF result->>'vehicle_id' IS DISTINCT FROM v::text THEN RAISE EXCEPTION 'Vehicle save roundtrip failed'; END IF;
 result:=public.save_fms_fixed_asset_secure(payload-'vehicleId');
 IF result->>'vehicle_id' IS DISTINCT FROM v::text THEN RAISE EXCEPTION 'Old caller cleared vehicle'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.get_master_data_delete_dependency_details('vehicle',ARRAY[v]) WHERE dependency_code='vehicle_fixed_asset' AND record_id=asset.id AND NOT cleanup_allowed) THEN RAISE EXCEPTION 'Asset dependency missing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.fms_list_asset_vehicle_options_secure(asset.account_set_id,NULL,v)) j WHERE j->>'value'=v::text) THEN RAISE EXCEPTION 'Vehicle selection missing'; END IF;
 PERFORM set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
 BEGIN
  PERFORM public.fms_list_asset_vehicle_options_secure(asset.account_set_id,NULL,v);
  RAISE EXCEPTION 'Selected tenant bypass';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $rpc$;
ROLLBACK;
