begin;

do $test$
declare
 actor uuid;tenant uuid;supplier uuid;material uuid;unit_id uuid;estimate_type uuid;
 estimate jsonb;finance jsonb;estimates jsonb:='[]';finances jsonb:='[]';combined jsonb;first_line jsonb;index_value integer;source_no text;
begin
 select auth_user_id into actor from public.sys_user where user_roles @>array['R_SUPER'] and auth_user_id is not null limit 1;
 select id into tenant from public.sys_tenant where tenant_code='qa-payable-20261022';
 select id into supplier from public.mdm_supplier where tenant_id=tenant limit 1;
 select id,inventory_unit_id into material,unit_id from public.mdm_material where tenant_id=tenant and inventory_unit_id is not null limit 1;
 select id into estimate_type from public.mdm_document_type where tenant_id=tenant and document_type_code='AP_EST_OTHER';
 if material is null or estimate_type is null then raise exception 'Lineage acceptance fixtures missing';end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers','{}',true);
 for index_value in 1..2 loop
  estimate:=public.fms_save_purchase_payable_secure(jsonb_build_object('kind','estimated','tenant_id',tenant,'document_type_id',estimate_type,'supplier_id',supplier,'business_date',current_date,'lines',jsonb_build_array(jsonb_build_object('material_id',material,'inventory_unit_id',unit_id,'quantity',3,'unit_price',100,'tax_rate',13,'source_document_no','MANUAL-REFERENCE','source_line_no','999'))));
  perform public.fms_act_purchase_payable_secure(array[(estimate->>'id')::uuid],'submit');perform public.fms_act_purchase_payable_secure(array[(estimate->>'id')::uuid],'approve');
  finance:=public.fms_push_estimated_payable_secure((estimate->>'id')::uuid);
  if finance->>'source_document_no' is distinct from estimate->>'document_no' or finance->'lines'->0->>'source_document_no' is distinct from estimate->>'document_no' or finance->'lines'->0->>'source_line_no'<>'10' or finance->'estimated_sources'->0->>'id' is distinct from estimate->>'id' then raise exception 'Manual financial push lost canonical source lineage';end if;
  finance:=public.fms_save_purchase_payable_secure(finance||jsonb_build_object('source_document_no','FORGED-HEADER','lines',jsonb_build_array(finance->'lines'->0||jsonb_build_object('source_document_no','FORGED-LINE','source_line_no','777'))));
  if finance->>'source_document_no' is distinct from estimate->>'document_no' or finance->'lines'->0->>'source_document_no' is distinct from estimate->>'document_no' or finance->'lines'->0->>'source_line_no'<>'10' then raise exception 'Client replaced linked provenance';end if;
  if (finance->>'total_amount')::numeric<>339 or (finance->>'amount')::numeric<>300 then raise exception 'Read lineage changed financial amounts';end if;
  estimates:=estimates||jsonb_build_array(estimate);finances:=finances||jsonb_build_array(finance);
 end loop;
 perform public.fms_act_purchase_payable_secure(array[(finances->1->>'id')::uuid],'delete');
 first_line:=finances->0->'lines'->0;
 combined:=public.fms_save_purchase_payable_secure(finances->0||jsonb_build_object('lines',jsonb_build_array(first_line,(finances->1->'lines'->0)-'id')));
 if jsonb_array_length(combined->'estimated_sources')<>2 then raise exception 'Combined financial sources collapsed';end if;
 for index_value in 0..1 loop
  source_no:=estimates->index_value->>'document_no';
  if position(source_no in combined->>'source_document_no')=0 or not exists(select 1 from jsonb_array_elements(combined->'lines') line where line->>'source_document_no'=source_no and line->>'estimated_document_id'=estimates->index_value->>'id' and line->>'source_line_no'='10') then raise exception 'Combined canonical source mapping missing';end if;
 end loop;
 perform public.fms_act_purchase_payable_secure(array[(combined->>'id')::uuid],'submit');perform public.fms_act_purchase_payable_secure(array[(combined->>'id')::uuid],'approve');
 if (select -sum(line.total_amount) from public.fms_purchase_payable_line line join public.fms_purchase_payable_document document on document.id=line.document_id where document.reversal_source_id=(combined->>'id')::uuid)<>678 then raise exception 'Lineage broke original-price reversal';end if;
end $test$;

rollback;
