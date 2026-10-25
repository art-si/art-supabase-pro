-- Run against the review schema, or inside the candidate transaction. All changes roll back.
BEGIN;
INSERT INTO public.sys_menu(name,type,path,component,parent_id,app_code,sort,meta)
SELECT 'TmsReportCustomerProfit:EditReview','button','','',m.id,'tms',1,
 jsonb_build_object('title','维护经营复盘','is_enable',true,'is_auth_button',true)
FROM public.sys_menu m WHERE m.name='TmsReportCustomerProfit'
AND NOT EXISTS(SELECT 1 FROM public.sys_menu WHERE name='TmsReportCustomerProfit:EditReview');
INSERT INTO public.sys_role_menu(role_id,menu_id,tenant_id)
SELECT r.id,m.id,r.tenant_id FROM public.sys_role r CROSS JOIN public.sys_menu m
WHERE r.role_code='yq_2026_001' AND r.tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9'
AND m.name='TmsReportCustomerProfit:EditReview'
AND NOT EXISTS(SELECT 1 FROM public.sys_role_menu rm WHERE rm.role_id=r.id AND rm.menu_id=m.id);
SELECT set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
SELECT set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE customer uuid; saved jsonb; revised jsonb;
BEGIN
 FOREACH customer IN ARRAY ARRAY['0ae754e4-3930-4902-82ed-526cd05ddb2e'::uuid,'4d8f2093-aeb0-4866-83d1-935fa5af33a6'::uuid] LOOP
  saved:=public.tms_get_customer_operating_review_secure(customer,'2099-01-01','2099-01-31');
  IF saved IS NOT NULL THEN RAISE EXCEPTION 'Test period already occupied'; END IF;
  saved:=public.tms_save_customer_operating_review_secure(customer,'2099-01-01','2099-01-31','重点维护','每周核对账款',NULL);
  IF saved->>'customerId' IS DISTINCT FROM customer::text OR saved->>'strategy' IS DISTINCT FROM '重点维护'
  THEN RAISE EXCEPTION 'Create DTO mismatch'; END IF;
  revised:=public.tms_save_customer_operating_review_secure(customer,'2099-01-01','2099-01-31','调整报价','月底复核改善效果',(saved->>'updatedAt')::timestamptz);
  IF revised->>'id' IS DISTINCT FROM saved->>'id' OR revised->>'strategy' IS DISTINCT FROM '调整报价'
  THEN RAISE EXCEPTION 'Update mismatch'; END IF;
  BEGIN
   PERFORM public.tms_save_customer_operating_review_secure(customer,'2099-01-01','2099-01-31','覆盖旧值','不应覆盖最新版本',(saved->>'updatedAt')::timestamptz);
   RAISE EXCEPTION 'Stale version accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN
   PERFORM public.tms_save_customer_operating_review_secure(customer,'2099-01-01','2099-01-31','重复创建','不应覆盖已有记录',NULL);
   RAISE EXCEPTION 'Duplicate create accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  IF public.tms_get_customer_operating_review_secure(customer,'2099-01-01','2099-01-31') IS DISTINCT FROM revised
  THEN RAISE EXCEPTION 'Read differs from latest save'; END IF;
  IF public.tms_get_customer_operating_review_secure(customer,'2099-02-01','2099-02-28') IS NOT NULL
  THEN RAISE EXCEPTION 'Review leaked across periods'; END IF;
 END LOOP;
 BEGIN
  PERFORM public.tms_save_customer_operating_review_secure(customer,'2099-02-01','2099-01-01','策略','措施',NULL);
  RAISE EXCEPTION 'Inverted period accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  PERFORM public.tms_save_customer_operating_review_secure(customer,'2099-02-01','2099-02-28',' ','措施',NULL);
  RAISE EXCEPTION 'Blank strategy accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 IF has_table_privilege('authenticated','public.tms_customer_operating_review','INSERT')
 OR has_table_privilege('authenticated','public.tms_customer_operating_review','UPDATE')
 THEN RAISE EXCEPTION 'Raw mutation exposed'; END IF;
END $test$;
RESET ROLE;
DELETE FROM public.sys_role_menu rm USING public.sys_menu m,public.sys_role r
WHERE rm.menu_id=m.id AND rm.role_id=r.id AND r.role_code='yq_2026_001'
AND r.tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9' AND m.name='TmsReportCustomerProfit:EditReview';
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
 PERFORM public.tms_get_customer_operating_review_secure('0ae754e4-3930-4902-82ed-526cd05ddb2e','2099-01-01','2099-01-31');
 BEGIN
  PERFORM public.tms_save_customer_operating_review_secure('0ae754e4-3930-4902-82ed-526cd05ddb2e','2099-02-01','2099-02-28','无权修改','必须拒绝',NULL);
  RAISE EXCEPTION 'Read-only user can save';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
RESET ROLE;
ROLLBACK;
