BEGIN;
-- Synthetic location events are temporary. Read through the authenticated report API.
INSERT INTO public.tms_waybill_event(tenant_id,waybill_id,event_type,event_time,location_text,longitude,latitude)
SELECT w.tenant_id,w.id,'arrived',now()-interval '1 minute','位置回归-'||right(w.id::text,1),121.47,31.23
FROM public.tms_waybill w WHERE w.id IN
('a9fc0006-1023-4620-9220-000000000001','a9fc0006-1023-4620-9220-000000000002');
INSERT INTO public.tms_waybill_event(tenant_id,waybill_id,event_type,event_time,location_text,longitude,latitude)
SELECT w.tenant_id,w.id,'arrived',now()+interval '1 day','未来位置不得显示',121.47,31.23
FROM public.tms_waybill w WHERE w.id='a9fc0006-1023-4620-9220-000000000001';
INSERT INTO public.tms_waybill_event(tenant_id,waybill_id,event_type,event_time,location_text)
SELECT w.tenant_id,w.id,'completed',now(),'线路文本不得显示'
FROM public.tms_waybill w WHERE w.id='a9fc0006-1023-4620-9220-000000000002';
SELECT set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
SELECT set_config('request.headers','{}',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE rows jsonb; forged jsonb; n integer;
BEGIN
 rows:=public.tms_management_report('vehicle-dispatch','2026-10-01','2026-10-31',NULL,0,200)->'records';
 SELECT count(*) INTO n FROM jsonb_array_elements(rows) r
 WHERE r->>'vehicle_id' IN ('a9fc0004-1023-4620-9220-000000000001','a9fc0004-1023-4620-9220-000000000002')
 AND r->>'location' IN ('位置回归-1','位置回归-2')
 AND r->>'location_reported_at'=to_char((now()-interval '1 minute') at time zone 'Asia/Shanghai','YYYY-MM-DD HH24:MI');
 IF n<>2 THEN RAISE EXCEPTION 'Expected two correctly dated latest locations, got %',n; END IF;
 PERFORM set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
 forged:=public.tms_management_report('vehicle-dispatch','2026-10-01','2026-10-31',NULL,0,200)->'records';
 IF rows IS DISTINCT FROM forged THEN RAISE EXCEPTION 'Forged tenant header changed locations'; END IF;
END $test$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE scope text; rows jsonb; n integer;
BEGIN
 FOREACH scope IN ARRAY ARRAY['{}','{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}'] LOOP
  PERFORM set_config('request.headers',scope,true);
  rows:=public.tms_management_report('vehicle-dispatch','2026-10-01','2026-10-31',NULL,0,200)->'records';
  SELECT count(*) INTO n FROM jsonb_array_elements(rows) r WHERE r->>'location' IN ('位置回归-1','位置回归-2');
  IF scope LIKE '%6675%' THEN
   IF n<>0 THEN RAISE EXCEPTION 'Selected foreign tenant exposed locations'; END IF;
  ELSIF n<>2 THEN RAISE EXCEPTION 'Platform scope missing locations'; END IF;
 END LOOP;
END $test$;
RESET ROLE;
DO $setup$
DECLARE rid uuid; code text:='DISPATCH_LOCATION_'||replace(gen_random_uuid()::text,'-','');
BEGIN
 INSERT INTO public.sys_role(role_code,role_name,tenant_id,enabled)
 VALUES(code,'调度位置来源权限回归','7529f951-938e-4e2c-ac0d-316c136ae1f9',true) RETURNING id INTO rid;
 INSERT INTO public.sys_role_menu(role_id,menu_id,tenant_id)
 SELECT rid,id,'7529f951-938e-4e2c-ac0d-316c136ae1f9' FROM public.sys_menu WHERE name='TmsReportVehicleDispatch';
 UPDATE public.sys_user SET user_roles=ARRAY[code] WHERE auth_user_id='9850d41a-77e9-40a7-b2cb-0ad02ac01440';
 PERFORM set_config('request.jwt.claims','{"sub":"9850d41a-77e9-40a7-b2cb-0ad02ac01440","role":"authenticated"}',true);
 PERFORM set_config('request.headers','{}',true);
END $setup$;
SET LOCAL ROLE authenticated;
DO $test$
DECLARE rows jsonb;
BEGIN
 rows:=public.tms_management_report('vehicle-dispatch','2026-10-01','2026-10-31',NULL,0,200)->'records';
 IF jsonb_array_length(rows)<2 THEN RAISE EXCEPTION 'Report-only permission fixture failed'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(rows) r WHERE r->>'location' IS NOT NULL OR r->>'location_reported_at' IS NOT NULL)
 THEN RAISE EXCEPTION 'Location source permission bypass'; END IF;
END $test$;
RESET ROLE;
ROLLBACK;
