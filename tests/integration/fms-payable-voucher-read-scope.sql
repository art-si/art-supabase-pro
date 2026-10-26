begin;

do $context$
declare
  tenant uuid;
  actor uuid;
  ordinary uuid;
  other_tenant uuid;
  foreign_voucher uuid;
  book uuid;
  foreign_book uuid;
  vouchers jsonb;
begin
  select id into tenant from public.sys_tenant where tenant_code='qa-payable-20261022';
  select auth_user_id into actor from public.sys_user
    where user_roles @> array['R_SUPER'] and auth_user_id is not null order by id limit 1;
  select auth_user_id into ordinary from public.sys_user
    where tenant_id=tenant and auth_user_id is not null and not system_protected
      and user_roles @> array['QA_AP_ACCEPTANCE_01A15DAD'] order by id limit 1;
  select id into other_tenant from public.sys_tenant
    where id<>tenant and builtin_type is distinct from 'platform' and status='1' order by id limit 1;
  select id,account_set_id into foreign_voucher,foreign_book from public.fms_voucher where tenant_id<>tenant order by id limit 1;
  select account_set_id into book from public.fms_voucher where tenant_id=tenant
    group by account_set_id having count(*)>=2 order by count(*) desc,account_set_id limit 1;
  select jsonb_agg(id) into vouchers from (
    select id from public.fms_voucher where tenant_id=tenant and account_set_id=book order by id limit 2
  ) selected;
  if actor is null or ordinary is null or other_tenant is null or foreign_voucher is null
    or coalesce(jsonb_array_length(vouchers),0)<>2 then
    raise exception 'Missing independent payable voucher read-scope acceptance fixtures';
  end if;
  perform set_config('test.payable_voucher_scope',jsonb_build_object(
    'tenant',tenant,'actor',actor,'ordinary',ordinary,'other_tenant',other_tenant,
    'foreign_voucher',foreign_voucher,'vouchers',vouchers,'book',book,'foreign_book',foreign_book)::text,true);
end $context$;

set local role authenticated;

do $test$
declare
  context jsonb:=current_setting('test.payable_voucher_scope')::jsonb;
  selected_voucher uuid;
  platform_selected jsonb;
  ordinary_own jsonb;
  result jsonb;
  blocked boolean;
  voucher_ids uuid[];
begin
  select array_agg(value::uuid) into voucher_ids from jsonb_array_elements_text(context->'vouchers');
  voucher_ids:=array_append(voucher_ids,(context->>'foreign_voucher')::uuid);
  perform set_config('request.jwt.claim.sub',context->>'actor',true);
  perform set_config('request.headers','{}',true);
  result:=public.fms_list_vouchers_secure(p_ids=>voucher_ids);
  if (result->>'total')::integer<>3 or jsonb_array_length(result->'records')<>3
    or exists(select 1 from jsonb_array_elements(result->'records') entry where entry->>'id' is null) then
    raise exception 'Platform-all voucher list lost authorized tenants or row identity';
  end if;
  result:=public.fms_list_vouchers_secure(p_ids=>voucher_ids,p_account_set_id=>(context->>'book')::uuid);
  if(result->>'total')::integer<>2 then raise exception 'Explicit book did not restrict platform-all voucher list';end if;
  for selected_voucher in select value::uuid from jsonb_array_elements_text(context->'vouchers') loop
    perform set_config('request.jwt.claim.sub',context->>'actor',true);
    perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',context->>'tenant')::text,true);
    platform_selected:=public.fms_get_voucher_secure(selected_voucher);
    if platform_selected->>'id' is distinct from selected_voucher::text
      or jsonb_array_length(platform_selected->'lines')<2 then
      raise exception 'Platform-selected voucher detail or lines missing';
    end if;
    perform set_config('request.headers','{}',true);
    result:=public.fms_get_voucher_secure(selected_voucher);
    if result is distinct from platform_selected then
      raise exception 'Platform-all voucher detail differs from its selected-tenant projection';
    end if;
    perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',context->>'other_tenant')::text,true);
    blocked:=false;
    begin perform public.fms_get_voucher_secure(selected_voucher);
    exception when no_data_found then blocked:=true;end;
    if not blocked then raise exception 'Platform-selected voucher reader ignored concrete tenant';end if;
    result:=public.fms_list_vouchers_secure(p_ids=>voucher_ids);
    if(result->>'total')::integer<>0 then raise exception 'Platform-selected voucher list ignored concrete tenant';end if;
    blocked:=false;
    begin perform public.fms_list_vouchers_secure(p_ids=>voucher_ids,p_account_set_id=>(context->>'book')::uuid);
    exception when insufficient_privilege then blocked:=true;end;
    if not blocked then raise exception 'Platform-selected voucher list accepted another tenant book';end if;

    perform set_config('request.jwt.claim.sub',context->>'ordinary',true);
    perform set_config('request.headers','{}',true);
    ordinary_own:=public.fms_get_voucher_secure(selected_voucher);
    if ordinary_own->>'id' is distinct from selected_voucher::text
      or jsonb_array_length(ordinary_own->'lines')<2 then
      raise exception 'Ordinary authorized voucher detail or lines missing';
    end if;
    perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',context->>'other_tenant')::text,true);
    if public.fms_get_voucher_secure(selected_voucher) is distinct from ordinary_own then
      raise exception 'Forged header changed ordinary voucher access';
    end if;
    result:=public.fms_list_vouchers_secure(p_ids=>voucher_ids);
    if(result->>'total')::integer<>2 or jsonb_array_length(result->'records')<>2
      or exists(select 1 from jsonb_array_elements(result->'records') entry where entry->>'id'=context->>'foreign_voucher') then
      raise exception 'Ordinary voucher list leaked or changed under forged header';
    end if;
    blocked:=false;
    begin perform public.fms_list_vouchers_secure(p_account_set_id=>(context->>'foreign_book')::uuid);
    exception when insufficient_privilege then blocked:=true;end;
    if not blocked then raise exception 'Ordinary voucher list accepted foreign book';end if;
    blocked:=false;
    begin perform public.fms_get_voucher_secure((context->>'foreign_voucher')::uuid);
    exception when no_data_found then blocked:=true;end;
    if not blocked then raise exception 'Ordinary voucher reader exposed another tenant';end if;
  end loop;
  perform set_config('request.jwt.claim.sub',context->>'actor',true);
  perform set_config('request.headers','{}',true);
  if public.fms_get_voucher_secure((context->>'foreign_voucher')::uuid)->>'id'
    is distinct from context->>'foreign_voucher' then
    raise exception 'Platform-all failed to read authorized foreign voucher';
  end if;
  perform set_config('request.jwt.claim.sub','',true);
  blocked:=false;
  begin perform public.fms_get_voucher_secure(selected_voucher);
  exception when insufficient_privilege then blocked:=true;end;
  if not blocked then raise exception 'Unauthenticated voucher detail was exposed';end if;
end $test$;

rollback;
