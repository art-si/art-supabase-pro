BEGIN READ ONLY;
SET LOCAL statement_timeout='8s';

DO $native_execution$
DECLARE fixture record;document public.fms_payable_settlement_document;line public.fms_payable_settlement_line;
 execution public.fms_payable_payment_execution;original public.fms_fund_ledger_entry;reversal public.fms_fund_ledger_entry;
 source public.fms_purchase_payable_document;fund public.fms_fund_account;application_count integer;
BEGIN
 FOR fixture IN SELECT * FROM(VALUES
  ('9086a861-84f4-4a03-8a28-2db7b87eeee0'::uuid,'USD',7.2::numeric,7::numeric,'QA_NATIVE_FX_USD','approved'),
  ('9413873f-35b0-4511-b447-1dfbf0d9c81c'::uuid,'EUR',8.1::numeric,8::numeric,'QA_NATIVE_FX_EUR','closed')
 ) cases(id,currency,source_rate,payment_rate,fund_code,application_status) LOOP
  SELECT * INTO STRICT document FROM public.fms_payable_settlement_document WHERE id=fixture.id;
  SELECT * INTO STRICT line FROM public.fms_payable_settlement_line WHERE document_id=document.id;
  SELECT * INTO STRICT execution FROM public.fms_payable_payment_execution WHERE document_id=document.id;
  SELECT * INTO STRICT original FROM public.fms_fund_ledger_entry WHERE id=execution.fund_ledger_id;
  SELECT * INTO STRICT reversal FROM public.fms_fund_ledger_entry WHERE id=execution.reversal_ledger_id;
  SELECT * INTO STRICT source FROM public.fms_purchase_payable_document WHERE id=line.payable_id;
  SELECT * INTO STRICT fund FROM public.fms_fund_account WHERE id=line.fund_account_id;
  IF document.tenant_id<>(SELECT id FROM public.sys_tenant WHERE tenant_code='qa-payable-20261022')
   OR document.kind<>'payment' OR document.status<>'approved' OR document.amount<>100
   OR document.currency_code<>fixture.currency OR document.exchange_rate<>fixture.payment_rate
   OR source.kind<>'financial' OR source.status<>'approved' OR source.currency_code<>fixture.currency
   OR source.exchange_rate<>fixture.source_rate OR source.tenant_id<>document.tenant_id
   OR source.account_set_id IS DISTINCT FROM document.account_set_id
   OR source.payee_supplier_id IS NOT DISTINCT FROM source.supplier_id
   OR line.payee_supplier_id IS DISTINCT FROM source.payee_supplier_id THEN
   RAISE EXCEPTION 'Native payment changed original quote, book, payee or lifecycle';
  END IF;
  IF fund.account_code<>fixture.fund_code OR fund.account_type<>'cash' OR fund.online_banking_enabled
   OR fund.tenant_id<>document.tenant_id OR fund.account_set_id IS DISTINCT FROM document.account_set_id THEN
   RAISE EXCEPTION 'Native acceptance used a real bank or another accounting book';
  END IF;
  IF execution.status<>'reversed' OR execution.reversed_at IS NULL OR execution.amount<>100
   OR execution.currency_code<>fixture.currency OR execution.exchange_rate<>fixture.payment_rate
   OR execution.cash_base_amount<>100*fixture.payment_rate OR execution.cash_transaction_id IS NOT NULL
   OR execution.tenant_id<>document.tenant_id OR execution.account_set_id IS DISTINCT FROM document.account_set_id
   OR original.fund_account_id<>fund.id OR reversal.fund_account_id<>fund.id
   OR original.account_set_id IS DISTINCT FROM document.account_set_id
   OR reversal.account_set_id IS DISTINCT FROM original.account_set_id
   OR original.amount<>100 OR reversal.amount<>original.amount OR reversal.direction=original.direction
   OR reversal.reversal_of_id IS DISTINCT FROM original.id THEN
   RAISE EXCEPTION 'Native cancelled payment lost immutable original execution or exact ledger reversal';
  END IF;
  SELECT count(*) INTO application_count FROM public.fms_payable_settlement_document application
  JOIN public.fms_payable_settlement_line application_line ON application_line.document_id=application.id AND application_line.tenant_id=application.tenant_id
  WHERE application.kind='application' AND application.tenant_id=document.tenant_id
   AND application_line.payable_id=source.id AND application.status=fixture.application_status
   AND(application.currency_code=fixture.currency AND application.exchange_rate=fixture.payment_rate);
  IF application_count<>1 OR(fixture.currency='USD' AND line.application_line_id IS NULL)
   OR(fixture.currency='EUR' AND line.application_line_id IS NOT NULL) THEN
   RAISE EXCEPTION 'Native application downpush or closed-reservation direct payment changed';
  END IF;
 END LOOP;
END $native_execution$;

ROLLBACK;
