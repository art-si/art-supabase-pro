-- A cost child inherits its selected waybill tenant across all four read scopes.
begin;
do $check$
declare r jsonb; item jsonb;
begin
 perform set_config('request.jwt.claims','{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
 perform set_config('request.headers','{}',true);
 r:=public.tms_list_waybill_cost_options_secure(0,99,'QA-MAIN-WB-20261026',null);
 if (r->>'total')::integer<>3 then raise exception 'Platform-all should find three QA trips';end if;
 for item in select value from jsonb_array_elements(r->'records') loop
  if item->>'tenant_id'<>'2824c2b5-2774-4781-b995-f55e8bcee920' then
    raise exception 'Option tenant missing or wrong';
  end if;
 end loop;
 perform set_config('request.headers','{"x-art-tenant-scope":"2824c2b5-2774-4781-b995-f55e8bcee920"}',true);
 r:=public.tms_list_waybill_cost_options_secure(0,99,'QA-MAIN-WB-20261026',null);
 if (r->>'total')::integer<>3 then raise exception 'Platform selected missed QA options';end if;
 perform set_config('request.headers','{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}',true);
 r:=public.tms_list_waybill_cost_options_secure(0,99,'QA-MAIN-WB-20261026',null);
 if (r->>'total')::integer<>0 then raise exception 'Platform selected leaked QA options';end if;
 perform set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
 perform set_config('request.headers','{}',true);
 r:=public.tms_list_waybill_cost_options_secure(0,99,'VMS-QA-YD',null);
 if (r->>'total')::integer<2 then raise exception 'Ordinary own options missing';end if;
 for item in select value from jsonb_array_elements(r->'records') loop
  if item->>'tenant_id'<>'7529f951-938e-4e2c-ac0d-316c136ae1f9' then
    raise exception 'Ordinary option leaked another tenant';
  end if;
 end loop;
 perform set_config('request.headers','{"x-art-tenant-scope":"2824c2b5-2774-4781-b995-f55e8bcee920"}',true);
 r:=public.tms_list_waybill_cost_options_secure(0,99,'QA-MAIN-WB-20261026',null);
 if (r->>'total')::integer<>0 then raise exception 'Forged header leaked QA options';end if;
end $check$;
select set_config('request.jwt.claims','{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
select set_config('request.headers','{}',true);
do $write$
declare payload jsonb; cost_id uuid;
begin
 payload:=public.tms_save_waybill_cost_secure(null,
   '{"waybill_id":"a83978af-bc51-4dc1-aee4-c13dccaa9b64",
     "leg_id":"e8bfe426-bcec-4298-ab0e-577d538a3102",
     "expense_item_id":"dea1b4b6-0752-4dbc-9d6d-89d1b5806f19",
     "amount":30,
     "reporter_user_id":"7446b152-4057-47af-b4c1-bcbb74491880",
     "remark":"DEMO target-tenant cost"}'::jsonb);
 cost_id:=(payload->>'id')::uuid;
 if not exists(select 1 from public.tms_waybill_cost
   where id=cost_id and tenant_id='2824c2b5-2774-4781-b995-f55e8bcee920'
     and leg_id='e8bfe426-bcec-4298-ab0e-577d538a3102' and audit_status='draft')
   then raise exception 'Platform-all cost child did not inherit parent tenant';
 end if;
 payload:=public.tms_save_waybill_cost_secure(null,
   '{"waybill_id":"a83978af-bc51-4dc1-aee4-c13dccaa9b64",
     "leg_id":"e8bfe426-bcec-4298-ab0e-577d538a3102",
     "expense_item_id":"dea1b4b6-0752-4dbc-9d6d-89d1b5806f19",
     "amount":30,
     "remark":"DEMO platform operator reporter"}'::jsonb);
 cost_id:=(payload->>'id')::uuid;
 if not exists(select 1 from public.tms_waybill_cost
   where id=cost_id and tenant_id='2824c2b5-2774-4781-b995-f55e8bcee920'
     and reporter_user_id is null and reporter_name_snapshot like '平台代录 · %')
   then raise exception 'Platform operator was falsely assigned a target-tenant reporter';
 end if;
 begin
   perform public.tms_save_waybill_cost_secure(null,
     '{"waybill_id":"a83978af-bc51-4dc1-aee4-c13dccaa9b64",
       "expense_item_id":"dea1b4b6-0752-4dbc-9d6d-89d1b5806f19",
       "amount":30,
       "reporter_user_id":"93f2f1e8-a3dc-4f5a-999b-6c8c02d0c7e9"}'::jsonb);
   raise exception 'Foreign reporter unexpectedly accepted';
 exception when others then
   if sqlerrm='Foreign reporter unexpectedly accepted'
      or sqlerrm not like '%填报人不存在%'
     then raise;
   end if;
 end;
 begin
   perform public.tms_save_waybill_cost_secure(null,
     '{"waybill_id":"a83978af-bc51-4dc1-aee4-c13dccaa9b64",
       "expense_item_id":"3e28fd33-2eae-4f1c-9946-61f9ac015a19",
       "amount":30,
       "reporter_user_id":"7446b152-4057-47af-b4c1-bcbb74491880",
       "remark":"DEMO foreign expense item"}'::jsonb);
   raise exception 'Foreign expense item unexpectedly accepted';
 exception when others then
   if sqlerrm='Foreign expense item unexpectedly accepted'
      or sqlerrm not like '%费用项目不存在或不属于当前租户%'
     then raise;
   end if;
 end;
end $write$;
select set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
select set_config('request.headers','{}',true);
do $ordinary$
declare payload jsonb; cost_id uuid;
begin
 payload:=public.tms_save_waybill_cost_secure(null,
   '{"waybill_id":"a9fc0006-1023-4620-9220-000000000008",
     "expense_item_id":"3e28fd33-2eae-4f1c-9946-61f9ac015a19",
     "amount":30,"remark":"DEMO ordinary reporter"}'::jsonb);
 cost_id:=(payload->>'id')::uuid;
 if not exists(select 1 from public.tms_waybill_cost
   where id=cost_id
     and reporter_user_id='93f2f1e8-a3dc-4f5a-999b-6c8c02d0c7e9'
     and reporter_name_snapshot not like '平台代录 · %')
   then raise exception 'Ordinary reporter default changed unexpectedly';
 end if;
end $ordinary$;
rollback;
