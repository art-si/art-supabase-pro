-- Ordinary tenant: dedicated outbound source and two assets; all changes roll back.
begin;
do $test$
declare actor uuid; h public.wms_sales_document%rowtype; b public.wms_inventory_batch%rowtype;
 l jsonb; d uuid; ids jsonb; asset uuid; aset uuid; category uuid;
begin
 select auth_user_id into strict actor from sys_user where id='93f2f1e8-a3dc-4f5a-999b-6c8c02d0c7e9';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 perform set_config('request.headers','{}',true);
 if app_private.is_platform_super() then raise exception 'Expected ordinary tenant'; end if;
 select * into strict b from wms_inventory_batch where id='afe16e97-8462-4d7f-805d-6fe8430b4c18';
 select * into strict h from wms_sales_document where tenant_id=b.tenant_id and kind='other_outbound' and status='approved' limit 1;
 select to_jsonb(x) into strict l from wms_sales_document_line x where document_id=h.id order by line_no limit 1;
 l:=(l-'id'-'document_id')||jsonb_build_object('material_id',b.material_id,'quantity',1,'base_quantity',1,
 'inventory_unit_id',b.display_unit_id,'base_unit_id',b.display_unit_id,'warehouse_id',b.warehouse_id,'bin_id',b.bin_id,
 'batch_no',b.batch_no,'stock_batch_id',b.id,'project_id',b.project_id,'construction_no',b.construction_no,
 'stock_type',b.stock_type,'stock_status','available','owner_type',b.owner_type,'owner_id',b.owner_id,
 'source_document_id',null,'source_line_id',null,'source_document',null,'source_line_no',null,
 'unit_price',10,'tax_rate',13,'price_basis','untaxed','discount_method','none','unit_discount_rate',0,'gift',false,'serial_nos','[]'::jsonb);
 d:=wms_save_sales_document_secure((to_jsonb(h)-'id')||jsonb_build_object('warehouse_id',b.warehouse_id,
 'organization_id',b.organization_id,'remark','QA 独立两条转固来源回滚验证',
 'lines',jsonb_build_array(l||jsonb_build_object('line_no',10),l||jsonb_build_object('line_no',20))));
 perform wms_change_sales_document_status_secure(d,'submit');
 perform wms_change_sales_document_status_secure(d,'approve');
 select a.id,c.id into strict aset,category from fms_account_set a join fms_asset_category c on c.account_set_id=a.id
 where a.tenant_id=b.tenant_id and a.status='active' and c.is_enabled order by c.category_code limit 1;
 ids:=wms_push_other_asset_secure(aset,category,current_date,jsonb_build_array(jsonb_build_object('document_id',d,'line_ids',null)));
 if jsonb_array_length(ids)<>2 then raise exception 'Expected two assets'; end if;
 for asset in select value::uuid from jsonb_array_elements_text(ids) loop
  if not exists(select 1 from fms_fixed_asset where id=asset and original_value=10 and status='draft' and source_id=d)
   then raise exception 'Asset source or amount mismatch'; end if;
  perform act_fms_fixed_asset_secure(asset,'activate');
  perform act_fms_fixed_asset_secure(asset,'suspend');
  perform act_fms_fixed_asset_secure(asset,'resume');
  if not exists(select 1 from fms_fixed_asset where id=asset and status='active') then raise exception 'Lifecycle failed'; end if;
 end loop;
 -- Approval posts the two source lines; capitalization must not deduct them again.
 if (select quantity from wms_inventory_batch where id=b.id)<>b.quantity-2 then raise exception 'Approval or capitalization stock quantity incorrect'; end if;
end $test$;
rollback;
