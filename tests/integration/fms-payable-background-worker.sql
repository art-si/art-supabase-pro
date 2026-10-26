BEGIN;

do $worker_test$
declare actor uuid:='a9eeb9b7-e474-43e3-9cc2-c2f46c0f0ec3';tenant uuid:='111e83d3-190e-4405-84c8-440d484d13a6';
 role_ident uuid:='40283472-f334-4cb9-84a0-2a41fcf7ab25';template public.sys_menu;button_ident uuid;scheme_ident uuid;book_ident uuid;configuration_ident uuid;
 payload jsonb;source_record record;voucher_status text;job_ident uuid;job_row public.fms_payable_writeoff_automation_job;native_record public.fms_payable_writeoff_record;
 before_funds integer;result jsonb;auto_button uuid;stopped_job uuid;blocked_job uuid;trace_record uuid;repeated_count integer;original_headers text;original_sub text;original_role text;original_claims text;
begin
 select * into template from public.sys_menu where name='FinancePayableWriteoff:Scheme';
 select id into button_ident from public.sys_menu where name='FinancePayableWriteoff:Automation' limit 1;
 if button_ident is null then
 button_ident:=gen_random_uuid();
 insert into public.sys_menu select (jsonb_populate_record(null::public.sys_menu,
  replace(to_jsonb(template)::text,'FinancePayableWriteoff:Scheme','FinancePayableWriteoff:Automation')::jsonb||jsonb_build_object('id',button_ident))).*;
 end if;
 insert into public.sys_role_menu(role_id,menu_id,tenant_id) values(role_ident,button_ident,tenant) on conflict do nothing;
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.jwt.claim.role','authenticated',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);perform set_config('request.headers','{}',true);
 if not app_private.has_permission('FinancePayableWriteoff:Automation') then raise exception 'Ordinary automation grant fixture failed';end if;
 select id into book_ident from public.fms_account_set where tenant_id=tenant and is_default;
 select count(*) into before_funds from public.fms_fund_ledger_entry where tenant_id=tenant;
 for source_record in select * from public.fms_payable_writeoff_record where id in('1a6bd9f1-40c5-4aec-a4fe-71143e717a57','45490cd8-af92-417b-ae01-623f76b7d60c') order by id loop
  if source_record.status<>'active' then raise exception 'Active payment pair fixture required';end if;
  if source_record.voucher_id is not null then
   select status into voucher_status from public.fms_voucher where id=source_record.voucher_id;
   if voucher_status='draft' then perform public.transition_fms_voucher_secure(source_record.voucher_id,'void','后台核销回滚验收',null);
   elsif voucher_status<>'voided' then raise exception 'Do not alter posted fixture voucher';end if;
  end if;
  perform public.fms_reverse_payable_writeoff_secure(source_record.id,'后台核销回滚验收恢复来源');
 end loop;
 scheme_ident:=public.fms_save_payable_reference_secure('scheme',jsonb_build_object('configuration_version',2,'code','BG-ROLLBACK-'||left(gen_random_uuid()::text,8),
  'name','后台执行回滚方案','enabled',true,'automatic',true,'rules',jsonb_build_array(jsonb_build_object('primary_field','source_id','secondary_field','source_id','operator','eq','empty_matches',false)),
  'relation_rules',jsonb_build_array(jsonb_build_object('relation','payable_payment','rules',jsonb_build_array(
   jsonb_build_object('primary_field','source_id','secondary_field','source_id','operator','eq','empty_matches',false),
   jsonb_build_object('primary_field','currency_code','secondary_field','currency_code','operator','eq','empty_matches',false))))));
 insert into app_private.payable_automation_worker_state(singleton,last_succeeded_at) values(true,clock_timestamp()) on conflict(singleton) do update set last_succeeded_at=excluded.last_succeeded_at;
 payload:=jsonb_build_object('configuration_version',1,'name','普通人员后台回滚配置','scheme_id',scheme_ident,'expected_scheme_version',1,'account_set_id',book_ident,'enabled',true,
  'relations',jsonb_build_array('payable_payment'),'cross_currency_mode','same_currency','allow_cross_party',false);
 configuration_ident:=public.fms_save_payable_automation_secure(payload);
 for source_record in select * from public.fms_payable_writeoff_record where id in('1a6bd9f1-40c5-4aec-a4fe-71143e717a57','45490cd8-af92-417b-ae01-623f76b7d60c') order by id loop
  perform app_private.enqueue_payable_automation_job(configuration_ident,'payable_payment','payable',source_record.payable_id,source_record.payable_id,'后台回滚源单',source_record.id::text,'primary',app_private.payable_business_date());
 end loop;
 original_sub:=current_setting('request.jwt.claim.sub',true);original_role:=current_setting('request.jwt.claim.role',true);
 original_claims:=current_setting('request.jwt.claims',true);original_headers:=current_setting('request.headers',true);
 result:=app_private.process_payable_automation_jobs(5);
 if (result->>'succeeded')::integer<>2 or(result->>'blocked')::integer<>0 then raise exception 'Expected two ordinary background writes, got %',result;end if;
 if current_setting('request.jwt.claim.sub',true) is distinct from original_sub or current_setting('request.jwt.claim.role',true) is distinct from original_role
 or current_setting('request.jwt.claims',true) is distinct from original_claims or current_setting('request.headers',true) is distinct from original_headers
 or coalesce(current_setting('app.payable_automation_job',true),'')<>'' then raise exception 'Worker leaked identity or scope context';end if;
 for job_row in select * from public.fms_payable_writeoff_automation_job where automation_id=configuration_ident loop
  if job_row.status<>'succeeded' or (select count(*) from public.fms_payable_writeoff_record where tenant_id=job_row.tenant_id and match_snapshot->>'automation_job_id'=job_row.id::text)<>1 or job_row.actor_auth_user_id<>actor then raise exception 'Missing successful ordinary audit';end if;
  select * into native_record from public.fms_payable_writeoff_record where tenant_id=job_row.tenant_id and match_snapshot->>'automation_job_id'=job_row.id::text;
  if native_record.match_snapshot->>'execution_kind' is distinct from 'background'
   or native_record.match_snapshot->>'automation_job_id' is distinct from job_row.id::text
   or native_record.match_snapshot->>'automation_job_no' is distinct from job_row.job_no
   or native_record.actor is distinct from actor then
   raise exception 'Native writeoff did not preserve background provenance/ordinary actor';end if;
 end loop;

 if(select count(*) from public.fms_fund_ledger_entry where tenant_id=tenant)<>before_funds then raise exception 'Background writeoff initiated cash movement';end if;
 result:=app_private.process_payable_automation_jobs(5);
 if (result->>'processed')::integer<>0 then raise exception 'Completed jobs were replayed';end if;
 select * into job_row from public.fms_payable_writeoff_automation_job where automation_id=configuration_ident order by created_at,id limit 1;
 select id into trace_record from public.fms_payable_writeoff_record where tenant_id=tenant and match_snapshot->>'automation_job_id'=job_row.id::text;
 if public.fms_get_payable_writeoff_record_secure(trace_record)->'match_snapshot'->>'automation_job_id' is distinct from job_row.id::text
 or(public.fms_payable_automation_records_secure(job_row.id,1,20)->>'total')::int<>1 then raise exception 'Native history links did not resolve';end if;
 stopped_job:=app_private.enqueue_payable_automation_job(configuration_ident,'payable_payment','payable',job_row.source_id,job_row.source_document_id,job_row.source_document_no,'before-reversal','primary',app_private.payable_business_date());
 perform public.fms_reverse_payable_writeoff_secure(trace_record,'后台排队后手工反核销保护验收');
 result:=app_private.process_payable_automation_jobs(5);
 if not exists(select 1 from public.fms_payable_writeoff_automation_job where id=stopped_job and status='cancelled')
 or not exists(select 1 from public.fms_payable_writeoff_record where id=trace_record and status='reversed') then raise exception 'Queued job undid manual reversal';end if;
 blocked_job:=app_private.enqueue_payable_automation_job(configuration_ident,'payable_payment','payable',job_row.source_id,job_row.source_document_id,job_row.source_document_no,'permission-revalidation','primary',app_private.payable_business_date());
 select id into auto_button from public.sys_menu where name='FinancePayableWriteoff:AutoWriteoff' limit 1;
 delete from public.sys_role_menu where role_id=role_ident and menu_id=auto_button;
 perform set_config('request.jwt.claim.sub','',true);perform set_config('request.jwt.claim.role','service_role',true);
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);perform set_config('request.headers','{"x-art-tenant-scope":"untrusted-outer-scope"}',true);
 result:=app_private.process_payable_automation_jobs(5);
 if not exists(select 1 from public.fms_payable_writeoff_automation_job where id=blocked_job and status='blocked' and error_code='42501')
 or current_setting('request.jwt.claim.role',true)<>'service_role' or current_setting('request.jwt.claims',true)<>'{"role":"service_role"}'
 or current_setting('request.headers',true)<>'{"x-art-tenant-scope":"untrusted-outer-scope"}' then raise exception 'Worker inherited service authority or leaked failed identity context';end if;
 if exists(select 1 from public.fms_payable_writeoff_record where match_snapshot->>'automation_job_id'=blocked_job::text) then raise exception 'Revoked actor still wrote a financial record';end if;
 insert into public.sys_role_menu(role_id,menu_id,tenant_id) values(role_ident,auto_button,tenant) on conflict do nothing;
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.jwt.claim.role','authenticated',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);perform set_config('request.headers','{}',true);
 execute 'set local role authenticated';
 begin perform public.fms_process_payable_automation_jobs_system(5);raise exception 'Ordinary user called system runner';exception when insufficient_privilege then null;end;
 begin perform app_private.process_payable_automation_jobs(5);raise exception 'Ordinary user called private runner';exception when insufficient_privilege then null;end;
 begin perform count(*) from app_private.payable_automation_attempt;raise exception 'Private diagnostics exposed';exception when insufficient_privilege then null;end;
 begin update public.fms_payable_writeoff_automation_job set status='pending' where id=stopped_job;raise exception 'Ordinary user rewrote history';exception when insufficient_privilege then null;end;
 execute 'reset role';

end $worker_test$;


do $event_test$
declare actor uuid:='a9eeb9b7-e474-43e3-9cc2-c2f46c0f0ec3';tenant uuid:='111e83d3-190e-4405-84c8-440d484d13a6';
 payload jsonb;financial jsonb;payment jsonb;financial_id uuid;payment_id uuid;line_id uuid;fund uuid;book uuid;currency_id uuid;method uuid;purpose uuid;payment_type uuid;
 configuration_id uuid;count_before integer;result jsonb;initial_unpaid numeric;
begin
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.jwt.claim.role','authenticated',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);perform set_config('request.headers','{}',true);
 select id,account_set_id into configuration_id,book from public.fms_payable_writeoff_automation where tenant_id=tenant and name='普通人员后台回滚配置' and enabled;
 if configuration_id is null then raise exception 'Worker fixture configuration required';end if;
 payload:=app_private.purchase_payable_json('85bc17d5-dfa5-4732-8d8e-53dea306336d')-'id'-'version';
 payload:=payload||jsonb_build_object('business_date',app_private.payable_business_date(),'invoice_no','BG-EVENT-'||left(gen_random_uuid()::text,8),'remark','后台事件排队回滚验收','payment_plans','[]'::jsonb,
  'lines',(select jsonb_agg(value-'id'-'source_line_id'-'estimated_line_id'-'reversal_of_line_id') from jsonb_array_elements(payload->'lines') value));
 financial:=public.fms_save_purchase_payable_secure(payload);financial_id:=(financial->>'id')::uuid;
 perform public.fms_act_purchase_payable_secure(array[financial_id],'submit','',null);perform public.fms_act_purchase_payable_secure(array[financial_id],'approve','',null);
 initial_unpaid:=(app_private.purchase_payable_json(financial_id)->>'unpaid_amount')::numeric;
 select id into currency_id from public.fms_currency where tenant_id=tenant and currency_code='CNY';
 select id into method from public.mdm_settlement_method where tenant_id=tenant and enabled and category='cash' order by id limit 1;
 select id into purpose from public.mdm_payment_purpose where tenant_id=tenant and enabled and business_type='purchase' and payable_writeoff order by id limit 1;
 select id into payment_type from public.mdm_document_type where tenant_id=tenant and enabled and document_type_code='AP_PAYMENT_PURCHASE';
 insert into public.fms_fund_account(tenant_id,account_set_id,currency_id,account_code,account_name,account_type,bank_name,account_no_masked,account_no_fingerprint,opening_balance)
 values(tenant,book,currency_id,'BG_EVENT_'||upper(left(replace(gen_random_uuid()::text,'-',''),8)),'后台事件回滚现金户','cash','','**** QA',md5(gen_random_uuid()::text),1000) returning id into fund;
 payment:=public.fms_save_payable_settlement_secure(jsonb_build_object('kind','payment','document_type_id',payment_type,'business_date',app_private.payable_business_date(),'currency_code','CNY',
  'lines',jsonb_build_array(jsonb_build_object('payable_id',financial_id,'purpose_id',purpose,'supplier_id',financial->>'supplier_id','settlement_method_id',method,'fund_account_id',fund,'amount',1))));
 payment_id:=(payment->>'id')::uuid;line_id:=(payment->'lines'->0->>'id')::uuid;
 perform public.fms_act_payable_settlement_secure(array[payment_id],'submit');perform public.fms_act_payable_settlement_secure(array[payment_id],'approve');perform public.fms_act_payable_settlement_secure(array[payment_id],'confirm');
 if exists(select 1 from public.fms_payable_writeoff_record where payable_id=financial_id and status='active') then raise exception 'Legacy immediate hook bypassed opted-in background configuration';end if;
 set constraints all immediate;
 if not exists(select 1 from public.fms_payable_writeoff_automation_job where automation_id=configuration_id and source_kind='payable' and source_id=financial_id)
 or not exists(select 1 from public.fms_payable_writeoff_automation_job where automation_id=configuration_id and source_kind='payment' and source_id=line_id) then raise exception 'Source approval/confirmation did not atomically enqueue';end if;
 select count(*) into count_before from public.fms_fund_ledger_entry where tenant_id=tenant;
 result:=app_private.process_payable_automation_jobs(5);
 if (select count(*) from public.fms_payable_writeoff_record where payable_id=financial_id and payment_line_id=line_id and status='active')<>1
 or(app_private.purchase_payable_json(financial_id)->>'unpaid_amount')::numeric<>initial_unpaid-1 then raise exception 'Native event job did not write exactly once: %',result;end if;
 if(select count(*) from public.fms_fund_ledger_entry where tenant_id=tenant)<>count_before then raise exception 'Event writeoff moved additional cash';end if;
end $event_test$;


do $control_test$
declare tenant uuid:='111e83d3-190e-4405-84c8-440d484d13a6';ordinary uuid:='a9eeb9b7-e474-43e3-9cc2-c2f46c0f0ec3';
 role_ident uuid:='40283472-f334-4cb9-84a0-2a41fcf7ab25';root_actor uuid;template public.sys_menu;button_ident uuid;action_name text;
 own_scheme uuid;own_book uuid;foreign_scheme public.fms_payable_writeoff_scheme;foreign_book uuid;foreign_tenant uuid;
 own_configuration uuid;foreign_configuration uuid;foreign_job uuid;worker_configuration public.fms_payable_writeoff_automation;payload jsonb;result jsonb;
begin
 select * into template from public.sys_menu where name='FinancePayableWriteoff:Scheme';
 foreach action_name in array array['Automation','AutomationRetry','AutomationDelete'] loop
  select id into button_ident from public.sys_menu where name='FinancePayableWriteoff:'||action_name limit 1;
  if button_ident is null then
   button_ident:=gen_random_uuid();
   insert into public.sys_menu select(jsonb_populate_record(null::public.sys_menu,
    replace(to_jsonb(template)::text,'FinancePayableWriteoff:Scheme','FinancePayableWriteoff:'||action_name)::jsonb||jsonb_build_object('id',button_ident))).*;
  end if;
  insert into public.sys_role_menu(role_id,menu_id,tenant_id) values(role_ident,button_ident,tenant) on conflict do nothing;
 end loop;
 perform set_config('request.jwt.claim.sub',ordinary::text,true);perform set_config('request.jwt.claim.role','authenticated',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ordinary,'role','authenticated')::text,true);perform set_config('request.headers','{}',true);
 if not app_private.has_permission('FinancePayableWriteoff:Automation') or not app_private.has_permission('FinancePayableWriteoff:AutomationDelete')
 or not app_private.has_permission('FinancePayableWriteoff:AutomationRetry') then raise exception 'Managed action grant fixture required';end if;
 own_scheme:=public.fms_save_payable_reference_secure('scheme',jsonb_build_object('configuration_version',2,'code','BG_SCOPE_'||upper(left(gen_random_uuid()::text,8)),
  'name','后台范围回滚方案','enabled',true,'automatic',true,'rules',jsonb_build_array(jsonb_build_object('primary_field','supplier_id','secondary_field','supplier_id','operator','eq','empty_matches',false))));
 select id into own_book from public.fms_account_set where tenant_id=tenant and is_default;
 select profile.auth_user_id into root_actor from public.sys_user profile join public.sys_tenant root_tenant on root_tenant.id=profile.tenant_id
  where profile.system_protected and root_tenant.builtin_type='platform' and profile.auth_user_id is not null order by profile.id limit 1;
 perform set_config('request.jwt.claim.sub',root_actor::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',root_actor,'role','authenticated')::text,true);perform set_config('request.headers','{}',true);
 if not app_private.is_platform_super() then raise exception 'Platform super fixture required';end if;
 select scheme.* into foreign_scheme from public.fms_payable_writeoff_scheme scheme where scheme.tenant_id<>tenant
  and exists(select 1 from public.fms_account_set where tenant_id=scheme.tenant_id and status='active') order by scheme.tenant_id,scheme.code limit 1;
 if foreign_scheme.id is null then raise exception 'Foreign reference metadata fixture required';end if;
 foreign_tenant:=foreign_scheme.tenant_id;
 select id into foreign_book from public.fms_account_set where tenant_id=foreign_tenant and status='active' order by is_default desc,id limit 1;
 payload:=jsonb_build_object('configuration_version',1,'name','自有范围后台配置','scheme_id',own_scheme,'account_set_id',own_book,'tenant_id',foreign_tenant,
  'enabled',false,'relations',jsonb_build_array('payable_red_blue'),'cross_currency_mode','same_currency','allow_cross_party',false);
 own_configuration:=public.fms_save_payable_automation_secure(payload);
 if not exists(select 1 from public.fms_payable_writeoff_automation where id=own_configuration and tenant_id=tenant) then raise exception 'Platform-all child create did not inherit parent tenant';end if;
 foreign_configuration:=public.fms_save_payable_automation_secure(jsonb_build_object('configuration_version',1,'name','异租户范围后台配置','scheme_id',foreign_scheme.id,'account_set_id',foreign_book,'enabled',false,
  'relations',jsonb_build_array(coalesce(foreign_scheme.relation_rules->0->>'relation','payable_payment')),'cross_currency_mode','same_currency'));
 foreign_job:=gen_random_uuid();
 insert into public.fms_payable_writeoff_automation_job(id,tenant_id,automation_id,automation_version,scheme_id,scheme_version,account_set_id,job_no,relation,source_kind,source_side,source_id,source_document_id,source_document_no,source_revision,business_date)
 values(foreign_job,foreign_tenant,foreign_configuration,1,foreign_scheme.id,foreign_scheme.version,foreign_book,'FOREIGN-SCOPE-'||foreign_job,
  coalesce(foreign_scheme.relation_rules->0->>'relation','payable_payment'),'payable','primary',gen_random_uuid(),gen_random_uuid(),'异租户范围单据','scope',app_private.payable_business_date());
 if(public.fms_payable_automation_workspace_secure(jsonb_build_object('automation_id',own_configuration))->'configurations'->>'total')::int<>1
 or(public.fms_payable_automation_workspace_secure(jsonb_build_object('automation_id',foreign_configuration))->'configurations'->>'total')::int<>1 then raise exception 'Platform-all read missed scoped configuration';end if;
 payload:=payload||jsonb_build_object('id',own_configuration,'version',1,'name','平台全部范围编辑');
 perform public.fms_save_payable_automation_secure(payload);
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',tenant)::text,true);
 if(public.fms_payable_automation_workspace_secure(jsonb_build_object('automation_id',own_configuration))->'configurations'->>'total')::int<>1
 or(public.fms_payable_automation_workspace_secure(jsonb_build_object('automation_id',foreign_configuration))->'configurations'->>'total')::int<>0 then raise exception 'Platform-selected scope leaked';end if;
 begin perform public.fms_payable_automation_workspace_secure(jsonb_build_object('tenant_id',foreign_tenant));raise exception 'Selected scope accepted foreign filter';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',ordinary::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',ordinary,'role','authenticated')::text,true);
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',foreign_tenant)::text,true);
 if(public.fms_payable_automation_workspace_secure(jsonb_build_object('automation_id',own_configuration))->'configurations'->>'total')::int<>1
 or(public.fms_payable_automation_workspace_secure(jsonb_build_object('automation_id',foreign_configuration))->'configurations'->>'total')::int<>0
 or(public.fms_payable_automation_workspace_secure(jsonb_build_object('job_id',foreign_job))->'jobs'->>'total')::int<>0 then raise exception 'Ordinary forged header changed metadata scope';end if;
 begin perform public.fms_delete_payable_automation_secure(foreign_configuration,1);raise exception 'Foreign config deleted';exception when insufficient_privilege then null;end;
 begin perform public.get_fms_payable_automation_delete_dependencies_secure(array[foreign_configuration],null);raise exception 'Foreign references disclosed';exception when insufficient_privilege then null;end;
 begin perform public.fms_retry_payable_automation_job_secure(foreign_job);raise exception 'Foreign job retried';exception when insufficient_privilege then null;end;
 begin perform public.fms_payable_automation_records_secure(foreign_job,1,20);raise exception 'Foreign result links disclosed';exception when insufficient_privilege then null;end;
 payload:=payload||jsonb_build_object('version',2,'enabled',true,'expected_scheme_version',999,'actor_auth_user_id',root_actor);
 begin perform public.fms_save_payable_automation_secure(payload);raise exception 'Unseen scheme version acknowledged';exception when serialization_failure then null;end;
 payload:=payload||jsonb_build_object('expected_scheme_version',1);
 perform public.fms_save_payable_automation_secure(payload);
 if not exists(select 1 from public.fms_payable_writeoff_automation where id=own_configuration and version=3 and actor_auth_user_id=ordinary and tenant_id=tenant) then raise exception 'Actor override/foreign header changed execution ownership';end if;
 begin perform public.fms_delete_payable_automation_secure(own_configuration,3);raise exception 'Enabled configuration deleted';exception when check_violation then null;end;
 update public.fms_account_set set status='suspended' where id=own_book;
 payload:=payload||jsonb_build_object('version',3,'enabled',false);
 perform public.fms_save_payable_automation_secure(payload);
 update public.fms_account_set set status='active' where id=own_book;
 if exists(select 1 from public.fms_payable_writeoff_automation where id=own_configuration and enabled) then raise exception 'Inactive book prevented safe stopping';end if;
 begin perform public.fms_delete_payable_automation_secure(own_configuration,3);raise exception 'Changed configuration deleted without review';exception when serialization_failure then null;end;
 if exists(select 1 from public.get_fms_payable_automation_delete_dependencies_secure(array[own_configuration],null)) then raise exception 'Unused disabled config incorrectly blocked';end if;
 if public.fms_delete_payable_automation_secure(own_configuration,4) is distinct from true then raise exception 'Unused disabled config not deleted';end if;
 select * into worker_configuration from public.fms_payable_writeoff_automation where tenant_id=tenant and name='普通人员后台回滚配置';
 if worker_configuration.id is null then raise exception 'Worker history fixture required';end if;
 perform public.fms_save_payable_automation_secure(to_jsonb(worker_configuration)||jsonb_build_object('configuration_version',1,'enabled',false));
 if not exists(select 1 from public.get_fms_payable_automation_delete_dependencies_secure(array[worker_configuration.id],null) where source_table='fms_payable_writeoff_automation_job' and record_no like 'APHXHT-%') then raise exception 'Blocking history lacks recognizable job number';end if;
 begin perform public.fms_delete_payable_automation_secure(worker_configuration.id,worker_configuration.version+1);raise exception 'Historical configuration deleted';exception when foreign_key_violation then null;end;
end $control_test$;

ROLLBACK;
