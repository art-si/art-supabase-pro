BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
SELECT set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
DO $test$
DECLARE j jsonb; id uuid;
BEGIN
 FOREACH id IN ARRAY ARRAY['9c2f677d-300e-4de1-a500-7975c3d34ca8'::uuid,'b943b4e4-b121-40e8-8cdc-bbfab7fd88da'::uuid] LOOP
 j:=public.tms_get_order_exception_history_secure(id);
 IF jsonb_array_length(j)<>4 OR j->0->>'action'<>'create' OR j->1->>'action'<>'start'
 OR j->2->>'action'<>'resolve' OR j->3->>'action'<>'close' THEN RAISE EXCEPTION 'History incomplete'; END IF;
 IF j->0 ? 'actor' THEN RAISE EXCEPTION 'Raw actor identifier exposed'; END IF;
 END LOOP;
END $test$;
SELECT set_config('request.jwt.claims','{"sub":"9850d41a-77e9-40a7-b2cb-0ad02ac01440","role":"authenticated"}',true);
DO $test$ BEGIN
 BEGIN
 PERFORM public.tms_get_order_exception_history_secure('9c2f677d-300e-4de1-a500-7975c3d34ca8');
 RAISE EXCEPTION 'Unpermitted history visible';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
SELECT set_config('request.jwt.claims','{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
SELECT set_config('request.headers','{}',true);
DO $test$ BEGIN
 IF jsonb_array_length(public.tms_get_order_exception_history_secure('9c2f677d-300e-4de1-a500-7975c3d34ca8'))<>4 THEN RAISE EXCEPTION 'Platform all failed'; END IF;
 PERFORM set_config('request.headers','{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}',true);
 IF jsonb_array_length(public.tms_get_order_exception_history_secure('b943b4e4-b121-40e8-8cdc-bbfab7fd88da'))<>4 THEN RAISE EXCEPTION 'Platform selected failed'; END IF;
 PERFORM set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
 BEGIN
 PERFORM public.tms_get_order_exception_history_secure('9c2f677d-300e-4de1-a500-7975c3d34ca8');
 RAISE EXCEPTION 'Selected tenant leak';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
RESET ROLE;
DELETE FROM public.sys_role_menu WHERE menu_id IN (SELECT id FROM public.sys_menu WHERE name='TmsReportOrderExceptions:ViewHistory');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
SELECT set_config('request.headers','{}',true);
DO $test$ BEGIN
 BEGIN
 PERFORM public.tms_get_order_exception_history_secure('9c2f677d-300e-4de1-a500-7975c3d34ca8');
 RAISE EXCEPTION 'Page permission bypassed history button permission';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
ROLLBACK;
