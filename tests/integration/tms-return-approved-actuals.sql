-- Genuine FMS approvals and TMS costs roll back with their return dispatch.
begin;
do $check$
declare
  root_id uuid := '5897bebd-c163-4e69-8754-a862cc9ea998';
  child_id uuid;
  v_leg_id uuid;
  customer_id uuid;
  v_estimate_id uuid;
  v_financial_id uuid;
  v_cost_id uuid;
  doc public.fms_receivable_document%rowtype;
  lines jsonb;
  result jsonb;
  summary jsonb;
  report jsonb;
  existing_shared numeric;
  allocated numeric;
  step integer;
  root_no text;
  origin_name text;
  destination_name text;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
  perform set_config('request.headers',
    '{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}',true);
  select w.waybill_no,o.origin_station,o.destination_station
  into strict root_no,origin_name,destination_name
  from public.tms_waybill w join public.tms_order o on o.id=w.order_id
  where w.id=root_id;
  select id into strict customer_id from public.mdm_customer
  where tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9' and enabled
  order by id limit 1;
  select coalesce(sum(amount),0) into existing_shared
  from public.tms_waybill_cost where waybill_id=root_id
    and audit_status='approved' and cost_type='toll' and leg_id is null;

  result:=public.tms_create_return_leg_secure(root_id,jsonb_build_object(
    'return_customer_id',customer_id,'origin_station',destination_name,
    'destination_station',origin_name,'freight_income',1800,
    'information_fee',100,'technical_service_fee',50,
    'direct_toll_fee',200,'direct_misc_fee',20,
    'shared_cost_allocation_pct',35));
  child_id:=(result->>'waybill_id')::uuid;
  v_leg_id:=(result->>'id')::uuid;
  if child_id is null or v_leg_id is null or child_id=root_id then
    raise exception 'Return child dispatch was not created';
  end if;
  update public.tms_waybill set status='accepted' where id=child_id;
  update public.tms_waybill set status='loading' where id=child_id;
  update public.tms_waybill set status='transporting' where id=child_id;
  update public.tms_waybill set status='unloading' where id=child_id;
  update public.tms_waybill set status='signed' where id=child_id;
  v_estimate_id:=public.fms_create_return_leg_estimated_receivable_secure(v_leg_id);
  select * into strict doc from public.fms_receivable_document where id=v_estimate_id;
  select jsonb_agg(jsonb_build_object(
    'lineNo',line_no,'basis',basis,'sourceLineId',source_line_id,
    'sourceLineNo',source_line_no,'sourceTotalAmount',source_total_amount,
    'materialDescription',material_description,'quantity',quantity,
    'priceBasis','taxed','taxInclusiveUnitPrice',tax_inclusive_unit_price,
    'taxRate',9,'enteredGrossAmount',total_amount)) into lines
  from public.fms_receivable_line where document_id=v_estimate_id;
  perform public.fms_save_receivable_document_secure(jsonb_build_object(
    'id',v_estimate_id,'kind','estimate','customerId',doc.customer_id,
    'documentTypeId',doc.document_type_id,
    'settlementOrganizationId','8fbc1836-d0ea-4afd-98c6-f557ab40fe4f',
    'businessDate',current_date,'currencyCode','CNY','lines',lines));
  perform public.fms_act_receivable_document_secure(v_estimate_id,'submit');
  perform public.fms_act_receivable_document_secure(v_estimate_id,'approve');
  v_financial_id:=public.fms_push_financial_receivable_secure(v_estimate_id);
  perform public.fms_act_receivable_document_secure(v_financial_id,'submit');
  perform public.fms_act_receivable_document_secure(v_financial_id,'approve');

  result:=public.tms_save_waybill_cost_secure(null,jsonb_build_object(
    'waybill_id',child_id,'leg_id',v_leg_id,
    'expense_item_id','3e28fd33-2eae-4f1c-9946-61f9ac015a19',
    'amount',120,'occurred_on',current_date,'payee_name','QA 返程费用',
    'reporter_user_id','93f2f1e8-a3dc-4f5a-999b-6c8c02d0c7e9',
    'remark','ROLLBACK ONLY 返程直接费用'));
  v_cost_id:=(result->>'id')::uuid;
  perform public.start_workflow('tms_waybill_cost',v_cost_id,
    '返程费用审批','{}',gen_random_uuid()::text);
  if (select audit_status from public.tms_waybill_cost where id=v_cost_id)='pending_review' then
    perform set_config('request.jwt.claims',
      '{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
    perform set_config('request.headers','{}',true);
    for step in 1..2 loop
      perform public.act_workflow_by_business('tms_waybill_cost',v_cost_id,
        'approve','ROLLBACK ONLY',gen_random_uuid()::text);
    end loop;
    perform set_config('request.jwt.claims',
      '{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
    perform set_config('request.headers',
      '{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}',true);
  end if;
  if (select audit_status from public.tms_waybill_cost where id=v_cost_id)<>'approved' then
    raise exception 'Return direct cost was not approved';
  end if;
  result:=public.tms_save_waybill_cost_secure(null,jsonb_build_object(
    'waybill_id',root_id,
    'expense_item_id','8786d378-15f2-4f27-9291-ba35ddf7d73a',
    'amount',200,'occurred_on',current_date,'payee_name','QA 共用路桥费',
    'reporter_user_id','93f2f1e8-a3dc-4f5a-999b-6c8c02d0c7e9',
    'remark','ROLLBACK ONLY 共用成本'));
  v_cost_id:=(result->>'id')::uuid;
  perform public.start_workflow('tms_waybill_cost',v_cost_id,
    '共用费用审批','{}',gen_random_uuid()::text);
  perform set_config('request.jwt.claims',
    '{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
  perform set_config('request.headers','{}',true);
  for step in 1..2 loop
    perform public.act_workflow_by_business('tms_waybill_cost',v_cost_id,
      'approve','ROLLBACK ONLY',gen_random_uuid()::text);
  end loop;
  perform set_config('request.jwt.claims',
    '{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
  perform set_config('request.headers',
    '{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}',true);
  if (select audit_status from public.tms_waybill_cost where id=v_cost_id)<>'approved' then
    raise exception 'Shared cost was not approved';
  end if;
  allocated:=round((existing_shared+200)*0.35,2);
  summary:=public.tms_get_return_trip_summary_secure(root_id);
  if (summary->>'returnActualRevenue')::numeric<>1800
    or (summary->>'returnActualCost')::numeric<>120+allocated
    or (summary->>'returnActualGrossProfit')::numeric<>1680-allocated
    or (summary->'returns'->0->>'actualGrossProfit')::numeric<>1680-allocated
    or summary->>'actualAccountingStatus'<>'approved_to_date' then
    raise exception 'Approved return actual mismatch: %',summary;
  end if;
  if (select count(*) from public.fms_receivable_document
      where source_type='tms_return_leg' and source_id=v_leg_id and kind='estimate')<>1
    or (select count(*) from public.tms_waybill_cost
      where waybill_id=child_id and leg_id=v_leg_id and audit_status='approved')<>1
    or (select count(*) from public.tms_waybill_cost
      where waybill_id=root_id and leg_id is null and audit_status='approved'
        and remark='ROLLBACK ONLY 共用成本')<>1 then
    raise exception 'Approved AR or direct/shared cost ownership drifted';
  end if;
  report:=public.tms_return_profit_report_secure(0,100,null,null,root_no);
  if not exists (select 1 from jsonb_array_elements(report->'records') row
    where (row->>'waybillId')::uuid=child_id
      and (row->>'actualRevenue')::numeric=1800
      and (row->>'actualCost')::numeric=120+allocated
      and (row->>'actualGrossProfit')::numeric=1680-allocated) then
    raise exception 'Return report lost approved actuals';
  end if;
end $check$;
rollback;
