BEGIN;
DO $test$
DECLARE actual jsonb; baseline jsonb; scope text;
BEGIN
 PERFORM set_config('request.jwt.claims','{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
 FOREACH scope IN ARRAY ARRAY['{}','{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}'] LOOP
 PERFORM set_config('request.headers',scope,true);
 actual:=public.tms_get_waybill_execution_context('a9fc0006-1023-4620-9220-000000000001');
 IF actual->>'waybillId' IS DISTINCT FROM 'a9fc0006-1023-4620-9220-000000000001' THEN RAISE EXCEPTION 'Allowed context missing'; END IF;
 END LOOP;
 PERFORM set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
 BEGIN
 PERFORM public.tms_get_waybill_execution_context('a9fc0006-1023-4620-9220-000000000001');
 RAISE EXCEPTION 'Selected foreign scope leaked execution';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
 PERFORM set_config('request.headers','{}',true);
 baseline:=public.tms_get_waybill_execution_context('a9fc0006-1023-4620-9220-000000000001');
 PERFORM set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
 IF public.tms_get_waybill_execution_context('a9fc0006-1023-4620-9220-000000000001') IS DISTINCT FROM baseline THEN RAISE EXCEPTION 'Forged header changed context'; END IF;
END $test$;
ROLLBACK;
