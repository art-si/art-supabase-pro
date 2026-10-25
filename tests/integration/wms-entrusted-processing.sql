-- Empty construction numbers must survive the full inventory posting lifecycle.
begin;
do $test$
declare u uuid; d public.wms_purchase_document%rowtype; l jsonb; p jsonb; v_document_id uuid; bid uuid; i integer;
begin
 select x.auth_user_id into strict u from public.sys_user x join public.sys_role r on r.tenant_id=x.tenant_id and r.role_code=any(x.user_roles)
 where r.builtin_type='platform_super' and x.system_protected and x.status='1' limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 perform set_config('request.headers','{}',true);
 select * into strict d from public.wms_purchase_document where kind='purchase_inbound' and status='approved' limit 1;
 select to_jsonb(x) into strict l from public.wms_purchase_document_line x join public.mdm_material m on m.id=x.material_id where x.document_id=d.id and not m.serial_management_enabled limit 1;
 l:=l||jsonb_build_object('quantity',2,'project_id','4cf56c0b-8350-4be5-876d-dcd70bc2e589','construction_no',null,'source_order_target_line_id',null,'source_batch_id',null,'source_document',null,'source_line_no',null,'owner_type','customer','owner_id','4d8f2093-aeb0-4866-83d1-935fa5af33a6','serial_nos','[]'::jsonb);
 p:=(to_jsonb(d)-'id')||jsonb_build_object('kind','entrusted_processing_inbound','document_type_id','346be9a0-2a65-4f45-ac24-c955640e4114','business_type_id','d6b3aba1-781e-464b-98c1-50bf5bb36ae3','customer_id','4d8f2093-aeb0-4866-83d1-935fa5af33a6','warehouse_id',l->'warehouse_id','business_date',current_date);
 for i in 1..2 loop
  v_document_id:=public.wms_save_purchase_document_secure(p||jsonb_build_object('lines',jsonb_build_array(l||jsonb_build_object('batch_no','QA-ENTRUSTED-'||gen_random_uuid()))));
  perform public.wms_change_purchase_document_status_secure(v_document_id,'submit');
  perform public.wms_change_purchase_document_status_secure(v_document_id,'approve');
  select b.id into strict bid from public.wms_inventory_batch b join public.wms_purchase_document_line x on x.id=b.source_purchase_line_id where x.document_id=v_document_id and b.construction_no is null;
  if (select quantity from public.wms_inventory_batch where id=bid)<>2 then raise exception 'entrusted inbound stock missing'; end if;
  v_document_id:=public.wms_save_purchase_document_secure(p||jsonb_build_object('kind','entrusted_processing_return','document_type_id','84635c85-685c-477f-9cf1-142e1951ca08','business_type_id','045b4c57-d005-4e92-8050-7814628752e1','lines',jsonb_build_array(l||jsonb_build_object('quantity',1,'source_batch_id',bid))));
  perform public.wms_change_purchase_document_status_secure(v_document_id,'submit');
  perform public.wms_change_purchase_document_status_secure(v_document_id,'approve');
  if (select quantity from public.wms_inventory_batch where id=bid)<>1 then raise exception 'entrusted return stock not deducted'; end if;
 end loop;
 -- A serial-managed material uses the same optional construction scope.
 update public.mdm_supply_chain_code_rule set apply_serial=true where id='8a018dfe-8314-4922-996c-79cb96454a63';
 update public.mdm_warehouse_bin set supports_serial=true where id=(l->>'bin_id')::uuid;
 update public.mdm_material set serial_management_enabled=true,serial_rule_id='8a018dfe-8314-4922-996c-79cb96454a63',serial_generation_timing='inbound' where id=(l->>'material_id')::uuid;
 l:=l||jsonb_build_object('inventory_unit_id',l->'base_unit_id','serial_nos',jsonb_build_array('QA-SN-'||gen_random_uuid(),'QA-SN-'||gen_random_uuid()));
 v_document_id:=public.wms_save_purchase_document_secure(p||jsonb_build_object('lines',jsonb_build_array(l||jsonb_build_object('batch_no','QA-SN-BATCH-'||gen_random_uuid()))));
 perform public.wms_change_purchase_document_status_secure(v_document_id,'submit');
 perform public.wms_change_purchase_document_status_secure(v_document_id,'approve');
 select b.id into strict bid from public.wms_inventory_batch b join public.wms_purchase_document_line x on x.id=b.source_purchase_line_id where x.document_id=v_document_id;
 if (select count(*) from public.wms_serial_number where batch_id=bid and construction_no is null and status='in_stock')<>2 then raise exception 'empty construction serial stock missing'; end if;
 v_document_id:=public.wms_save_purchase_document_secure(p||jsonb_build_object('kind','entrusted_processing_return','document_type_id','84635c85-685c-477f-9cf1-142e1951ca08','business_type_id','045b4c57-d005-4e92-8050-7814628752e1','lines',jsonb_build_array(l||jsonb_build_object('quantity',1,'source_batch_id',bid,'serial_nos',jsonb_build_array(l->'serial_nos'->0)))));
 perform public.wms_change_purchase_document_status_secure(v_document_id,'submit');
 perform public.wms_change_purchase_document_status_secure(v_document_id,'approve');
 if (select count(*) from public.wms_serial_number where batch_id=bid and status='out')<>1 then raise exception 'serial return stock not deducted'; end if;
 begin
  perform public.wms_save_purchase_document_secure(p||jsonb_build_object('kind','entrusted_processing_return','warehouse_id',null,'lines',jsonb_build_array(l)));
  raise exception 'missing return warehouse accepted';
 exception when check_violation then null; end;
 begin
  perform public.wms_save_purchase_document_secure(p||jsonb_build_object('kind','entrusted_processing_return','lines',jsonb_build_array(l,l)));
  raise exception 'duplicate return material accepted';
 exception when check_violation then null; end;
end $test$;
rollback;
