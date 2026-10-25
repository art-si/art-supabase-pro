begin;

do $test$
declare
 actor uuid;receipt_template public.wms_purchase_document;source_template public.wms_purchase_document_line;decimal_unit uuid:=gen_random_uuid();decimal_units jsonb;
 material public.mdm_material;piece_unit uuid;box_unit uuid;foreign_unit uuid;estimate_type uuid;
 estimate jsonb;finance jsonb;payload jsonb;line_value jsonb;listed jsonb;first_estimate uuid;receipt_id uuid:=gen_random_uuid();receipt_line uuid:=gen_random_uuid();
 group_index integer;part_index integer;part_quantity numeric;expected_linked numeric;reversal_quantity numeric;reversal_basic numeric;reversal_amount numeric;blocked boolean;
 first_source_estimate uuid;second_source_estimate uuid;
begin
 select auth_user_id into actor from public.sys_user where auth_user_id is not null and user_roles @>array['R_SUPER'] limit 1;
 select receipt.* into receipt_template from public.wms_purchase_document receipt where receipt.kind='purchase_inbound' and receipt.status='approved' and not receipt.is_initialization and receipt.supplier_id is not null and exists(select 1 from public.wms_purchase_document_line source join public.mdm_material master on master.id=source.material_id and master.tenant_id=source.tenant_id where source.document_id=receipt.id and master.base_unit_id is not null) limit 1;
 select source.* into source_template from public.wms_purchase_document_line source join public.mdm_material master on master.id=source.material_id and master.tenant_id=source.tenant_id where source.document_id=receipt_template.id and master.base_unit_id is not null limit 1;
 select * into material from public.mdm_material where id=source_template.material_id;
 if actor is null or material.id is null then raise exception 'Missing payable unit conversion fixtures';end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers','{}',true);
 piece_unit:=material.base_unit_id;
 insert into public.mdm_unit_of_measure(tenant_id,unit_code,unit_name,base_unit_id,conversion_factor) values(material.tenant_id,'QA_AP_BOX_'||upper(left(gen_random_uuid()::text,8)),'回归箱',piece_unit,10) returning id into box_unit;
 update public.mdm_material set unit_conversions=unit_conversions||jsonb_build_array(jsonb_build_object('source_unit_id',box_unit,'source_factor',1,'base_factor',10)) where id=material.id;
 select id into estimate_type from public.mdm_document_type where tenant_id=material.tenant_id and document_type_code='AP_EST_OTHER';
 for group_index in 1..3 loop
  if group_index=3 then update public.mdm_material set unit_conversions=(select coalesce(jsonb_agg(rule),'[]'::jsonb) from jsonb_array_elements(unit_conversions) rule where nullif(rule->>'source_unit_id','')::uuid<>box_unit)||jsonb_build_array(jsonb_build_object('source_unit_id',box_unit,'source_factor',1,'base_factor',3)) where id=material.id;end if;
  line_value:=jsonb_build_object('material_id',material.id,'inventory_unit_id',box_unit,'base_unit_id',piece_unit,'base_quantity',case when group_index=3 then 3 else 100 end,'quantity',case when group_index=3 then 1 else 10 end,'unit_price',100,'tax_inclusive_unit_price',100,'price_basis','net','tax_rate',0,'material_units',jsonb_build_object('base_unit_id',gen_random_uuid(),'unit_conversions','[]'::jsonb));
  payload:=jsonb_build_object('kind','estimated','tenant_id',material.tenant_id,'document_type_id',estimate_type,'supplier_id',receipt_template.supplier_id,'business_date',current_date,'input_tax_inclusive_price',false,'lines',jsonb_build_array(line_value));
  estimate:=public.fms_save_purchase_payable_secure(payload);
  if estimate->'lines'->0->'material_units'->>'base_unit_id' is distinct from piece_unit::text then raise exception 'Client-supplied material conversion facts were trusted';end if;
  if group_index=1 then first_estimate:=(estimate->>'id')::uuid;end if;
  perform public.fms_act_purchase_payable_secure(array[(estimate->>'id')::uuid],'submit');perform public.fms_act_purchase_payable_secure(array[(estimate->>'id')::uuid],'approve');
  expected_linked:=0;
  for part_index in 1..case when group_index=1 then 2 else 3 end loop
   part_quantity:=case when group_index=3 then 1 when group_index=1 then 50 when part_index=2 then 34 else 33 end;
   finance:=public.fms_push_estimated_payable_secure((estimate->>'id')::uuid);
   if (finance->'lines'->0->>'quantity')::numeric<>round((case when group_index=3 then 1 else 10 end)-expected_linked,6) or (finance->'lines'->0->>'base_quantity')::numeric<>round((case when group_index=3 then 3 else 100 end)-expected_linked*(case when group_index=3 then 3 else 10 end),6) then raise exception 'Remaining push lost the original quantity/base quantity ratio';end if;
   finance:=public.fms_save_purchase_payable_secure(jsonb_set(finance,'{lines}',jsonb_build_array(finance->'lines'->0||jsonb_build_object('inventory_unit_id',piece_unit,'quantity',part_quantity,'base_unit_id',case when group_index=2 and part_index=2 then box_unit else piece_unit end,'base_quantity',case when group_index=2 and part_index=2 then part_quantity/10 else part_quantity end,'unit_price',case when group_index=3 then 33.3333 else 10 end,'tax_inclusive_unit_price',case when group_index=3 then 33.3333 else 10 end,'price_basis','net'))));
   expected_linked:=expected_linked+part_quantity/(case when group_index=3 then 3 else 10 end);
   listed:=public.fms_purchase_payable_list_secure('estimated','',(estimate->>'id')::uuid,1,0)->'data'->0;
   if (listed->'lines'->0->>'linked_quantity')::numeric<>round(expected_linked,6) then raise exception 'Associated financial quantity did not use the original estimated unit';end if;
   perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'submit');perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'approve');
   if group_index=2 and part_index=1 then update public.mdm_material set unit_conversions=(select coalesce(jsonb_agg(rule),'[]'::jsonb) from jsonb_array_elements(unit_conversions) rule where nullif(rule->>'source_unit_id','')::uuid<>box_unit)||jsonb_build_array(jsonb_build_object('source_unit_id',box_unit,'source_factor',1,'base_factor',20)) where id=material.id;end if;
  end loop;
  select -sum(reversed.quantity),-sum((reversed.line_snapshot->>'base_quantity')::numeric),-sum(reversed.total_amount) into reversal_quantity,reversal_basic,reversal_amount from public.fms_purchase_payable_line reversed where reversed.reversal_of_line_id=(estimate->'lines'->0->>'id')::uuid;
  if reversal_quantity<>(case when group_index=3 then 1 else 10 end) or reversal_basic<>(case when group_index=3 then 3 else 100 end) or reversal_amount<>(case when group_index=3 then 100 else 1000 end) then raise exception 'Cross-unit reversal did not retain original units, basic quantity and price';end if;
  if exists(select 1 from public.fms_purchase_payable_line reversed where reversed.reversal_of_line_id=(estimate->'lines'->0->>'id')::uuid and (reversed.unit_price<>100 or (reversed.line_snapshot->>'inventory_unit_id')::uuid<>box_unit)) or (select sum(reversed.cost_difference) from public.fms_purchase_payable_line reversed where reversed.reversal_of_line_id=(estimate->'lines'->0->>'id')::uuid)<>(case when group_index=3 then -0.01 else 0 end) then raise exception 'Reversal borrowed financial unit/price or created a false cost difference';end if;
  listed:=public.fms_purchase_payable_list_secure('estimated','',(estimate->>'id')::uuid,1,0)->'data'->0;
  if not (listed->'lines'->0->>'is_reversed')::boolean then raise exception 'Fully invoiced cross-unit estimate did not become reversed';end if;
 end loop;
 blocked:=false;begin perform public.fms_push_estimated_payable_secure(first_estimate);exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Full cross-unit association could be pushed twice';end if;

 if app_private.wms_convert_material_quantity(material.id,2,box_unit,piece_unit)<>6 or app_private.convert_material_quantity(app_private.purchase_payable_json(first_estimate)->'lines'->0->'material_units',2,box_unit,piece_unit)<>20 then raise exception 'Live WMS conversion or original payable conversion snapshot was repriced';end if;
 payload:=jsonb_set(payload,'{lines}',jsonb_build_array(line_value||jsonb_build_object('quantity',10,'base_quantity',30)));
 estimate:=public.fms_save_purchase_payable_secure(payload);
 perform public.fms_act_purchase_payable_secure(array[(estimate->>'id')::uuid],'submit');perform public.fms_act_purchase_payable_secure(array[(estimate->>'id')::uuid],'approve');
 finance:=public.fms_push_estimated_payable_secure((estimate->>'id')::uuid);
 finance:=public.fms_save_purchase_payable_secure(jsonb_set(finance,'{lines}',jsonb_build_array(finance->'lines'->0||jsonb_build_object('quantity',5,'base_quantity',30,'base_quantity_edited',true,'unit_price',200,'tax_inclusive_unit_price',200))));
 if (finance->'lines'->0->>'base_quantity')::numeric<>30 or finance->'lines'->0?'base_quantity_edited' then raise exception 'Explicit basic quantity correction was lost or transient UI intent persisted';end if;
 perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'submit');perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'approve');
 if (select -sum(line.quantity) from public.fms_purchase_payable_line line where line.reversal_of_line_id=(estimate->'lines'->0->>'id')::uuid)<>10 then raise exception 'Explicit basic quantity correction did not control the original-unit reversal';end if;
 blocked:=false;begin perform public.fms_save_purchase_payable_secure(jsonb_set(payload,'{lines,0,base_quantity}','"NaN"'));exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Nonfinite basic quantity accepted';end if;
 blocked:=false;begin perform public.fms_save_purchase_payable_secure(jsonb_set(payload,'{lines,0,quantity}','0.0000001'));exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Quantity below supported precision accepted';end if;
 update public.mdm_material set unit_conversions=(select coalesce(jsonb_agg(rule),'[]'::jsonb) from jsonb_array_elements(unit_conversions) rule where nullif(rule->>'source_unit_id','')::uuid<>box_unit)||jsonb_build_array(jsonb_build_object('source_unit_id',box_unit,'source_factor',3,'base_factor',1)) where id=material.id;
 estimate:=public.fms_save_purchase_payable_secure(jsonb_set(payload,'{lines}',jsonb_build_array((line_value-'base_quantity')||jsonb_build_object('quantity',1))));
 if (estimate->'lines'->0->>'base_quantity')::numeric<>0.333333 then raise exception 'Configured fractional basic quantity missing';end if;
 estimate:=public.fms_save_purchase_payable_secure(jsonb_set(estimate,'{lines,0,quantity}','3'));
 if (estimate->'lines'->0->>'base_quantity')::numeric<>1 then raise exception 'Quantity change reused rounded configured basic quantity';end if;
 estimate:=public.fms_save_purchase_payable_secure(jsonb_set(estimate,'{lines}',jsonb_build_array(estimate->'lines'->0||jsonb_build_object('quantity',6,'base_quantity_edited',true))));
 if (estimate->'lines'->0->>'base_quantity')::numeric<>1 then raise exception 'Manual basic quantity intent was overwritten by configured conversion';end if;
 estimate:=public.fms_save_purchase_payable_secure(jsonb_set(estimate,'{lines,0,quantity}','3'));
 if (estimate->'lines'->0->>'base_quantity')::numeric<>0.5 then raise exception 'Existing actual basic quantity ratio was replaced by master conversion';end if;
 estimate:=public.fms_save_purchase_payable_secure(jsonb_set(estimate,'{lines}',jsonb_build_array(estimate->'lines'->0||jsonb_build_object('base_quantity',1.000001,'base_quantity_edited',true))));
 estimate:=public.fms_save_purchase_payable_secure(jsonb_set(estimate,'{lines,0,quantity}','1.5'));
 if (estimate->'lines'->0->>'base_quantity')::numeric<>0.500001 then raise exception 'Actual basic quantity ratio did not round consistently at half a micro-unit';end if;

 insert into public.wms_purchase_document select (jsonb_populate_record(null::public.wms_purchase_document,to_jsonb(receipt_template)||jsonb_build_object('id',receipt_id,'document_no','AP-UNIT-'||receipt_id::text))).*;
 insert into public.wms_purchase_document_line select (jsonb_populate_record(null::public.wms_purchase_document_line,to_jsonb(source_template)||jsonb_build_object('id',receipt_line,'document_id',receipt_id,'line_no',10,'inventory_unit_id',box_unit,'base_unit_id',piece_unit,'quantity',10,'base_quantity',100,'unit_price',100,'tax_inclusive_unit_price',100,'tax_rate',0,'amount',1000,'tax_amount',0,'total_amount',1000,'source_order_target_line_id',null,'movement_id',null))).*;
 estimate:=public.wms_push_purchase_payables_secure('estimated',jsonb_build_array(jsonb_build_object('document_id',receipt_id)))->0;
 estimate:=public.fms_save_purchase_payable_secure(jsonb_set(estimate,'{lines}',jsonb_build_array(estimate->'lines'->0||jsonb_build_object('quantity',5,'base_quantity',50))));
 first_source_estimate:=(estimate->>'id')::uuid;
 estimate:=public.wms_push_purchase_payables_secure('estimated',jsonb_build_array(jsonb_build_object('document_id',receipt_id)))->0;
 second_source_estimate:=(estimate->>'id')::uuid;
 perform public.fms_act_purchase_payable_secure(array[first_source_estimate,second_source_estimate],'submit');perform public.fms_act_purchase_payable_secure(array[first_source_estimate,second_source_estimate],'approve');
 finance:=public.wms_push_purchase_payables_secure('financial',jsonb_build_array(jsonb_build_object('document_id',receipt_id)))->0;
 finance:=public.fms_save_purchase_payable_secure(jsonb_set(finance,'{lines}',(select jsonb_agg(item||jsonb_build_object('inventory_unit_id',piece_unit,'quantity',(item->>'quantity')::numeric*10,'base_quantity',(item->>'quantity')::numeric*10,'unit_price',10,'tax_inclusive_unit_price',10)) from jsonb_array_elements(finance->'lines') item)));
 if jsonb_array_length(finance->'lines')<>2 or (finance->>'total_amount')::numeric<>1000 then raise exception 'Same-source cross-unit invoice did not split across both estimates';end if;
 perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'submit');perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'approve');
 blocked:=false;begin perform public.wms_push_purchase_payables_secure('financial',jsonb_build_array(jsonb_build_object('document_id',receipt_id)));exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Source quantity limit ignored cross-unit financial quantities';end if;
 blocked:=false;begin perform public.wms_push_purchase_payables_secure('estimated',jsonb_build_array(jsonb_build_object('document_id',receipt_id)));exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Estimate-after-invoice duplicated cross-unit liability';end if;
 if (select -sum(line.quantity) from public.fms_purchase_payable_line line join public.fms_purchase_payable_document document on document.id=line.document_id where document.reversal_source_id=(finance->>'id')::uuid)<>10 then raise exception 'Same-source reversal used financial raw quantity instead of original units';end if;
 select id into foreign_unit from public.mdm_unit_of_measure where tenant_id<>material.tenant_id limit 1;
 if foreign_unit is not null then
  blocked:=false;begin perform public.fms_save_purchase_payable_secure(jsonb_set(payload,'{lines,0,base_unit_id}',to_jsonb(foreign_unit)));exception when check_violation then blocked:=true;end;
  if not blocked then raise exception 'Foreign-tenant basic unit accepted';end if;
 end if;
 if has_function_privilege('anon','app_private.payable_quantity_in_unit(numeric,jsonb,numeric,jsonb)','execute') or has_function_privilege('authenticated','app_private.payable_quantity_in_unit(numeric,jsonb,numeric,jsonb)','execute') then raise exception 'Private unit normalizer exposed to clients';end if;
 decimal_units:=jsonb_build_object('base_unit_id',piece_unit,'unit_conversions',jsonb_build_array(jsonb_build_object('source_unit_id',box_unit,'source_factor',0.2,'base_factor',0.3),jsonb_build_object('source_unit_id',decimal_unit,'source_factor',0.4,'base_factor',0.8)));
 if app_private.convert_material_quantity(decimal_units,0.000001,box_unit,piece_unit)<>0.000002 or app_private.convert_material_quantity(decimal_units,0.000002,box_unit,decimal_unit)<>0.000002 then raise exception 'Decimal factor conversion did not round half-up at six decimal places';end if;
end $test$;

rollback;
