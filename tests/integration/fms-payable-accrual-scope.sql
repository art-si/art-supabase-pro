BEGIN;

DO $accrual_scope_setup$
DECLARE
 root_actor uuid;qa_actor uuid:='a9eeb9b7-e474-43e3-9cc2-c2f46c0f0ec3';qa_tenant uuid:='111e83d3-190e-4405-84c8-440d484d13a6';
 own_org uuid;foreign_org uuid;department_org uuid;foreign_tenant uuid;own_book uuid;foreign_book uuid;role_id uuid;code text:='ACCRUAL_RLS_'||upper(left(gen_random_uuid()::text,8));
 own_policy uuid;foreign_policy uuid;result jsonb;
 organization_template public.mdm_organization;blocked boolean;
BEGIN
 SELECT auth_user_id INTO STRICT root_actor FROM public.sys_user WHERE system_protected AND 'R_SUPER'=ANY(user_roles) AND status='1' ORDER BY id LIMIT 1;
 SELECT id INTO STRICT own_org FROM public.mdm_organization WHERE tenant_id=qa_tenant AND status='1' AND organization_type='company' ORDER BY id LIMIT 1;
 SELECT id INTO STRICT own_book FROM public.fms_account_set WHERE tenant_id=qa_tenant AND is_default AND status='active' AND base_currency_code='CNY';
 SELECT organization.id,organization.tenant_id,book.id INTO STRICT foreign_org,foreign_tenant,foreign_book FROM public.mdm_organization organization
 JOIN public.fms_account_set book ON book.tenant_id=organization.tenant_id AND book.is_default AND book.status='active' AND book.base_currency_code='CNY'
 JOIN public.fms_accounting_period period ON period.account_set_id=book.id AND app_private.payable_business_date() BETWEEN period.start_date AND period.end_date AND period.status IN('open','closing')
 WHERE organization.tenant_id<>qa_tenant AND organization.status='1' AND organization.organization_type='company' ORDER BY organization.id LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',root_actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',root_actor,'role','authenticated')::text,true);
 PERFORM set_config('request.headers','{}',true);
 SELECT * INTO STRICT organization_template FROM public.mdm_organization WHERE id=own_org;
 INSERT INTO public.mdm_organization SELECT(jsonb_populate_record(NULL::public.mdm_organization,to_jsonb(organization_template)||jsonb_build_object('id',gen_random_uuid(),'organization_code',code,'organization_name','本租户独立回滚组织','parent_id',organization_template.id,'organization_type','company','is_system',false))).* RETURNING id INTO own_org;
 INSERT INTO public.mdm_organization SELECT(jsonb_populate_record(NULL::public.mdm_organization,to_jsonb(organization_template)||jsonb_build_object('id',gen_random_uuid(),'organization_code',code||'_DEPT','organization_name','不可启用库存的部门','parent_id',own_org,'organization_type','department','is_system',false))).* RETURNING id INTO department_org;
 blocked:=false;BEGIN
  PERFORM public.fms_save_payable_accrual_policy_secure(jsonb_build_object('code',code||'_DEPT','name','应拒绝非公司库存参数','organization_id',department_org,'account_set_id',own_book,'effective_from',app_private.payable_business_date(),'enabled',false));
 EXCEPTION WHEN check_violation THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Non-company organization accepted an inventory accrual policy';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.fms_payable_accrual_workspace_secure('{}')->'organizations') option WHERE option->>'id'=department_org::text) THEN RAISE EXCEPTION 'Department leaked into inventory organization options';END IF;
 SELECT * INTO STRICT organization_template FROM public.mdm_organization WHERE id=foreign_org;
 INSERT INTO public.mdm_organization SELECT(jsonb_populate_record(NULL::public.mdm_organization,to_jsonb(organization_template)||jsonb_build_object('id',gen_random_uuid(),'organization_code',code,'organization_name','异租户独立回滚组织','parent_id',organization_template.id,'organization_type','company','is_system',false))).* RETURNING id INTO foreign_org;
 own_policy:=public.fms_save_payable_accrual_policy_secure(jsonb_build_object('code',code,'name','本租户回滚参数','organization_id',own_org,'account_set_id',own_book,'effective_from',app_private.payable_business_date(),'enabled',false));
 foreign_policy:=public.fms_save_payable_accrual_policy_secure(jsonb_build_object('code',code,'name','异租户回滚参数','organization_id',foreign_org,'account_set_id',foreign_book,'effective_from',app_private.payable_business_date(),'enabled',false));
 IF(SELECT tenant_id FROM public.fms_payable_accrual_policy WHERE id=own_policy)<>qa_tenant OR(SELECT tenant_id FROM public.fms_payable_accrual_policy WHERE id=foreign_policy)<>foreign_tenant THEN RAISE EXCEPTION 'Platform-all config lost its explicit parent tenant';END IF;
 PERFORM public.fms_save_payable_accrual_policy_secure(jsonb_build_object('id',foreign_policy,'version',1,'code',code,'name','全部租户合法编辑','organization_id',foreign_org,'account_set_id',foreign_book,'effective_from',app_private.payable_business_date(),'enabled',false));
 INSERT INTO public.sys_role(role_name,role_code,enabled,tenant_id) VALUES('自动暂估RLS回滚角色',code,true,qa_tenant) RETURNING id INTO role_id;
 INSERT INTO public.sys_role_menu(tenant_id,role_id,menu_id) SELECT qa_tenant,role_id,id FROM public.sys_menu WHERE name IN('FinanceEstimatedPayable:View','FinanceEstimatedPayable:Accrual','FinanceEstimatedPayable:AccrualDelete');
 UPDATE public.sys_user SET user_roles=ARRAY[code] WHERE auth_user_id=qa_actor;
 PERFORM set_config('test.accrual_root',root_actor::text,true);
 PERFORM set_config('test.accrual_own',own_policy::text,true);
 PERFORM set_config('test.accrual_other',foreign_policy::text,true);
 PERFORM set_config('test.accrual_other_tenant',foreign_tenant::text,true);
 PERFORM set_config('test.accrual_code',code,true);
END $accrual_scope_setup$;

SET LOCAL ROLE authenticated;

DO $accrual_scope_read$
DECLARE
 own_policy uuid:=current_setting('test.accrual_own')::uuid;foreign_policy uuid:=current_setting('test.accrual_other')::uuid;
 qa_actor uuid:='a9eeb9b7-e474-43e3-9cc2-c2f46c0f0ec3';qa_tenant uuid:='111e83d3-190e-4405-84c8-440d484d13a6';
 context text;expected integer;result jsonb;payload jsonb;blocked boolean;
BEGIN
 FOREACH context IN ARRAY ARRAY['platform_all','platform_selected','ordinary_own','ordinary_forged'] LOOP
  expected:=CASE WHEN context='platform_all' THEN 2 ELSE 1 END;
  IF context='platform_selected' THEN PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',qa_tenant)::text,true);
  ELSIF context='ordinary_own' THEN
   PERFORM set_config('request.jwt.claim.sub',qa_actor::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',qa_actor,'role','authenticated')::text,true);PERFORM set_config('request.headers','{}',true);
  ELSIF context='ordinary_forged' THEN PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',current_setting('test.accrual_other_tenant'))::text,true);END IF;
  IF(SELECT count(*) FROM public.fms_payable_accrual_policy WHERE id IN(own_policy,foreign_policy))<>expected THEN RAISE EXCEPTION 'Policy direct RLS failed: %',context;END IF;
  result:=public.fms_payable_accrual_workspace_secure(jsonb_build_object('keyword',current_setting('test.accrual_code')));
  IF(SELECT count(*) FROM jsonb_array_elements(result->'configurations'->'data') row WHERE row->>'id' IN(own_policy::text,foreign_policy::text))<>expected THEN RAISE EXCEPTION 'Config secure reader scope failed: %',context;END IF;
 END LOOP;
 SELECT jsonb_build_object('id',id,'version',version,'code',code,'name','普通用户合法编辑','organization_id',organization_id,'account_set_id',account_set_id,'effective_from',effective_from,'enabled',false,'actor_auth_user_id',current_setting('test.accrual_root')) INTO STRICT payload FROM public.fms_payable_accrual_policy WHERE id=own_policy;
 PERFORM public.fms_save_payable_accrual_policy_secure(payload);
 blocked:=false;BEGIN PERFORM public.fms_save_payable_accrual_policy_secure(payload||jsonb_build_object('id',foreign_policy,'version',2));EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Ordinary forged scope could edit a foreign configuration';END IF;
 IF has_table_privilege('authenticated','public.fms_payable_accrual_policy','UPDATE') OR has_table_privilege('authenticated','public.fms_payable_accrual_run','INSERT') THEN RAISE EXCEPTION 'Unmanaged config or history write is exposed';END IF;
 blocked:=false;BEGIN PERFORM app_private.apply_payable_accrual_on_inbound(gen_random_uuid());EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Ordinary actor invoked the internal financial delegate';END IF;
END $accrual_scope_read$;

RESET ROLE;

DO $accrual_scope_write$
DECLARE
 own_policy uuid:=current_setting('test.accrual_own')::uuid;foreign_policy uuid:=current_setting('test.accrual_other')::uuid;payload jsonb;blocked boolean;
BEGIN
 IF(SELECT actor_auth_user_id FROM public.fms_payable_accrual_policy WHERE id=own_policy)<>'a9eeb9b7-e474-43e3-9cc2-c2f46c0f0ec3'::uuid THEN RAISE EXCEPTION 'Client forged a different financial execution principal';END IF;
 PERFORM set_config('request.jwt.claim.sub',current_setting('test.accrual_root'),true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.accrual_root'),'role','authenticated')::text,true);
 PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope','111e83d3-190e-4405-84c8-440d484d13a6')::text,true);
 SELECT jsonb_build_object('id',id,'version',version,'code',code,'name','拒绝选定范围外编辑','organization_id',organization_id,'account_set_id',account_set_id,'effective_from',effective_from,'enabled',false) INTO STRICT payload FROM public.fms_payable_accrual_policy WHERE id=foreign_policy;
 blocked:=false;BEGIN PERFORM public.fms_save_payable_accrual_policy_secure(payload);EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Selected platform scope edited a foreign policy';END IF;
 PERFORM set_config('request.headers','{}',true);
 IF jsonb_array_length(public.fms_payable_accrual_delete_dependencies_secure(ARRAY[own_policy]))<>0 THEN RAISE EXCEPTION 'Unused paused config acquired fake dependencies';END IF;
 PERFORM public.fms_delete_payable_accrual_policy_secure(own_policy);
 IF EXISTS(SELECT 1 FROM public.fms_payable_accrual_policy WHERE id=own_policy) THEN RAISE EXCEPTION 'Unused config deletion did not execute';END IF;
END $accrual_scope_write$;

ROLLBACK;
