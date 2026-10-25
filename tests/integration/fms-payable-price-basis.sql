begin;

do $test$
declare
 actor uuid;tenant uuid;supplier uuid;material uuid;inventory_unit uuid;estimated_type uuid;
 payload jsonb;estimate jsonb;finance jsonb;line_value jsonb;calculated jsonb;original_line public.fms_purchase_payable_line;
 index_value integer;expected_total numeric;reversal_total numeric;blocked boolean;
begin
 select auth_user_id into actor from public.sys_user where user_roles @>array['R_SUPER'] and auth_user_id is not null limit 1;
 select master.tenant_id,master.id,master.inventory_unit_id into tenant,material,inventory_unit from public.mdm_material master where master.inventory_unit_id is not null and exists(select 1 from public.mdm_supplier where tenant_id=master.tenant_id) and exists(select 1 from public.mdm_document_type where tenant_id=master.tenant_id and document_type_code='AP_EST_OTHER') limit 1;
 if actor is null or material is null then raise exception 'Missing payable price fixtures';end if;
 select id into supplier from public.mdm_supplier where tenant_id=tenant limit 1;
 select id into estimated_type from public.mdm_document_type where tenant_id=tenant and document_type_code='AP_EST_OTHER';
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers','{}',true);
 for index_value in 1..2 loop
  line_value:=jsonb_build_object('material_id',material,'inventory_unit_id',inventory_unit,'quantity',case when index_value=1 then 1 else 1000 end,'unit_price',case when index_value=1 then 0.0354 else 99.9558 end,'tax_inclusive_unit_price',case when index_value=1 then 0.04 else 112.95 end,'price_basis','gross','tax_rate',13);
  payload:=jsonb_build_object('kind','estimated','tenant_id',tenant,'document_type_id',estimated_type,'supplier_id',supplier,'business_date',current_date,'input_tax_inclusive_price',true,'lines',jsonb_build_array(line_value));
  estimate:=public.fms_save_purchase_payable_secure(payload);
  expected_total:=case when index_value=1 then 0.04 else 112950 end;
  if (estimate->>'total_amount')::numeric<>expected_total or estimate->'lines'->0->>'price_basis'<>'gross' then raise exception 'Inclusive price was not authoritative: expected %, actual %',expected_total,estimate->>'total_amount';end if;
  estimate:=public.fms_save_purchase_payable_secure(estimate||jsonb_build_object('remark','只改备注，金额不得漂移'));
  if (estimate->>'total_amount')::numeric<>expected_total then raise exception 'No-op edit repriced a gross-basis line';end if;
  if index_value=2 then
   estimate:=public.fms_save_purchase_payable_secure(jsonb_set(estimate,'{lines,0,quantity}','1001'));
   if (estimate->>'total_amount')::numeric<>113062.95 or (estimate->'lines'->0->>'tax_inclusive_unit_price')::numeric<>112.95 then raise exception 'Quantity change reused rounded net price';end if;
   expected_total:=113062.95;
  end if;
  perform public.fms_act_purchase_payable_secure(array[(estimate->>'id')::uuid],'submit');perform public.fms_act_purchase_payable_secure(array[(estimate->>'id')::uuid],'approve');
  finance:=public.fms_push_estimated_payable_secure((estimate->>'id')::uuid);
  if (finance->>'total_amount')::numeric<>expected_total or finance->'lines'->0->>'price_basis'<>'gross' then raise exception 'Financial push repriced original gross basis';end if;
  if index_value=2 then
   finance:=public.fms_save_purchase_payable_secure(jsonb_set(finance,'{lines,0,quantity}','1'));
   if (finance->>'total_amount')::numeric<>112.95 then raise exception 'Partial invoice drifted from entered gross price';end if;
  end if;
  perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'submit');perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'approve');
  if index_value=2 then
   finance:=public.fms_push_estimated_payable_secure((estimate->>'id')::uuid);
   if (finance->>'total_amount')::numeric<>112950 then raise exception 'Remaining invoice repriced gross basis';end if;
   perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'submit');perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'approve');
  end if;
  select -sum(reversed.total_amount) into reversal_total from public.fms_purchase_payable_line reversed where reversed.reversal_of_line_id=(estimate->'lines'->0->>'id')::uuid;
  if reversal_total<>expected_total then raise exception 'Final reversal did not absorb original gross-price cents';end if;
 end loop;
 for original_line in select * from public.fms_purchase_payable_line where line_snapshot->>'price_basis' is null and kind='estimated' and amount>=0 loop
  calculated:=app_private.calculate_payable_line(original_line.line_snapshot||jsonb_build_object('quantity',original_line.quantity,'unit_price',original_line.unit_price,'tax_rate',case when original_line.amount<>0 then original_line.tax_amount/original_line.amount*100 else 0 end),jsonb_build_object('discount_includes_tax',true));
  if (calculated->>'total_amount')::numeric<>original_line.total_amount then raise exception 'Legacy net-price baseline changed';end if;
 end loop;
 line_value:=jsonb_build_object('quantity',3,'unit_price',0.0442,'tax_inclusive_unit_price',0.05,'price_basis','gross','tax_rate',13,'discount_method','rate','discount_value',10);
 calculated:=app_private.calculate_payable_line(line_value,'{"discount_includes_tax":true}');
 if (calculated->>'discount_amount')::numeric<>0.02 or (calculated->>'total_amount')::numeric<>0.13 or (calculated->>'amount')::numeric<>0.12 or (calculated->>'tax_amount')::numeric<>0.01 then raise exception 'Discount cents or gross split inconsistent';end if;
 calculated:=app_private.calculate_payable_line(line_value||'{"discount_value":100}','{"discount_includes_tax":true}');
 if (calculated->>'total_amount')::numeric<>0 then raise exception 'Full discount retained liability';end if;
 calculated:=app_private.calculate_payable_line(line_value||'{"gift":true}','{}');
 if (calculated->>'total_amount')::numeric<>0 then raise exception 'Gift retained liability';end if;
 calculated:=app_private.calculate_payable_line(line_value||'{"total_amount":0.04}','{"input_amount":true,"input_tax_inclusive_price":true}');
 if (calculated->>'total_amount')::numeric<>0.04 then raise exception 'Amount entry lost authoritative gross amount';end if;
 blocked:=false;begin perform app_private.calculate_payable_line(line_value||'{"price_basis":"invalid"}','{}');exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Invalid price basis accepted';end if;
 if has_function_privilege('anon','app_private.calculate_payable_line(jsonb,jsonb)','execute') or has_function_privilege('authenticated','app_private.calculate_payable_line(jsonb,jsonb)','execute') then raise exception 'Private calculator exposed to client';end if;
end $test$;

do $split_test$
declare
 actor uuid;template public.wms_purchase_document;source_line public.wms_purchase_document_line;
 receipt_id uuid:=gen_random_uuid();receipt_line_id uuid:=gen_random_uuid();estimate jsonb;finance jsonb;
 first_estimate uuid;second_estimate uuid;before_total numeric;
begin
 select auth_user_id into actor from public.sys_user where user_roles @>array['R_SUPER'] and auth_user_id is not null limit 1;
 select document.* into template from public.wms_purchase_document document where document.kind='purchase_inbound' and document.status='approved' and not document.is_initialization and document.supplier_id is not null and exists(select 1 from public.wms_purchase_document_line where document_id=document.id) limit 1;
 select * into source_line from public.wms_purchase_document_line where document_id=template.id limit 1;
 if actor is null or source_line.id is null then raise exception 'Missing split invoice price fixture';end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers','{}',true);
 insert into public.wms_purchase_document select (jsonb_populate_record(null::public.wms_purchase_document,to_jsonb(template)||jsonb_build_object('id',receipt_id,'document_no','PRICE-SPLIT-'||receipt_id::text))).*;
 insert into public.wms_purchase_document_line select (jsonb_populate_record(null::public.wms_purchase_document_line,to_jsonb(source_line)||jsonb_build_object('id',receipt_line_id,'document_id',receipt_id,'line_no',10,'quantity',2,'base_quantity',2,'unit_price',0.0398,'tax_inclusive_unit_price',0.045,'tax_rate',13,'amount',0.08,'tax_amount',0.01,'total_amount',0.09,'source_order_target_line_id',null,'movement_id',null))).*;
 estimate:=public.wms_push_purchase_payables_secure('estimated',jsonb_build_array(jsonb_build_object('document_id',receipt_id)))->0;
 estimate:=public.fms_save_purchase_payable_secure(jsonb_set(estimate,'{lines,0,quantity}','1'));
 first_estimate:=(estimate->>'id')::uuid;
 estimate:=public.wms_push_purchase_payables_secure('estimated',jsonb_build_array(jsonb_build_object('document_id',receipt_id)))->0;
 second_estimate:=(estimate->>'id')::uuid;
 if (select sum(line.total_amount) from public.fms_purchase_payable_line line where line.document_id=any(array[first_estimate,second_estimate]))<>0.09 then raise exception 'Source tranche rounding created an extra estimated cent';end if;
 perform public.fms_act_purchase_payable_secure(array[first_estimate,second_estimate],'submit');perform public.fms_act_purchase_payable_secure(array[first_estimate,second_estimate],'approve');
 finance:=public.wms_push_purchase_payables_secure('financial',jsonb_build_array(jsonb_build_object('document_id',receipt_id)))->0;
 if (finance->'lines'->0->>'tax_rate')::numeric<>13 then raise exception 'Source tax rate was inferred from rounded money instead of the actual source rate';end if;
 before_total:=(finance->>'total_amount')::numeric;
 if jsonb_array_length(finance->'lines')<>2 or before_total<>0.09 then raise exception 'Split financial fixture did not preserve source cents';end if;
 finance:=public.fms_save_purchase_payable_secure(finance||jsonb_build_object('remark','来源金额分摊后只改备注'));
 if (finance->>'total_amount')::numeric<>before_total then raise exception 'Metadata-only edit repriced source allocation: expected %, actual %',before_total,finance->>'total_amount';end if;
 perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'submit');perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'approve');
 if (select -sum(line.total_amount) from public.fms_purchase_payable_line line join public.fms_purchase_payable_document document on document.id=line.document_id where document.reversal_source_id=(finance->>'id')::uuid)<>0.09 then raise exception 'Source invoice reversals did not reconcile to original source cents';end if;
end $split_test$;

rollback;
