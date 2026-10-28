-- Electric card context: two QA cards, tenant/vehicle/status guards, independent balance.
-- All writes are intentionally rolled back.
begin;
create temp table electric_context_scope_test(id int);
create function pg_temp.try_electric_context(
  p_card uuid,p_waybill uuid,p_status text default 'located',
  p_source text default 'map_pick',p_long numeric default 121.4700000,p_lat numeric default 31.2300000
) returns uuid language sql as $fn$
  select public.vms_record_electric_card_transaction_v2(
    p_card,'consume',1,now(),1,1,'QA 充电站','QA-P-1',
    '','','QA-CONTEXT-ROLLBACK','{}'::text[],null,null,'回滚验证',
    p_waybill,'上海测试地点',p_long,p_lat,case when p_status='located' then 'gcj02' else null end,p_source,p_status,case when p_status='located' then 'qa' else null end,case when p_status='located' then now() else null end)
$fn$;
do $test$
declare
 qa_tenant uuid:='7529f951-938e-4e2c-ac0d-316c136ae1f9';
 foreign_tenant uuid:='111e83d3-190e-4405-84c8-440d484d13a6';
 ordinary_actor uuid:='ab881b32-87d4-4dce-9014-ce488b8069df';
 super_actor uuid;
 card1 uuid;card2 uuid;closed_card uuid;
 waybill1 uuid:='8be0adc5-10ab-48b0-bc40-8ebceaeb9065';
 waybill2 uuid:='6d30461f-e412-4190-bf86-716e8a0e0945';
 foreign_waybill uuid:='57e3ab08-6f30-46d6-8991-9d7f1d4c1184';
 closed_waybill uuid:='3d42cd5c-7a5d-437e-9bde-0d951187d20d';
 entry1 uuid;entry2 uuid;before1 numeric;before2 numeric;fuel_before numeric;result jsonb;
 failed boolean;
begin
 select id into card1 from public.vms_electric_card where card_no='VMS-ELEC-QA-20261027-001';
 select id into card2 from public.vms_electric_card where card_no='VMS-ELEC-QA-20261027-002';
 if card1 is null or card2 is null then raise exception 'Two QA electric cards missing';end if;
 select sum(signed_amount) into before1 from public.vms_electric_card_entry where card_id=card1;
 select sum(signed_amount) into before2 from public.vms_electric_card_entry where card_id=card2;
 select coalesce(sum(signed_amount),0) into fuel_before from public.vms_fuel_card_entry where tenant_id=qa_tenant;
 select u.auth_user_id into super_actor
 from public.sys_user u join public.sys_tenant t on t.id=u.tenant_id
 where t.builtin_type='platform' and u.system_protected=true and u.status='1' and u.deleted_at is null
   and exists(select 1 from public.sys_role r where r.tenant_id=u.tenant_id
    and r.builtin_type='platform_super' and r.role_code=any(u.user_roles) and r.enabled=true)
 order by u.id limit 1;
 if super_actor is null then raise exception 'Platform super actor unavailable';end if;
 execute 'set local role authenticated';
 perform set_config('request.jwt.claim.sub',ordinary_actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ordinary_actor,'role','authenticated')::text,true);
 perform set_config('request.headers','{}',true);
 result:=public.vms_list_electric_card_waybill_options_secure(card1,0,19,null);
 if (result->>'total')::integer<1 or exists(
  select 1 from jsonb_array_elements(result->'records') x
  where x->>'vehicleId'<>'d7670b37-2283-433e-95d2-7315829b0edc'
     or x->>'status'='completed'
 ) then raise exception 'Waybill options leak another vehicle or completed task';end if;
 entry1:=pg_temp.try_electric_context(card1,waybill1);
 entry2:=pg_temp.try_electric_context(card2,waybill2,'pending',null,null,null);
 if not exists(select 1 from public.vms_electric_card_entry
   where id=entry1 and tenant_id=qa_tenant and waybill_id=waybill1
     and expense_coordinate_status='located' and expense_coordinate_source='map_pick'
     and expense_location='上海测试地点' and expense_longitude=121.4700000)
   or not exists(select 1 from public.vms_electric_card_entry
   where id=entry2 and tenant_id=qa_tenant and waybill_id=waybill2
     and expense_coordinate_status='pending' and expense_location='上海测试地点'
     and expense_longitude is null)
 then raise exception 'Two contextual electric entries not recorded correctly';end if;
 if (select sum(signed_amount) from public.vms_electric_card_entry where card_id=card1)<>before1-1
   or (select sum(signed_amount) from public.vms_electric_card_entry where card_id=card2)<>before2-1
 then raise exception 'Electric balances changed unexpectedly';end if;
 result:=public.vms_list_electric_card_entries_secure(0,19,card1,'consume',null,null);
 if not exists(select 1 from jsonb_array_elements(result->'records') x
   where x->>'id'=entry1::text and x->>'waybillNo'='QA-OWN-20261027-01'
     and x->>'expenseLocation'='上海测试地点')
 then raise exception 'Secure list omitted electric waybill/location';end if;
 failed:=false;
 begin perform pg_temp.try_electric_context(card1,waybill2);
 exception when foreign_key_violation then failed:=true;end;
 if not failed then raise exception 'Foreign vehicle waybill accepted';end if;
 failed:=false;
 begin perform pg_temp.try_electric_context(card1,foreign_waybill);
 exception when foreign_key_violation then failed:=true;end;
 if not failed then raise exception 'Foreign tenant waybill accepted';end if;
 failed:=false;
 begin perform pg_temp.try_electric_context(card1,waybill1,'pending','map_pick',121.47,31.23);
 exception when invalid_parameter_value then failed:=true;end;
 if not failed then raise exception 'Unconfirmed coordinates accepted';end if;
 failed:=false;
 begin perform pg_temp.try_electric_context(card1,waybill1,'located','map_pick',999,31.23);
 exception when invalid_parameter_value then failed:=true;end;
 if not failed then raise exception 'Out-of-range coordinates accepted';end if;
 -- Existing 15-argument RPC remains callable for legacy recharge/reversal clients.
 perform public.vms_record_electric_card_transaction(card1,'recharge',1,now(),
   null,null,'','','','','','{}'::text[],null,null,'旧接口兼容回滚验证');
 if (select sum(signed_amount) from public.vms_electric_card_entry where card_id=card1)<>before1
 then raise exception 'Legacy electric RPC balance wrong';end if;
 if (select coalesce(sum(signed_amount),0) from public.vms_fuel_card_entry where tenant_id=qa_tenant)<>fuel_before
 then raise exception 'Electric writes changed fuel balance';end if;
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',foreign_tenant)::text,true);
 result:=public.vms_list_electric_card_waybill_options_secure(card1,0,19,null);
 if (result->>'total')::integer<1 then raise exception 'Ordinary forged header hid own waybills';end if;
 failed:=false;
 begin perform pg_temp.try_electric_context(card1,foreign_waybill);
 exception when foreign_key_violation then failed:=true;end;
 if not failed then raise exception 'Forged header allowed foreign waybill';end if;
 perform set_config('request.jwt.claim.sub','9850d41a-77e9-40a7-b2cb-0ad02ac01440',true);
 perform set_config('request.jwt.claims',
   jsonb_build_object('sub','9850d41a-77e9-40a7-b2cb-0ad02ac01440','role','authenticated')::text,true);
 perform set_config('request.headers','{}',true);
 failed:=false;
 begin perform public.vms_list_electric_card_waybill_options_secure(card1,0,19,null);
 exception when insufficient_privilege then failed:=true;end;
 if not failed then raise exception 'Permissionless actor read electric waybill options';end if;
 failed:=false;
 begin perform pg_temp.try_electric_context(card1,waybill1);
 exception when insufficient_privilege then failed:=true;end;
 if not failed then raise exception 'Permissionless actor wrote electric context';end if;
 perform set_config('request.jwt.claim.sub',super_actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',super_actor,'role','authenticated')::text,true);
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',foreign_tenant)::text,true);
 failed:=false;
 begin perform public.vms_list_electric_card_waybill_options_secure(card1,0,19,null);
 exception when insufficient_privilege then failed:=true;end;
 if not failed then raise exception 'Platform selected foreign tenant read card options';end if;
 perform set_config('request.headers','{}',true);
 result:=public.vms_list_electric_card_waybill_options_secure(card1,0,19,null);
 if (result->>'total')::integer<1 then raise exception 'Platform-all lost electric waybills';end if;
 execute 'reset role';
 closed_card:=public.vms_create_electric_card('VMS-ELEC-CTX-ROLLBACK-CLOSED',
   '7a3d9ca0-7a71-4c41-a8da-c67a2951ba0f','',null,null,null,10,'回滚验证');
 execute 'set local role authenticated';
 perform set_config('request.jwt.claim.sub',ordinary_actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ordinary_actor,'role','authenticated')::text,true);
 failed:=false;
 begin perform pg_temp.try_electric_context(closed_card,closed_waybill);
 exception when foreign_key_violation then failed:=true;end;
 if not failed then raise exception 'Completed waybill accepted';end if;
 -- The current frontend uses v2 for recharge and reversal as well.
 perform public.vms_record_electric_card_transaction_v2(
   card1,'recharge',1,now(),null,null,'','','','','','{}'::text[],null,null,
   '回滚验证充值',null,'',null,null,null,null,'pending',null,null);
 perform public.vms_record_electric_card_transaction_v2(
   card1,'reversal',1,now(),null,null,'','','','','','{}'::text[],null,entry1,
   '回滚验证冲正',null,'',null,null,null,null,'pending',null,null);
 if (select sum(signed_amount) from public.vms_electric_card_entry where card_id=card1)<>before1+2
 then raise exception 'V2 recharge/reversal balance wrong';end if;
 execute 'reset role';
end $test$;
rollback;
