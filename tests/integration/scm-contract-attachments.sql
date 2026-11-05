-- Run against the linked project with execute_sql. All fixture writes roll back.
begin;
do $test$
declare
  v_sales public.scm_sales_document%rowtype;
  v_purchase public.scm_purchase_document%rowtype;
  v_user public.sys_user%rowtype;
  v_super uuid;
  v_ordinary uuid;
  v_restricted uuid;
  v_attachment_id uuid;
  v_url text;
  v_foreign_url text;
  v_other_tenant uuid;
  v_payload jsonb;
  v_sales_id uuid;
  v_purchase_id uuid;
  v_order_id uuid;
  v_count integer;
begin
  select s.* into strict v_sales
  from public.scm_sales_document s
  where s.kind='sales_contract' and s.status='draft' and s.customer_id is not null
    and exists(select 1 from public.sys_attachment a where a.tenant_id=s.tenant_id and a.url<>'')
    and exists(select 1 from public.scm_purchase_document p
      where p.tenant_id=s.tenant_id and p.kind='purchase_contract'
        and p.status='draft' and p.supplier_id is not null)
  limit 1;
  select p.* into strict v_purchase from public.scm_purchase_document p
    where p.tenant_id=v_sales.tenant_id and p.kind='purchase_contract'
      and p.status='draft' and p.supplier_id is not null limit 1;
  select a.id,a.url into strict v_attachment_id,v_url from public.sys_attachment a
    where a.tenant_id=v_sales.tenant_id and a.url<>'' limit 1;
  select a.url into strict v_foreign_url from public.sys_attachment a
    where a.tenant_id<>v_sales.tenant_id and a.url<>'' limit 1;
  select t.id into strict v_other_tenant from public.sys_tenant t
    where t.id<>v_sales.tenant_id and t.status='1' limit 1;
  select u.auth_user_id into strict v_super from public.sys_user u
    join public.sys_tenant t on t.id=u.tenant_id and t.builtin_type='platform'
    join public.sys_role r on r.tenant_id=u.tenant_id and r.builtin_type='platform_super'
      and r.role_code=any(u.user_roles)
    where u.system_protected and u.deleted_at is null and u.status='1'
      and r.enabled and u.auth_user_id is not null limit 1;
  for v_user in select * from public.sys_user
    where tenant_id=v_sales.tenant_id and auth_user_id is not null and status='1'
  loop
    perform set_config('request.jwt.claim.sub',v_user.auth_user_id::text,true);
    if app_private.has_permission('ScmSalesContract:Add')
      and app_private.has_permission('ScmSalesContract:Edit')
      and app_private.has_permission('ScmSalesContract:View')
      and app_private.has_permission('ScmPurchaseContract:Add')
      and app_private.has_permission('ScmPurchaseContract:Edit')
      and app_private.has_permission('ScmPurchaseContract:View') then
      v_ordinary:=v_user.auth_user_id;
    elsif not app_private.has_permission('ScmSalesContract:View')
      and not app_private.has_permission('ScmPurchaseContract:View') then
      v_restricted:=v_user.auth_user_id;
    end if;
  end loop;
  if v_ordinary is null or v_restricted is null then
    raise exception 'SCM contract attachment actor fixtures missing';
  end if;
  v_payload:=jsonb_build_array(jsonb_build_object('name','合同.pdf','url',v_url,
    'file_type','application/pdf','file_size',123));
  perform set_config('request.jwt.claim.sub',v_ordinary::text,true);
  perform set_config('request.headers','{}',true);
  insert into public.scm_sales_document(tenant_id,kind,document_no,customer_id,details)
    values(v_sales.tenant_id,'sales_contract','QA-CONTRACT-ATTACH-'||gen_random_uuid(),
      v_sales.customer_id,jsonb_build_object('contract_attachments',v_payload))
    returning id into v_sales_id;
  insert into public.scm_purchase_document(tenant_id,kind,document_no,supplier_id,details)
    values(v_purchase.tenant_id,'purchase_contract','QA-CONTRACT-ATTACH-'||gen_random_uuid(),
      v_purchase.supplier_id,jsonb_build_object('contract_attachments',v_payload))
    returning id into v_purchase_id;
  update public.scm_sales_document set details=jsonb_set(details,
    '{contract_attachments,0,name}','"合同更新.pdf"'::jsonb) where id=v_sales_id;
  update public.scm_purchase_document set details=jsonb_set(details,
    '{contract_attachments,0,name}','"合同更新.pdf"'::jsonb) where id=v_purchase_id;
  select count(*) into v_count from public.get_attachment_delete_dependency_details(array[v_attachment_id])
    where dependency_code like 'attachment_scm_%';
  if v_count<>2 then raise exception 'ordinary own references: %',v_count; end if;
  perform set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope',v_other_tenant)::text,true);
  select count(*) into v_count from public.get_attachment_delete_dependency_details(array[v_attachment_id])
    where dependency_code like 'attachment_scm_%';
  if v_count<>2 then raise exception 'ordinary forged header references: %',v_count; end if;
  perform set_config('request.jwt.claim.sub',v_super::text,true);
  perform set_config('request.headers','{}',true);
  select count(*) into v_count from public.get_attachment_delete_dependency_details(array[v_attachment_id])
    where dependency_code like 'attachment_scm_%';
  if v_count<>2 then raise exception 'platform all references: %',v_count; end if;
  perform set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope',v_sales.tenant_id)::text,true);
  select count(*) into v_count from public.get_attachment_delete_dependency_details(array[v_attachment_id])
    where dependency_code like 'attachment_scm_%';
  if v_count<>2 then raise exception 'platform selected references: %',v_count; end if;
  perform set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope',v_other_tenant)::text,true);
  select count(*) into v_count from public.get_attachment_delete_dependency_details(array[v_attachment_id])
    where dependency_code like 'attachment_scm_%';
  if v_count<>0 then raise exception 'platform other tenant leaked references: %',v_count; end if;
  perform set_config('request.jwt.claim.sub',v_restricted::text,true);
  perform set_config('request.headers','{}',true);
  select count(*) into v_count from public.get_attachment_delete_dependency_details(array[v_attachment_id])
    where dependency_code like 'attachment_scm_%' and target_id is null
      and record_status is null and record_amount is null and created_at is null
      and record_no like '%无查看权限%';
  if v_count<>2 then raise exception 'restricted placeholders: %',v_count; end if;
  begin
    delete from public.sys_attachment where id=v_attachment_id;
    raise exception 'referenced attachment deletion accepted';
  exception when foreign_key_violation then null; end;
  perform set_config('request.jwt.claim.sub',v_super::text,true);
  begin
    perform app_private.assert_scm_contract_attachments(
      jsonb_build_object('contract_attachments',
        jsonb_build_array(jsonb_build_object('name','跨租户','url',v_foreign_url,
          'file_type','pdf','file_size',1))),v_sales.tenant_id,true);
    raise exception 'cross-tenant attachment accepted';
  exception when foreign_key_violation then null; end;
  insert into public.scm_sales_document(tenant_id,kind,document_no,customer_id,details)
    values(v_sales.tenant_id,'sales_order','QA-ORDER-ATTACH-'||gen_random_uuid(),
      v_sales.customer_id,jsonb_build_object('contract_attachments',v_payload))
    returning id into v_order_id;
  if (select details ? 'contract_attachments' from public.scm_sales_document where id=v_order_id)
  then raise exception 'non-contract inherited attachments persisted'; end if;
end
$test$;
rollback;
