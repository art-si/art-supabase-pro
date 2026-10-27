-- Read and write contract for independent electric cards.
-- All trial writes roll back; persistent QA cards remain unchanged.
begin;
do $test$
declare
  super_actor uuid;
  ordinary_actor uuid := 'ab881b32-87d4-4dce-9014-ce488b8069df';
  qa_tenant uuid := '7529f951-938e-4e2c-ac0d-316c136ae1f9';
  other_tenant uuid := '111e83d3-190e-4405-84c8-440d484d13a6';
  qa_vehicle uuid := 'd7670b37-2283-433e-95d2-7315829b0edc';
  scenario jsonb;
  result jsonb;
  direct_cards integer;
  direct_entries integer;
  temporary_card uuid;
  opening_balance numeric;
  fuel_before numeric;
  fuel_after numeric;
  charge_entry uuid;
  failed boolean;
  case_name text;
  incorrect_trajectory integer;
  qa_private_path text;
  foreign_private_path text;
begin
  qa_private_path:=qa_tenant::text||'/'||ordinary_actor::text||
    '/6ccf1256-f9f7-4c83-92cf-21e313d657dc.png';
  foreign_private_path:=other_tenant::text||'/'||ordinary_actor::text||
    '/6ccf1256-f9f7-4c83-92cf-21e313d657dc.png';
  select count(*) into incorrect_trajectory from (
    select e.balance_after,
      sum(e.signed_amount) over(partition by e.card_id order by e.posting_seq) running_balance
    from public.vms_electric_card_entry e
  ) balances where balance_after<>running_balance;
  if incorrect_trajectory<>0 then raise exception 'Electric posting sequence breaks balance trajectory';end if;
  if exists (
    select 1 from public.vms_electric_card c
    where c.card_no like 'VMS-ELEC-QA-20261027-%'
      and not (
        (select occurred_at from public.vms_electric_card_entry e
         where e.card_id=c.id and e.entry_type='opening')
        <
        (select occurred_at from public.vms_electric_card_entry e
         where e.card_id=c.id and e.entry_type='recharge')
        and
        (select occurred_at from public.vms_electric_card_entry e
         where e.card_id=c.id and e.entry_type='recharge')
        <
        (select occurred_at from public.vms_electric_card_entry e
         where e.card_id=c.id and e.entry_type='consume')
      )
  ) then raise exception 'QA business occurrence order is inconsistent';end if;
  select u.auth_user_id into super_actor
  from public.sys_user u
  join public.sys_tenant t on t.id=u.tenant_id
  where t.builtin_type='platform' and u.system_protected=true and u.status='1'
    and u.deleted_at is null
    and exists(select 1 from public.sys_role r where r.tenant_id=u.tenant_id
      and r.builtin_type='platform_super' and r.role_code=any(u.user_roles)
      and r.enabled=true)
  order by u.id limit 1;
  if super_actor is null then raise exception 'Platform super actor unavailable';end if;
  execute 'set local role authenticated';
  for scenario in select value from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('name','platform_all','uid',super_actor,'header',null,'expected',2),
    jsonb_build_object('name','platform_selected','uid',super_actor,'header',qa_tenant,'expected',2),
    jsonb_build_object('name','platform_other','uid',super_actor,'header',other_tenant,'expected',0),
    jsonb_build_object('name','ordinary_own','uid',ordinary_actor,'header',null,'expected',2),
    jsonb_build_object('name','ordinary_forged','uid',ordinary_actor,'header',other_tenant,'expected',2)
  )) loop
    case_name:=scenario->>'name';
    perform set_config('request.jwt.claim.sub',scenario->>'uid',true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',scenario->>'uid','role','authenticated')::text,true);
    perform set_config('request.headers',case when scenario->>'header' is null then '{}'
      else jsonb_build_object('x-art-tenant-scope',scenario->>'header')::text end,true);
    result:=public.vms_list_electric_cards_secure(0,19,null,null,null);
    if (result->>'total')::integer<>(scenario->>'expected')::integer then
      raise exception '% electric-card read scope wrong: %',case_name,result->>'total';end if;
    select count(*) into direct_cards from public.vms_electric_card
      where card_no like 'VMS-ELEC-QA-20261027-%';
    if direct_cards<>(scenario->>'expected')::integer then
      raise exception '% direct electric-card RLS wrong: %',case_name,direct_cards;end if;
    result:=public.vms_list_electric_card_entries_secure(0,19,null,null,null,null);
    if (result->>'total')::integer<>(scenario->>'expected')::integer*3 then
      raise exception '% electric-ledger read scope wrong: %',case_name,result->>'total';end if;
    if (scenario->>'expected')::integer>0 and
      (result->'records'->0->>'postingSeq')::bigint
      <(result->'records'->1->>'postingSeq')::bigint then
      raise exception '% ledger list is not posting-sequence descending',case_name;end if;
    select count(*) into direct_entries from public.vms_electric_card_entry
      where card_id in (select id from public.vms_electric_card
        where card_no like 'VMS-ELEC-QA-20261027-%');
    if direct_entries<>(scenario->>'expected')::integer*3 then
      raise exception '% direct electric-ledger RLS wrong: %',case_name,direct_entries;end if;
    if case_name in ('ordinary_own','ordinary_forged') then
      if not app_private.vms_electric_card_private_upload_allowed(qa_private_path)
        or not app_private.vms_electric_card_private_read_allowed(qa_private_path)
        or app_private.vms_electric_card_private_upload_allowed(foreign_private_path)
        or app_private.vms_electric_card_private_read_allowed(foreign_private_path) then
        raise exception '% private electric voucher scope wrong',case_name;end if;
    end if;
  end loop;
  for scenario in select value from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('name','platform_all','uid',super_actor,'header',null),
    jsonb_build_object('name','platform_selected','uid',super_actor,'header',qa_tenant),
    jsonb_build_object('name','platform_other','uid',super_actor,'header',other_tenant),
    jsonb_build_object('name','ordinary_own','uid',ordinary_actor,'header',null),
    jsonb_build_object('name','ordinary_forged','uid',ordinary_actor,'header',other_tenant)
  )) loop
    case_name:=scenario->>'name';
    perform set_config('request.jwt.claim.sub',scenario->>'uid',true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',scenario->>'uid','role','authenticated')::text,true);
    perform set_config('request.headers',case when scenario->>'header' is null then '{}'
      else jsonb_build_object('x-art-tenant-scope',scenario->>'header')::text end,true);
    if case_name='platform_other' then
      begin
        perform public.vms_create_electric_card('VMS-ELEC-ROLLBACK-DENIED',qa_vehicle,
          '',null,null,null,0,'scope test');
        raise exception 'Selected platform scope created a card in another tenant';
      exception when insufficient_privilege then null;
      end;
    else
      temporary_card:=public.vms_create_electric_card(
        'VMS-ELEC-ROLLBACK-'||case_name,qa_vehicle,'',null,null,null,50,'scope test');
      if (select tenant_id from public.vms_electric_card where id=temporary_card)<>qa_tenant then
        raise exception '% wrote to wrong tenant',case_name;end if;
      if case_name='ordinary_own' then
        select coalesce(sum(signed_amount),0) into fuel_before
        from public.vms_fuel_card_entry where tenant_id=qa_tenant;
        perform public.vms_record_electric_card_transaction(temporary_card,'recharge',100,now(),
          null,null,'','','','','','{}',null,null,'scope test');
        charge_entry:=public.vms_record_electric_card_transaction(temporary_card,'consume',30,now(),
          10,3,'测试充电站','P-001','','','','{}',null,null,'scope test');
        select sum(signed_amount) into opening_balance
        from public.vms_electric_card_entry where card_id=temporary_card;
        if opening_balance<>120 then raise exception 'Electric balance wrong: %',opening_balance;end if;
        failed:=false;
        begin
          perform public.vms_record_electric_card_transaction(temporary_card,'consume',999,now(),
            10,3,'测试充电站','P-001','','','','{}',null,null,'scope test');
        exception when invalid_parameter_value then failed:=true;
        end;
        if not failed then raise exception 'Electric card allowed insufficient balance';end if;
        perform public.vms_set_electric_card_status(temporary_card,'lost');
        failed:=false;
        begin
          perform public.vms_record_electric_card_transaction(temporary_card,'consume',1,now(),
            1,1,'测试充电站','P-001','','','','{}',null,null,'scope test');
        exception when invalid_parameter_value then failed:=true;
        end;
        if not failed then raise exception 'Lost electric card accepted consumption';end if;
        perform public.vms_record_electric_card_transaction(temporary_card,'reversal',30,now(),
          null,null,'','','','','','{}',null,charge_entry,'修正测试消费');
        select sum(signed_amount) into opening_balance
        from public.vms_electric_card_entry where card_id=temporary_card;
        if opening_balance<>150 then raise exception 'Electric reversal balance wrong: %',opening_balance;end if;
        failed:=false;
        begin
          perform public.vms_record_electric_card_transaction(temporary_card,'reversal',30,now(),
            null,null,'','','','','','{}',null,charge_entry,'重复冲正');
        exception when invalid_parameter_value then failed:=true;
        end;
        if not failed then raise exception 'Electric card allowed duplicate reversal';end if;
        select coalesce(sum(signed_amount),0) into fuel_after
        from public.vms_fuel_card_entry where tenant_id=qa_tenant;
        if fuel_before<>fuel_after then raise exception 'Electric transaction touched fuel balance';end if;
      end if;
    end if;
  end loop;
  if (select count(*) from public.vms_electric_card where vehicle_id=qa_vehicle
      and card_no like 'VMS-ELEC-ROLLBACK-%')<3 then
    raise exception 'Vehicle was limited to one electric card';end if;
  execute 'reset role';
end $test$;
rollback;
