-- Read-only regression: list pagination and status counts use the same filters and tenant scope.
-- The production sample had 40 visible orders, including 17 pending and 1 partially signed.
begin;

do $test$
declare
  v_super uuid := '0a872664-874c-447d-a256-d0dbdca6ed45';
  v_ordinary uuid := 'ab881b32-87d4-4dce-9014-ce488b8069df';
  v_own_tenant uuid := '7529f951-938e-4e2c-ac0d-316c136ae1f9';
  v_other_tenant uuid;
  v_header_tenant uuid;
  v_keyword text;
  v_all_total integer;
  v_own_total integer;
  v_other_total integer;
  v_search_total integer;
  v_result jsonb;
  v_list jsonb;
  v_count_sum integer;
begin
  select o.tenant_id into v_other_tenant
  from public.tms_order o
  where o.tenant_id <> v_own_tenant and o.order_status <> 'created'
  order by o.tenant_id limit 1;
  select o.order_no into v_keyword
  from public.tms_order o
  where o.tenant_id = v_own_tenant and o.order_status <> 'created'
  order by o.id limit 1;

  select count(*) into v_all_total from public.tms_order where order_status <> 'created';
  select count(*) into v_own_total from public.tms_order
  where tenant_id = v_own_tenant and order_status <> 'created';
  select count(*) into v_other_total from public.tms_order
  where tenant_id = v_other_tenant and order_status <> 'created';
  select count(*) into v_search_total from public.tms_order
  where order_status <> 'created' and order_no ilike '%' || v_keyword || '%';
  if v_other_tenant is null or v_keyword is null or v_all_total < 2 then
    raise exception '[order-counts] requires two tenants with orders';
  end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', v_super::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_super, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{}', true);

  v_result := public.tms_list_orders_secure('order_list', p_count_only => true);
  select coalesce(sum(value::integer), 0) into v_count_sum
  from jsonb_each_text(v_result->'orderStatusCounts');
  if (v_result->>'total')::integer <> v_all_total or v_count_sum <> v_all_total then
    raise exception '[order-counts] platform-all total or status sum differs: %, %, expected %',
      v_result->>'total', v_count_sum, v_all_total;
  end if;
  v_list := public.tms_list_orders_secure('order_list', p_from => 0, p_to => 19);
  if (v_list->>'total')::integer <> v_all_total
     or jsonb_array_length(v_list->'records') <> least(20, v_all_total) then
    raise exception '[order-counts] list pagination differs from count-only result';
  end if;

  v_result := public.tms_list_orders_secure(
    'order_list', p_cargo_keyword => v_keyword, p_count_only => true);
  select coalesce(sum(value::integer), 0) into v_count_sum
  from jsonb_each_text(v_result->'orderStatusCounts');
  if (v_result->>'total')::integer <> v_search_total or v_count_sum <> v_search_total then
    raise exception '[order-counts] search total or status sum differs';
  end if;

  perform set_config('request.headers', jsonb_build_object('x-art-tenant-scope', v_own_tenant)::text, true);
  v_result := public.tms_list_orders_secure('order_list', p_count_only => true);
  select coalesce(sum(value::integer), 0) into v_count_sum
  from jsonb_each_text(v_result->'orderStatusCounts');
  if (v_result->>'total')::integer <> v_own_total or v_count_sum <> v_own_total then
    raise exception '[order-counts] platform-selected tenant total differs';
  end if;

  perform set_config('request.headers', jsonb_build_object('x-art-tenant-scope', v_other_tenant)::text, true);
  v_result := public.tms_list_orders_secure('order_list', p_count_only => true);
  select coalesce(sum(value::integer), 0) into v_count_sum
  from jsonb_each_text(v_result->'orderStatusCounts');
  if (v_result->>'total')::integer <> v_other_total or v_count_sum <> v_other_total then
    raise exception '[order-counts] other selected tenant total differs';
  end if;

  perform set_config('request.jwt.claim.sub', v_ordinary::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_ordinary, 'role', 'authenticated')::text, true);
  foreach v_header_tenant in array array[null::uuid, v_other_tenant] loop
    perform set_config('request.headers', case when v_header_tenant is null then '{}'
      else jsonb_build_object('x-art-tenant-scope', v_header_tenant)::text end, true);
    v_result := public.tms_list_orders_secure('order_list', p_count_only => true);
    select coalesce(sum(value::integer), 0) into v_count_sum
    from jsonb_each_text(v_result->'orderStatusCounts');
    if (v_result->>'total')::integer <> v_own_total or v_count_sum <> v_own_total then
      raise exception '[order-counts] ordinary own/forged scope total differs';
    end if;
  end loop;
end;
$test$;

rollback;
