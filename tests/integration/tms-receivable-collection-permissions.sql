BEGIN;
INSERT INTO public.sys_menu(name,type,path,component,parent_id,app_code,sort,meta)
SELECT 'TmsReportReceivables:'||v.action,'button','','',m.id,'tms',v.sort,
 jsonb_build_object('title',v.title,'is_enable',true,'is_auth_button',true)
FROM public.sys_menu m CROSS JOIN (VALUES
 ('AddCollection','登记催收',1),('ViewCollection','查看催收历史',2)
) v(action,title,sort)
WHERE m.name='TmsReportReceivables' AND NOT EXISTS(
 SELECT 1 FROM public.sys_menu b WHERE b.name='TmsReportReceivables:'||v.action);
INSERT INTO public.sys_role_menu(role_id,menu_id,tenant_id)
SELECT r.id,m.id,r.tenant_id FROM public.sys_role r CROSS JOIN public.sys_menu m
WHERE r.role_code='yq_2026_001' AND r.tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9'
AND m.name IN ('TmsReportReceivables:AddCollection','TmsReportReceivables:ViewCollection')
AND NOT EXISTS(SELECT 1 FROM public.sys_role_menu rm WHERE rm.role_id=r.id AND rm.menu_id=m.id);
SELECT set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE scope text; record_id uuid; records jsonb;
BEGIN
 FOREACH scope IN ARRAY ARRAY['{}','{"x-art-tenant-scope":"6675a0d6-3ff6-4ab7-bb09-232d85ae96ad"}'] LOOP
  PERFORM set_config('request.headers',scope,true);
  record_id:=public.tms_add_receivable_collection_secure('7d95528d-7a9b-4cd5-96b7-115a22f0a371',
   jsonb_build_object('contacted_at',now()-interval '1 hour','method','电话','note','[普通用户催收回滚验收] 已核对付款安排'));
  records:=public.tms_list_receivable_collections_secure('7d95528d-7a9b-4cd5-96b7-115a22f0a371');
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(records) r WHERE r->>'id'=record_id::text)
  THEN RAISE EXCEPTION 'Ordinary own/forged-header collection roundtrip failed'; END IF;
 END LOOP;
END $test$;
RESET ROLE;
DELETE FROM public.sys_role_menu rm USING public.sys_menu m,public.sys_role r
WHERE rm.menu_id=m.id AND rm.role_id=r.id AND r.role_code='yq_2026_001'
AND r.tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9'
AND m.name='TmsReportReceivables:AddCollection';
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
 PERFORM public.tms_list_receivable_collections_secure('7d95528d-7a9b-4cd5-96b7-115a22f0a371');
 BEGIN
  PERFORM public.tms_add_receivable_collection_secure('7d95528d-7a9b-4cd5-96b7-115a22f0a371',
   jsonb_build_object('contacted_at',now(),'method','电话','note','已撤销登记权限应拒绝'));
  RAISE EXCEPTION 'View-only user can append collection';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
RESET ROLE;
DELETE FROM public.sys_menu WHERE name='TmsReportReceivables:AddCollection';
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
 BEGIN
  PERFORM public.tms_add_receivable_collection_secure('7d95528d-7a9b-4cd5-96b7-115a22f0a371',
   jsonb_build_object('contacted_at',now(),'method','电话','note','缺失按钮定义不应开放权限'));
  RAISE EXCEPTION 'Missing button definition opens collection mutation';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
ROLLBACK;
