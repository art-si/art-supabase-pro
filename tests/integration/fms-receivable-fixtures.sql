-- Regression fixture only. Execute inside BEGIN/ROLLBACK; never commit this setup.
-- Select an initialized test context and temporarily use its existing CNY chart.
do $context$
declare actor uuid; account_id uuid; tenant uuid;
begin
 select u.auth_user_id into actor from public.sys_user u join public.sys_tenant t on t.id=u.tenant_id
 where u.system_protected and t.builtin_type='platform' and u.auth_user_id is not null limit 1;
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers','{}',true);
 select a.id,a.tenant_id into account_id,tenant from public.fms_account_set a
 where a.status='active' and a.is_default and a.base_currency_code='CNY'
 and exists(select 1 from public.fms_fund_account f join public.fms_currency currency on currency.id=f.currency_id where f.account_set_id=a.id and f.status='active' and currency.currency_code='CNY')
 order by a.create_time limit 1;
 if account_id is null then raise exception 'Regression requires a default CNY account set with a cash account'; end if;
 insert into public.fms_opening_balance_control(tenant_id,account_set_id,fiscal_year,status,confirmed_at,confirmed_by)
 values(tenant,account_id,extract(year from current_date)::int,'confirmed',now(),'ar-regression')
 on conflict(account_set_id,fiscal_year) do update set status='confirmed',confirmed_at=now(),confirmed_by='ar-regression';
end $context$;
