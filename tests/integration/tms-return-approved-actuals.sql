-- Transaction-only: two synthetic trips, genuine FMS approvals and two-stage TMS cost workflow.
-- All business rows roll back after approved-actual and shared-allocation assertions.
begin;
select set_config('request.jwt.claims','{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
select set_config('request.headers','{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}',true);
select set_config('qa.return_existing_cost_count',(
  select count(*)::text from public.tms_waybill_cost
  where waybill_id in (
    'a9fc0006-1023-4620-9220-000000000007',
    'a9fc0006-1023-4620-9220-000000000008'
  )
),true);
do $x$
declare w uuid; leg uuid; e uuid; f uuid; c uuid; j jsonb; cost_status text; step integer; d public.fms_receivable_document; lines jsonb; input jsonb;
begin
for w in select id from public.tms_waybill where id in ('a9fc0006-1023-4620-9220-000000000007','a9fc0006-1023-4620-9220-000000000008') order by id loop
 input:=case when w='a9fc0006-1023-4620-9220-000000000008' then
  '{"return_customer_id":"a9fc0001-1023-4620-9220-000000000001","origin_station":"广州","destination_station":"上海","freight_income":1800,"information_fee":100,"technical_service_fee":50,"direct_toll_fee":200,"direct_misc_fee":20,"shared_cost_allocation_pct":35}'::jsonb
 else '{"return_customer_id":"a9fc0001-1023-4620-9220-000000000002","origin_station":"北京","destination_station":"上海","freight_income":2300,"information_fee":80,"technical_service_fee":40,"direct_toll_fee":180,"direct_misc_fee":30,"shared_cost_allocation_pct":40}'::jsonb end;
 leg:=(public.tms_create_return_leg_secure(w,input)->>'id')::uuid;
 update public.tms_waybill set status='unloading' where id=w;
 update public.tms_waybill set status='signed' where id=w;
 e:=public.fms_create_return_leg_estimated_receivable_secure(leg);
 select * into d from public.fms_receivable_document where id=e;
 select jsonb_agg(jsonb_build_object('lineNo',line_no,'basis',basis,'sourceLineId',source_line_id,'sourceLineNo',source_line_no,'sourceTotalAmount',source_total_amount,'materialDescription',material_description,'quantity',quantity,'priceBasis','taxed','taxInclusiveUnitPrice',tax_inclusive_unit_price,'taxRate',9,'enteredGrossAmount',total_amount)) into lines from public.fms_receivable_line where document_id=e;
 perform public.fms_save_receivable_document_secure(jsonb_build_object('id',e,'kind','estimate','customerId',d.customer_id,'documentTypeId',d.document_type_id,'settlementOrganizationId','8fbc1836-d0ea-4afd-98c6-f557ab40fe4f','businessDate',current_date,'currencyCode','CNY','lines',lines));
 perform public.fms_act_receivable_document_secure(e,'submit');
 perform public.fms_act_receivable_document_secure(e,'approve');
 f:=public.fms_push_financial_receivable_secure(e);
 perform public.fms_act_receivable_document_secure(f,'submit');
 perform public.fms_act_receivable_document_secure(f,'approve');
 j:=public.tms_save_waybill_cost_secure(null,jsonb_build_object('waybill_id',w,'leg_id',leg,'expense_item_id','3e28fd33-2eae-4f1c-9946-61f9ac015a19','amount',120,'occurred_on',current_date,'payee_name','QA 返程费用','reporter_user_id','93f2f1e8-a3dc-4f5a-999b-6c8c02d0c7e9','remark','DEMO 审批流验收'));
 c:=(j->>'id')::uuid;
 perform public.start_workflow('tms_waybill_cost',c,'DEMO 返程费用审批','{}',gen_random_uuid()::text);
 select audit_status into cost_status from public.tms_waybill_cost where id=c;
 if cost_status='pending_review' then
   perform set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
   perform set_config('request.headers','{}',true);
   for step in 1..2 loop
     perform public.act_workflow_by_business('tms_waybill_cost',c,'approve','DEMO transaction',gen_random_uuid()::text);
   end loop;
   perform set_config('request.jwt.claims','{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
   perform set_config('request.headers','{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}',true);
 end if;
 if (select audit_status from public.tms_waybill_cost where id=c)<>'approved' then raise exception 'cost not approved'; end if;
 j:=public.tms_save_waybill_cost_secure(null,jsonb_build_object('waybill_id',w,'expense_item_id','8786d378-15f2-4f27-9291-ba35ddf7d73a','amount',200,'occurred_on',current_date,'payee_name','QA 共用路桥费','reporter_user_id','93f2f1e8-a3dc-4f5a-999b-6c8c02d0c7e9','remark','DEMO 共用成本审批流验收'));
 c:=(j->>'id')::uuid;
 perform public.start_workflow('tms_waybill_cost',c,'DEMO 共用路桥费审批','{}',gen_random_uuid()::text);
 perform set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
 perform set_config('request.headers','{}',true);
 for step in 1..2 loop
   perform public.act_workflow_by_business('tms_waybill_cost',c,'approve','DEMO transaction',gen_random_uuid()::text);
 end loop;
 perform set_config('request.jwt.claims','{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
 perform set_config('request.headers','{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}',true);
 if (select audit_status from public.tms_waybill_cost where id=c)<>'approved' then raise exception 'shared toll not approved'; end if;
end loop;
end $x$;
do $check$
declare
  v_waybill uuid;
  v_summary jsonb;
  v_expected_revenue numeric;
  v_expected_cost numeric;
  v_expected_profit numeric;
  v_before_cost_count integer;
  v_report jsonb;
begin
  for v_waybill,v_expected_revenue,v_expected_cost,v_expected_profit in
    select * from (values
      ('a9fc0006-1023-4620-9220-000000000007'::uuid,2300::numeric,200::numeric,2100::numeric),
      ('a9fc0006-1023-4620-9220-000000000008'::uuid,1800::numeric,190::numeric,1610::numeric)
    ) fixture loop
    v_summary:=public.tms_get_return_trip_summary_secure(v_waybill);
    if (v_summary->>'returnActualRevenue')::numeric<>v_expected_revenue
      or (v_summary->>'returnActualCost')::numeric<>v_expected_cost
      or (v_summary->>'returnActualGrossProfit')::numeric<>v_expected_profit
      or v_summary->>'actualAccountingStatus'<>'approved_to_date' then
      raise exception 'Approved return actual mismatch: %',v_summary;
    end if;
    if (select count(*) from public.fms_receivable_document e
      join public.tms_waybill_leg l on l.id=e.source_id and l.tenant_id=e.tenant_id
      where l.waybill_id=v_waybill and l.leg_kind='return' and e.kind='estimate'
        and e.source_type='tms_return_leg')<>1 then
      raise exception 'Return AR source must be unique';
    end if;
    if (select count(*) from public.tms_waybill_cost c
      where c.waybill_id=v_waybill and c.audit_status='approved'
        and c.leg_id=(select id from public.tms_waybill_leg
          where waybill_id=v_waybill and leg_kind='return')
        and c.remark='DEMO 审批流验收')<>1
      or (select count(*) from public.tms_waybill_cost c
        where c.waybill_id=v_waybill and c.audit_status='approved'
          and c.leg_id is null and c.cost_type='toll'
          and c.remark='DEMO 共用成本审批流验收')<>1 then
      raise exception 'One direct and one shared cost should remain on the parent';
    end if;
    if (select count(*) from public.fms_receivable_document r
      join public.fms_receivable_document e on e.id=r.estimate_id
      join public.tms_waybill_leg l on l.id=e.source_id
      where l.waybill_id=v_waybill and e.source_type='tms_return_leg'
        and r.kind='reversal' and r.status='approved')<>1 then
      raise exception 'Expected estimate conversion reversal';
    end if;
  end loop;
  select count(*) into v_before_cost_count from public.tms_waybill_cost
  where waybill_id in ('a9fc0006-1023-4620-9220-000000000007','a9fc0006-1023-4620-9220-000000000008');
  if v_before_cost_count<>current_setting('qa.return_existing_cost_count')::integer+4
    then raise exception 'Costs duplicated while projecting return profits'; end if;
  v_report:=public.tms_return_profit_report_secure(
    0,20,'2026-10-01','2026-10-31','VMS-QA-YD'
  );
  if (v_report->'summary'->>'returnCount')::integer<>2
    or (v_report->'summary'->>'approvedCount')::integer<>2
    or (v_report->'summary'->>'pendingCount')::integer<>0
    or (v_report->'summary'->>'approvedGrossProfitToDate')::numeric<>3710
    or jsonb_array_length(v_report->'records')<>2 then
    raise exception 'Return gross profit report did not aggregate approved facts: %',v_report->'summary';
  end if;
end $check$;
select w.waybill_no,public.tms_get_return_trip_summary_secure(w.id)->>'returnActualRevenue' actual_revenue,public.tms_get_return_trip_summary_secure(w.id)->>'returnActualCost' actual_cost,public.tms_get_return_trip_summary_secure(w.id)->>'returnActualGrossProfit' actual_profit,public.tms_get_return_trip_summary_secure(w.id)->>'returnAllocatedToll' shared_allocated,public.tms_get_return_trip_summary_secure(w.id)->>'actualAccountingStatus' status from public.tms_waybill w where w.id in ('a9fc0006-1023-4620-9220-000000000007','a9fc0006-1023-4620-9220-000000000008') order by w.waybill_no;
rollback;
