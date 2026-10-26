BEGIN;
SET LOCAL jit=off;
SET LOCAL statement_timeout='8s';

CREATE TEMPORARY TABLE qa_button_identity(actor uuid,root_actor uuid,tenant_id uuid,other_tenant uuid) ON COMMIT DROP;
GRANT SELECT ON qa_button_identity TO authenticated;
INSERT INTO qa_button_identity
SELECT ordinary.auth_user_id,root.auth_user_id,ordinary.tenant_id,root.tenant_id
FROM public.sys_user ordinary CROSS JOIN LATERAL(
 SELECT * FROM public.sys_user WHERE system_protected AND user_roles @>ARRAY['R_SUPER'] AND status='1' ORDER BY id LIMIT 1
) root WHERE ordinary.auth_user_id='a9eeb9b7-e474-43e3-9cc2-c2f46c0f0ec3' AND NOT ordinary.system_protected;

WITH RECURSIVE required_menu AS(
 SELECT id,parent_id FROM public.sys_menu WHERE name IN('ScmPurchaseContract:View','ScmPurchaseContract:Push')
 UNION SELECT parent.id,parent.parent_id FROM public.sys_menu parent JOIN required_menu child ON parent.id=child.parent_id
) INSERT INTO public.sys_role_menu(tenant_id,role_id,menu_id)
SELECT '111e83d3-190e-4405-84c8-440d484d13a6','40283472-f334-4cb9-84a0-2a41fcf7ab25',id FROM required_menu menu
WHERE NOT EXISTS(SELECT 1 FROM public.sys_role_menu access WHERE access.role_id='40283472-f334-4cb9-84a0-2a41fcf7ab25' AND access.menu_id=menu.id);

SET LOCAL ROLE authenticated;
DO $capability_scope_matrix$
DECLARE context qa_button_identity;mode text;buttons jsonb;own_buttons jsonb;menus jsonb;
BEGIN
 SELECT * INTO STRICT context FROM qa_button_identity;
 FOREACH mode IN ARRAY ARRAY['ordinary_own','ordinary_forged','platform_all','platform_selected'] LOOP
  PERFORM set_config('request.jwt.claim.sub',CASE WHEN mode LIKE 'platform%' THEN context.root_actor ELSE context.actor END::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',CASE WHEN mode LIKE 'platform%' THEN context.root_actor ELSE context.actor END,'role','authenticated')::text,true);
  PERFORM set_config('request.headers',CASE WHEN mode='ordinary_forged' THEN jsonb_build_object('x-art-tenant-scope',context.other_tenant)::text WHEN mode='platform_selected' THEN jsonb_build_object('x-art-tenant-scope',context.tenant_id)::text ELSE '{}' END,true);
  buttons:=public.get_current_user_button_permissions();
  IF jsonb_typeof(buttons)<>'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements(buttons) button WHERE button->>'type'<>'button' OR NOT app_private.has_permission(button->>'name')) THEN
   RAISE EXCEPTION 'Capability list exposed ungranted or non-button data';END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(buttons) button WHERE button->>'name'='FinancePayableApplication:Add')
   OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(buttons) button WHERE button->>'name'='ScmPurchaseContract:Push') THEN
   RAISE EXCEPTION 'Cross-application capabilities were filtered to the current application';END IF;
  IF mode='ordinary_own' THEN own_buttons:=buttons;END IF;
  IF mode='ordinary_forged' AND buttons IS DISTINCT FROM own_buttons THEN RAISE EXCEPTION 'Forged tenant header changed ordinary capabilities';END IF;
  menus:=public.get_menus_for_current_applications(ARRAY['scm']);
  IF menus ? 'fms' OR EXISTS(SELECT 1 FROM jsonb_array_elements(menus->'scm') menu WHERE menu->>'name' LIKE 'Finance%') THEN
   RAISE EXCEPTION 'Capability loading imported foreign application routes';END IF;
 END LOOP;
END $capability_scope_matrix$;
RESET ROLE;

DO $revoke_and_disabled_application$
DECLARE context qa_button_identity;buttons jsonb;
BEGIN
 SELECT * INTO STRICT context FROM qa_button_identity;
 DELETE FROM public.sys_role_menu access USING public.sys_menu menu
 WHERE access.role_id='40283472-f334-4cb9-84a0-2a41fcf7ab25' AND menu.id=access.menu_id AND menu.name='ScmPurchaseContract:Push';
 PERFORM set_config('request.jwt.claim.sub',context.actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',context.actor,'role','authenticated')::text,true);
 buttons:=public.get_current_user_button_permissions();
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(buttons) button WHERE button->>'name'='ScmPurchaseContract:Push') THEN RAISE EXCEPTION 'Revoked capability remained available';END IF;
 UPDATE public.sys_role SET enabled=false WHERE id='40283472-f334-4cb9-84a0-2a41fcf7ab25';
 IF public.get_current_user_button_permissions()<>'[]'::jsonb THEN RAISE EXCEPTION 'Disabled role retained capabilities';END IF;
 UPDATE public.sys_role SET enabled=true WHERE id='40283472-f334-4cb9-84a0-2a41fcf7ab25';
 PERFORM set_config('request.jwt.claim.sub',context.root_actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',context.root_actor,'role','authenticated')::text,true);
 UPDATE public.sys_application SET enabled=false WHERE app_code='fms';
 PERFORM set_config('request.jwt.claim.sub',context.actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',context.actor,'role','authenticated')::text,true);
 buttons:=public.get_current_user_button_permissions();
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(buttons) button WHERE button->>'name'='FinancePayableApplication:Add') THEN RAISE EXCEPTION 'Disabled application retained capabilities';END IF;
END $revoke_and_disabled_application$;

DO $anonymous_capabilities$
DECLARE rejected boolean:=false;
BEGIN
 IF has_function_privilege('anon','public.get_current_user_button_permissions()','EXECUTE') THEN RAISE EXCEPTION 'Anonymous role can execute capability reader';END IF;
 PERFORM set_config('request.jwt.claim.sub','',true);
 PERFORM set_config('request.jwt.claims','{}',true);
 BEGIN PERFORM public.get_current_user_button_permissions();EXCEPTION WHEN insufficient_privilege THEN rejected:=true;END;
 IF NOT rejected THEN RAISE EXCEPTION 'Missing authentication was accepted';END IF;
END $anonymous_capabilities$;
ROLLBACK;
