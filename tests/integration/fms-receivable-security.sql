-- Execute after lifecycle test inside BEGIN/ROLLBACK.
do $security$
declare actor uuid;ordinary uuid;t uuid;foreign_tenant uuid;role_id uuid;credit_id uuid;role_code text:='AR_SECURITY_'||upper(left(gen_random_uuid()::text,8));sample public.fms_receivable_document%rowtype;result jsonb;tab text;
begin
 select u.auth_user_id into actor from public.sys_user u join public.sys_tenant tenant on tenant.id=u.tenant_id where u.system_protected and tenant.builtin_type='platform' and u.auth_user_id is not null limit 1;
 select u.auth_user_id,u.tenant_id into ordinary,t from public.sys_user u where u.auth_user_id is not null and u.status='1' and not u.system_protected
 and (nullif(current_setting('test.ar_tenant_code',true),'') is null
  or exists(select 1 from public.sys_tenant tenant where tenant.id=u.tenant_id and tenant.tenant_code=current_setting('test.ar_tenant_code',true)))
 and exists(select 1 from public.fms_receivable_document d where d.tenant_id=u.tenant_id and d.kind='financial' and d.status='approved' and not d.is_credit)
 and exists(select 1 from public.fms_receivable_document d where d.tenant_id=u.tenant_id and d.kind='financial' and d.status='approved' and d.is_credit) order by u.id limit 1;
 if ordinary is null then raise exception 'Ordinary AR security fixture required';end if;
 select * into sample from public.fms_receivable_document where tenant_id=t and kind='financial' and not is_credit and status='approved' order by created_at,id limit 1;
 select id into credit_id from public.fms_receivable_document where tenant_id=t and kind='financial' and is_credit and status='approved' order by created_at,id limit 1;
 if sample.id is null or credit_id is null then raise exception 'Approved debit and credit AR fixtures required';end if;
 select id into foreign_tenant from public.sys_tenant where id<>t and status='1' and builtin_type is distinct from 'platform'
 and(service_start_date is null or service_start_date<=current_date) and(service_end_date is null or service_end_date>=current_date) limit 1;
 if foreign_tenant is null then raise exception 'A second active business tenant is required';end if;
 insert into public.sys_role(role_code,role_name,tenant_id,enabled) values(role_code,'应收只读临时验证角色',t,true) returning id into role_id;
 insert into public.sys_role_menu(role_id,menu_id,tenant_id) select role_id,id,t from public.sys_menu where name in('FinanceFinancialReceivable','FinanceFinancialReceivable:View','FinanceFinancialReceivable:Approve','FinanceEstimatedReceivable','FinanceEstimatedReceivable:View','FinanceReceiptWriteoff','FinanceReceiptWriteoff:View');
 update public.sys_user set user_roles=array[role_code] where auth_user_id=ordinary;
 perform set_config('request.jwt.claim.sub',ordinary::text,true);perform set_config('request.headers','{}',true);
 result:=public.fms_receivable_workspace_secure('financial',jsonb_build_object('id',sample.id));
 if (result->>'total')::int<>1 or (result->'records'->0->>'tenant_id')::uuid<>t then raise exception 'Ordinary own-tenant read lost its record';end if;
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',foreign_tenant)::text,true);
 result:=public.fms_receivable_workspace_secure('financial',jsonb_build_object('id',sample.id));
 if (result->>'total')::int<>1 or (result->'records'->0->'total_amount') is distinct from 'null'::jsonb then raise exception 'Hidden amounts leaked or forged scope changed ordinary read: %',result;end if;
 if exists(select 1 from jsonb_array_elements(result->'records') d where (d->>'tenant_id')::uuid<>t) then raise exception 'Foreign tenant leaked';end if;
 result:=public.fms_receivable_workspace_secure('financial',jsonb_build_object('id',sample.id,'viewMode','line'));
 if exists(select 1 from jsonb_array_elements(result->'records') d where
  d->'unlinked_invoice_amount' is distinct from 'null'::jsonb or d->'unmatched_amount' is distinct from 'null'::jsonb
  or d->'reserved_amount' is distinct from 'null'::jsonb or d->'outstanding_amount' is distinct from 'null'::jsonb
  or d->'lines'->0->'invoicedAmount' is distinct from 'null'::jsonb) then raise exception 'Line view exposed restricted balances';end if;
 begin perform public.fms_act_receivable_document_secure(sample.id,'approve');raise exception 'Blind monetary approval allowed';exception when insufficient_privilege then null;end;
 begin perform public.fms_create_credit_payment_request_secure(sample.id,jsonb_build_object('amount',1,'remark','forged'));raise exception 'Positive receivable accepted for payment';exception when check_violation then null;end;
 begin perform public.fms_create_credit_payment_request_secure(credit_id,jsonb_build_object('amount',1,'remark','forged'));raise exception 'Read-only user created a credit payment request';exception when insufficient_privilege then null;end;
 begin perform public.fms_receivable_workspace_secure('financial',jsonb_build_object('tenantId',foreign_tenant));raise exception 'Foreign filter accepted';exception when insufficient_privilege then null;end;
 begin perform public.fms_receivable_workspace_secure('receipt','{}');raise exception 'Missing receipt view permission accepted';exception when insufficient_privilege then null;end;
 foreach tab in array array['fms_receivable_document','fms_receivable_line','fms_receivable_application','fms_receipt_document','fms_receipt_refund','fms_receivable_payment_request','fms_receivable_writeoff','fms_receivable_debt_allocation','mdm_receipt_condition'] loop
  if has_table_privilege('authenticated','public.'||tab,'INSERT,UPDATE,DELETE') then raise exception 'Direct protected write privilege exists on %',tab;end if;
 end loop;
 if exists(select 1 from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in('fms_ar_options_secure','fms_ar_delete_dependencies_secure','fms_check_receivable_writeoff_secure','fms_receivable_writeoff_candidates_secure','fms_save_receipt_condition_secure','fms_delete_receipt_condition_secure') and has_function_privilege('anon',p.oid,'EXECUTE')) then raise exception 'Anonymous RPC grant bypasses authenticated boundary';end if;
 if app_private.ar_mask('{"cost_snapshot":{"unit_cost":199},"age0To30":123,"revenue_amount":999}'::jsonb)->'cost_snapshot' is distinct from 'null'::jsonb then raise exception 'Nested actual cost leaked';end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers','{}',true);
 result:=public.fms_receivable_workspace_secure('financial',jsonb_build_object('id',sample.id));
 if(result->>'total')::int<>1 then raise exception 'Platform-all read lost the isolated tenant record';end if;
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',t)::text,true);
 result:=public.fms_receivable_workspace_secure('financial',jsonb_build_object('id',sample.id));
 if(result->>'total')::int<>1 then raise exception 'Platform-selected own-tenant read lost the record';end if;
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',foreign_tenant)::text,true);
 result:=public.fms_receivable_workspace_secure('financial',jsonb_build_object('id',sample.id));if(result->>'total')::int<>0 then raise exception 'Platform selected scope leaked foreign AR';end if;
 perform set_config('request.headers','{}',true);
end $security$;
