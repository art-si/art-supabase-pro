-- Reproduce accidental protected-field writes and verify legitimate personal-driver edits.
BEGIN;
DO $test$
DECLARE
 super_auth uuid; super_app uuid; own_tenant uuid; other_tenant uuid; ordinary_auth uuid; actor record;
 v_driver_id uuid; foreign_driver uuid; result jsonb; blocked boolean;
BEGIN
 SELECT auth_user_id,id INTO super_auth,super_app FROM public.sys_user WHERE user_roles @> ARRAY['R_SUPER'] AND auth_user_id IS NOT NULL LIMIT 1;
 SELECT tenant_id INTO own_tenant FROM public.sys_user WHERE auth_user_id='ab881b32-87d4-4dce-9014-ce488b8069df';
 SELECT id INTO other_tenant FROM public.sys_tenant WHERE id<>own_tenant AND status='1' AND (service_start_date IS NULL OR service_start_date<=current_date) AND (service_end_date IS NULL OR service_end_date>=current_date) LIMIT 1;
 IF super_auth IS NULL OR own_tenant IS NULL OR other_tenant IS NULL THEN RAISE EXCEPTION 'Driver edit scope fixtures missing'; END IF;
 PERFORM set_config('request.jwt.claim.sub',super_auth::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',super_auth,'role','authenticated')::text,true);
 PERFORM set_config('request.headers','{}',true);
 v_driver_id := public.tms_create_driver_secure(jsonb_build_object('target_tenant_id',own_tenant,'driver_name','QA个人司机编辑回滚','phone','188'||lpad((random()*100000000)::bigint::text,8,'0'),'gender','male','id_card_no','QA'||left(replace(gen_random_uuid()::text,'-',''),16),'license_type','A2','license_expire_date','2030-11-30','profile',jsonb_build_object('driver_ownership','individual','driver_status','on_duty','finance_invoice_name','QA保留原有财务资料')));
 foreign_driver := public.tms_create_driver_secure(jsonb_build_object('target_tenant_id',other_tenant,'driver_name','QA外租户司机编辑回滚','phone','188'||lpad((random()*100000000)::bigint::text,8,'0'),'gender','male','id_card_no','QA'||left(replace(gen_random_uuid()::text,'-',''),16),'license_type','A2','profile',jsonb_build_object('driver_ownership','individual')));
 FOR actor IN SELECT auth_user_id FROM public.sys_user WHERE tenant_id=own_tenant AND auth_user_id IS NOT NULL AND status='1' AND deleted_at IS NULL AND NOT user_roles @> ARRAY['R_SUPER'] LOOP
   PERFORM set_config('request.jwt.claim.sub',actor.auth_user_id::text,true);
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor.auth_user_id,'role','authenticated')::text,true);
   IF app_private.can_execute_business_action('TmsDriver','TmsDriver:Edit',super_app,true) AND app_private.resolve_field_access('tms.driver','financialAccount',super_app)<>'edit' THEN ordinary_auth:=actor.auth_user_id; EXIT; END IF;
 END LOOP;
 IF ordinary_auth IS NULL THEN RAISE EXCEPTION 'Need an ordinary editor without financial-account edit access'; END IF;
 blocked:=false;
 BEGIN
   PERFORM public.tms_update_driver_secure(v_driver_id,jsonb_build_object('license_expire_date','2031-11-30','profile',jsonb_build_object('driver_ownership','individual','finance_invoice_name','','finance_bank_account','','finance_default_account',false)));
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Protected financial changes were unexpectedly allowed'; END IF;
 result:=public.tms_update_driver_secure(v_driver_id,jsonb_build_object('license_expire_date','2031-11-30','profile',jsonb_build_object('driver_ownership','individual','driver_status','on_duty')));
 IF NOT EXISTS(SELECT 1 FROM public.mdm_driver WHERE id=v_driver_id AND license_expire_date='2031-11-30' AND tenant_id=own_tenant) THEN RAISE EXCEPTION 'Ordinary personal-driver edit denied'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.tms_driver_profile WHERE tms_driver_profile.driver_id=v_driver_id AND finance_invoice_name='QA保留原有财务资料') THEN RAISE EXCEPTION 'Uneditable financial data changed'; END IF;
 PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
 PERFORM public.tms_update_driver_secure(v_driver_id,jsonb_build_object('license_expire_date','2032-11-30'));
 blocked:=false;
 BEGIN PERFORM public.tms_update_driver_secure(foreign_driver,jsonb_build_object('license_expire_date','2032-11-30')); EXCEPTION WHEN OTHERS THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Forged ordinary scope allowed foreign edit'; END IF;
 PERFORM set_config('request.jwt.claim.sub',super_auth::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',super_auth,'role','authenticated')::text,true);
 PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
 blocked:=false;
 BEGIN PERFORM public.tms_update_driver_secure(v_driver_id,jsonb_build_object('license_expire_date','2033-11-30')); EXCEPTION WHEN OTHERS THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Platform-selected scope allowed foreign edit'; END IF;
 PERFORM set_config('request.headers','{}',true);
 PERFORM public.tms_update_driver_secure(v_driver_id,jsonb_build_object('license_expire_date','2033-11-30'));
 IF NOT EXISTS(SELECT 1 FROM public.mdm_driver WHERE id=v_driver_id AND tenant_id=own_tenant AND license_expire_date='2033-11-30') THEN RAISE EXCEPTION 'Platform-all update lost row tenant'; END IF;
END $test$;
ROLLBACK;
SELECT 'driver-edit-field-permission-passed' AS result;
