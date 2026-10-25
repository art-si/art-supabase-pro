-- Approval, refund-only, historical sources and report RLS; all writes roll back.
begin;
do $test$
declare
 actor uuid; ordinary uuid; other uuid;
 b public.wms_inventory_batch%rowtype; h public.wms_sales_document%rowtype;
 ret public.wms_sales_document%rowtype; l jsonb; payload jsonb;
 outbound uuid; historic uuid; line_id uuid; refund uuid; failed uuid; report jsonb; report_kind text;
begin
 select u.auth_user_id into strict actor from public.sys_user u join public.sys_role r
 on r.tenant_id=u.tenant_id and r.role_code=any(u.user_roles)
 where r.builtin_type='platform_super' and u.system_protected and u.status='1' limit 1;
 select auth_user_id into strict ordinary from public.sys_user where id='93f2f1e8-a3dc-4f5a-999b-6c8c02d0c7e9';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 perform set_config('request.headers','{}',true);
 select * into strict b from public.wms_inventory_batch where id='afe16e97-8462-4d7f-805d-6fe8430b4c18';
 select id into strict other from public.sys_tenant where id<>b.tenant_id limit 1;
 select * into strict h from public.wms_sales_document where kind='outbound' and status='approved' and tenant_id=b.tenant_id limit 1;
 select * into strict ret from public.wms_sales_document where kind='return' and tenant_id=b.tenant_id limit 1;
 insert into public.wms_inventory_batch select (jsonb_populate_record(null::public.wms_inventory_batch,
 to_jsonb(b)||jsonb_build_object('id',gen_random_uuid(),'initial_purchase_line_id',null,'source_purchase_line_id',null))).*
 returning * into b;
 select to_jsonb(x) into strict l from public.wms_sales_document_line x where document_id=h.id order by line_no limit 1;
 l:=(l-'id'-'document_id')||jsonb_build_object('quantity',1,'material_id',b.material_id,
 'inventory_unit_id',b.display_unit_id,'base_unit_id',b.display_unit_id,'warehouse_id',b.warehouse_id,
 'bin_id',b.bin_id,'batch_no',b.batch_no,'stock_batch_id',b.id,'project_id',b.project_id,'construction_no',b.construction_no,
 'stock_type',b.stock_type,'stock_status','available','owner_type',b.owner_type,'owner_id',b.owner_id,
 'source_document_id',null,'source_line_id',null,'return_type',null,'serial_nos','[]'::jsonb);
 payload:=(to_jsonb(h)-'id')||jsonb_build_object('warehouse_id',b.warehouse_id,'business_date',current_date,'lines',jsonb_build_array(l,l));
 failed:=public.wms_save_sales_document_secure(payload);
 perform public.wms_change_sales_document_status_secure(failed,'submit');
 -- First line posts inside the subtransaction; second line fails, reverting both.
 update public.wms_inventory_batch set quantity=1 where id=b.id;
 begin
  perform public.wms_change_sales_document_status_secure(failed,'approve');
  raise exception 'Multi-line insufficient approval allowed';
 exception when check_violation then null; end;
 if (select quantity from public.wms_inventory_batch where id=b.id)<>1
 or (select status from public.wms_sales_document where id=failed)<>'submitted'
 or exists(select 1 from public.wms_sales_document_line where document_id=failed and movement_id is not null)
 then raise exception 'Multi-line failure did not roll back atomically'; end if;
 update public.wms_inventory_batch set quantity=b.quantity where id=b.id;
 perform public.wms_change_sales_document_status_secure(failed,'withdraw');
 perform public.wms_change_sales_document_status_secure(failed,'delete');
 outbound:=public.wms_save_sales_document_secure(payload||jsonb_build_object('lines',jsonb_build_array(l)));
 perform public.wms_change_sales_document_status_secure(outbound,'submit');
 perform public.wms_change_sales_document_status_secure(outbound,'approve');
 select id into strict line_id from public.wms_sales_document_line where document_id=outbound;
 refund:=public.wms_save_sales_document_secure((to_jsonb(ret)-'id')||jsonb_build_object('business_date',current_date,
 'warehouse_id',b.warehouse_id,'customer_id',h.customer_id,'lines',jsonb_build_array(l||jsonb_build_object(
 'return_type','refund_only','source_document_id',outbound,'source_line_id',line_id))));
 perform public.wms_change_sales_document_status_secure(refund,'submit');
 perform public.wms_change_sales_document_status_secure(refund,'approve');
 if (select quantity from public.wms_inventory_batch where id=b.id)<>b.quantity-1
 or exists(select 1 from public.wms_sales_document_line where document_id=refund and movement_id is not null)
 then raise exception 'Refund-only changed stock'; end if;
 -- Historic approved documents must not silently add stock on a new physical return.
 historic:=public.wms_save_sales_document_secure(payload||jsonb_build_object('lines',jsonb_build_array(l)));
 perform public.wms_change_sales_document_status_secure(historic,'submit');
 -- Controlled fixture models the old status-only approval, without posting stock.
 update public.wms_sales_document set status='approved',approved_at=now() where id=historic;
 select id into strict line_id from public.wms_sales_document_line where document_id=historic;
 failed:=public.wms_save_sales_document_secure((to_jsonb(ret)-'id')||jsonb_build_object('business_date',current_date,
 'warehouse_id',b.warehouse_id,'customer_id',h.customer_id,'lines',jsonb_build_array(l||jsonb_build_object(
 'return_type','return','source_document_id',historic,'source_line_id',line_id))));
 perform public.wms_change_sales_document_status_secure(failed,'submit');
 begin perform public.wms_change_sales_document_status_secure(failed,'approve');
  raise exception 'Historic unposted physical return allowed';
 exception when check_violation then null; end;
 if (select quantity from public.wms_inventory_batch where id=b.id)<>b.quantity-1 then raise exception 'Historical return changed stock'; end if;
 foreach report_kind in array array['stock','movement','ledger','receipt-issue'] loop
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  perform set_config('request.headers','{}',true);
  execute 'set local role authenticated';
  report:=public.wms_inventory_report_secure(report_kind,p_tenant_id=>b.tenant_id,p_limit=>200);
  if not exists(select 1 from jsonb_array_elements(report->'data') x where x->>'batch_id'=b.id::text) then raise exception 'Platform all report missing'; end if;
  execute 'reset role';
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other)::text,true);
  execute 'set local role authenticated';
  report:=public.wms_inventory_report_secure(report_kind,p_tenant_id=>b.tenant_id,p_limit=>200);
  if (report->>'total')::int<>0 then raise exception 'Selected tenant report leaked'; end if;
  execute 'reset role';
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',b.tenant_id)::text,true);
  execute 'set local role authenticated';
  report:=public.wms_inventory_report_secure(report_kind,p_tenant_id=>b.tenant_id,p_limit=>200);
  if not exists(select 1 from jsonb_array_elements(report->'data') x where x->>'batch_id'=b.id::text) then raise exception 'Platform selected report missing'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',ordinary,'role','authenticated')::text,true);
  perform set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other)::text,true);
  execute 'set local role authenticated';
  report:=public.wms_inventory_report_secure(report_kind,p_tenant_id=>b.tenant_id,p_limit=>200);
  if not exists(select 1 from jsonb_array_elements(report->'data') x where x->>'batch_id'=b.id::text) then raise exception 'Forged header changed ordinary report scope'; end if;
  report:=public.wms_inventory_report_secure(report_kind,p_tenant_id=>other,p_limit=>200);
  if (report->>'total')::int<>0 then raise exception 'Ordinary cross-tenant report leaked'; end if;
  execute 'reset role';
 end loop;
end $test$;
rollback;
