begin;
do $test$
declare
  actor uuid;
  tenant uuid;
  supplier uuid;
  material uuid;
  unit_id uuid;
  est_type uuid;
  estimate jsonb;
  finance jsonb;
  partial_line jsonb;
  estimate_id uuid;
  finance_id uuid;
  estimate_line uuid;
  blocked boolean;
begin
  select auth_user_id into actor from public.sys_user where user_roles @>array['R_SUPER'] and auth_user_id is not null limit 1;
  select m.tenant_id,m.id,m.inventory_unit_id,s.id into tenant,material,unit_id,supplier
  from public.mdm_material m join public.mdm_supplier s on s.tenant_id=m.tenant_id
  where m.status='enabled' and m.inventory_unit_id is not null limit 1;
  if actor is null or tenant is null then raise exception 'Missing payable test fixtures'; end if;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.headers','{}',true);
  select id into est_type from public.mdm_document_type where tenant_id=tenant and document_type_code='AP_EST_OTHER';
  estimate:=public.fms_save_purchase_payable_secure(jsonb_build_object(
    'kind','estimated','tenant_id',tenant,'supplier_id',supplier,'document_type_id',est_type,
    'business_date','2026-10-21','posting_date','2026-10-21','input_tax_inclusive_price',true,
    'tax_excluded_from_cost',true,'lines',jsonb_build_array(jsonb_build_object(
      'material_id',material,'material_code','TEST-MAT','material_description','测试物料',
      'inventory_unit_id',unit_id,'quantity',3,'unit_price',100,'tax_rate',13
    ))
  ));
  estimate_id:=(estimate->>'id')::uuid;
  estimate_line:=(estimate->'lines'->0->>'id')::uuid;
  if (estimate->>'total_amount')::numeric<>339 then raise exception 'Incorrect estimated total'; end if;
  if estimate->'lines'->0->>'material_code' is distinct from (select material_code from public.mdm_material where id=material) then raise exception 'Client replaced the authoritative material code'; end if;
  if not exists(select 1 from public.get_record_delete_dependency_details('mdm_material',array[material::text],'fms_payable_line_material_tenant_fkey') dependency where dependency.target_id=estimate_id::text and dependency.record_no=estimate->>'document_no' and dependency.source_table='fms_purchase_payable_document') then raise exception 'Material deletion guard cannot identify the payable document'; end if;
  perform public.fms_act_purchase_payable_secure(array[estimate_id],'submit');
  perform public.fms_act_purchase_payable_secure(array[estimate_id],'approve');
  finance:=public.fms_push_estimated_payable_secure(estimate_id);
  finance_id:=(finance->>'id')::uuid;
  partial_line:=finance->'lines'->0;
  finance:=public.fms_save_purchase_payable_secure(finance||jsonb_build_object('lines',jsonb_build_array(partial_line||jsonb_build_object('quantity',1,'unit_price',110))));
  if (app_private.purchase_payable_json(estimate_id)->>'linked_amount')::numeric<>124.30 then raise exception 'Missing saved financial association'; end if;
  perform public.fms_act_purchase_payable_secure(array[finance_id],'submit');
  perform public.fms_act_purchase_payable_secure(array[finance_id],'approve');
  if (select -sum(total_amount) from public.fms_purchase_payable_line where reversal_of_line_id=estimate_line)<>113 then raise exception 'Partial reversal must use original estimated price'; end if;
  if (select sum(cost_difference) from public.fms_purchase_payable_line where reversal_of_line_id=estimate_line)<>10 then raise exception 'Incorrect cost difference'; end if;
  blocked:=false;
  begin perform public.fms_act_purchase_payable_secure(array[finance_id],'approve'); exception when check_violation then blocked:=true; end;
  if not blocked then raise exception 'Duplicate approval was accepted'; end if;
  finance:=public.fms_push_estimated_payable_secure(estimate_id);
  finance_id:=(finance->>'id')::uuid;
  if (finance->'lines'->0->>'quantity')::numeric<>2 then raise exception 'Incorrect remaining quantity'; end if;
  perform public.fms_act_purchase_payable_secure(array[finance_id],'submit');
  perform public.fms_act_purchase_payable_secure(array[finance_id],'approve');
  if (select -sum(total_amount) from public.fms_purchase_payable_line where reversal_of_line_id=estimate_line)<>339 then raise exception 'Full reversal does not balance'; end if;
  if jsonb_array_length(public.fms_payable_delete_dependencies_secure(array[estimate_id]))=0 then raise exception 'Referenced document deletion guard is empty'; end if;
  blocked:=false;
  begin perform public.fms_act_purchase_payable_secure(array[estimate_id],'delete'); exception when foreign_key_violation then blocked:=true; end;
  if not blocked then raise exception 'Referenced payable was deleted'; end if;
  perform public.fms_act_purchase_payable_secure(array[finance_id],'freeze','测试争议',10);
  if (app_private.purchase_payable_json(finance_id)->>'freeze_status')<>'partial' then raise exception 'Missing partial freeze'; end if;
  perform public.fms_act_purchase_payable_secure(array[finance_id],'unfreeze','测试解除争议');
  if (select frozen_amount from public.fms_purchase_payable_document where id=finance_id)<>0 then raise exception 'Unfreeze did not restore availability'; end if;
  estimate:=public.fms_save_purchase_payable_secure(jsonb_build_object(
    'kind','estimated','tenant_id',tenant,'supplier_id',supplier,'document_type_id',est_type,
    'business_date','2026-10-21','basis','amount','input_amount',true,'input_tax_inclusive_price',true,
    'lines',jsonb_build_array(jsonb_build_object('material_id',material,'material_code','TEST-AMOUNT',
      'material_description','金额基准验证','inventory_unit_id',unit_id,'quantity',1,'unit_price',100,'tax_rate',0,'total_amount',100))
  ));
  estimate_id:=(estimate->>'id')::uuid;
  estimate_line:=(estimate->'lines'->0->>'id')::uuid;
  perform public.fms_act_purchase_payable_secure(array[estimate_id],'submit');
  perform public.fms_act_purchase_payable_secure(array[estimate_id],'approve');
  finance:=public.fms_push_estimated_payable_secure(estimate_id);
  finance_id:=(finance->>'id')::uuid;
  finance:=public.fms_save_purchase_payable_secure(finance||jsonb_build_object('lines',jsonb_build_array(finance->'lines'->0||jsonb_build_object('total_amount',40))));
  perform public.fms_act_purchase_payable_secure(array[finance_id],'submit');
  perform public.fms_act_purchase_payable_secure(array[finance_id],'approve');
  finance:=public.fms_push_estimated_payable_secure(estimate_id);
  finance_id:=(finance->>'id')::uuid;
  if (finance->>'total_amount')::numeric<>60 then raise exception 'Amount-basis push lost partial remainder'; end if;
  perform public.fms_act_purchase_payable_secure(array[finance_id],'submit');
  perform public.fms_act_purchase_payable_secure(array[finance_id],'approve');
  if (select -sum(total_amount) from public.fms_purchase_payable_line where reversal_of_line_id=estimate_line)<>100 then raise exception 'Amount-basis reversals do not balance'; end if;
  select id into est_type from public.mdm_document_type where tenant_id=tenant and document_type_code='AP_FIN_STANDARD';
  finance:=public.fms_save_purchase_payable_secure(jsonb_build_object(
    'kind','financial','tenant_id',tenant,'supplier_id',supplier,'document_type_id',est_type,
    'business_date','2026-10-21','basis','amount','input_amount',true,'input_tax_inclusive_price',true,
    'plans_by_ratio',true,'payment_plans',jsonb_build_array(
      jsonb_build_object('due_date','2026-11-21','ratio',33.3333,'amount',0),
      jsonb_build_object('due_date','2026-12-21','ratio',33.3333,'amount',0),
      jsonb_build_object('due_date','2027-01-21','ratio',33.3334,'amount',0)
    ),
    'lines',jsonb_build_array(jsonb_build_object('material_id',material,'inventory_unit_id',unit_id,
      'quantity',1,'unit_price',0.01,'tax_rate',0,'total_amount',0.01))
  ));
  if (finance->'payment_plans'->2->>'amount')::numeric<>0.01 then raise exception 'Payment plan last installment did not absorb the cent remainder'; end if;
  blocked:=false;
  begin perform public.fms_save_purchase_payable_secure(finance||jsonb_build_object('payment_plans',jsonb_build_array(jsonb_build_object('due_date','2026-02-30','ratio',100,'amount',0.01)))); exception when datetime_field_overflow then blocked:=true; end;
  if not blocked then raise exception 'Invalid payment plan calendar date was accepted'; end if;
  select id into est_type from public.mdm_document_type where tenant_id=tenant and document_type_code='AP_EST_OTHER';
  estimate:=public.fms_save_purchase_payable_secure(jsonb_build_object(
    'kind','estimated','tenant_id',tenant,'supplier_id',supplier,'document_type_id',est_type,
    'business_date','2026-10-21','lines',jsonb_build_array(jsonb_build_object('material_id',material,
      'inventory_unit_id',unit_id,'quantity',1,'unit_price',100,'tax_rate',13,'gift',true))
  ));
  estimate_id:=(estimate->>'id')::uuid;
  if (estimate->'lines'->0->>'is_reversed')::boolean then raise exception 'Unbilled zero-value gift was marked reversed'; end if;
  perform public.fms_act_purchase_payable_secure(array[estimate_id],'submit');
  perform public.fms_act_purchase_payable_secure(array[estimate_id],'approve');
  finance:=public.fms_push_estimated_payable_secure(estimate_id);
  finance_id:=(finance->>'id')::uuid;
  perform public.fms_act_purchase_payable_secure(array[finance_id],'submit');
  perform public.fms_act_purchase_payable_secure(array[finance_id],'approve');
  if not (app_private.purchase_payable_json(estimate_id)->'lines'->0->>'is_reversed')::boolean then raise exception 'Fully billed gift did not update reversal flag by quantity'; end if;
end $test$;
rollback;
