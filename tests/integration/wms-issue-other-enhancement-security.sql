-- Fixtures, workflow mutations, and permission changes are rolled back.
begin;
do $test$
declare super_id uuid;d public.wms_sales_document%rowtype; l jsonb; req uuid;reqline uuid;reqtype uuid;reqbiz uuid;wh uuid;
 outid uuid;out2 uuid;returnid uuid;rt uuid;rb uuid;payload jsonb; result jsonb; other uuid;aset uuid;cat uuid;assetdoc uuid;asset_id uuid;project_id uuid;project_req uuid;pricing_req uuid;stock record;stock_line jsonb;stock_req uuid;u public.sys_user%rowtype;role_row public.sys_role%rowtype;
begin
 select x.auth_user_id into strict super_id from public.sys_user x join public.sys_role s on s.tenant_id=x.tenant_id and s.role_code=any(x.user_roles) where s.builtin_type='platform_super' and x.system_protected and x.status='1' limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',super_id,'role','authenticated')::text,true);
 perform set_config('request.headers','{}',true);
 select * into strict d from public.wms_sales_document where kind='other_outbound' and status='approved' and tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9' limit 1;
 select to_jsonb(x),x.warehouse_id into strict l,wh from public.wms_sales_document_line x join public.mdm_material m on m.id=x.material_id where x.document_id=d.id and not m.serial_management_enabled limit 1;
 update public.mdm_warehouse set business_scopes=array_append(business_scopes,'picking') where id=wh and not business_scopes @> array['picking'];
 select id into strict reqtype from public.mdm_document_type where tenant_id=d.tenant_id and document_type_name='标准出库申请单' and enabled limit 1;
 select id into strict reqbiz from public.mdm_business_type where tenant_id=d.tenant_id and reqtype=any(document_type_ids) and enabled limit 1;
 l:=l||jsonb_build_object('quantity',4,'unit_price',100,'tax_rate',13,'price_basis','untaxed','discount_method','none','gift',false,'stock_batch_id',null,'source_document_id',null,'source_line_id',null,'project_id',null,'construction_no',null,'batch_no',null,'bin_id',null,'serial_nos','[]'::jsonb);
 select b.id,b.material_id,b.bin_id,b.stock_type,b.owner_type,b.owner_id,b.quantity,m.inventory_unit_id,m.base_unit_id into strict stock from public.wms_inventory_batch b join public.mdm_material m on m.id=b.material_id and m.tenant_id=b.tenant_id where b.warehouse_id=wh and b.tenant_id=d.tenant_id and b.project_id is null and nullif(btrim(b.batch_no),'') is null and b.quantity>=10 and b.status in ('normal','available') and not m.serial_management_enabled and m.inventory_unit_id is not null and m.base_unit_id is not null limit 1;
 stock_line:=l||jsonb_build_object('quantity',1,'stock_batch_id',stock.id,'material_id',stock.material_id,'bin_id',stock.bin_id,'batch_no','','inventory_unit_id',stock.inventory_unit_id,'base_unit_id',stock.base_unit_id,'stock_type',stock.stock_type,'owner_type',stock.owner_type,'owner_id',stock.owner_id);
 stock_req:=public.wms_create_issue_request_secure(jsonb_build_object('organization_id',d.organization_id,'document_type_id',reqtype,'business_type_id',reqbiz,'warehouse_id',wh,'request_type','consumables_outbound','lines',jsonb_build_array(stock_line)));
 if not exists(select 1 from public.wms_issue_request_line where request_id=stock_req and stock_batch_id=stock.id) then raise exception 'empty stock batch rejected by request';end if;
 perform public.wms_save_sales_document_secure((to_jsonb(d)-'id')||jsonb_build_object('kind','other_outbound','warehouse_id',wh,'using_department_id',d.organization_id,'customer_id',null,'lines',jsonb_build_array(stock_line)));
 begin perform public.wms_create_issue_request_secure(jsonb_build_object('organization_id',d.organization_id,'document_type_id',reqtype,'business_type_id',reqbiz,'warehouse_id',wh,'request_type','consumables_outbound','lines',jsonb_build_array(stock_line||jsonb_build_object('batch_no','forged-batch'))));raise exception 'mismatched stock batch allowed';exception when check_violation then null;end;
 l:=l||jsonb_build_object('material_id',stock.material_id,'inventory_unit_id',stock.inventory_unit_id,'base_unit_id',stock.base_unit_id);
 req:=public.wms_create_issue_request_secure(jsonb_build_object('organization_id',d.organization_id,'document_type_id',reqtype,'business_type_id',reqbiz,'warehouse_id',wh,'request_type','consumables_outbound','using_department_id',d.organization_id,'lines',jsonb_build_array(l,l||jsonb_build_object('gift',true))));
 if (select work_order_id from public.wms_issue_request where id=req) is not null or (select count(*) from public.wms_issue_request_line where request_id=req)<>2 then raise exception 'optional work order or duplicate material lines failed';end if;
 if (select array_agg(line_no order by line_no) from public.wms_issue_request_line where request_id=req)<>array[10,20] then raise exception 'line numbering failed';end if;
 if (select (details->>'amount')::numeric from public.wms_issue_request_line where request_id=req and line_no=20)<>0 then raise exception 'gift pricing failed';end if;
 if not exists(select 1 from public.wms_issue_request_line where request_id=req and line_no=10
  and (details->>'unit_price')::numeric=100 and (details->>'tax_inclusive_unit_price')::numeric=113
  and (details->>'amount')::numeric=400 and (details->>'tax_amount')::numeric=52 and (details->>'total_amount')::numeric=452) then raise exception 'untaxed price conversion/formula failed';end if;
 if not exists(select 1 from public.wms_issue_request_line where request_id=req and line_no=20
  and (details->>'tax_amount')::numeric=0 and (details->>'total_amount')::numeric=0) then raise exception 'gift tax/total failed';end if;
 pricing_req:=public.wms_create_issue_request_secure(jsonb_build_object('organization_id',d.organization_id,'document_type_id',reqtype,'business_type_id',reqbiz,'warehouse_id',wh,'request_type','consumables_outbound','using_department_id',d.organization_id,
  'lines',jsonb_build_array(l||jsonb_build_object('price_basis','taxed','tax_inclusive_unit_price',113),l||jsonb_build_object('discount_method','rate','unit_discount_rate',0.1))));
 if not exists(select 1 from public.wms_issue_request_line where request_id=pricing_req and line_no=10
  and (details->>'unit_price')::numeric=100 and (details->>'tax_inclusive_unit_price')::numeric=113
  and (details->>'amount')::numeric=400 and (details->>'tax_amount')::numeric=52 and (details->>'total_amount')::numeric=452) then raise exception 'tax inclusive reverse conversion/formula failed';end if;
 if not exists(select 1 from public.wms_issue_request_line where request_id=pricing_req and line_no=20
  and (details->>'discount_amount')::numeric=45.2 and (details->>'amount')::numeric=354.8
  and (details->>'tax_amount')::numeric=52 and (details->>'total_amount')::numeric=406.8) then raise exception 'discount formula failed';end if;
 perform public.wms_submit_issue_request_secure(req);
 perform public.wms_review_issue_request_secure(req,'approve');
 select id into strict project_id from public.mdm_project where tenant_id=d.tenant_id and enabled limit 1;
 project_req:=public.wms_create_issue_request_secure(jsonb_build_object('organization_id',d.organization_id,'document_type_id',reqtype,'business_type_id',reqbiz,'warehouse_id',wh,'request_type','consumables_outbound','using_department_id',d.organization_id,'project_id',project_id,'construction_no',null,'lines',jsonb_build_array(l||jsonb_build_object('project_id',project_id,'construction_no',null))));
 perform public.wms_submit_issue_request_secure(project_req);
 perform public.wms_review_issue_request_secure(project_req,'approve');
 if not exists(select 1 from public.wms_issue_request where id=project_req and status='approved' and wms_issue_request.project_id is not null and construction_no is null) then raise exception 'optional construction number blocked approval';end if;
 l:=stock_line||jsonb_build_object('quantity',4);
 select id into strict reqline from public.wms_issue_request_line where request_id=req and line_no=10;
 result:=public.wms_issue_request_lines_secure(array[req]);
 if jsonb_array_length(result)<>2 then raise exception 'request line reader failed';end if;
 perform public.wms_sales_choices_secure('request_stock',d.tenant_id,d.organization_id,wh);
 perform public.wms_sales_choices_secure('other_stock',d.tenant_id,d.organization_id,wh);
 result:=public.wms_sales_choices_secure('issue_request',d.tenant_id,d.organization_id,wh);
 if not exists(select 1 from jsonb_array_elements(result->'data') x where x->>'source_document_id'=req::text) then raise exception 'source request missing';end if;
 payload:=to_jsonb(d)||jsonb_build_object('id',null,'customer_id',null,'using_department_id',d.organization_id,'project_id',null,'warehouse_id',wh,'lines',jsonb_build_array(l||jsonb_build_object('quantity',1,'source_document_id',req,'source_line_id',reqline::text)));
 outid:=public.wms_save_sales_document_secure(payload);
 result:=public.wms_issue_request_lines_secure(array[req]);
 if not exists(select 1 from jsonb_array_elements(result) x where x->>'id'=reqline::text and (x->>'issued_quantity')::numeric=1) then raise exception 'partial source consumption missing';end if;
 begin perform public.wms_save_sales_document_secure(payload||jsonb_build_object('lines',jsonb_build_array(l||jsonb_build_object('quantity',4,'source_document_id',req,'source_line_id',reqline::text))));raise exception 'over-issue allowed';exception when check_violation then null;end;
 out2:=public.wms_save_sales_document_secure(payload||jsonb_build_object('using_department_id',null));
 begin perform public.wms_change_sales_document_status_secure(out2,'submit');raise exception 'empty department/customer submission allowed';exception when check_violation then null;end;
 perform public.wms_change_sales_document_status_secure(outid,'submit');
 perform public.wms_change_sales_document_status_secure(outid,'approve');
 if (select quantity from public.wms_inventory_batch where id=stock.id)<>stock.quantity-1 then raise exception 'Request-sourced outbound did not post stock'; end if;
 select id into strict rt from public.mdm_document_type where tenant_id=d.tenant_id and document_type_name='标准其他出库退回单' and enabled limit 1;
 select id into strict rb from public.mdm_business_type where tenant_id=d.tenant_id and rt=any(document_type_ids) and enabled limit 1;
 select id into strict reqline from public.wms_sales_document_line where document_id=outid;
 returnid:=public.wms_save_sales_document_secure(payload||jsonb_build_object('kind','other_return','document_type_id',rt,'business_type_id',rb,'lines',jsonb_build_array(l||jsonb_build_object('quantity',0.5,'source_document_id',outid,'source_line_id',reqline::text))));
 if not exists(select 1 from public.wms_sales_document_line where document_id=returnid and quantity=-0.5 and base_quantity<0 and amount=-50 and tax_amount=-6.5 and total_amount=-56.5 and source_kind='other_outbound') then raise exception 'other return signs/formula failed';end if;
 begin perform public.wms_save_sales_document_secure(payload||jsonb_build_object('kind','other_return','document_type_id',rt,'business_type_id',rb,'lines',jsonb_build_array(l||jsonb_build_object('quantity',1,'source_document_id',outid,'source_line_id',reqline::text))));raise exception 'over-return allowed';exception when check_violation then null;end;
 perform public.wms_change_sales_document_status_secure(returnid,'submit');
 perform public.wms_change_sales_document_status_secure(returnid,'approve');
 if (select quantity from public.wms_inventory_batch where id=stock.id)<>stock.quantity-0.5 then raise exception 'Partial other return did not restore stock'; end if;
 select a.id,c.id into strict aset,cat from public.fms_account_set a join public.fms_asset_category c on c.account_set_id=a.id and c.tenant_id=a.tenant_id where a.tenant_id=d.tenant_id and a.status='active' and c.is_enabled limit 1;
 assetdoc:=public.wms_save_sales_document_secure(payload||jsonb_build_object('lines',jsonb_build_array(l,l||jsonb_build_object('quantity',2))));
 perform public.wms_change_sales_document_status_secure(assetdoc,'submit');
 perform public.wms_change_sales_document_status_secure(assetdoc,'approve');
 if (select quantity from public.wms_inventory_batch where id=stock.id)<>stock.quantity-6.5 then raise exception 'Asset source approval quantity incorrect'; end if;
 result:=public.wms_push_other_asset_secure(aset,cat,current_date,jsonb_build_array(jsonb_build_object('document_id',assetdoc,'line_ids',null)));
 if jsonb_array_length(result)<>2 or (select array_agg(original_value order by original_value) from public.fms_fixed_asset where id in (select value::uuid from jsonb_array_elements_text(result)) and tenant_id=d.tenant_id and status='draft')<>array[200,400]::numeric[] then raise exception 'two asset drafts lineage/pricing failed';end if;
 begin perform public.wms_push_other_asset_secure(aset,cat,current_date,jsonb_build_array(jsonb_build_object('document_id',assetdoc,'line_ids',null)));raise exception 'duplicate capitalization allowed';exception when check_violation then null;end;
 select id into strict other from public.sys_tenant where id<>d.tenant_id limit 1;
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other)::text,true);
 begin perform public.act_fms_fixed_asset_secure((result->>0)::uuid,'activate');raise exception 'selected tenant activated foreign asset';exception when no_data_found or insufficient_privilege then null;end;
 begin perform public.act_fms_fixed_asset((result->>0)::uuid,'activate');raise exception 'direct action bypassed selected tenant';exception when no_data_found or insufficient_privilege then null;end;
 perform set_config('request.headers','{}',true);
 for asset_id in select value::uuid from jsonb_array_elements_text(result) loop
   perform public.act_fms_fixed_asset_secure(asset_id,'activate');
   if (select status from public.fms_fixed_asset where id=asset_id)<>'active' then raise exception 'generated asset activation failed';end if;
   perform public.act_fms_fixed_asset_secure(asset_id,'suspend');
   if (select status from public.fms_fixed_asset where id=asset_id)<>'suspended' then raise exception 'generated asset suspension failed';end if;
   perform public.act_fms_fixed_asset_secure(asset_id,'resume');
   if (select status from public.fms_fixed_asset where id=asset_id)<>'active' then raise exception 'generated asset resumption failed';end if;
 end loop;
 select * into strict u from public.sys_user x where x.tenant_id<>d.tenant_id and x.auth_user_id is not null and x.status='1' and x.deleted_at is null and not exists(select 1 from public.sys_role r where r.tenant_id=x.tenant_id and r.role_code=any(x.user_roles) and r.builtin_type='platform_super') limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u.auth_user_id,'role','authenticated')::text,true);
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',d.tenant_id)::text,true);
 begin perform public.act_fms_fixed_asset_secure((result->>0)::uuid,'suspend');raise exception 'forged ordinary header suspended foreign asset';exception when no_data_found or insufficient_privilege then null;end;
 begin perform public.act_fms_fixed_asset((result->>0)::uuid,'suspend');raise exception 'direct ordinary action suspended foreign asset';exception when no_data_found or insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',super_id,'role','authenticated')::text,true);
 select id into strict other from public.sys_tenant where id<>d.tenant_id limit 1;
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other)::text,true);
 begin perform public.wms_issue_request_lines_secure(array[req]);raise exception 'selected cross-tenant source read allowed';exception when insufficient_privilege then null;end;
 perform set_config('request.headers','{}',true);
 execute 'set local role authenticated';
 if not exists(select 1 from public.wms_issue_request_list where id=req and issued_quantity_total=2) then raise exception 'invoker summary consumption failed';end if;
 execute 'reset role';

 select * into strict u from public.sys_user x where x.tenant_id=d.tenant_id and x.auth_user_id is not null and x.status='1' and x.deleted_at is null and not exists(select 1 from public.sys_role r where r.tenant_id=x.tenant_id and r.role_code=any(x.user_roles) and r.builtin_type='platform_super') limit 1;
 select * into strict role_row from public.sys_role where tenant_id=d.tenant_id and enabled and builtin_type is distinct from 'platform_super' limit 1;
 insert into public.sys_role_menu(role_id,menu_id,tenant_id,create_by) select role_row.id,m.id,role_row.tenant_id,'rollback verification' from public.sys_menu m where m.name in ('WmsIssueRequest:View','WmsIssueRequest:Add','WmsIssueRequest:Push','WmsOtherOutbound:View','WmsOtherOutbound:Add','WmsOtherOutbound:Push') on conflict do nothing;
 update public.sys_user set user_roles=array[role_row.role_code] where id=u.id;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u.auth_user_id,'role','authenticated')::text,true);
 perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other)::text,true);
 perform public.wms_issue_request_lines_secure(array[req]);
 begin perform public.wms_sales_choices_secure('other_stock',other,d.organization_id,wh);raise exception 'forged ordinary header allowed cross read';exception when insufficient_privilege then null;end;
 execute 'set local role authenticated';
 if not exists(select 1 from public.wms_issue_request_list where id=req) then raise exception 'ordinary forged header hid own request';end if;
 execute 'reset role';
 perform set_config('request.jwt.claims','{}',true);
 begin perform public.wms_create_issue_request_secure('{}');raise exception 'anonymous request creation allowed';exception when insufficient_privilege then null;end;
end $test$;
rollback;
