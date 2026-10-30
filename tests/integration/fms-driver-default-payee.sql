-- Read scope, explicit driver payee identity, historical snapshots and masking.
-- QA profiles, costs, reimbursement and temporary waybill assignment are rolled back.
begin;

insert into public.tms_driver_profile (
  driver_id, tenant_id, create_by, finance_default_account,
  finance_invoice_name, finance_tax_no, finance_bank_name, finance_bank_account
) values (
  '79f1edfc-963e-41d7-82c9-824d4c7ab6a1',
  '7529f951-938e-4e2c-ac0d-316c136ae1f9',
  'QA-ROLLBACK', true, 'QA司机开票名', 'QA-TAX-001', 'QA测试银行', 'QA-ACCOUNT-001'
) on conflict (driver_id) do update set
  finance_default_account=true,
  finance_invoice_name='QA司机开票名',
  finance_tax_no='QA-TAX-001',
  finance_bank_name='QA测试银行',
  finance_bank_account='QA-ACCOUNT-001';

update public.tms_driver_profile set
  finance_default_account=true,
  finance_invoice_name='QA返程司机甲开票名',
  finance_tax_no='QA-TAX-002',
  finance_bank_name='QA测试银行',
  finance_bank_account='QA-ACCOUNT-002'
where driver_id='119a7398-3952-426f-af0e-4fbe8233453d';

do $test$
declare
  account jsonb;
  saved jsonb;
  cost_id uuid;
  cost_owner uuid;
  hidden jsonb;
  masked jsonb;
  blocked boolean;
  reimbursement_id uuid;
  other_driver uuid := 'b29a9470-cc7a-4516-8b93-ba601f87476b';
begin
  -- Platform all and selected, then ordinary own and forged header.
  perform set_config('request.jwt.claims',
    '{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
  perform set_config('request.jwt.claim.sub','0a872664-874c-447d-a256-d0dbdca6ed45',true);
  perform set_config('request.headers','{}',true);
  account:=public.fms_get_waybill_driver_default_account_secure(
    'd76b90ef-9d02-4799-a73f-7b01fed18584',null);
  if account->>'bank_account' is distinct from 'QA-ACCOUNT-002' then
    raise exception 'Platform-all assigned driver account missing';
  end if;
  perform set_config('request.headers',
    '{"x-art-tenant-scope":"2824c2b5-2774-4781-b995-f55e8bcee920"}',true);
  account:=public.fms_get_waybill_driver_default_account_secure(
    'd76b90ef-9d02-4799-a73f-7b01fed18584',null);
  if account->>'driver_id' is distinct from '119a7398-3952-426f-af0e-4fbe8233453d' then
    raise exception 'Platform-selected assigned driver mismatch';
  end if;
  perform set_config('request.headers',
    '{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}',true);
  if public.fms_get_waybill_driver_default_account_secure(
    'd76b90ef-9d02-4799-a73f-7b01fed18584',null) is not null then
    raise exception 'Platform-selected foreign driver account leaked';
  end if;

  perform set_config('request.jwt.claims',
    '{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
  perform set_config('request.jwt.claim.sub','ab881b32-87d4-4dce-9014-ce488b8069df',true);
  perform set_config('request.headers','{}',true);
  account:=public.fms_get_waybill_driver_default_account_secure(
    '4abb2d01-bfa5-41a8-b5af-3a10621157c8',
    '43f9be72-11ad-4e7c-9f0f-106638cb129a');
  if account->>'bank_account' is distinct from 'QA-ACCOUNT-001' then
    raise exception 'Ordinary own-tenant default account missing';
  end if;
  perform set_config('request.headers',
    '{"x-art-tenant-scope":"2824c2b5-2774-4781-b995-f55e8bcee920"}',true);
  if public.fms_get_waybill_driver_default_account_secure(
    'd76b90ef-9d02-4799-a73f-7b01fed18584',null) is not null then
    raise exception 'Ordinary forged header exposed foreign account';
  end if;
  account:=public.fms_get_waybill_driver_default_account_secure(
    '4abb2d01-bfa5-41a8-b5af-3a10621157c8',
    '43f9be72-11ad-4e7c-9f0f-106638cb129a');
  if account->>'bank_account' is distinct from 'QA-ACCOUNT-001' then
    raise exception 'Ordinary forged header changed own-tenant scope';
  end if;

  perform set_config('request.jwt.claims',
    '{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
  perform set_config('request.jwt.claim.sub','0a872664-874c-447d-a256-d0dbdca6ed45',true);
  perform set_config('request.headers',
    '{"x-art-tenant-scope":"2824c2b5-2774-4781-b995-f55e8bcee920"}',true);
  saved:=public.tms_save_waybill_cost_secure(null,jsonb_build_object(
    'waybill_id','d76b90ef-9d02-4799-a73f-7b01fed18584',
    'expense_item_id','bcf84a05-0d7e-4317-953e-1ed3d48f1c4b',
    'amount',1,'payee_type','driver',
    'payee_driver_id','119a7398-3952-426f-af0e-4fbe8233453d',
    'payee_name','QA司机收款人','payee_bank','QA测试银行',
    'payee_account','QA-ACCOUNT-001'));
  cost_id:=(saved->>'id')::uuid;
  if cost_id is null then raise exception 'Driver payee cost was not saved'; end if;
  select created_by_user_id into cost_owner from public.tms_waybill_cost where id=cost_id;
  hidden:=app_private.tms_waybill_cost_to_secure_json(
    app_private.tms_waybill_cost_raw_json(cost_id),cost_owner,
    '{"costAmounts":"read","paymentDetails":"hidden","driverPhone":"hidden","expenseLocation":"hidden","expenseEvidence":"hidden"}');
  masked:=app_private.tms_waybill_cost_to_secure_json(
    app_private.tms_waybill_cost_raw_json(cost_id),cost_owner,
    '{"costAmounts":"read","paymentDetails":"masked","driverPhone":"hidden","expenseLocation":"hidden","expenseEvidence":"hidden"}');
  if hidden ? 'payee_bank' or hidden ? 'payee_account' or hidden ? 'payee_driver_id'
    or masked->>'payee_account' is distinct from '***' then
    raise exception 'Driver payee account masking failed';
  end if;

  -- The saved payee identity and bank survive a later waybill driver change.
  update public.tms_waybill set driver_id=other_driver
  where id='d76b90ef-9d02-4799-a73f-7b01fed18584';
  saved:=public.tms_save_waybill_cost_secure(cost_id,jsonb_build_object(
    'waybill_id','d76b90ef-9d02-4799-a73f-7b01fed18584',
    'expense_item_id','bcf84a05-0d7e-4317-953e-1ed3d48f1c4b',
    'amount',1,'payee_type','driver',
    'payee_driver_id','119a7398-3952-426f-af0e-4fbe8233453d',
    'payee_name','QA司机收款人','payee_bank','QA测试银行',
    'payee_account','QA-ACCOUNT-001'));
  if saved->>'payee_driver_id' is distinct from '119a7398-3952-426f-af0e-4fbe8233453d'
    or saved->>'payee_account' is distinct from 'QA-ACCOUNT-001' then
    raise exception 'Historical driver payee snapshot was rewritten';
  end if;
  blocked:=false;
  begin
    perform public.tms_save_waybill_cost_secure(cost_id,jsonb_build_object(
      'waybill_id','d76b90ef-9d02-4799-a73f-7b01fed18584',
      'expense_item_id','bcf84a05-0d7e-4317-953e-1ed3d48f1c4b',
      'amount',1,'payee_type','driver',
      'payee_driver_id','79f1edfc-963e-41d7-82c9-824d4c7ab6a1'));
  exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Cross-tenant payee driver accepted'; end if;

  -- An approved existing cost converts within this rollback transaction only.
  perform set_config('request.jwt.claims',
    '{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
  perform set_config('request.jwt.claim.sub','ab881b32-87d4-4dce-9014-ce488b8069df',true);
  perform set_config('request.headers','{}',true);
  reimbursement_id:=public.create_tms_expense_reimbursement_with_driver_secure(
    array['71232af2-3f1d-4264-b2bb-aa6efd9cf5ef'::uuid],
    'current_driver','4cdc6916-276b-4b56-83d4-387097de9e88',
    'QA司机报销收款人','QA测试银行','QA-ACCOUNT-RB',
    current_date,'bank_transfer','[]'::jsonb,'QA回滚测试',null);
  if not exists (
    select 1 from public.tms_expense_reimbursement r
    where r.id=reimbursement_id and r.payee_driver_id='4cdc6916-276b-4b56-83d4-387097de9e88'
      and r.payee_account='QA-ACCOUNT-RB' and r.status='draft'
  ) then
    raise exception 'Driver reimbursement identity/account snapshot missing';
  end if;
end $test$;

select 'driver default account tenant scope, saved payee identity, masking and rollback reimbursement passed' result;
rollback;
