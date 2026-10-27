-- Exercises the real save RPC and unique constraint. All data and grants roll back.
begin;
do $test$
declare
  actor uuid; ordinary uuid; ordinary_role uuid; other_tenant uuid;
  target public.mes_work_order%rowtype;
  board public.mes_work_order_detail%rowtype;
  rule public.mes_pack_rule%rowtype;
  existing public.mes_work_order_pack%rowtype;
  payload jsonb; saved_id uuid; revision text;
  failed_constraint text; scope_headers text;
begin
  select u.auth_user_id into strict actor
  from public.sys_user u join public.sys_role r
    on r.tenant_id=u.tenant_id and r.role_code=any(u.user_roles)
  where r.builtin_type='platform_super' and u.system_protected and u.status='1' limit 1;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);

  select p.* into strict existing from public.mes_work_order_pack p
    where p.pack_no='PK-0001' limit 1;
  select w.* into strict target from public.mes_work_order w
  where w.tenant_id=existing.tenant_id and w.status='confirmed' and w.deleted_at is null
    and w.packing_enabled_snapshot and w.packing_published_at is null
    and not exists(select 1 from public.mes_work_order_pack p where p.work_order_id=w.id)
    and nullif(w.extension_values->>w.packing_thickness_field_key_snapshot,'')::numeric>0
    and exists(select 1 from public.mes_work_order_detail d where d.work_order_id=w.id and d.pieces>0)
  order by w.id limit 1;
  select * into strict board from public.mes_work_order_detail
    where work_order_id=target.id and pieces>0 order by id limit 1;
  select r.* into strict rule from public.mes_pack_rule r
  where r.tenant_id=target.tenant_id and r.enabled
    and (r.board_thickness_mm is null or r.board_thickness_mm=(target.extension_values->>target.packing_thickness_field_key_snapshot)::numeric)
    and (r.max_length is null or r.max_length>=board.length_mm)
    and (r.max_weight is null or (board.unit_weight_kg is not null and r.max_weight>=board.unit_weight_kg))
    and r.max_stack_height>=(target.extension_values->>target.packing_thickness_field_key_snapshot)::numeric
  order by r.id limit 1;
  payload:=jsonb_build_array(jsonb_build_object('pack_no','PK-0001','items',
    jsonb_build_array(jsonb_build_object('board_id',board.id,'pieces',1))));

  -- Platform-all can save the same short number for a different work order.
  perform public.mes_save_packing_plan_v2(target.id,target.update_time::text,payload,rule.id);
  select id into strict saved_id from public.mes_work_order_pack
    where work_order_id=target.id and pack_no='PK-0001';
  if saved_id=existing.id or not exists(select 1 from public.mes_work_order_pack where id=existing.id and pack_no='PK-0001') then
    raise exception 'Cross-order save changed an existing package';
  end if;
  payload:=jsonb_set(payload,'{0,id}',to_jsonb(saved_id::text));
  select update_time::text into revision from public.mes_work_order where id=target.id;

  -- Same-order duplicates are rejected at both RPC and table boundaries.
  begin
    perform public.mes_save_packing_plan_v2(target.id,revision,payload||payload,rule.id);
    raise exception 'Duplicate payload was accepted';
  exception when unique_violation then null;
  end;
  begin
    insert into public.mes_work_order_pack(tenant_id,work_order_id,pack_no,area,axis)
      values(target.tenant_id,target.id,'PK-0001',board.area,board.number);
    raise exception 'Duplicate row was accepted';
  exception when unique_violation then
    get stacked diagnostics failed_constraint=constraint_name;
    if failed_constraint<>'mes_work_order_pack_tenant_order_no_key' then
      raise exception 'Unexpected constraint: %',failed_constraint;
    end if;
  end;

  -- A concrete platform tenant remains a boundary.
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',target.tenant_id)::text,true);
  perform public.mes_save_packing_plan_v2(target.id,revision,payload,rule.id);
  select id into strict other_tenant from public.sys_tenant where id<>target.tenant_id limit 1;
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
  begin
    perform public.mes_save_packing_plan_v2(target.id,revision,payload,rule.id);
    raise exception 'Platform-selected crossed its tenant boundary';
  exception when no_data_found then null;
  end;

  -- Ordinary users with Save may edit their own work order, even with a forged header.
  select u.auth_user_id,r.id into strict ordinary,ordinary_role
  from public.sys_user u join public.sys_role r
    on r.tenant_id=u.tenant_id and r.role_code=any(u.user_roles) and r.enabled
  where u.tenant_id=target.tenant_id and u.status='1' and u.user_type='2'
    and u.auth_user_id is not null and r.builtin_type is distinct from 'platform_super'
  order by u.id limit 1;
  insert into public.sys_role_menu(tenant_id,role_id,menu_id,create_by)
    select target.tenant_id,ordinary_role,m.id,'system' from public.sys_menu m
    where m.name in ('MesPacking:Save','MesPacking:View') on conflict do nothing;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',ordinary,'role','authenticated')::text,true);
  foreach scope_headers in array array['{}',jsonb_build_object('x-art-tenant-scope',other_tenant)::text] loop
    perform set_config('request.headers',scope_headers,true);
    select update_time::text into revision from public.mes_work_order where id=target.id;
    perform public.mes_save_packing_plan_v2(target.id,revision,payload,rule.id);
  end loop;
  if app_private.current_read_tenant_id() is distinct from target.tenant_id then
    raise exception 'Ordinary forged header changed tenant scope';
  end if;
end;
$test$;
rollback;
