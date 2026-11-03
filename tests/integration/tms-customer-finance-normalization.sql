-- Finance is authoritative in child rows, including legacy create/import payloads.
begin;
do $finance_normalization$
declare
  actor uuid;
  ordinary_actor uuid;
  ordinary_role_id uuid;
  v_customer_id uuid;
  main_rows integer;
  child_rows integer;
  denied boolean:=false;
  denied_finance boolean:=false;
  denied_contact boolean:=false;
begin
  select count(*) into main_rows from public.mdm_customer
  where invoice_title is not null or tax_no is not null
    or bank_name is not null or bank_account is not null;
  if main_rows<>0 then raise exception 'Customer main table still contains finance values'; end if;
  select count(*) into child_rows from public.mdm_customer_finance;
  if child_rows<3 then raise exception 'Historical finance child rows are missing'; end if;
  select u.auth_user_id into actor
  from public.sys_user u join public.sys_tenant t on t.id=u.tenant_id
  where t.builtin_type='platform' and u.system_protected and u.status='1'
  order by u.id limit 1;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  execute 'set local role authenticated';
  v_customer_id:=public.tms_create_customer_secure(jsonb_build_object(
    'customer_name','TEST finance child only','invoice_title','TEST invoice',
    'tax_no','TEST-TAX','bank_account','TEST-ACCOUNT'));
  begin
    perform public.tms_update_customer_secure(v_customer_id,jsonb_build_object('tax_no','FORBIDDEN'));
  exception when sqlstate '42501' then denied:=true;
  end;
  if not denied then raise exception 'Direct customer finance update bypassed child authority'; end if;
  execute 'reset role';
  select count(*) into main_rows from public.mdm_customer where id=v_customer_id
    and (invoice_title is not null or tax_no is not null or bank_name is not null or bank_account is not null);
  select count(*) into child_rows from public.mdm_customer_finance
  where customer_id=v_customer_id
    and tax_no='TEST-TAX' and bank_account='TEST-ACCOUNT' and is_default_invoice;
  if main_rows<>0 or child_rows<>1 then
    raise exception 'Legacy create failed finance isolation: %, %',main_rows,child_rows;
  end if;
  select u.auth_user_id,r.id into ordinary_actor,ordinary_role_id
  from public.sys_user u
  join public.sys_tenant t on t.id=u.tenant_id and t.builtin_type is distinct from 'platform'
  join public.sys_role r on r.tenant_id=u.tenant_id and r.role_code=any(u.user_roles) and r.enabled
  where u.status='1' and u.deleted_at is null and u.auth_user_id is not null
    and cardinality(u.user_roles)=1
    and exists(select 1 from public.sys_role_menu rm join public.sys_menu m on m.id=rm.menu_id
      where rm.role_id=r.id and m.name='TmsCustomer:Add')
    and exists(select 1 from public.sys_role_menu rm join public.sys_menu m on m.id=rm.menu_id
      where rm.role_id=r.id and m.name='TmsCustomer:FinanceAdd')
    and exists(select 1 from public.sys_role_menu rm join public.sys_menu m on m.id=rm.menu_id
      where rm.role_id=r.id and m.name='TmsCustomer:ContactAdd')
  order by u.id limit 1;
  if ordinary_actor is null then raise exception 'Ordinary customer Add actor fixture is missing'; end if;
  delete from public.sys_role_menu rm using public.sys_menu m
  where rm.menu_id=m.id and rm.role_id=ordinary_role_id
    and m.name in ('TmsCustomer:FinanceAdd','TmsCustomer:ContactAdd');
  perform set_config('request.jwt.claim.sub',ordinary_actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',ordinary_actor,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  begin
    perform public.tms_create_customer_secure(jsonb_build_object(
      'customer_name','TEST unauthorized finance','invoice_title','TEST invoice'));
  exception when sqlstate '42501' then denied_finance:=true;
  end;
  begin
    perform public.tms_create_customer_secure(jsonb_build_object(
      'customer_name','TEST unauthorized contact','contact_name','TEST contact'));
  exception when sqlstate '42501' then denied_contact:=true;
  end;
  if not denied_finance or not denied_contact then
    raise exception 'Legacy customer create bypassed child Add permissions';
  end if;
end $finance_normalization$;
rollback;
