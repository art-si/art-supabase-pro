-- Sales-contract completeness and quotation balance are advisory; fixtures roll back.
begin;

do $test$
declare
  source public.scm_sales_document%rowtype;
  source_line jsonb;
  contract_line jsonb;
  super_actor uuid;
  own_actor uuid;
  candidate record;
  other_tenant uuid;
  actor uuid;
  contract_id uuid;
  scenario integer;
  saved public.scm_sales_document%rowtype;
begin
  select d.* into strict source from public.scm_sales_document d
  where d.kind='sales_quotation' and d.status='effective'
    and exists(select 1 from jsonb_array_elements(d.lines) l
      where nullif(l->>'material_id','') is not null and (l->>'quantity')::numeric>0)
  order by d.id limit 1;
  select l into strict source_line from jsonb_array_elements(source.lines) l
    where nullif(l->>'material_id','') is not null and (l->>'quantity')::numeric>0 limit 1;
  select u.auth_user_id into strict super_actor from public.sys_user u
    join public.sys_role r on r.tenant_id=u.tenant_id and r.role_code=any(u.user_roles)
    where r.builtin_type='platform_super' and u.system_protected and u.status='1'
      and u.deleted_at is null and r.enabled limit 1;
  select id into strict other_tenant from public.sys_tenant
    where id<>source.tenant_id and status='1' limit 1;
  for candidate in select auth_user_id from public.sys_user
    where tenant_id=source.tenant_id and auth_user_id is not null
      and deleted_at is null and status='1'
  loop
    perform set_config('request.jwt.claims',jsonb_build_object('sub',candidate.auth_user_id,'role','authenticated')::text,true);
    perform set_config('request.jwt.claim.sub',candidate.auth_user_id::text,true);
    if not app_private.is_platform_super()
      and app_private.has_permission('ScmSalesContract:Add')
      and app_private.has_permission('ScmSalesContract:Edit')
      and app_private.has_permission('ScmSalesContract:View') then
      own_actor:=candidate.auth_user_id;
      exit;
    end if;
  end loop;
  if own_actor is null then raise exception 'Sales-contract ordinary actor fixture missing'; end if;

  contract_line:=source_line||jsonb_build_object(
    'line_id',gen_random_uuid(),'source_document_id',source.id,
    'source_line_id',source_line->>'line_id',
    'quantity',(source_line->>'quantity')::numeric+1000);
  -- Real authenticated writes in platform-all, platform-selected, ordinary-own,
  -- and ordinary-own with a forged cross-tenant header.
  for scenario in 1..4 loop
    actor:=case when scenario<=2 then super_actor else own_actor end;
    perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
    perform set_config('request.jwt.claim.sub',actor::text,true);
    perform set_config('request.headers',case scenario
      when 2 then jsonb_build_object('x-art-tenant-scope',source.tenant_id)::text
      when 4 then jsonb_build_object('x-art-tenant-scope',other_tenant)::text
      else '{}' end,true);
    execute 'set local role authenticated';
    insert into public.scm_sales_document(tenant_id,kind,document_no,project_id,customer_id,
      lines,payment_plans,clauses)
    values(source.tenant_id,'sales_contract','QA-ADVISORY-'||gen_random_uuid(),
      source.project_id,source.customer_id,jsonb_build_array(contract_line),'[]','[]')
    returning id into contract_id;
    update public.scm_sales_document set
      lines=jsonb_build_array(contract_line||jsonb_build_object('quantity',(contract_line->>'quantity')::numeric+1)),
      payment_plans='[{"due_date":"","ratio":0,"amount":0,"payment_types":[]}]',
      clauses='[{"title":"","content":"后续补充"}]'
      where id=contract_id returning * into strict saved;
    if saved.tenant_id<>source.tenant_id or jsonb_array_length(saved.payment_plans)<>1
      or saved.clauses->0->>'content'<>'后续补充' then
      raise exception 'Advisory save lost optional data or changed tenant';
    end if;
    begin
      update public.scm_sales_document set payment_plans='[{"amount":-1,"ratio":0}]'
        where id=contract_id;
      raise exception 'Negative payment amount accepted';
    exception when check_violation then null;
    end;
    begin
      update public.scm_sales_document set lines=jsonb_build_array(
        contract_line||jsonb_build_object('source_line_id',gen_random_uuid()))
        where id=contract_id;
      raise exception 'Forged quotation source line accepted';
    exception when check_violation then null;
    end;
    if scenario>=3 then
      begin
        insert into public.scm_sales_document(tenant_id,kind,document_no)
          values(other_tenant,'sales_contract','QA-CROSS-TENANT-'||gen_random_uuid());
        raise exception 'Cross-tenant ordinary write accepted';
      exception
        when insufficient_privilege or check_violation then null;
        when raise_exception then
          if sqlerrm<>'无权为其他租户生成编号' then raise; end if;
      end;
    end if;
    execute 'reset role';
  end loop;
end $test$;

rollback;
