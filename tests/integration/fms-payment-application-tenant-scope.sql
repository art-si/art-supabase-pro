-- Existing QA parent records; all application writes are rolled back.
begin;
do $test$
declare
 a public.sys_user%rowtype; u public.sys_user%rowtype; c uuid;
 id_new uuid; foreign_carrier uuid; test_case text; row_new public.tms_carrier_payment_application%rowtype;
begin
 select * into strict a from public.sys_user where id='51760251-629d-4561-aeb8-0fbe62352494';
 select * into strict u from public.sys_user where id='93f2f1e8-a3dc-4f5a-999b-6c8c02d0c7e9';
 select carrier_id into strict c from public.tms_carrier_statement where id='66a9ecd1-ddef-4303-896a-d6a1acb24779';
 select id into strict foreign_carrier from public.mdm_carrier where tenant_id<>u.tenant_id order by id limit 1;
 foreach test_case in array array['platform_all','platform_selected','ordinary_own','ordinary_forged'] loop
  perform set_config('request.jwt.claims',jsonb_build_object('sub',case when test_case like 'platform_%' then a.auth_user_id else u.auth_user_id end,'role','authenticated','email',case when test_case like 'platform_%' then a.user_email else u.user_email end)::text,true);
  perform set_config('request.headers',case when test_case='platform_all' then '{}' when test_case='ordinary_forged' then jsonb_build_object('x-art-tenant-scope',a.tenant_id)::text else jsonb_build_object('x-art-tenant-scope',u.tenant_id)::text end,true);
  id_new:=public.save_tms_carrier_payment_application_secure(null,c,'2026-10-12',1,'bank_transfer','[]','rollback verification','[{"statementId":"66a9ecd1-ddef-4303-896a-d6a1acb24779","amount":1}]',null);
  select * into strict row_new from public.tms_carrier_payment_application where id=id_new;
  if row_new.tenant_id<>u.tenant_id then raise exception 'Wrong parent tenant: %',test_case; end if;
  if test_case like 'platform_%' then
   if row_new.created_by_user_id is not null then raise exception 'Cross-tenant creator FK'; end if;
  elsif row_new.created_by_user_id is distinct from u.id then raise exception 'Ordinary creator missing'; end if;
  perform public.save_tms_carrier_payment_application_secure(id_new,c,'2026-10-12',2,'bank_transfer','[]','rollback edited','[{"statementId":"66a9ecd1-ddef-4303-896a-d6a1acb24779","amount":2}]',null);
  if not exists(select 1 from public.tms_carrier_payment_application_item where application_id=id_new and tenant_id=u.tenant_id and applied_amount=2) then raise exception 'Edit/child mismatch'; end if;
  if test_case<>'platform_all' then
   begin
    perform public.save_tms_carrier_payment_application_secure(null,foreign_carrier,'2026-10-12',1,'bank_transfer','[]',null,'[]',null);
    raise exception 'Foreign carrier accepted: %',test_case;
   exception when insufficient_privilege then null; end;
  end if;
 end loop;
end $test$;
select 'payment create/edit/child/creator and foreign-scope denial: four cases passed' result;
rollback;
