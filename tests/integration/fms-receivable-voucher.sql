-- Temporary rule and source setup: execute inside BEGIN/ROLLBACK.
do $voucher$
declare actor uuid;a public.fms_account_set%rowtype;post_date date;debit uuid;credit uuid;rule_id uuid;kind text;e uuid;f uuid;r uuid;customer uuid;org uuid;type_id uuid;result jsonb;preview jsonb;repeated jsonb;voucher uuid;n int;vouchers uuid[]:=array[]::uuid[];
begin
 select u.auth_user_id into actor from public.sys_user u join public.sys_tenant t on t.id=u.tenant_id where u.system_protected and t.builtin_type='platform' and u.auth_user_id is not null limit 1;
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers','{}',true);
 select * into a from public.fms_account_set where is_default and status='active' and exists(select 1 from public.mdm_customer where tenant_id=fms_account_set.tenant_id)
 and(nullif(current_setting('test.ar_tenant_code',true),'') is null or exists(select 1 from public.sys_tenant tenant where tenant.id=fms_account_set.tenant_id and tenant.tenant_code=current_setting('test.ar_tenant_code',true)))
 order by create_time limit 1;
 select start_date into post_date from public.fms_accounting_period where account_set_id=a.id and status='open' order by start_date desc limit 1;
 select id into debit from public.fms_subject s where account_set_id=a.id and is_enabled and not cash_flow_required and not exists(select 1 from public.fms_subject c where c.parent_id=s.id) and not exists(select 1 from public.fms_subject_auxiliary_type b where b.subject_id=s.id and b.is_required) order by subject_code limit 1;
 select id into credit from public.fms_subject s where account_set_id=a.id and id<>debit and is_enabled and not cash_flow_required and not exists(select 1 from public.fms_subject c where c.parent_id=s.id) and not exists(select 1 from public.fms_subject_auxiliary_type b where b.subject_id=s.id and b.is_required) order by subject_code limit 1;
 if post_date is null or credit is null then raise exception 'Missing accounting period or leaf subjects';end if;
 foreach kind in array array['estimate','financial','reversal'] loop
  insert into public.fms_posting_rule(tenant_id,account_set_id,rule_code,rule_name,source_type,event_code,priority,submission_mode)
  values(a.tenant_id,a.id,'ARTEST_'||upper(left(gen_random_uuid()::text,8)),'应收凭证回滚测试','system','ar_'||kind||'_approved',999999,'draft') returning id into rule_id;
  insert into public.fms_posting_rule_line(tenant_id,account_set_id,rule_id,line_no,subject_id,direction,amount_key)
  values(a.tenant_id,a.id,rule_id,1,debit,'debit','gross_amount'),(a.tenant_id,a.id,rule_id,2,credit,'credit','gross_amount');
 end loop;
 select id into customer from public.mdm_customer where tenant_id=a.tenant_id and enabled limit 1;
 select id into org from public.mdm_organization where tenant_id=a.tenant_id and organization_type='company' and status='1' limit 1;
 select id into type_id from public.mdm_document_type where tenant_id=a.tenant_id and document_type_code='AR_EST_STANDARD';
 for n in 1..2 loop
 e:=public.fms_save_receivable_document_secure(jsonb_build_object('kind','estimate','tenantId',a.tenant_id,'documentTypeId',type_id,'customerId',customer,'settlementOrganizationId',org,'businessDate',post_date,'currencyCode','CNY','settlementMethod','cash','lines',jsonb_build_array(jsonb_build_object('lineNo',10,'basis','amount','materialDescription','隔离凭证验证'||n,'enteredGrossAmount',113*n,'quantity',0,'unitPrice',0,'priceBasis','taxed','taxRate',13,'discountMethod','none'))));
 perform public.fms_act_receivable_document_secure(e,'submit');perform public.fms_act_receivable_document_secure(e,'approve');
 preview:=public.fms_ar_voucher_secure('estimate',e,false);
 if jsonb_array_length(preview->'lines')<>2 then raise exception 'Estimate voucher preview missing';end if;
 result:=public.fms_ar_voucher_secure('estimate',e,true);voucher:=(result->>'voucherId')::uuid;
 if voucher is null then raise exception 'Estimate voucher generation failed: %',result;end if;
 vouchers:=array_append(vouchers,voucher);
 repeated:=public.fms_ar_voucher_secure('estimate',e,true);
 if repeated->>'voucherId' is distinct from voucher::text then raise exception 'Repeated voucher generation duplicated entries';end if;
 f:=public.fms_push_financial_receivable_secure(e);perform public.fms_act_receivable_document_secure(f,'submit');perform public.fms_act_receivable_document_secure(f,'approve');
 result:=public.fms_ar_voucher_secure('financial',f,true);if result->>'voucherId' is null then raise exception 'Financial voucher failed: %',result;end if;
 vouchers:=array_append(vouchers,(result->>'voucherId')::uuid);
 select d.id into r from public.fms_receivable_document d where d.financial_id=f and d.kind='reversal';
 preview:=public.fms_ar_voucher_secure('reversal',r,false);
 if (preview->'lines'->0->>'creditAmount')::numeric<>113*n or (preview->'lines'->1->>'debitAmount')::numeric<>113*n then raise exception 'Reversal preview did not reverse accounting direction: %',preview;end if;
 result:=public.fms_ar_voucher_secure('reversal',r,true);voucher:=(result->>'voucherId')::uuid;
 vouchers:=array_append(vouchers,voucher);
 if not exists(select 1 from public.fms_voucher_line where voucher_id=voucher and subject_id=debit and credit_amount=113*n) then raise exception 'Reversal voucher did not credit original debit subject: %',result;end if;
 if not exists(select 1 from public.fms_voucher where id=voucher and total_debit=113*n and total_credit=113*n) then raise exception 'Reversal voucher is unbalanced';end if;
 end loop;
 if (select count(distinct id) from unnest(vouchers) id)<>6
  or (select count(*) from public.fms_voucher where id=any(vouchers) and tenant_id=a.tenant_id and account_set_id=a.id and total_debit=total_credit)<>6
  or (select sum(total_debit) from public.fms_voucher where id=any(vouchers))<>1017
  then raise exception 'Two chains did not create six distinct, scoped and balanced vouchers';end if;
end $voucher$;
