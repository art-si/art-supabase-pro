-- Append-only evidence on existing QA rows. Every write, including synthetic
-- Storage metadata, rolls back. No fuel/electric balance is posted.
begin;
do $test$
declare
  actor uuid := 'ab881b32-87d4-4dce-9014-ce488b8069df';
  qa_tenant uuid := '7529f951-938e-4e2c-ac0d-316c136ae1f9';
  fuel_entry uuid := '5fa5a26c-b893-453a-97c2-034cb3fb94a6';
  electric_entry uuid := 'adb3f175-a429-478d-b9c9-7195fad3bdb4';
  fuel_path text := qa_tenant::text||'/'||actor::text||'/'||gen_random_uuid()::text||'.png';
  electric_path text := qa_tenant::text||'/'||actor::text||'/'||gen_random_uuid()::text||'.jpg';
  fuel_amount numeric;
  fuel_balance numeric;
  electric_amount numeric;
  electric_balance numeric;
  denied boolean;
begin
  insert into storage.objects(bucket_id,name,owner_id)
  values('vms-fuel-card-private',fuel_path,actor::text),
        ('vms-electric-card-private',electric_path,actor::text);
  select amount,balance_after into fuel_amount,fuel_balance
  from public.vms_fuel_card_entry where id=fuel_entry;
  select amount,balance_after into electric_amount,electric_balance
  from public.vms_electric_card_entry where id=electric_entry;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  if public.vms_append_card_entry_vouchers_secure('fuel',fuel_entry,array[fuel_path])<>1
    or public.vms_append_card_entry_vouchers_secure('electric',electric_entry,array[electric_path])<>1
  then raise exception 'Voucher append did not return expected count'; end if;
  if not exists (select 1 from public.vms_fuel_card_entry
      where id=fuel_entry and voucher_paths=array[fuel_path]
        and amount=fuel_amount and balance_after=fuel_balance)
    or not exists (select 1 from public.vms_electric_card_entry
      where id=electric_entry and voucher_paths=array[electric_path]
        and amount=electric_amount and balance_after=electric_balance)
  then raise exception 'Voucher append changed financial fields or lost evidence'; end if;
  denied:=false;
  begin
    perform public.vms_append_card_entry_vouchers_secure('fuel',fuel_entry,array[fuel_path]);
  exception when others then denied:=true; end;
  if not denied then raise exception 'Duplicate voucher was accepted'; end if;
  denied:=false;
  begin
    perform public.vms_append_card_entry_vouchers_secure(
      'fuel',fuel_entry,array[replace(electric_path,qa_tenant::text,gen_random_uuid()::text)]);
  exception when others then denied:=true; end;
  if not denied then raise exception 'Foreign tenant voucher was accepted'; end if;
  denied:=false;
  begin
    perform public.vms_append_card_entry_vouchers_secure('electric',electric_entry,array[fuel_path]);
  exception when others then denied:=true; end;
  if not denied then raise exception 'Wrong bucket voucher was accepted'; end if;
end
$test$;
rollback;
