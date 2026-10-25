-- Two ordinary-tenant sales cycles; business RPCs only, with all changes rolled back.
begin;
do $test$
declare
  actor uuid;
  platform_actor uuid;
  other_tenant uuid;
  header public.wms_sales_document%rowtype;
  return_header public.wms_sales_document%rowtype;
  batch public.wms_inventory_batch%rowtype;
  original_material public.mdm_material%rowtype;
  test_unit uuid;
  stock_quantity numeric;
  line jsonb;
  outbound_id uuid;
  return_id uuid;
  outbound_line uuid;
  invoice_ids jsonb;
  stock_choices jsonb;
  before_available numeric;
  after_available numeric;
  sample integer;
  outbound_kind text;
  return_kind text;
  sn_mode integer;
  test_sn text:= 'QA-STOCK-'||gen_random_uuid()::text;
  report jsonb;
  report_row jsonb;
  ledger_before jsonb;
  report_kind text;
begin
  select auth_user_id into strict actor from public.sys_user
    where id='93f2f1e8-a3dc-4f5a-999b-6c8c02d0c7e9';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  if app_private.is_platform_super() then raise exception 'Expected ordinary tenant actor'; end if;
  select x.auth_user_id into strict platform_actor from public.sys_user x join public.sys_role r on r.tenant_id=x.tenant_id and r.role_code=any(x.user_roles)
    where r.builtin_type='platform_super' and x.system_protected and x.status='1' limit 1;
  select * into strict batch from public.wms_inventory_batch
    where id='afe16e97-8462-4d7f-805d-6fe8430b4c18';
  select * into strict original_material from public.mdm_material where id=batch.material_id;
  select id into strict other_tenant from public.sys_tenant where id<>batch.tenant_id limit 1;
  if has_function_privilege('authenticated','app_private.wms_post_sales_document_stock(uuid)','EXECUTE')
    or has_function_privilege('anon','app_private.wms_post_sales_document_stock(uuid)','EXECUTE') then raise exception 'Private posting helper exposed'; end if;
  update public.wms_inventory_batch set area_sqm=quantity*2 where id=batch.id;
  batch.area_sqm:=batch.quantity*2;
  for sn_mode in 0..2 loop
  update public.mdm_material set serial_management_enabled=original_material.serial_management_enabled,
    serial_rule_id=original_material.serial_rule_id,serial_generation_timing=original_material.serial_generation_timing where id=batch.material_id;
  test_unit:=batch.display_unit_id;
  if sn_mode=2 then
    select (u->>'source_unit_id')::uuid into strict test_unit from jsonb_array_elements(original_material.unit_conversions) u
      where app_private.wms_sales_inventory_factor(batch.material_id,u->>'source_unit_id')=1000 limit 1;
  end if;
  stock_quantity:=app_private.wms_sales_inventory_factor(batch.material_id,test_unit::text);
  if sn_mode=1 then
    update public.mdm_warehouse_bin set supports_serial=true where id=batch.bin_id;
    update public.mdm_supply_chain_code_rule set apply_serial=true where tenant_id=batch.tenant_id and id='8a018dfe-8314-4922-996c-79cb96454a63';
    update public.mdm_material set serial_management_enabled=true,serial_rule_id='8a018dfe-8314-4922-996c-79cb96454a63',serial_generation_timing='inbound' where id=batch.material_id;
    insert into public.wms_serial_number(tenant_id,organization_id,serial_no,material_id,batch_id,status,warehouse_id,bin_id,project_id,construction_no)
    values(batch.tenant_id,batch.organization_id,test_sn,batch.material_id,batch.id,'in_stock',batch.warehouse_id,batch.bin_id,batch.project_id,batch.construction_no);
  end if;
  foreach outbound_kind in array array['outbound','other_outbound'] loop
  return_kind:=case outbound_kind when 'outbound' then 'return' else 'other_return' end;
  select * into strict header from public.wms_sales_document
    where kind=outbound_kind and status='approved' and tenant_id=batch.tenant_id limit 1;
  select * into strict return_header from public.wms_sales_document
    where kind=return_kind and tenant_id=batch.tenant_id limit 1;
  select to_jsonb(x) into strict line from public.wms_sales_document_line x
    where document_id=header.id order by line_no limit 1;
  line:=(line-'id'-'document_id')||jsonb_build_object(
    'line_no',10,'material_id',batch.material_id,'quantity',1,'base_quantity',1,
    'inventory_unit_id',test_unit,'base_unit_id',batch.display_unit_id,
    'warehouse_id',batch.warehouse_id,'bin_id',batch.bin_id,'batch_no',batch.batch_no,
    'stock_batch_id',batch.id,'project_id',batch.project_id,'construction_no',batch.construction_no,
    'stock_type',batch.stock_type,'stock_status','available','owner_type',batch.owner_type,'owner_id',batch.owner_id,
    'source_document_id',null,'source_line_id',null,'source_document',null,'source_line_no',null,
    'unit_price',10,'tax_rate',13,'price_basis','untaxed','discount_method','none','unit_discount_rate',0,
    'gift',false,'serial_nos',case when sn_mode=1 then jsonb_build_array(test_sn) else '[]'::jsonb end,'return_type',null);
  stock_choices:=public.wms_sales_choices_secure('stock',batch.tenant_id,batch.organization_id,batch.warehouse_id,null,200,0,null);
  select (x->>'available_quantity')::numeric into strict before_available from jsonb_array_elements(stock_choices->'data') x where x->>'id'=batch.id::text;
  report:=public.wms_inventory_report_secure('ledger',p_date_start=>current_date,p_date_end=>current_date,p_tenant_id=>batch.tenant_id,p_limit=>200);
  select x into strict ledger_before from jsonb_array_elements(report->'data') x where x->>'batch_id'=batch.id::text;
  for sample in 1..2 loop
    perform set_config('request.jwt.claims',jsonb_build_object('sub',case when sample=1 then platform_actor else actor end,'role','authenticated')::text,true);
    perform set_config('request.headers',case when sample=1 then '{}'::jsonb else jsonb_build_object('x-art-tenant-scope',other_tenant) end::text,true);
    outbound_id:=public.wms_save_sales_document_secure((to_jsonb(header)-'id')||jsonb_build_object(
      'organization_id',batch.organization_id,'warehouse_id',batch.warehouse_id,'business_date',current_date,
      'remark','QA 两条销售开票闭环回滚验证','lines',jsonb_build_array(line)));
    perform public.wms_change_sales_document_status_secure(outbound_id,'submit');
    perform set_config('request.jwt.claims',jsonb_build_object('sub',platform_actor,'role','authenticated')::text,true);
    perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
    begin
      perform public.wms_change_sales_document_status_secure(outbound_id,'approve');
      raise exception 'Selected cross-tenant posting allowed';
    exception when insufficient_privilege then null; end;
    if (select status from public.wms_sales_document where id=outbound_id)<>'submitted' then raise exception 'Denied posting changed status'; end if;
    perform set_config('request.jwt.claims',jsonb_build_object('sub',case when sample=1 then platform_actor else actor end,'role','authenticated')::text,true);
    perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',case when sample=1 then batch.tenant_id else other_tenant end)::text,true);
    if sample=1 then
      update public.wms_inventory_batch set quantity=0 where id=batch.id;
      begin
        perform public.wms_change_sales_document_status_secure(outbound_id,'approve');
        raise exception 'Insufficient stock approval allowed';
      exception when check_violation then null; end;
      if (select status from public.wms_sales_document where id=outbound_id)<>'submitted'
        or exists(select 1 from public.wms_inventory_movement where reference_no=(select document_no from public.wms_sales_document where id=outbound_id))
        then raise exception 'Failed approval left status or movement changes'; end if;
      update public.wms_inventory_batch set quantity=batch.quantity where id=batch.id;
    end if;
    perform public.wms_change_sales_document_status_secure(outbound_id,'approve');
    -- Match the existing purchase workflow: approval must post the stock movement.
    if (select quantity from public.wms_inventory_batch where id=batch.id)<>batch.quantity-stock_quantity
      then raise exception 'Approved sales outbound did not deduct stock'; end if;
    foreach report_kind in array array['stock','movement','ledger','receipt-issue'] loop
      report:=public.wms_inventory_report_secure(report_kind,p_date_start=>current_date,p_date_end=>current_date,p_tenant_id=>batch.tenant_id,p_limit=>200);
      select x into strict report_row from jsonb_array_elements(report->'data') x
        where x->>'batch_id'=batch.id::text and (report_kind in ('stock','ledger') or x->>'source_document_id'=outbound_id::text);
      if report_kind='stock' and (report_row->>'inventory_quantity')::numeric<>batch.quantity-stock_quantity then raise exception 'Stock report not updated'; end if;
      if report_kind='ledger' and ((report_row->>'closing_quantity')::numeric<>(ledger_before->>'closing_quantity')::numeric-stock_quantity
        or (report_row->>'outbound_quantity')::numeric<>(ledger_before->>'outbound_quantity')::numeric+stock_quantity) then raise exception 'Ledger outbound or closing not updated'; end if;
      if report_kind in ('movement','receipt-issue') and (report_row->>'direction'<>'out' or (report_row->>'outbound_quantity')::numeric<>stock_quantity
        or (report_row->>'source_line_no')::integer<>10) then raise exception 'Outbound report lineage incorrect'; end if;
    end loop;
    if (select area_sqm from public.wms_inventory_batch where id=batch.id)<>batch.area_sqm-stock_quantity*2 then raise exception 'Outbound area not deducted'; end if;
    if batch.display_quantity is not null and (select display_quantity from public.wms_inventory_batch where id=batch.id)<>
      batch.display_quantity-stock_quantity/app_private.wms_sales_inventory_factor(batch.material_id,batch.display_unit_id::text) then raise exception 'Display quantity not converted'; end if;
    if sn_mode=1 and not exists(select 1 from public.wms_serial_number where serial_no=test_sn and status='out') then raise exception 'Outbound SN not posted'; end if;
    stock_choices:=public.wms_sales_choices_secure('stock',batch.tenant_id,batch.organization_id,batch.warehouse_id,null,200,0,null);
    select (x->>'available_quantity')::numeric into strict after_available from jsonb_array_elements(stock_choices->'data') x where x->>'id'=batch.id::text;
    if after_available<>before_available-stock_quantity then raise exception 'Stock picker deducted posted allocation twice'; end if;
    if not exists(select 1 from public.wms_sales_document_line l join public.wms_inventory_movement m on m.id=l.movement_id
      where l.document_id=outbound_id and m.source_batch_id=batch.id and m.quantity=stock_quantity and m.movement_type=case outbound_kind when 'outbound' then 'sales_out' else 'other_out' end)
      then raise exception 'Outbound movement lineage missing'; end if;
    begin
      perform public.wms_change_sales_document_status_secure(outbound_id,'approve');
      raise exception 'Duplicate approval allowed';
    exception when check_violation then null; end;
    if (select quantity from public.wms_inventory_batch where id=batch.id)<>batch.quantity-stock_quantity
      then raise exception 'Duplicate approval changed stock'; end if;
    select id into strict outbound_line from public.wms_sales_document_line where document_id=outbound_id;
    return_id:=public.wms_save_sales_document_secure((to_jsonb(return_header)-'id')||jsonb_build_object(
      'organization_id',batch.organization_id,'warehouse_id',batch.warehouse_id,'customer_id',header.customer_id,
      'business_date',current_date,'remark','QA 两条红字开票闭环回滚验证',
      'lines',jsonb_build_array(line||jsonb_build_object('stock_batch_id',null,'return_type','return',
        'source_document_id',outbound_id,'source_line_id',outbound_line))));
    perform public.wms_change_sales_document_status_secure(return_id,'submit');
    perform public.wms_change_sales_document_status_secure(return_id,'approve');
    if (select quantity from public.wms_inventory_batch where id=batch.id)<>batch.quantity
      then raise exception 'Approved sales return did not restore stock'; end if;
    foreach report_kind in array array['stock','movement','ledger','receipt-issue'] loop
      report:=public.wms_inventory_report_secure(report_kind,p_date_start=>current_date,p_date_end=>current_date,p_tenant_id=>batch.tenant_id,p_limit=>200);
      select x into strict report_row from jsonb_array_elements(report->'data') x
        where x->>'batch_id'=batch.id::text and (report_kind in ('stock','ledger') or x->>'source_document_id'=return_id::text);
      if report_kind='stock' and (report_row->>'inventory_quantity')::numeric<>batch.quantity then raise exception 'Stock return report not restored'; end if;
      if report_kind='ledger' and (report_row->>'closing_quantity')::numeric<>(ledger_before->>'closing_quantity')::numeric then raise exception 'Ledger return closing not restored'; end if;
      if report_kind in ('movement','receipt-issue') and (report_row->>'direction'<>'in' or (report_row->>'inbound_quantity')::numeric<>stock_quantity) then raise exception 'Return report direction incorrect'; end if;
    end loop;
    report:=public.wms_inventory_report_secure('ledger',p_date_start=>current_date,p_date_end=>current_date,p_tenant_id=>batch.tenant_id,p_limit=>200);
    select x into strict ledger_before from jsonb_array_elements(report->'data') x where x->>'batch_id'=batch.id::text;
    if (select area_sqm from public.wms_inventory_batch where id=batch.id)<>batch.area_sqm then raise exception 'Return area not restored'; end if;
    if batch.display_quantity is not null and (select display_quantity from public.wms_inventory_batch where id=batch.id)<>batch.display_quantity then raise exception 'Display quantity not restored'; end if;
    if sn_mode=1 and not exists(select 1 from public.wms_serial_number where serial_no=test_sn and status='in_stock') then raise exception 'Return SN not restored'; end if;
    if not exists(select 1 from public.wms_sales_document_line l join public.wms_inventory_movement m on m.id=l.movement_id
      where l.document_id=return_id and m.target_batch_id=batch.id and m.quantity=stock_quantity and m.movement_type=case return_kind when 'return' then 'sales_return' else 'other_return' end)
      then raise exception 'Return movement lineage missing'; end if;
    if outbound_kind='outbound' then
    invoice_ids:=public.wms_push_sales_invoice_secure('ordinary',jsonb_build_array(
      jsonb_build_object('document_id',outbound_id,'line_ids',null)));
    if jsonb_array_length(invoice_ids)<>1 then raise exception 'Ordinary invoice not generated'; end if;
    invoice_ids:=public.wms_push_sales_invoice_secure('special',jsonb_build_array(
      jsonb_build_object('document_id',return_id,'line_ids',null)));
    if not exists(select 1 from public.wms_sales_invoice i join public.wms_sales_invoice_line l on l.document_id=i.id
      where i.id=(invoice_ids->>0)::uuid and i.red_letter and l.quantity=-1 and l.total_amount=-11.3)
      then raise exception 'Red invoice quantity or amount incorrect'; end if;
    end if;
  end loop;
  end loop;
  end loop;
  update public.mdm_material set serial_management_enabled=original_material.serial_management_enabled,
    serial_rule_id=original_material.serial_rule_id,serial_generation_timing=original_material.serial_generation_timing where id=batch.material_id;
  perform set_config('request.jwt.claims','{}',true);
  begin
    perform public.wms_change_sales_document_status_secure(outbound_id,'approve');
    raise exception 'Anonymous posting allowed';
  exception when insufficient_privilege then null; end;
  if (select quantity from public.wms_inventory_batch where id=batch.id)<>batch.quantity
    then raise exception 'Sales cycles changed final batch quantity'; end if;
end $test$;
rollback;
