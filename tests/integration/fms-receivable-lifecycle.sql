-- Execute inside a transaction and ROLLBACK after assertions.
do $test$
declare
  v_auth uuid;
  v_tenant uuid;
  v_customer uuid;
  v_org uuid;
  v_est_type uuid;
  v_fin_type uuid;
  v_est uuid;
  v_fin uuid;
  v_fin_second uuid;
  v_est_line uuid;
  v_other_tenant uuid;
  v_reversal_count integer;
begin
  select u.auth_user_id,u.tenant_id into v_auth,v_tenant
  from public.sys_user u
  where u.auth_user_id is not null and u.status='1'
    and exists(select 1 from public.mdm_customer c where c.tenant_id=u.tenant_id)
    and exists(select 1 from public.mdm_organization o where o.tenant_id=u.tenant_id)
    and exists(select 1 from public.fms_fund_account f join public.fms_currency c on c.id=f.currency_id
      where f.tenant_id=u.tenant_id and f.status='active' and c.currency_code='CNY')
    and exists (
      select 1 from public.sys_role r
      join public.sys_role_menu rm on rm.role_id=r.id
      join public.sys_menu m on m.id=rm.menu_id
      where r.tenant_id=u.tenant_id and r.role_code=any(u.user_roles)
        and m.name='FinanceEstimatedReceivable'
    )
    and exists (
      select 1 from public.sys_role r
      join public.sys_role_menu rm on rm.role_id=r.id
      join public.sys_menu m on m.id=rm.menu_id
      where r.tenant_id=u.tenant_id and r.role_code=any(u.user_roles)
        and m.name='FinanceFinancialReceivable'
    )
  limit 1;
  if v_auth is null then raise exception 'No eligible test account'; end if;
  select id into v_customer from public.mdm_customer where tenant_id=v_tenant limit 1;
  select id into v_org from public.mdm_organization where tenant_id=v_tenant and organization_type='company' and status='1' limit 1;
  select id into v_est_type from public.mdm_document_type
    where tenant_id=v_tenant and document_type_code='AR_EST_STANDARD';
  if v_est_type is null then
    insert into public.mdm_document_type(
      tenant_id,menu_id,menu_ids,document_type_code,document_type_name,is_default
    )
    select v_tenant,m.id,array[m.id],'AR_EST_STANDARD','标准销售暂估',true
    from public.sys_menu m where m.name='FinanceEstimatedReceivable'
    returning id into v_est_type;
  end if;
  select id into v_fin_type from public.mdm_document_type
    where tenant_id=v_tenant and document_type_code='AR_FIN_STANDARD';
  if v_fin_type is null then
    insert into public.mdm_document_type(
      tenant_id,menu_id,menu_ids,document_type_code,document_type_name,is_default
    )
    select v_tenant,m.id,array[m.id],'AR_FIN_STANDARD','标准销售应收',true
    from public.sys_menu m where m.name='FinanceFinancialReceivable'
    returning id into v_fin_type;
  end if;
  perform set_config('request.jwt.claim.sub',v_auth::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('test.ar_lifecycle_actor',v_auth::text,true);
  v_est := public.fms_save_receivable_document_secure(jsonb_build_object(
    'kind','estimate','tenantId',v_tenant,'documentTypeId',v_est_type,
    'customerId',v_customer,'settlementOrganizationId',v_org,
    'businessDate',current_date,'currencyCode','CNY','settlementMethod','cash',
    'lines',jsonb_build_array(jsonb_build_object(
      'lineNo',10,'basis','quantity','materialDescription','测试商品',
      'quantity',3,'priceBasis','untaxed','unitPrice',100,
      'taxInclusiveUnitPrice',0,'taxRate',13,'discountMethod','none',
      'discountRate',0,'discountAmount',0,'gift',false
    ))
  ));
  select id into v_other_tenant from public.sys_tenant where id<>v_tenant limit 1;
  perform set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope',v_other_tenant)::text,true);
  if app_private.current_read_tenant_id() is distinct from v_tenant then
    raise exception 'Forged tenant header changed ordinary read scope';
  end if;
  begin
    perform public.fms_list_receivable_documents_secure(
      0,19,'estimate',v_other_tenant,null,null,null,null,null
    );
    raise exception 'Forged tenant filter was accepted';
  exception when insufficient_privilege then
    null;
  end;
  perform set_config('request.headers','{}',true);
  perform public.fms_act_receivable_document_secure(v_est,'submit');
  perform public.fms_act_receivable_document_secure(v_est,'approve');
  select id into v_est_line from public.fms_receivable_line where document_id=v_est;
  v_fin := public.fms_push_financial_receivable_secure(v_est);
  perform public.fms_save_receivable_document_secure(jsonb_build_object(
    'id',v_fin,'kind','financial','tenantId',v_tenant,
    'estimateId',v_est,'documentTypeId',v_fin_type,
    'customerId',v_customer,'settlementOrganizationId',v_org,
    'businessDate',current_date,'currencyCode','CNY','settlementMethod','cash',
    'lines',jsonb_build_array(jsonb_build_object(
      'lineNo',10,'basis','quantity','estimatedLineId',v_est_line,
      'materialDescription','测试商品','quantity',1,'matchedQuantity',1,
      'priceBasis','untaxed','unitPrice',100,'taxInclusiveUnitPrice',0,
      'taxRate',13,'discountMethod','none','discountRate',0,
      'discountAmount',0,'gift',false
    ))
  ));
  perform public.fms_act_receivable_document_secure(v_fin,'submit');
  perform public.fms_act_receivable_document_secure(v_fin,'approve');
  v_fin_second := public.fms_push_financial_receivable_secure(v_est);
  perform set_config('test.ar_lifecycle_estimate',v_est::text,true);
  perform set_config('test.ar_lifecycle_financial_first',v_fin::text,true);
  perform set_config('test.ar_lifecycle_financial_max',v_fin_second::text,true);
  perform public.fms_act_receivable_document_secure(v_fin_second,'submit');
  perform public.fms_act_receivable_document_secure(v_fin_second,'approve');
  select count(*) into v_reversal_count from public.fms_receivable_document
  where estimate_id=v_est and kind='reversal' and status='approved';
  if v_reversal_count<>2 then raise exception 'Partial reversal count mismatch'; end if;
  if (select total_amount from public.fms_receivable_document where id=v_est) <>
     (select sum(total_amount) from public.fms_receivable_document
       where estimate_id=v_est and kind='reversal') then
    raise exception 'Reversal total mismatch';
  end if;
end;
$test$;

do $platform_scope$
declare
  v_auth uuid;
  v_sample public.fms_receivable_document%rowtype;
  v_other_tenant uuid;
  v_result jsonb;
  v_new uuid;
begin
  select u.auth_user_id into v_auth
  from public.sys_user u
  join public.sys_tenant t on t.id=u.tenant_id
  join public.sys_role r on r.tenant_id=u.tenant_id
    and r.role_code=any(u.user_roles)
  where u.auth_user_id is not null and u.system_protected
    and t.builtin_type='platform' and r.builtin_type='platform_super'
  limit 1;
  select * into v_sample from public.fms_receivable_document
    where kind='estimate' limit 1;
  if v_auth is null or v_sample.id is null then
    raise exception 'Missing platform scope test prerequisites';
  end if;
  perform set_config('request.jwt.claim.sub',v_auth::text,true);
  perform set_config('request.headers','{}',true);
  if app_private.current_read_tenant_id() is not null then
    raise exception 'Platform all scope unexpectedly narrowed';
  end if;
  v_result := public.fms_list_receivable_documents_secure(
    0,19,'estimate',null,null,null,null,null,null
  );
  if (v_result->>'total')::integer < 1 then
    raise exception 'Platform all scope did not read estimate';
  end if;
  v_new := public.fms_save_receivable_document_secure(jsonb_build_object(
    'kind','estimate','tenantId',v_sample.tenant_id,
    'documentTypeId',v_sample.document_type_id,
    'customerId',v_sample.customer_id,
    'settlementOrganizationId',v_sample.settlement_organization_id,
    'businessDate',current_date,'currencyCode','CNY','settlementMethod','cash',
    'lines',jsonb_build_array(jsonb_build_object(
      'lineNo',10,'basis','amount','materialDescription','平台范围测试',
      'quantity',0,'priceBasis','taxed','unitPrice',0,
      'taxInclusiveUnitPrice',0,'taxRate',13,'discountMethod','none',
      'discountRate',0,'discountAmount',0,'enteredGrossAmount',113,'gift',false
    ))
  ));
  if v_new is null then raise exception 'Platform all create failed'; end if;
  perform set_config('request.headers',
    jsonb_build_object('x-art-tenant-scope',v_sample.tenant_id)::text,true);
  if app_private.current_read_tenant_id() is distinct from v_sample.tenant_id then
    raise exception 'Platform selected scope mismatch';
  end if;
  v_result := public.fms_list_receivable_documents_secure(
    0,19,'estimate',null,null,null,null,null,null
  );
  if (v_result->>'total')::integer < 2 then
    raise exception 'Platform selected scope lost tenant estimates';
  end if;
  select id into v_other_tenant from public.sys_tenant
    where id<>v_sample.tenant_id limit 1;
  begin
    perform public.fms_list_receivable_documents_secure(
      0,19,'estimate',v_other_tenant,null,null,null,null,null
    );
    raise exception 'Platform selected cross-tenant filter accepted';
  exception when insufficient_privilege then
    null;
  end;
end;
$platform_scope$;
