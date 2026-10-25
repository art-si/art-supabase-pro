begin;

do $audit$
declare
 folder_id uuid;
 menu_id uuid;
 menu_name text;
 route_slug text;
 expected_actions text[];
 actual_actions text[];
begin
 select id into strict folder_id from public.sys_menu where name='FinanceAccountsPayable' and type='folder';
 if (select count(*) from public.sys_menu where parent_id=folder_id and type in('menu','folder'))<>6 then raise exception 'Payable audit coverage must include every child page';end if;
 for menu_name,route_slug,expected_actions in
  values
   ('FinanceEstimatedPayable','estimated-payable',array['Add','Approve','Delete','Edit','Export','Import','Print','Push','Submit','View','Voucher']),
   ('FinancePurchasePayable','purchase-payable',array['Add','Approve','Delete','Edit','Export','Freeze','Import','Print','Push','Submit','View','Voucher']),
   ('FinancePayableApplication','payment-application',array['Add','Approve','Close','Delete','Edit','Export','Freeze','Print','Push','Submit','View']),
   ('FinancePayablePayment','payment',array['Add','Approve','Confirm','Delete','Edit','Export','Print','Push','Submit','View','Void','Voucher']),
   ('FinancePayableRefund','payment-refund',array['Add','Approve','Confirm','Delete','Edit','Export','Print','Submit','View','Void','Voucher']),
   ('FinancePayableWriteoff','writeoff',array['AutoWriteoff','Reverse','Scheme','View','Voucher','Writeoff'])
 loop
  select id into strict menu_id from public.sys_menu where name=menu_name and parent_id=folder_id and type='menu';
  if not exists(select 1 from public.sys_menu where id=menu_id and path=route_slug and component='/fms/accounts-payable/'||route_slug and (meta->>'is_enable')::boolean) then raise exception 'Payable route or enabled page mismatch: %',menu_name;end if;
  select array_agg(split_part(name,':',2) order by split_part(name,':',2)) into actual_actions from public.sys_menu where parent_id=menu_id and type='button' and (meta->>'is_enable')::boolean;
  if actual_actions is distinct from expected_actions then raise exception 'Payable button audit coverage mismatch: %, %',menu_name,actual_actions;end if;
 end loop;
 if exists(select 1 from public.sys_menu where component='/fms/settlement/purchase-payable') then raise exception 'Legacy financial payable menu still duplicates the migrated page';end if;
end $audit$;

rollback;
