BEGIN;
DO $test$ DECLARE category text; item uuid; cid uuid; result jsonb; row_before jsonb; row_after jsonb; attempt integer; n integer; w uuid; plate text; BEGIN
PERFORM set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
PERFORM set_config('request.headers','{}',true);
FOR n IN 1..2 LOOP
w:=('a9fc0006-1023-4620-9220-'||lpad(n::text,12,'0'))::uuid;
plate:='测A验收00'||n;
FOREACH category IN ARRAY ARRAY['vehicle_maintenance','traffic_fine'] LOOP
row_before:=public.tms_management_report('vehicle-profit','2026-09-01','2026-09-30',plate,0,200)->'records'->0;
IF jsonb_typeof(row_before->(category||'_cost')) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Missing readable category %',category; END IF;
SELECT id INTO STRICT item FROM public.tms_expense_item WHERE tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9' AND business_category=category AND is_selectable;
result:=public.tms_save_waybill_cost_secure(NULL,jsonb_build_object('waybill_id',w,'expense_item_id',item,'amount',100*n,'occurred_on','2026-09-18','remark','ROLLBACK ONLY 车辆分类费用'));
cid:=(result->>'id')::uuid;
row_after:=public.tms_management_report('vehicle-profit','2026-09-01','2026-09-30',plate,0,200)->'records'->0;
IF row_after->(category||'_cost') IS DISTINCT FROM row_before->(category||'_cost') THEN RAISE EXCEPTION 'Draft counted'; END IF;
PERFORM public.start_workflow('tms_waybill_cost',cid,'车辆分类费用回归','{}'::jsonb,gen_random_uuid()::text);
FOR attempt IN 1..5 LOOP
 EXIT WHEN (SELECT audit_status FROM public.tms_waybill_cost WHERE id=cid)='approved';
 PERFORM public.act_workflow_by_business('tms_waybill_cost',cid,'approve','事务验证',gen_random_uuid()::text);
END LOOP;
row_after:=public.tms_management_report('vehicle-profit','2026-09-01','2026-09-30',plate,0,200)->'records'->0;
IF (row_after->>(category||'_cost'))::numeric IS DISTINCT FROM (row_before->>(category||'_cost'))::numeric+100*n THEN RAISE EXCEPTION 'Category amount mismatch'; END IF;
IF (row_after->>'reconciled_cost')::numeric IS DISTINCT FROM (row_before->>'reconciled_cost')::numeric+100*n THEN RAISE EXCEPTION 'Cost counted more than once'; END IF;
END LOOP; END LOOP;
END $test$;
DO $permissions$
DECLARE actor uuid; own_result jsonb; hidden_result jsonb;
BEGIN
PERFORM set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
PERFORM set_config('request.headers','{}',true);
own_result:=public.tms_management_report('vehicle-profit','2026-09-01','2026-09-30','测A验收',0,200);
PERFORM set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
IF public.tms_management_report('vehicle-profit','2026-09-01','2026-09-30','测A验收',0,200) IS DISTINCT FROM own_result THEN RAISE EXCEPTION 'Forged header alters category amounts'; END IF;
DELETE FROM public.sys_role_menu rm USING public.sys_menu m,public.sys_role r,public.sys_user u
WHERE rm.menu_id=m.id AND rm.role_id=r.id AND r.role_code=ANY(u.user_roles)
AND u.auth_user_id='ab881b32-87d4-4dce-9014-ce488b8069df'
AND (m.name='FinanceWaybillCost' OR m.name LIKE 'FinanceWaybillCost:%');
IF app_private.can_execute_business_action('FinanceWaybillCost',null,null,false) THEN RAISE EXCEPTION 'Permission fixture did not revoke cost source'; END IF;
hidden_result:=public.tms_management_report('vehicle-profit','2026-09-01','2026-09-30','测A验收',0,200);
IF (hidden_result->>'total')::integer<>2 THEN RAISE EXCEPTION 'Report became unavailable instead of masking cost'; END IF;
IF EXISTS(SELECT 1 FROM jsonb_array_elements(hidden_result->'records') j WHERE jsonb_typeof(j->'vehicle_maintenance_cost') IS DISTINCT FROM 'null' OR jsonb_typeof(j->'traffic_fine_cost') IS DISTINCT FROM 'null' OR jsonb_typeof(j->'fuel_cost') IS DISTINCT FROM 'null' OR jsonb_typeof(j->'toll_cost') IS DISTINCT FROM 'null') THEN RAISE EXCEPTION 'Unauthorized category amount disclosed or replaced by zero'; END IF;
SELECT auth_user_id INTO actor FROM public.sys_user WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1;
PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
IF (public.tms_management_report('vehicle-profit','2026-09-01','2026-09-30','测A验收',0,200)->>'total')::integer<>0 THEN RAISE EXCEPTION 'Selected tenant contains foreign vehicles'; END IF;
END $permissions$;
ROLLBACK;
