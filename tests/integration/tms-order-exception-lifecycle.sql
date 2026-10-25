BEGIN;
DO $test$
DECLARE
 own_order uuid := 'a9fc0005-1023-4620-9220-000000000007';
 other_order uuid;
 own_tenant uuid := '7529f951-938e-4e2c-ac0d-316c136ae1f9';
 other_tenant uuid;
 super_auth uuid;
 exception_id uuid;
 r public.tms_order_exception;
 payload jsonb := '{"exception_type":"damage","stage":"transit","description":"[TMS报表验收] 人工异常生命周期测试","occurred_at":"2026-10-23T08:00:00+08:00","estimated_loss":100}'::jsonb;
BEGIN
 SELECT id,tenant_id INTO other_order,other_tenant FROM public.tms_order WHERE tenant_id<>own_tenant AND order_status<>'cancelled' LIMIT 1;
 SELECT auth_user_id INTO super_auth FROM public.sys_user WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1;
 IF other_order IS NULL OR super_auth IS NULL THEN RAISE EXCEPTION 'Missing cross-tenant fixtures'; END IF;
 PERFORM set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
 PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
 exception_id:=public.tms_create_order_exception_secure(own_order,payload);
 SELECT * INTO r FROM public.tms_order_exception WHERE id=exception_id;
 IF r.tenant_id<>own_tenant OR r.status<>'pending' THEN RAISE EXCEPTION 'Ordinary forged scope affected ownership'; END IF;
 BEGIN
  PERFORM public.tms_create_order_exception_secure(other_order,payload);
  RAISE EXCEPTION 'Cross-tenant create allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM public.tms_transition_order_exception_secure(exception_id,'pending','start','开始核实');
 PERFORM public.tms_transition_order_exception_secure(exception_id,'in_progress','resolve','核实货损并协商理赔',100,80);
 PERFORM public.tms_transition_order_exception_secure(exception_id,'resolved','close','核实完成，确认结案');
 SELECT * INTO r FROM public.tms_order_exception WHERE id=exception_id;
 IF r.status<>'closed' OR r.damage_amount<>100 OR r.claim_amount<>80 OR jsonb_array_length(r.history)<>4 THEN RAISE EXCEPTION 'Lifecycle or audit trail mismatch'; END IF;
 BEGIN
  PERFORM public.tms_transition_order_exception_secure(exception_id,'pending','start','陈旧请求');
  RAISE EXCEPTION 'Stale transition allowed' USING ERRCODE='check_violation';
 EXCEPTION WHEN raise_exception THEN NULL; END;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',super_auth,'role','authenticated')::text,true);
 PERFORM set_config('request.headers','{}',true);
 exception_id:=public.tms_create_order_exception_secure(other_order,payload);
 SELECT * INTO r FROM public.tms_order_exception WHERE id=exception_id;
 IF r.tenant_id<>other_tenant THEN RAISE EXCEPTION 'Platform-all failed parent tenant inheritance'; END IF;
 PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',own_tenant)::text,true);
 BEGIN
  PERFORM public.tms_transition_order_exception_secure(exception_id,'pending','start','跨选定租户请求');
  RAISE EXCEPTION 'Platform-selected cross-tenant mutation allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM public.tms_create_order_exception_secure(own_order,payload);
 PERFORM set_config('request.jwt.claims','{"sub":"9850d41a-77e9-40a7-b2cb-0ad02ac01440","role":"authenticated"}',true);
 BEGIN
  PERFORM public.tms_create_order_exception_secure(own_order,payload);
  RAISE EXCEPTION 'Missing permission allowed create';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
ROLLBACK;
