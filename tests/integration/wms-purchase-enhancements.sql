-- Runtime verification uses the actual business boundary; all data rolls back.
begin;
do $test$
declare u uuid; d public.wms_purchase_document%rowtype; template public.wms_purchase_document%rowtype; ids uuid[]; result jsonb; picked jsonb; n integer; payload jsonb; line jsonb; created uuid; fixture_ids uuid[];
begin
 select x.auth_user_id into strict u from public.sys_user x join public.sys_role r on r.tenant_id=x.tenant_id and r.role_code=any(x.user_roles)
 where r.builtin_type='platform_super' and x.system_protected and x.status='1' limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 perform set_config('request.headers','{}',true);
 select * into strict template from public.wms_purchase_document where kind='purchase_inbound' and status='approved' limit 1;
 select to_jsonb(l) into strict line from public.wms_purchase_document_line l join public.mdm_material m on m.id=l.material_id
 where l.document_id=template.id and not m.serial_management_enabled limit 1;
 line:=line||jsonb_build_object('quantity',1,'project_id',null,'construction_no',null,'source_order_target_line_id',null,'source_batch_id',null,'source_document',null,'source_line_no',null,'serial_nos','[]'::jsonb);
 payload:=(to_jsonb(template)-'id')||jsonb_build_object('business_date',current_date,'lines',jsonb_build_array(line));
 for n in 1..2 loop
  created:=public.wms_save_purchase_document_secure(payload||jsonb_build_object('lines',jsonb_build_array(line||jsonb_build_object('batch_no','QA-PAYABLE-'||gen_random_uuid()))));
  perform public.wms_change_purchase_document_status_secure(created,'submit');
  perform public.wms_change_purchase_document_status_secure(created,'approve');
  fixture_ids:=array_append(fixture_ids,created);
 end loop;
 -- Two independent source documents generate at least two documents in each payable page.
 for d in select * from public.wms_purchase_document where kind='purchase_inbound' and status='approved' and id=any(fixture_ids)
 and not exists(select 1 from public.fms_purchase_payable_document p where p.source_document_id=wms_purchase_document.id) order by id limit 2 loop
  ids:=array_append(ids,d.id);
  result:=public.wms_push_purchase_payables_secure('estimated',jsonb_build_array(jsonb_build_object('document_id',d.id,'line_ids',null)));
  if jsonb_array_length(result)<>1 or jsonb_array_length(result->0->'lines')=0 then raise exception 'estimated payable source lines missing'; end if;
  result:=public.wms_push_purchase_payables_secure('financial',jsonb_build_array(jsonb_build_object('document_id',d.id,'line_ids',null)));
  if jsonb_array_length(result)<>1 then raise exception 'financial payable missing'; end if;
  begin
   perform public.wms_push_purchase_payables_secure('estimated',jsonb_build_array(jsonb_build_object('document_id',d.id,'line_ids',null)));
   raise exception 'duplicate payable push accepted';
  exception when check_violation then null; end;
 end loop;
 if cardinality(ids)<>2 then raise exception 'two approved source documents required for verification'; end if;
 select count(*) into n from public.fms_purchase_payable_document where source_document_id=any(ids);
 if n<>4 then raise exception 'two records per payable page not generated'; end if;
 result:=public.fms_purchase_payable_list_secure('estimated');
 if (result->>'total')::integer<2 then raise exception 'estimated page data inaccessible'; end if;
 result:=public.fms_purchase_payable_list_secure('financial');
 if (result->>'total')::integer<2 then raise exception 'financial page data inaccessible'; end if;
 -- Every generated line retains the exact signed source amounts.
 if exists(select 1 from public.fms_purchase_payable_line p join public.wms_purchase_document_line l on l.id=p.source_line_id
  where p.document_id in(select id from public.fms_purchase_payable_document where source_document_id=any(ids))
  and (p.quantity<>l.quantity or p.amount<>l.amount or p.tax_amount<>l.tax_amount or p.total_amount<>l.total_amount)) then raise exception 'payable source amounts changed'; end if;
 perform set_config('request.jwt.claims','{}',true);
 begin perform public.fms_purchase_payable_list_secure('estimated'); raise exception 'anonymous payable access accepted'; exception when insufficient_privilege then null; end;
 begin perform public.wms_push_purchase_payables_secure('financial','[]'::jsonb); raise exception 'anonymous payable push accepted'; exception when insufficient_privilege then null; end;
end $test$;
rollback;
