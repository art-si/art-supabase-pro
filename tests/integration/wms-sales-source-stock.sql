-- Controlled SCM source fixtures and WMS business RPCs; all changes roll back.
begin;
do $test$
declare actor uuid; b public.wms_inventory_batch%rowtype; h public.wms_sales_document%rowtype;
 s public.scm_sales_document%rowtype; fixture_id uuid; source_line uuid; outbound_id uuid;
 choice jsonb; result jsonb; source_kind text; fixture_no text; payload jsonb; sample integer; total_posted numeric:=0;
begin
 select u.auth_user_id into strict actor from public.sys_user u join public.sys_role r on r.tenant_id=u.tenant_id and r.role_code=any(u.user_roles)
 where r.builtin_type='platform_super' and u.system_protected and u.status='1' limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 perform set_config('request.headers','{}',true);
 select * into strict b from public.wms_inventory_batch where id='afe16e97-8462-4d7f-805d-6fe8430b4c18';
 select * into strict h from public.wms_sales_document where tenant_id=b.tenant_id and kind='outbound' and status='approved' limit 1;
 foreach source_kind in array array['sales_order','shipping_notice'] loop
 for sample in 1..2 loop
  select * into strict s from public.scm_sales_document where tenant_id=b.tenant_id and kind=source_kind and document_type_id is not null limit 1;
  fixture_id:=gen_random_uuid(); source_line:=gen_random_uuid();
  insert into public.scm_sales_document select (jsonb_populate_record(null::public.scm_sales_document,to_jsonb(s)||jsonb_build_object(
   'id',fixture_id,'document_no','QA-SOURCE-'||fixture_id,'project_id',null,'source_id',null,
   'customer_id',h.customer_id,'status','draft',
   'details','{}'::jsonb,'lines',jsonb_build_array(jsonb_build_object('line_id',source_line,'line_no',10,
    'material_id',b.material_id,'material_description',(select description from public.mdm_material where id=b.material_id),
    'sales_unit',b.display_unit_id,'quantity',2,'unit_price',10,'tax_rate',13))))).*;
  -- Controlled fixture approval context; WMS posting still uses business RPCs.
  perform set_config('app.scm_sales_approval',fixture_id::text,true);
  update public.scm_sales_document set status='submitted' where id=fixture_id;
  if source_kind='sales_order' then update public.scm_sales_document set status='approved' where id=fixture_id; end if;
  select document_no into fixture_no from public.scm_sales_document where id=fixture_id;
  result:=public.wms_sales_choices_secure(source_kind,b.tenant_id,b.organization_id,b.warehouse_id,fixture_no,100,0,null);
  select x into strict choice from jsonb_array_elements(result->'data') x where x->>'source_document_id'=fixture_id::text and x->'line'->>'stock_batch_id'=b.id::text;
  if (choice->>'deliverable_quantity')::numeric<>2 or (choice->>'selection_disabled')::boolean then raise exception 'SCM source unavailable or wrong remainder'; end if;
  payload:=(to_jsonb(h)-'id')||jsonb_build_object('project_id',null,'warehouse_id',b.warehouse_id,
    'remark','QA 来源选单库存闭环回滚验证','lines',jsonb_build_array(choice->'line'||jsonb_build_object(
     'line_no',10,'quantity',1,'source_document_id',fixture_id,'source_line_id',source_line,'unit_price',10,'tax_rate',13,'price_basis','untaxed','discount_method','none','gift',false,'serial_nos','[]'::jsonb)));
  outbound_id:=public.wms_save_sales_document_secure(payload);
  perform public.wms_change_sales_document_status_secure(outbound_id,'submit');
  perform public.wms_change_sales_document_status_secure(outbound_id,'approve');
  total_posted:=total_posted+1;
  if (select quantity from public.wms_inventory_batch where id=b.id)<>b.quantity-total_posted then raise exception 'SCM source outbound did not post stock'; end if;
  result:=public.wms_sales_choices_secure(source_kind,b.tenant_id,b.organization_id,b.warehouse_id,fixture_no,100,0,null);
  if not exists(select 1 from jsonb_array_elements(result->'data') x where x->>'source_document_id'=fixture_id::text and (x->>'deliverable_quantity')::numeric=1 and (x->>'outbound_quantity')::numeric=1)
   then raise exception 'SCM partial source progress incorrect'; end if;
  begin
   perform public.wms_save_sales_document_secure(payload||jsonb_build_object('lines',jsonb_build_array(payload->'lines'->0||jsonb_build_object('quantity',2))));
   raise exception 'SCM over-shipment allowed';
  exception when check_violation then null; end;
 end loop;
 end loop;
end $test$;
rollback;
