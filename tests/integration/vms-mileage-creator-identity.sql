-- Trigger invariants; all fixture writes are rolled back.
BEGIN;
DO $test$
DECLARE row_id uuid; creator uuid; expected uuid; scope text;
BEGIN
 PERFORM set_config('request.jwt.claims','{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
 expected:=app_private.current_app_user_id();
 FOREACH scope IN ARRAY ARRAY['{}','{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}'] LOOP
 PERFORM set_config('request.headers',scope,true);
 INSERT INTO public.vehicle_mileage_record(tenant_id,plate_no) VALUES('7529f951-938e-4e2c-ac0d-316c136ae1f9','TEST-CREATOR') RETURNING id,created_by_user_id INTO row_id,creator;
 IF creator IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Platform actor was replaced'; END IF;
 END LOOP;
 PERFORM set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
 BEGIN
 INSERT INTO public.vehicle_mileage_record(tenant_id,plate_no) VALUES('7529f951-938e-4e2c-ac0d-316c136ae1f9','TEST-DENIED');
 RAISE EXCEPTION 'Selected tenant bypassed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
 INSERT INTO public.vehicle_mileage_record(tenant_id,plate_no,created_by_user_id) VALUES('7529f951-938e-4e2c-ac0d-316c136ae1f9','TEST-ORDINARY',expected) RETURNING id,created_by_user_id INTO row_id,creator;
 IF creator IS DISTINCT FROM app_private.current_app_user_id() THEN RAISE EXCEPTION 'Forged creator retained'; END IF;
 BEGIN
 UPDATE public.vehicle_mileage_record SET created_by_user_id=expected WHERE id=row_id;
 RAISE EXCEPTION 'Creator modified';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
 INSERT INTO public.vehicle_mileage_record(tenant_id,plate_no,created_by_user_id) VALUES('6675a0d6-3ff6-4ab7-bb09-232d85ae96ad','TEST-FOREIGN',expected);
 RAISE EXCEPTION 'Ordinary foreign tenant accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
ROLLBACK;
