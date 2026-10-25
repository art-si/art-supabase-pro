begin;

do $test$
declare
 actor uuid;ordinary uuid;parent public.scm_purchase_document;selected_contract_id uuid;first_contract uuid;second_contract uuid;foreign_contract uuid;selected_contract_no text;material uuid;unit_id uuid;estimated_type uuid;
 estimate jsonb;finance jsonb;payload jsonb;options jsonb;first_estimate_no text;blocked boolean;index_value integer;fixture_role_id uuid;fixture_role_code text:='AP_CONTRACT_'||left(gen_random_uuid()::text,8);
begin
 select auth_user_id into actor from public.sys_user where user_roles @>array['R_SUPER'] and auth_user_id is not null limit 1;
 select document.* into parent from public.scm_purchase_document document where document.kind='purchase_order' and document.status in('approved','completed') and document.supplier_id is not null and exists(select 1 from public.mdm_material where tenant_id=document.tenant_id and inventory_unit_id is not null) and exists(select 1 from public.sys_user where tenant_id=document.tenant_id and auth_user_id is not null and status='1') limit 1;
 if actor is null or parent.id is null then raise exception 'Missing purchase contract reference fixtures';end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers','{}',true);
 select id,inventory_unit_id into material,unit_id from public.mdm_material where tenant_id=parent.tenant_id and inventory_unit_id is not null limit 1;
 select id into estimated_type from public.mdm_document_type where tenant_id=parent.tenant_id and document_type_code='AP_EST_OTHER';
 for index_value in 1..2 loop
  selected_contract_no:=fixture_role_code||'_'||index_value;
  insert into public.scm_purchase_document(tenant_id,kind,document_no,supplier_id,project_id,document_date,lines,created_by_user_id)
  values(parent.tenant_id,'purchase_contract',selected_contract_no,parent.supplier_id,parent.project_id,current_date,(select jsonb_agg(line||jsonb_build_object('unit_price',round((line->>'unit_price')::numeric,2))) from jsonb_array_elements(parent.lines) line),parent.created_by_user_id) returning id,document_no into selected_contract_id,selected_contract_no;
  if index_value=1 then first_contract:=selected_contract_id;else second_contract:=selected_contract_id;end if;
  payload:=jsonb_build_object('kind','estimated','tenant_id',parent.tenant_id,'document_type_id',estimated_type,'supplier_id',parent.supplier_id,'business_date',current_date,'input_tax_inclusive_price',false,'lines',jsonb_build_array(jsonb_build_object('material_id',material,'inventory_unit_id',unit_id,'quantity',1,'unit_price',index_value*10,'tax_rate',0,'contract_id',selected_contract_id,'contract_no','不得信任的客户端编号')));
  estimate:=public.fms_save_purchase_payable_secure(payload);
  if estimate->'lines'->0->>'contract_id' is distinct from selected_contract_id::text or estimate->'lines'->0->>'contract_no' is distinct from selected_contract_no or not exists(select 1 from public.fms_purchase_payable_line payable_line where payable_line.id=(estimate->'lines'->0->>'id')::uuid and payable_line.contract_id=selected_contract_id) then raise exception 'Payable contract projection or authoritative number missing: %',jsonb_build_object('actual_id',estimate->'lines'->0->'contract_id','actual_no',estimate->'lines'->0->'contract_no','expected_id',selected_contract_id,'expected_no',selected_contract_no,'stored',(select jsonb_build_object('id',payable_line.contract_id,'number',payable_line.line_snapshot->'contract_no') from public.fms_purchase_payable_line payable_line where payable_line.id=(estimate->'lines'->0->>'id')::uuid));end if;
  if index_value=1 then first_estimate_no:=estimate->>'document_no';end if;
  perform public.fms_act_purchase_payable_secure(array[(estimate->>'id')::uuid],'submit');perform public.fms_act_purchase_payable_secure(array[(estimate->>'id')::uuid],'approve');
  finance:=public.fms_push_estimated_payable_secure((estimate->>'id')::uuid);
  if finance->'lines'->0->>'contract_id'<>selected_contract_id::text or finance->'lines'->0->>'contract_no'<>selected_contract_no then raise exception 'Financial payable push dropped the estimated contract';end if;
  perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'submit');perform public.fms_act_purchase_payable_secure(array[(finance->>'id')::uuid],'approve');
 end loop;
 options:=public.fms_payable_options_secure('contract',parent.tenant_id);
 if not exists(select 1 from jsonb_array_elements(options) item where item->>'id'=first_contract::text) or not exists(select 1 from jsonb_array_elements(options) item where item->>'id'=second_contract::text) or exists(select 1 from jsonb_array_elements(options) item join public.scm_purchase_document document on document.id=(item->>'id')::uuid where document.tenant_id<>parent.tenant_id or document.kind<>'purchase_contract') then raise exception 'Contract query did not retain source type and tenant scope';end if;
 if not exists(select 1 from public.get_record_delete_dependency_details('scm_purchase_document',array[first_contract::text],null) dependency where dependency.source_table='fms_purchase_payable_document' and dependency.record_no=first_estimate_no and dependency.record_status='approved') then raise exception 'Contract deletion guard did not identify the payable document';end if;
 blocked:=false;begin delete from public.scm_purchase_document where id=first_contract;exception when foreign_key_violation then blocked:=true;end;
 if not blocked then raise exception 'Referenced procurement contract could be deleted';end if;
 payload:=jsonb_set(payload,'{lines,0,contract_id}',to_jsonb(parent.id));
 blocked:=false;begin perform public.fms_save_purchase_payable_secure(payload);exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Purchase order accepted as a contract reference';end if;
 select id into foreign_contract from public.scm_purchase_document where kind='purchase_contract' and tenant_id<>parent.tenant_id limit 1;
 if foreign_contract is not null then
  blocked:=false;begin perform public.fms_save_purchase_payable_secure(jsonb_set(payload,'{lines,0,contract_id}',to_jsonb(foreign_contract)));exception when check_violation then blocked:=true;end;
  if not blocked then raise exception 'Foreign-tenant contract reference accepted';end if;
 end if;
 select auth_user_id into ordinary from public.sys_user where tenant_id=parent.tenant_id and auth_user_id is not null and status='1' and not user_roles @>array['R_SUPER'] limit 1;
 if ordinary is null then raise exception 'Missing ordinary payable contract actor';end if;
 insert into public.sys_role(role_code,role_name,tenant_id,enabled) values(fixture_role_code,'合同引用回滚验收角色',parent.tenant_id,true) returning id into fixture_role_id;
 insert into public.sys_role_menu(role_id,menu_id,tenant_id) select fixture_role_id,id,parent.tenant_id from public.sys_menu where name in('FinanceEstimatedPayable:View','FinanceEstimatedPayable:Add','FinanceEstimatedPayable:Edit','FinanceEstimatedPayable:Submit','FinanceEstimatedPayable:Approve','FinanceEstimatedPayable:Push','FinancePurchasePayable:View','FinancePurchasePayable:Add','FinancePurchasePayable:Edit');
 update public.sys_user set user_roles=array[fixture_role_code] where auth_user_id=ordinary;
 perform set_config('request.jwt.claim.sub',ordinary::text,true);
 if jsonb_array_length(public.fms_payable_options_secure('contract',parent.tenant_id))<>0 then raise exception 'Contract choices ignored source View permission';end if;
 payload:=jsonb_set(payload,'{lines,0,contract_id}',to_jsonb(first_contract));
 blocked:=false;begin perform public.fms_save_purchase_payable_secure(payload);exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'New contract association ignored source View permission';end if;
 insert into public.sys_role_menu(role_id,menu_id,tenant_id) select fixture_role_id,id,parent.tenant_id from public.sys_menu where name='ScmPurchaseContract:View';
 estimate:=public.fms_save_purchase_payable_secure(payload);
 perform public.fms_act_purchase_payable_secure(array[(estimate->>'id')::uuid],'submit');perform public.fms_act_purchase_payable_secure(array[(estimate->>'id')::uuid],'approve');
 delete from public.sys_role_menu where sys_role_menu.role_id=fixture_role_id and menu_id=(select id from public.sys_menu where name='ScmPurchaseContract:View');
 finance:=public.fms_push_estimated_payable_secure((estimate->>'id')::uuid);
 finance:=public.fms_save_purchase_payable_secure(finance||jsonb_build_object('remark','已有来源合同允许继续携带'));
 if finance->'lines'->0->>'contract_id'<>first_contract::text then raise exception 'Existing source contract inheritance required unrelated master permission';end if;
 blocked:=false;begin perform public.fms_save_purchase_payable_secure(jsonb_set(finance,'{lines,0,contract_id}',to_jsonb(second_contract)));exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Replacing inherited contract ignored source View permission';end if;
end $test$;

rollback;
