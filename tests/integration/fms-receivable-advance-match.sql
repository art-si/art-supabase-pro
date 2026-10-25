-- Run after fixtures/lifecycle inside BEGIN/ROLLBACK. Every record is isolated by returned IDs.
do $match$
declare
 platform_actor uuid:='0a872664-874c-447d-a256-d0dbdca6ed45'; ordinary_actor uuid;
 sample public.fms_receivable_document%rowtype; estimate_type uuid; other_tenant uuid;
 e uuid; f uuid; el uuid; fl uuid; p jsonb; mapping jsonb; n int; query jsonb; result jsonb; estimate_no text;
begin
 ordinary_actor:=current_setting('test.ar_lifecycle_actor')::uuid;
 select * into strict sample from public.fms_receivable_document where id=current_setting('test.ar_lifecycle_financial_first')::uuid;
 select document_type_id into estimate_type from public.fms_receivable_document where id=current_setting('test.ar_lifecycle_estimate')::uuid;
 select id into other_tenant from public.sys_tenant where id<>sample.tenant_id limit 1;
 for n in 1..3 loop
  perform set_config('request.jwt.claims',jsonb_build_object('sub',case when n=3 then ordinary_actor else platform_actor end,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',(case when n=3 then ordinary_actor else platform_actor end)::text,true);
  perform set_config('request.headers',case n when 1 then '{}' else jsonb_build_object('x-art-tenant-scope',case when n=3 then other_tenant else sample.tenant_id end)::text end,true);
  p:=jsonb_build_object('tenantId',sample.tenant_id,'customerId',sample.customer_id,'settlementOrganizationId',sample.settlement_organization_id,'businessDate',current_date,'currencyCode','CNY','settlementMethod','cash',
    'lines',jsonb_build_array(jsonb_build_object('lineNo',10,'basis','amount','materialDescription','先开票勾稽回滚验证','quantity',0,'priceBasis','taxed','taxRate',0,'enteredGrossAmount',n*10,'discountMethod','none')));
  if n=3 then p:=jsonb_set(p,'{lines,0}',(p->'lines'->0)||jsonb_build_object('basis','quantity','quantity',n,'taxInclusiveUnitPrice',10));end if;
  e:=public.fms_save_receivable_document_secure(p||jsonb_build_object('kind','estimate','documentTypeId',estimate_type));
  if n=3 then p:=jsonb_set(p,'{lines,0,taxInclusiveUnitPrice}','11');end if;
  f:=public.fms_save_receivable_document_secure(jsonb_set(p,'{lines,0,advanceInvoice}','true'::jsonb)||jsonb_build_object('kind','financial','documentTypeId',sample.document_type_id));
  perform public.fms_act_receivable_document_secure(e,'submit');perform public.fms_act_receivable_document_secure(e,'approve');
  perform public.fms_act_receivable_document_secure(f,'submit');perform public.fms_act_receivable_document_secure(f,'approve');
  select id into el from public.fms_receivable_line where document_id=e;
  select id into fl from public.fms_receivable_line where document_id=f;
  select document_no into estimate_no from public.fms_receivable_document where id=e;
  query:=jsonb_build_object('documentKind','estimate','onlyUnlinked',true,'currencyCode','CNY','status','approved','customerId',sample.customer_id,'organizationId',sample.settlement_organization_id,'keyword',estimate_no,'current',1,'size',1);
  result:=public.fms_receivable_workspace_secure('estimate',query);
  if (result->>'total')::int<>1 or jsonb_array_length(result->'records')<>1 or result->'records'->0->>'id'<>e::text then raise exception 'Matchable estimate paging or source filtering failed';end if;
  result:=public.fms_receivable_workspace_secure('estimate',query||'{"current":2}');
  if (result->>'total')::int<>1 or jsonb_array_length(result->'records')<>0 then raise exception 'Matchable estimate pagination lost its true total';end if;
  result:=public.fms_receivable_workspace_secure('estimate',query||'{"currencyCode":"USD"}');
  if (result->>'total')::int<>0 then raise exception 'Wrong-currency estimate was selectable';end if;
  mapping:=jsonb_build_array(jsonb_build_object('financialLineId',fl,'estimatedLineId',el,'quantity',case when n=3 then n else 0 end,'amount',n*10));
  if n<3 then
   perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
   begin
    perform public.fms_match_advance_receivable_secure(f,e,mapping);
    raise exception 'Foreign selected tenant accepted matching';
   exception when insufficient_privilege then null;end;
   perform set_config('request.headers',case when n=1 then '{}' else jsonb_build_object('x-art-tenant-scope',sample.tenant_id)::text end,true);
  end if;
  begin
   perform public.fms_match_advance_receivable_secure(f,e,jsonb_set(mapping,case when n=3 then array['0','quantity'] else array['0','amount'] end,'0'));
   raise exception 'Zero match amount accepted';
  exception when check_violation then null;end;
  begin
   perform public.fms_match_advance_receivable_secure(f,e,mapping||mapping);
   raise exception 'Repeated line mapping accepted';
  exception when check_violation then null;end;
  if exists(select 1 from public.fms_receivable_line where id=fl and estimated_line_id is not null) then raise exception 'Rejected mapping was not atomic';end if;
  perform public.fms_match_advance_receivable_secure(f,e,mapping);
  result:=public.fms_receivable_workspace_secure('estimate',query);
  if (result->>'total')::int<>0 then raise exception 'Fully matched estimate remained selectable';end if;
  if not exists(select 1 from public.fms_receivable_document where id=f and estimate_id=e and tenant_id=sample.tenant_id)
   or not exists(select 1 from public.fms_receivable_document where financial_id=f and kind='reversal' and total_amount=n*10)
   or (select count(*) from public.fms_receivable_application where financial_line_id=fl and event_kind='source_match')<>1
   then raise exception 'Matching source link, reversal or audit event missing';end if;
  begin
   perform public.fms_match_advance_receivable_secure(f,e,mapping);
   raise exception 'Matched financial accepted a second match';
  exception when check_violation then null;end;
 end loop;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',platform_actor,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',platform_actor::text,true);perform set_config('request.headers','{}',true);
end $match$;
