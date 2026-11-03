-- Electronic contract and transport agreement deletion: exact permission and tenant scope.
-- All deletes and temporary role-grant changes roll back.
BEGIN;

SAVEPOINT ordinary_own;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','ab881b32-87d4-4dce-9014-ce488b8069df',true);
SELECT set_config('request.headers','{}',true);
DO $ordinary_own$
DECLARE v_count integer;
BEGIN
  IF NOT app_private.has_permission('TmsElectronicContract:Delete')
     OR NOT app_private.has_permission('TmsTransportAgreement:Delete')
  THEN RAISE EXCEPTION 'Ordinary QA role lacks its expected delete permissions'; END IF;
  DELETE FROM public.tms_electronic_contract WHERE id='9bdf9bdc-e6e9-49aa-a500-c72874fd6668';
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>1 THEN RAISE EXCEPTION 'Ordinary user could not delete own unreferenced electronic contract'; END IF;
  DELETE FROM public.tms_transport_agreement WHERE id='3f5d74df-1d33-4108-b231-6f5555e2a892';
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>1 THEN RAISE EXCEPTION 'Ordinary user could not delete own unreferenced agreement'; END IF;
END $ordinary_own$;
RESET ROLE;
ROLLBACK TO SAVEPOINT ordinary_own;

SAVEPOINT ordinary_forged;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','ab881b32-87d4-4dce-9014-ce488b8069df',true);
SELECT set_config('request.headers','{"x-art-tenant-scope":"028e6a68-a9db-4055-974c-1e05bfe94b0f"}',true);
DO $ordinary_forged$
DECLARE v_count integer;
BEGIN
  DELETE FROM public.tms_electronic_contract WHERE id='9bdf9bdc-e6e9-49aa-a500-c72874fd6668';
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>1 THEN RAISE EXCEPTION 'Forged header changed ordinary electronic-contract own scope'; END IF;
  DELETE FROM public.tms_transport_agreement WHERE id='3f5d74df-1d33-4108-b231-6f5555e2a892';
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>1 THEN RAISE EXCEPTION 'Forged header changed ordinary agreement own scope'; END IF;
END $ordinary_forged$;
RESET ROLE;
ROLLBACK TO SAVEPOINT ordinary_forged;

SAVEPOINT platform_all;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','0a872664-874c-447d-a256-d0dbdca6ed45',true);
SELECT set_config('request.headers','{}',true);
DO $platform_all$
DECLARE v_count integer;
BEGIN
  DELETE FROM public.tms_electronic_contract WHERE id='9bdf9bdc-e6e9-49aa-a500-c72874fd6668';
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>1 THEN RAISE EXCEPTION 'Platform-all could not delete selected electronic contract'; END IF;
  DELETE FROM public.tms_transport_agreement WHERE id='3f5d74df-1d33-4108-b231-6f5555e2a892';
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>1 THEN RAISE EXCEPTION 'Platform-all could not delete selected agreement'; END IF;
END $platform_all$;
RESET ROLE;
ROLLBACK TO SAVEPOINT platform_all;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','0a872664-874c-447d-a256-d0dbdca6ed45',true);
SELECT set_config('request.headers','{"x-art-tenant-scope":"028e6a68-a9db-4055-974c-1e05bfe94b0f"}',true);
DO $platform_selected$
DECLARE v_count integer;
BEGIN
  DELETE FROM public.tms_electronic_contract WHERE id='9bdf9bdc-e6e9-49aa-a500-c72874fd6668';
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>0 THEN RAISE EXCEPTION 'Platform-selected view crossed electronic-contract tenant'; END IF;
  DELETE FROM public.tms_transport_agreement WHERE id='3f5d74df-1d33-4108-b231-6f5555e2a892';
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>0 THEN RAISE EXCEPTION 'Platform-selected view crossed agreement tenant'; END IF;
END $platform_selected$;
RESET ROLE;

SAVEPOINT no_delete_permission;
DELETE FROM public.sys_role_menu WHERE role_id='ae3ce695-ba09-4cb5-afae-6ca9249ba05b'
  AND menu_id IN ('8d443fd1-b68e-4908-838e-aec4a6c08a18','d22fa293-94e8-472d-b2d6-c3f8851649c7');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','ab881b32-87d4-4dce-9014-ce488b8069df',true);
SELECT set_config('request.headers','{}',true);
DO $no_delete_permission$
DECLARE v_count integer;
BEGIN
  IF app_private.has_permission('TmsElectronicContract:Delete')
     OR app_private.has_permission('TmsTransportAgreement:Delete')
  THEN RAISE EXCEPTION 'Delete grants were not revoked for negative test'; END IF;
  DELETE FROM public.tms_electronic_contract WHERE id='9bdf9bdc-e6e9-49aa-a500-c72874fd6668';
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>0 THEN RAISE EXCEPTION 'Electronic contract direct DELETE bypassed permission'; END IF;
  DELETE FROM public.tms_transport_agreement WHERE id='3f5d74df-1d33-4108-b231-6f5555e2a892';
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>0 THEN RAISE EXCEPTION 'Agreement direct DELETE bypassed permission'; END IF;
END $no_delete_permission$;
RESET ROLE;
ROLLBACK TO SAVEPOINT no_delete_permission;

ROLLBACK;
