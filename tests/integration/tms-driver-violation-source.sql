-- Exercise the persisted source RPC and the report together; all changes roll back.
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
SELECT set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE row_id uuid; driver_id uuid; current_row jsonb; rows jsonb; i integer; n integer;
BEGIN
 FOR i IN 1..2 LOOP
  row_id:=('a9fc0009-1023-4620-9220-'||lpad(i::text,12,'0'))::uuid;
  driver_id:=('a9fc0003-1023-4620-9220-'||lpad(i::text,12,'0'))::uuid;
  current_row:=public.vms_list_vehicle_violations_secure(p_ids=>ARRAY[row_id])->'records'->0;
  PERFORM public.vms_link_violation_driver_secure(row_id,driver_id,(current_row->>'update_time')::timestamptz);
 END LOOP;
 rows:=public.tms_management_report('driver-operations','2026-09-01','2026-10-31',NULL,0,200)->'records';
 SELECT count(*) INTO n FROM jsonb_array_elements(rows) r
 WHERE r->>'driver_id' IN ('a9fc0003-1023-4620-9220-000000000001','a9fc0003-1023-4620-9220-000000000002')
 AND (r->>'violation')::integer=1;
 IF n<>2 THEN RAISE EXCEPTION 'Two linked drivers must each have one violation, got %',n; END IF;
 rows:=public.tms_management_report('driver-operations','2099-01-01','2099-01-31',NULL,0,200)->'records';
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(rows) r WHERE (r->>'violation')::integer IS DISTINCT FROM 0)
 THEN RAISE EXCEPTION 'Violation period filter failed'; END IF;
 current_row:=public.vms_list_vehicle_violations_secure(p_ids=>ARRAY[row_id])->'records'->0;
 PERFORM public.vms_link_violation_driver_secure(row_id,NULL,(current_row->>'update_time')::timestamptz);
 rows:=public.tms_management_report('driver-operations','2026-09-01','2026-10-31',NULL,0,200)->'records';
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(rows) r WHERE r->>'violation' IS NOT NULL)
 THEN RAISE EXCEPTION 'Unassigned historical violation incorrectly treated as zero or matched by name'; END IF;
END $test$;
RESET ROLE;
UPDATE public.vehicle_violation_record SET driver_id='a9fc0003-1023-4620-9220-000000000002'
WHERE id='a9fc0009-1023-4620-9220-000000000002';
DO $setup$
DECLARE rid uuid; code text:='DRIVER_VIOLATION_MASK_'||replace(gen_random_uuid()::text,'-','');
BEGIN
 INSERT INTO public.sys_role(role_code,role_name,tenant_id,enabled)
 VALUES(code,'司机违章关联权限回归','7529f951-938e-4e2c-ac0d-316c136ae1f9',true) RETURNING id INTO rid;
 INSERT INTO public.sys_role_menu(role_id,menu_id,tenant_id)
 SELECT rid,id,'7529f951-938e-4e2c-ac0d-316c136ae1f9' FROM public.sys_menu WHERE name='TmsReportDriverOperations';
 UPDATE public.sys_user SET user_roles=ARRAY[code] WHERE auth_user_id='9850d41a-77e9-40a7-b2cb-0ad02ac01440';
 PERFORM set_config('request.jwt.claims','{"sub":"9850d41a-77e9-40a7-b2cb-0ad02ac01440","role":"authenticated"}',true);
END $setup$;
SET LOCAL ROLE authenticated;
DO $masked$
DECLARE rows jsonb;
BEGIN
 rows:=public.tms_management_report('driver-operations','2026-09-01','2026-10-31',NULL,0,200)->'records';
 IF jsonb_array_length(rows)=0 THEN RAISE EXCEPTION 'Report permission fixture failed'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(rows) r WHERE r->>'violation' IS NOT NULL)
 THEN RAISE EXCEPTION 'Hidden driver identity leaks through attributed violation count'; END IF;
END $masked$;
RESET ROLE;
ROLLBACK;
