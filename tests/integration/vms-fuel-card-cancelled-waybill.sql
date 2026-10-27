begin;
select set_config('request.jwt.claims',jsonb_build_object('sub','ab881b32-87d4-4dce-9014-ce488b8069df','role','authenticated')::text,true);
select set_config('request.headers','{}',true);
do $test$
declare card uuid:='4dd0014c-cb7a-45dd-aa5f-efff5bcc89cb';
 cancelled uuid:='64fb903b-8ce8-4441-85ac-14835e2c5b3d';
 pending uuid:='baee5a01-6ac6-4fd9-858a-67ffd14e554a';
 result jsonb;rejected boolean;entry uuid;
begin
 result:=public.vms_list_fuel_card_waybill_options_secure(card);
 if (result->>'total')::int<>3 or exists(
   select 1 from jsonb_array_elements(result->'records') x where x->>'status'='cancelled'
 ) then raise exception 'Cancelled waybill remains selectable';end if;
 rejected:=false;
 begin
   perform public.vms_record_fuel_card_transaction_v3(
     p_card_id:=card,p_entry_type:='consume',p_amount:=0.01,p_occurred_on:=current_date,p_waybill_id:=cancelled);
 exception when foreign_key_violation then rejected:=true;end;
 if not rejected then raise exception 'Cancelled waybill accepted by write RPC';end if;
 entry:=public.vms_record_fuel_card_transaction_v3(
   p_card_id:=card,p_entry_type:='consume',p_amount:=0.01,p_occurred_on:=current_date,p_waybill_id:=pending);
 if (public.vms_list_fuel_card_entries_secure(p_ids:=array[entry])->'records'->0->>'waybillId')<>pending::text then
   raise exception 'Valid pending waybill rejected';end if;
end $test$;
select 'cancelled-waybill-guard-passed' as result;
rollback;
