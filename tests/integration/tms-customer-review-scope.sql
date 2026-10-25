BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE saved jsonb; scope text;
BEGIN
 PERFORM set_config('request.headers','{}',true);
 saved:=public.tms_save_customer_operating_review_secure('0ae754e4-3930-4902-82ed-526cd05ddb2e',
  '2098-01-01','2098-01-31','平台全部范围创建','继承客户租户',NULL);
 saved:=public.tms_save_customer_operating_review_secure('0ae754e4-3930-4902-82ed-526cd05ddb2e',
  '2098-01-01','2098-01-31','平台全部范围修改','保留实际操作人',(saved->>'updatedAt')::timestamptz);
 FOREACH scope IN ARRAY ARRAY['{}','{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}'] LOOP
  PERFORM set_config('request.headers',scope,true);
  IF public.tms_get_customer_operating_review_secure('0ae754e4-3930-4902-82ed-526cd05ddb2e','2098-01-01','2098-01-31') IS DISTINCT FROM saved
  THEN RAISE EXCEPTION 'Allowed platform scope cannot read'; END IF;
 END LOOP;
 saved:=public.tms_save_customer_operating_review_secure('0ae754e4-3930-4902-82ed-526cd05ddb2e',
  '2098-01-01','2098-01-31','平台选定范围修改','当前租户内可维护',(saved->>'updatedAt')::timestamptz);
 PERFORM set_config('request.headers','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}',true);
 BEGIN
  PERFORM public.tms_get_customer_operating_review_secure('0ae754e4-3930-4902-82ed-526cd05ddb2e','2098-01-01','2098-01-31');
  RAISE EXCEPTION 'Selected foreign tenant can read';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.tms_save_customer_operating_review_secure('0ae754e4-3930-4902-82ed-526cd05ddb2e',
   '2098-01-01','2098-01-31','越界修改','应拒绝保存',(saved->>'updatedAt')::timestamptz);
  RAISE EXCEPTION 'Selected foreign tenant can update';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.tms_save_customer_operating_review_secure('4d8f2093-aeb0-4866-83d1-935fa5af33a6',
   '2098-01-01','2098-01-31','越界创建','应拒绝保存',NULL);
  RAISE EXCEPTION 'Selected foreign tenant can create';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
RESET ROLE;
DO $test$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.tms_customer_operating_review r JOIN public.sys_user u ON u.id=r.actor_id
  WHERE r.customer_id='0ae754e4-3930-4902-82ed-526cd05ddb2e' AND r.period_start='2098-01-01'
  AND r.tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9'
  AND u.auth_user_id='0a872664-874c-447d-a256-d0dbdca6ed45'
  AND r.strategy='平台选定范围修改')
 THEN RAISE EXCEPTION 'Parent tenant or actual actor not preserved'; END IF;
END $test$;
SELECT set_config('request.jwt.claims','{"sub":"9850d41a-77e9-40a7-b2cb-0ad02ac01440","role":"authenticated"}',true);
SELECT set_config('request.headers','{}',true);
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
 BEGIN
  PERFORM public.tms_get_customer_operating_review_secure('0ae754e4-3930-4902-82ed-526cd05ddb2e','2098-01-01','2098-01-31');
  RAISE EXCEPTION 'Unprivileged user can read';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.tms_save_customer_operating_review_secure('0ae754e4-3930-4902-82ed-526cd05ddb2e',
   '2098-02-01','2098-02-28','无权限创建','应拒绝保存',NULL);
  RAISE EXCEPTION 'Unprivileged user can save';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
RESET ROLE;
ROLLBACK;
