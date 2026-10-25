BEGIN;
DO $test$
DECLARE actor uuid; result jsonb; own_rows jsonb; forged_rows jsonb;
BEGIN
 SELECT auth_user_id INTO actor FROM public.sys_user WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 PERFORM set_config('request.headers','{}',true);
 result:=public.tms_management_report('operations-kpi','2026-09-01','2026-10-23','报表验收',0,200);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result->'records') j WHERE j->>'code'='damage' AND (j->>'actual')::numeric=0.375 AND j->>'warning'='未达标') THEN RAISE EXCEPTION 'Damage KPI mismatch'; END IF;
 IF (SELECT count(*) FROM public.tms_waybill_cost WHERE remark='[TMS报表验收20261024] 货损核算测试' AND audit_status='approved')<>2 THEN RAISE EXCEPTION 'Damage expense workflow incomplete'; END IF;
 PERFORM set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
 IF EXISTS(SELECT 1 FROM app_private.tms_report_damage_costs('2026-09-01','2026-10-23') WHERE tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9') THEN RAISE EXCEPTION 'Damage selected tenant leak'; END IF;
 PERFORM set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
 PERFORM set_config('request.headers','{}',true);
 SELECT jsonb_agg(to_jsonb(d) ORDER BY cost_id) INTO own_rows FROM app_private.tms_report_damage_costs('2026-09-01','2026-10-23') d;
 PERFORM set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
 SELECT jsonb_agg(to_jsonb(d) ORDER BY cost_id) INTO forged_rows FROM app_private.tms_report_damage_costs('2026-09-01','2026-10-23') d;
 IF own_rows IS DISTINCT FROM forged_rows OR jsonb_array_length(own_rows)<>2 THEN RAISE EXCEPTION 'Damage ordinary scope mismatch'; END IF;
 PERFORM public.tms_save_waybill_cost_secure(null,jsonb_build_object('waybill_id','a9fc0006-1023-4620-9220-000000000001','expense_item_id','81b802c6-2aca-4468-abcf-13fa2236cb97','amount',999,'occurred_on','2026-09-20','remark','ROLLBACK ONLY unapproved damage'));
 IF (SELECT sum(amount) FROM app_private.tms_report_damage_costs('2026-09-01','2026-10-23')) IS DISTINCT FROM 300::numeric THEN RAISE EXCEPTION 'Unapproved loss included'; END IF;
 PERFORM set_config('request.jwt.claims','{"sub":"9850d41a-77e9-40a7-b2cb-0ad02ac01440","role":"authenticated"}',true);
 IF EXISTS(SELECT 1 FROM app_private.tms_report_damage_costs('2026-09-01','2026-10-23')) THEN RAISE EXCEPTION 'Damage source permission bypass'; END IF;
 IF has_function_privilege('authenticated','app_private.tms_report_damage_costs(date,date)','EXECUTE') OR has_function_privilege('anon','app_private.tms_report_damage_costs(date,date)','EXECUTE') THEN RAISE EXCEPTION 'Private damage helper exposed'; END IF;
END $test$;
ROLLBACK;
