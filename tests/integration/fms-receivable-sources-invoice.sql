-- Run after fixtures/lifecycle in BEGIN/ROLLBACK. All source edits are test-only.
do $sources$
declare actor uuid;t uuid;w uuid;e uuid;f uuid;invoice uuid;ids jsonb;cost_doc uuid;expected numeric;actual numeric;other_order uuid;other_customer uuid;customer uuid;
begin
 select u.auth_user_id into actor from public.sys_user u join public.sys_tenant tenant on tenant.id=u.tenant_id where u.system_protected and tenant.builtin_type='platform' and u.auth_user_id is not null limit 1;
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.headers','{}',true);
 select id,tenant_id into w,t from public.wms_sales_document where kind='outbound' and status='approved' order by business_date desc limit 1;
 if w is null then raise exception 'WMS approved source fixture required';end if;
 e:=public.fms_create_estimated_receivable_from_source_secure('wms_sales_outbound',w);
 if not exists(select 1 from public.fms_receivable_line where document_id=e and source_line_id is not null) then raise exception 'WMS source lines missing';end if;
 begin perform public.fms_create_estimated_receivable_from_source_secure('wms_sales_outbound',w);raise exception 'Duplicate WMS source accepted';exception when unique_violation then null;end;
 -- Choose a fulfilled transport source with approved costs; release its legacy statement links only in this rollback transaction.
 select waybill.id,waybill.tenant_id into w,t from public.tms_waybill waybill
 where waybill.status in('signed','completed') and exists(select 1 from public.tms_waybill_cost c where c.waybill_id=waybill.id and c.audit_status='approved')
 and not exists(select 1 from public.tms_waybill_cost c where c.waybill_id=waybill.id and c.audit_status<>'approved')
 and exists(select 1 from public.tms_waybill_order_allocation a join public.tms_order o on o.id=a.order_id where a.waybill_id=waybill.id and o.signed_at is not null and a.freight_amount>0)
 and not exists(select 1 from public.tms_waybill_order_allocation a join public.tms_customer_statement_item si on si.order_id=a.order_id where a.waybill_id=waybill.id and si.is_active) limit 1;
 if w is null then raise exception 'Audited transport cost fixture required';end if;
 select o.shipping_customer_id into customer from public.tms_waybill_order_allocation a join public.tms_order o on o.id=a.order_id where a.waybill_id=w limit 1;
 select o.id,o.shipping_customer_id into other_order,other_customer from public.tms_order o where o.tenant_id=t and o.signed_at is not null and o.shipping_customer_id<>customer and o.total_fee>0
 and not exists(select 1 from public.tms_customer_statement_item si where si.order_id=o.id and si.is_active) limit 1;
 if other_order is null then raise exception 'Second transport customer fixture required';end if;
 insert into public.tms_waybill_order_allocation(tenant_id,waybill_id,order_id,quantity,weight_kg,volume_m3,freight_amount,receipt_recorded_at)
 values(t,w,other_order,0,0,0,1,(select signed_at from public.tms_order where id=other_order));
 ids:=public.fms_create_transport_estimated_receivables_secure(w);
 if jsonb_array_length(ids)<>2 then raise exception 'Transport customers were not grouped separately';end if;
 if public.fms_create_transport_estimated_receivables_secure(w)<>ids then raise exception 'Transport push is not idempotent';end if;
 select id into e from public.fms_receivable_document where source_id=w and source_type='tms_signed_waybill' and customer_id=customer;
 select sum(o.total_fee) into expected from public.tms_waybill_order_allocation a join public.tms_order o on o.id=a.order_id
 where a.waybill_id=w and o.shipping_customer_id=(select customer_id from public.fms_receivable_document where id=e);
 if (select total_amount from public.fms_receivable_document where id=e)<>expected then raise exception 'Transport income did not use order gross freight';end if;
 -- Fill the explicitly required tax and company on the generated service draft.
 update public.fms_receivable_line set tax_rate=0 where document_id=e;
 update public.fms_receivable_document set settlement_organization_id=(select id from public.mdm_organization where tenant_id=t and organization_type='company' and status='1' limit 1) where id=e;
 perform public.fms_act_receivable_document_secure(e,'submit');perform public.fms_act_receivable_document_secure(e,'approve');
 cost_doc:=public.fms_push_revenue_cost_secure(e);perform public.fms_act_revenue_cost_secure(cost_doc,'refresh');
 select sum(round(costs.amount*a.freight_amount/allocation.total,2)) into expected from public.fms_receivable_line l
 join public.tms_waybill_order_allocation a on a.order_id=l.source_line_id
 join lateral(select sum(amount) amount from public.tms_waybill_cost c where c.waybill_id=a.waybill_id and c.audit_status='approved') costs on true
 join lateral(select sum(freight_amount) total from public.tms_waybill_order_allocation b where b.waybill_id=a.waybill_id) allocation on true where l.document_id=e;
 perform public.fms_act_revenue_cost_secure(cost_doc,'submit');perform public.fms_act_revenue_cost_secure(cost_doc,'approve');
 select cost_amount into actual from public.fms_revenue_cost_document where id=cost_doc;
 if actual is distinct from expected or actual is null then raise exception 'Actual audited transport cost mismatch: % versus %',actual,expected;end if;
 f:=public.fms_push_financial_receivable_secure(e);perform public.fms_act_receivable_document_secure(f,'submit');perform public.fms_act_receivable_document_secure(f,'approve');
 ids:=public.fms_push_receivable_invoice_secure(f,'ordinary');invoice:=(ids->>0)::uuid;
 if exists(select 1 from public.fms_receivable_application where source_id=invoice and status='approved') then raise exception 'Invoice draft counted as issued';end if;
 begin update public.tms_invoice set total_amount=total_amount+1,amount_excluding_tax=amount_excluding_tax+1 where id=invoice;raise exception 'Invoice source amounts can be changed';exception when check_violation then null;end;
 -- Exercise the invoice callback under the existing workflow engine context.
 perform set_config('app.workflow_engine','on',true);
 update public.tms_invoice set invoice_no='ARTEST123456',status='pending_review' where id=invoice;
 update public.tms_invoice set status='issued' where id=invoice;
 if not exists(select 1 from public.fms_receivable_application where source_id=invoice and status='approved' and event_date=(select issue_date from public.tms_invoice where id=invoice)) then raise exception 'Issued invoice did not update AR';end if;
 if exists(select 1 from public.fms_posting_event where source_type='invoice' and source_id=invoice) then raise exception 'AR invoice created duplicate GL debt';end if;
 update public.tms_invoice set status='voided' where id=invoice;
 if exists(select 1 from public.fms_receivable_application where source_id=invoice and status<>'voided') then raise exception 'Voided invoice retained AR issued amount';end if;
 ids:=public.fms_push_receivable_invoice_secure(f,'special');invoice:=(ids->>0)::uuid;
 delete from public.tms_invoice where id=invoice;
 if exists(select 1 from public.fms_receivable_application where source_id=invoice and status<>'voided') then raise exception 'Deleted draft did not release invoice linkage';end if;
 perform public.fms_push_receivable_invoice_secure(f,'ordinary');
 perform set_config('app.workflow_engine','off',true);
end $sources$;
