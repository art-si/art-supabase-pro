begin;

do $test$
declare
 tenant uuid;ordinary uuid;actor uuid;foreign_tenant uuid;book uuid;currency_id uuid;fund uuid;method uuid;purpose uuid;refund_purpose uuid;payment_type uuid;refund_type uuid;supplier uuid;
 scheme_id uuid;current_version integer;fixture text:='QA_MATRIX_'||upper(left(gen_random_uuid()::text,8));relation_code text;configurations jsonb;payload jsonb;stale jsonb;metadata jsonb;result jsonb;source_item jsonb;plan jsonb;auto_query jsonb;
 impossible jsonb;common_rules jsonb;party_rules jsonb;identity_rules jsonb;rules jsonb;original_record public.fms_payable_writeoff_record;created_record uuid;snapshot jsonb;before_count bigint;blocked boolean;temporary_role uuid;
 payment jsonb;refund jsonb;payment_line uuid;refund_line uuid;payment_payable uuid;payment_existing_line uuid;payment_supplier uuid;red_payable uuid;red_credit uuid;
begin
 select id into tenant from public.sys_tenant where tenant_code='qa-payable-20261022';
 select auth_user_id into ordinary from public.sys_user where tenant_id=tenant and user_roles=array['QA_AP_ACCEPTANCE_01A15DAD'] and not system_protected order by id limit 1;
 select auth_user_id into actor from public.sys_user where user_roles @>array['R_SUPER'] and auth_user_id is not null order by id limit 1;
 select id into foreign_tenant from public.sys_tenant where id<>tenant and status='1' and builtin_type is distinct from 'platform' order by id limit 1;
 select id into book from public.fms_account_set where tenant_id=tenant and is_default and status='active';
 select id into currency_id from public.fms_currency where account_set_id=book and currency_code='CNY';
 if ordinary is null or actor is null or foreign_tenant is null or book is null then raise exception 'Missing independent matrix acceptance context';end if;
 perform set_config('request.jwt.claim.sub',ordinary::text,true);perform set_config('request.headers','{}',true);
 impossible:=jsonb_build_array(jsonb_build_object('primary_field','currency_code','secondary_field','currency_code','operator','ne','empty_matches',false));
 common_rules:=jsonb_build_array(jsonb_build_object('primary_field','currency_code','secondary_field','currency_code','operator','eq','empty_matches',false));
 party_rules:=common_rules||jsonb_build_array(jsonb_build_object('primary_field','supplier_id','secondary_field','supplier_id','operator','eq','empty_matches',false));
 identity_rules:=common_rules||jsonb_build_array(jsonb_build_object('primary_field','counterparty_id','secondary_field','counterparty_id','operator','eq','empty_matches',false));
 configurations:=jsonb_build_array(
  jsonb_build_object('relation','payable_payment','rules',common_rules||jsonb_build_array(jsonb_build_object('primary_field','source_id','secondary_field','source_id','operator','eq','empty_matches',false)),'description','付款按同源条件'),
  jsonb_build_object('relation','payment_refund','rules',party_rules,'description','退款关系独立条件'),
  jsonb_build_object('relation','payable_receivable','rules',identity_rules,'description','统一往来关系独立条件'),
  jsonb_build_object('relation','payable_red_blue','rules',party_rules,'description','红蓝关系独立条件'));
 payload:=jsonb_build_object('code',fixture,'name','按关系隔离回归','automatic',true,'rules',impossible,'relation_rules',configurations,'configuration_version',2);
 scheme_id:=public.fms_save_payable_reference_secure('scheme',payload);
 if(select version from public.fms_payable_writeoff_scheme where id=scheme_id)<>1 then raise exception 'New scheme version was not server controlled';end if;
 foreach rules in array array['[]'::jsonb,jsonb_build_array(configurations->0,configurations->0),jsonb_build_array(jsonb_build_object('relation','unknown','rules',party_rules)),jsonb_build_array(jsonb_build_object('relation','payable_payment','rules','[]'::jsonb))] loop
  blocked:=false;begin perform app_private.normalize_payable_relation_rules(rules);exception when check_violation then blocked:=true;end;
  if not blocked then raise exception 'Malformed or duplicate relation matrix accepted';end if;
 end loop;
 blocked:=false;begin perform public.fms_save_payable_reference_secure('scheme',payload||jsonb_build_object('id',scheme_id));exception when serialization_failure then blocked:=true;end;
 if not blocked then raise exception 'Matrix writer accepted missing version';end if;
 select to_jsonb(s)||jsonb_build_object('configuration_version',2) into stale from public.fms_payable_writeoff_scheme s where id=scheme_id;
 perform public.fms_save_payable_reference_secure('scheme',stale||jsonb_build_object('name','版本更新'));
 blocked:=false;begin perform public.fms_save_payable_reference_secure('scheme',stale);exception when serialization_failure then blocked:=true;end;
 if not blocked then raise exception 'Stale scheme update overwrote current version';end if;
 blocked:=false;begin perform public.fms_save_payable_reference_secure('scheme',stale-'configuration_version');exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Legacy writer altered relation-configured scheme';end if;

 select id into method from public.mdm_settlement_method where tenant_id=tenant and enabled and category='cash' order by id limit 1;
 select id into purpose from public.mdm_payment_purpose where tenant_id=tenant and enabled and business_type='advance' and payable_writeoff order by id limit 1;
 select id into supplier from public.mdm_supplier where tenant_id=tenant order by id limit 1;
 select id into payment_type from public.mdm_document_type where tenant_id=tenant and enabled and document_type_code='AP_PAYMENT_PURCHASE';
 select id into refund_type from public.mdm_document_type where tenant_id=tenant and enabled and menu_id=(select id from public.sys_menu where name='FinancePayableRefund') order by is_default desc,id limit 1;
 refund_purpose:=public.fms_save_payable_reference_secure('purpose',jsonb_build_object('code',fixture,'name','矩阵退预付款','business_type','advance_refund','payable_writeoff',true));
 insert into public.fms_fund_account(tenant_id,account_set_id,currency_id,account_code,account_name,account_type,bank_name,account_no_masked,account_no_fingerprint,opening_balance)
 values(tenant,book,currency_id,fixture,'矩阵回滚现金户','cash','','**** QA',md5(gen_random_uuid()::text),1000) returning id into fund;
 payment:=public.fms_save_payable_settlement_secure(jsonb_build_object('kind','payment','document_type_id',payment_type,'business_date',app_private.payable_business_date(),'currency_code','CNY',
  'lines',jsonb_build_array(jsonb_build_object('purpose_id',purpose,'supplier_id',supplier,'settlement_method_id',method,'fund_account_id',fund,'amount',100))));
 perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'submit');perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'approve');perform public.fms_act_payable_settlement_secure(array[(payment->>'id')::uuid],'confirm');
 payment_line:=(payment->'lines'->0->>'id')::uuid;
 refund:=public.fms_save_payable_settlement_secure(jsonb_build_object('kind','refund','document_type_id',refund_type,'business_date',app_private.payable_business_date(),'currency_code','CNY',
  'lines',jsonb_build_array(jsonb_build_object('refund_payment_line_id',payment_line,'purpose_id',refund_purpose,'settlement_method_id',method,'fund_account_id',fund,'amount',20))));
 perform public.fms_act_payable_settlement_secure(array[(refund->>'id')::uuid],'submit');perform public.fms_act_payable_settlement_secure(array[(refund->>'id')::uuid],'approve');perform public.fms_act_payable_settlement_secure(array[(refund->>'id')::uuid],'confirm');
 refund_line:=(refund->'lines'->0->>'id')::uuid;

 foreach relation_code in array array['payable_payment','payable_receivable','payable_red_blue','payment_refund'] loop
  if relation_code='payment_refund' then source_item:=jsonb_build_object('relation',relation_code,'payment_line_id',payment_line,'refund_line_id',refund_line,'amount',1);
  else
   select r.* into original_record from public.fms_payable_writeoff_record r
    join public.fms_purchase_payable_document p on p.id=r.payable_id
    left join public.fms_payable_settlement_line l on l.id=r.payment_line_id
    left join public.fms_voucher v on v.id=r.voucher_id
    where r.tenant_id=tenant and r.relation=relation_code and r.status='active' and r.amount>=2
     and p.frozen_amount=0 and p.currency_code='CNY' and p.base_currency_code='CNY'
     and (relation_code<>'payable_payment' or l.carrier_id is null)
     and (v.id is null or v.status in('draft','voided')) order by r.id limit 1;
   if original_record.id is null then raise exception 'Missing live source pair for %',relation_code;end if;
   if original_record.voucher_id is not null and(select status from public.fms_voucher where id=original_record.voucher_id)='draft' then
    perform public.transition_fms_voucher_secure(original_record.voucher_id,'void','关系矩阵回滚验证',null);
   end if;
   perform public.fms_reverse_payable_writeoff_secure(original_record.id,'关系矩阵回滚验证恢复余额');
   if relation_code='payable_payment' then payment_payable:=original_record.payable_id;payment_existing_line:=original_record.payment_line_id;select supplier_id into payment_supplier from public.fms_purchase_payable_document where id=payment_payable;end if;
   if relation_code='payable_red_blue' then red_payable:=original_record.payable_id;red_credit:=original_record.credit_payable_id;end if;
   source_item:=jsonb_build_object('relation',relation_code,'payable_id',original_record.payable_id,'payment_line_id',original_record.payment_line_id,
    'receivable_line_id',original_record.receivable_line_id,'credit_payable_id',original_record.credit_payable_id,'amount',1,'credit_amount',1);
  end if;
  select version into current_version from public.fms_payable_writeoff_scheme where id=scheme_id;
  result:=public.fms_payable_writeoff_secure(jsonb_build_array(source_item),scheme_id,app_private.payable_business_date(),'矩阵按关系执行');
  created_record:=(result->>0)::uuid;
  select match_snapshot into snapshot from public.fms_payable_writeoff_record where id=created_record;
  if(snapshot->>'scheme_version')::integer<>current_version or snapshot->>'relation'<>relation_code
   or snapshot->'rules'<>app_private.payable_rules_for_relation(impossible,configurations,relation_code)
   or coalesce(snapshot->>'relation_description','')='' then raise exception 'Relation rules or version missing from immutable snapshot: %',relation_code;end if;
  select to_jsonb(s)||jsonb_build_object('configuration_version',2) into payload from public.fms_payable_writeoff_scheme s where id=scheme_id;
  perform public.fms_save_payable_reference_secure('scheme',payload||jsonb_build_object('rules',common_rules,'relation_rules',(select jsonb_agg(value) from jsonb_array_elements(configurations) where value->>'relation'<>relation_code)));
  select count(*) into before_count from public.fms_payable_writeoff_record;
  blocked:=false;begin perform public.fms_payable_writeoff_secure(jsonb_build_array(source_item),scheme_id,app_private.payable_business_date(),'未配置关系不能回退共用规则');exception when check_violation then blocked:=true;end;
  if not blocked or(select count(*) from public.fms_payable_writeoff_record)<>before_count then raise exception 'Unconfigured relation fell back or mutated history: %',relation_code;end if;
  blocked:=false;begin perform public.fms_auto_payable_writeoff_secure(scheme_id,app_private.payable_business_date(),jsonb_build_object('relation',relation_code));exception when check_violation then blocked:=true;end;
  if not blocked then raise exception 'Automatic matching accepted unsupported relation: %',relation_code;end if;
  if(select match_snapshot from public.fms_payable_writeoff_record where id=created_record)<>snapshot then raise exception 'Scheme edit changed past match snapshot';end if;
  select to_jsonb(s)||jsonb_build_object('configuration_version',2) into payload from public.fms_payable_writeoff_scheme s where id=scheme_id;
  perform public.fms_save_payable_reference_secure('scheme',payload||jsonb_build_object('rules',impossible,'relation_rules',configurations));
 end loop;

 select to_jsonb(s)||jsonb_build_object('configuration_version',2) into payload from public.fms_payable_writeoff_scheme s where id=scheme_id;
 perform public.fms_save_payable_reference_secure('scheme',payload||jsonb_build_object('rules',common_rules,'relation_rules',jsonb_build_array(configurations->3)));
 if app_private.payable_scheme_matches(scheme_id,payment_payable,payment_existing_line) is distinct from false then raise exception 'Red-only automatic scheme was eligible for payment confirmation';end if;
 auto_query:=jsonb_build_object('relation','payable_red_blue','document_ids',jsonb_build_array(red_payable,red_credit));
 plan:=public.fms_auto_payable_writeoff_secure(scheme_id,app_private.payable_business_date(),auto_query);
 if jsonb_array_length(plan->'items')<>1 then raise exception 'Matrix automatic source preview did not use configured rules';end if;
 select to_jsonb(s)||jsonb_build_object('configuration_version',2) into payload from public.fms_payable_writeoff_scheme s where id=scheme_id;
 perform public.fms_save_payable_reference_secure('scheme',payload||jsonb_build_object('relation_rules',jsonb_set(payload->'relation_rules','{0,description}','"说明改变"')));
 blocked:=false;begin perform public.fms_auto_payable_writeoff_secure(scheme_id,app_private.payable_business_date(),auto_query,true,plan->>'plan_token');exception when serialization_failure then blocked:=true;end;
 if not blocked then raise exception 'Matrix revision did not invalidate old automatic plan';end if;
 plan:=public.fms_auto_payable_writeoff_secure(scheme_id,app_private.payable_business_date(),auto_query);
 perform public.fms_auto_payable_writeoff_secure(scheme_id,app_private.payable_business_date(),auto_query,true,plan->>'plan_token');
 select to_jsonb(s)||jsonb_build_object('configuration_version',2) into payload from public.fms_payable_writeoff_scheme s where id=scheme_id;
 perform public.fms_save_payable_reference_secure('scheme',payload||jsonb_build_object('rules',impossible,'relation_rules',jsonb_build_array(configurations->0)));
 auto_query:=jsonb_build_object('relation','payable_payment','supplier_id',payment_supplier);
 plan:=public.fms_auto_payable_writeoff_secure(scheme_id,app_private.payable_business_date(),auto_query);
 if not exists(select 1 from jsonb_array_elements(plan->'items') item where item->>'payable_id'=payment_payable::text) then raise exception 'Payment automatic matcher ignored relation matrix';end if;
 perform public.fms_auto_payable_writeoff_secure(scheme_id,app_private.payable_business_date(),auto_query,true,plan->>'plan_token');
 metadata:=public.fms_payable_scheme_configuration_secure();
 if(metadata->>'configuration_version')::integer<>2 or not exists(select 1 from jsonb_array_elements(metadata->'schemes') s where s->>'id'=scheme_id::text) then raise exception 'Configuration capability missing';end if;
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',foreign_tenant)::text,true);
 metadata:=public.fms_payable_scheme_configuration_secure();
 if not exists(select 1 from jsonb_array_elements(metadata->'schemes') s where s->>'id'=scheme_id::text)
  or exists(select 1 from jsonb_array_elements(metadata->'schemes') s where s->>'tenant_id'<>tenant::text) then raise exception 'Forged header changed ordinary configuration scope';end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers','{}',true);
 metadata:=public.fms_payable_scheme_configuration_secure();
 if not exists(select 1 from jsonb_array_elements(metadata->'schemes') s where s->>'id'=scheme_id::text) then raise exception 'Platform-all lost own child tenant configuration';end if;
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',foreign_tenant)::text,true);
 metadata:=public.fms_payable_scheme_configuration_secure();
 if exists(select 1 from jsonb_array_elements(metadata->'schemes') s where s->>'tenant_id'<>foreign_tenant::text) then raise exception 'Selected tenant metadata leaked configuration';end if;
 blocked:=false;begin perform public.fms_save_payable_reference_secure('scheme',payload||jsonb_build_object('id',scheme_id));exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Selected tenant wrote foreign configuration';end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers','{}',true);
 insert into public.sys_role(role_code,role_name,tenant_id,enabled) values(fixture,'仅配置权限回归',tenant,true) returning id into temporary_role;
 insert into public.sys_role_menu(role_id,menu_id,tenant_id) select temporary_role,id,tenant from public.sys_menu where name in('FinancePayableWriteoff:View','FinancePayableWriteoff:Scheme');
 update public.sys_user set user_roles=array[fixture] where auth_user_id=ordinary;
 perform set_config('request.jwt.claim.sub',ordinary::text,true);
 metadata:=public.fms_payable_scheme_configuration_secure();
 if(metadata->>'configuration_version')::integer<>2 or metadata ? 'primary' or metadata ? 'secondary' then raise exception 'Configuration-only role could not load safe scheme metadata';end if;
 blocked:=false;begin perform public.fms_auto_payable_writeoff_secure(scheme_id,app_private.payable_business_date(),'{}');exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Configuration permission granted automatic execution';end if;
 perform set_config('request.jwt.claim.sub','',true);
 blocked:=false;begin perform public.fms_payable_scheme_configuration_secure();exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Unauthenticated configuration read exposed data';end if;
end $test$;

rollback;
