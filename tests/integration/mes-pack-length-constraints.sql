-- Exercises persisted direction and packing constraints against the live RPCs.
-- Fixture edits and saved packs are rolled back.
begin;
do $test$
declare
  actor uuid;
  target public.mes_work_order%rowtype;
  rule public.mes_pack_rule%rowtype;
  first_board public.mes_work_order_detail%rowtype;
  second_board public.mes_work_order_detail%rowtype;
  third_board public.mes_work_order_detail%rowtype;
  first_id uuid;
  second_id uuid;
  packs jsonb;
  revised text;
begin
  select u.auth_user_id into strict actor
  from public.sys_user u
  join public.sys_role r on r.tenant_id=u.tenant_id and r.role_code=any(u.user_roles)
  where r.builtin_type='platform_super' and u.system_protected and u.status='1'
  limit 1;
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);

  select w.* into strict target
  from public.mes_work_order w
  where w.status='confirmed' and w.deleted_at is null
    and w.packing_enabled_snapshot and w.packing_published_at is null
    and not exists(select 1 from public.mes_work_order_pack p where p.work_order_id=w.id)
    and exists(
      select 1 from public.mes_work_order_detail a
      join public.mes_work_order_detail b on b.work_order_id=a.work_order_id
        and b.id>a.id and b.area=a.area and b.number<>a.number
        and b.length_mm<>a.length_mm
      where a.work_order_id=w.id
    )
  order by w.id limit 1;
  select r.* into strict rule from public.mes_pack_rule r
  where r.tenant_id=target.tenant_id and r.enabled
    and (r.board_thickness_mm is null or r.board_thickness_mm=
      (target.extension_values->>target.packing_thickness_field_key_snapshot)::numeric)
    and r.max_weight is null and r.max_length is null
    and r.max_stack_height>=2*
      (target.extension_values->>target.packing_thickness_field_key_snapshot)::numeric
  order by r.id limit 1;
  select a.id,b.id into strict first_id,second_id
  from public.mes_work_order_detail a
  join public.mes_work_order_detail b on b.work_order_id=a.work_order_id
    and b.id>a.id and b.area=a.area and b.number<>a.number
    and b.length_mm<>a.length_mm
  where a.work_order_id=target.id
  order by a.id,b.id limit 1;
  select * into strict first_board from public.mes_work_order_detail where id=first_id;
  select * into strict second_board from public.mes_work_order_detail where id=second_id;

  perform public.mes_save_pack_rule(rule.id,
    to_jsonb(rule)||jsonb_build_object('length_sort_direction','asc'));
  if (select length_sort_direction from public.mes_pack_rule where id=rule.id)<>'asc' then
    raise exception 'Length direction was not persisted';
  end if;
  perform public.mes_save_pack_rule(rule.id,to_jsonb(rule)-'length_sort_direction');
  if (select length_sort_direction from public.mes_pack_rule where id=rule.id)<>'asc' then
    raise exception 'Legacy rule save changed the configured length direction';
  end if;
  begin
    perform public.mes_save_pack_rule(rule.id,
      to_jsonb(rule)||jsonb_build_object('length_sort_direction','reverse'));
    raise exception 'Invalid length direction was accepted';
  exception when check_violation then null;
  end;

  update public.mes_pack_rule set same_number=false,allow_mix_length=true
  where id=rule.id;
  packs:=jsonb_build_array(jsonb_build_object(
    'pack_no','TEST-LENGTH-01','items',jsonb_build_array(
      jsonb_build_object('board_id',first_board.id,'pieces',1),
      jsonb_build_object('board_id',second_board.id,'pieces',1))));
  begin
    perform public.mes_save_packing_plan_v2(target.id,target.update_time::text,packs,rule.id);
    raise exception 'Different lengths across numbers were mixed';
  exception when check_violation then null;
  end;

  -- Same area and number may mix lengths when the rule explicitly permits it.
  update public.mes_work_order_detail set number=first_board.number
  where id=second_board.id;
  select * into strict third_board from public.mes_work_order_detail
  where work_order_id=target.id and area=first_board.area
    and id not in (first_board.id,second_board.id)
    and number<>first_board.number
  order by id limit 1;
  update public.mes_work_order_detail set length_mm=first_board.length_mm
  where id=third_board.id;
  begin
    perform public.mes_save_packing_plan_v2(
      target.id,target.update_time::text,
      jsonb_build_array(jsonb_build_object(
        'pack_no','TEST-LENGTH-01','items',jsonb_build_array(
          jsonb_build_object('board_id',first_board.id,'pieces',1),
          jsonb_build_object('board_id',third_board.id,'pieces',1),
          jsonb_build_object('board_id',second_board.id,'pieces',1)))),
      rule.id);
    raise exception 'Three-line mixed-length pack crossed numbers';
  exception when check_violation then null;
  end;
  revised:=public.mes_save_packing_plan_v2(
    target.id,target.update_time::text,packs,rule.id)->>'revision';
  if revised is null then raise exception 'Allowed mixed-length pack was not saved'; end if;
  update public.mes_pack_rule set allow_mix_length=false where id=rule.id;
  begin
    perform public.mes_save_packing_plan_v2(target.id,revised,packs,rule.id);
    raise exception 'Separate-length rule accepted mixed lengths';
  exception when check_violation then null;
  end;
end;
$test$;
rollback;
