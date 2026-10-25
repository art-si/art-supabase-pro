begin;

do $cash_projection$
declare
 actor uuid;
 cash record;
 payload jsonb;
 principal numeric;
 fee numeric;
 available numeric;
 checked integer:=0;
begin
 select auth_user_id into actor from public.sys_user where user_roles @>array['R_SUPER'] and auth_user_id is not null limit 1;
 if actor is null then raise exception 'Cash projection requires the existing platform test actor';end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.headers','{}',true);
 for cash in select * from public.tms_cash_transaction order by id limit 100 loop
  for payload in select public.tms_get_cash_transaction_secure(cash.id) union all select public.tms_list_cash_transactions_secure(p_record_id=>cash.id)->'records'->0 union all select public.tms_list_cash_transactions_secure(p_record_id=>cash.id,p_purpose=>'export')->'records'->0 loop
   if payload is null or payload->>'id' is distinct from cash.id::text then raise exception 'Secure cash projection lost an existing transaction';end if;
   principal:=(payload->>'principal_amount')::numeric;
   fee:=(payload->>'fee_amount')::numeric;
   available:=(payload->>'allocatable_amount')::numeric;
   if principal is null or fee is null or available is null or principal<0 or fee<0 or available<0 then raise exception 'Invalid principal, fee or available cash';end if;
   if principal+fee<>cash.amount or (payload->>'amount')::numeric<>cash.amount or (payload->>'unallocated_amount')::numeric<>greatest(cash.amount-cash.allocated_amount,0) then raise exception 'Secure cash projection rewrites historical cash amounts';end if;
   if available<>(case when cash.status='voided' then 0 else greatest(principal-cash.allocated_amount,0) end) then raise exception 'Available principal differs between cash readers';end if;
   if cash.direction='receipt' and (principal<>cash.amount or fee<>0) then raise exception 'Payment fee handling changed a customer receipt';end if;
  end loop;
  checked:=checked+1;
 end loop;
 if checked<2 then raise exception 'Need at least two existing cash transactions for read-only regression';end if;
end $cash_projection$;

rollback;
