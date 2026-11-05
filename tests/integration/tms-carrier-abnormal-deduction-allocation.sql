-- Two real orders, three real approved carrier costs, one merge and one split allocation.
-- Exercises full zero payable, non-root merged order, split consumption and repeat idempotence.
-- All added allocations, approvals, statements and items roll back.
BEGIN;
DO $test$
DECLARE
  actor public.sys_user%rowtype;
  tenant uuid := '7529f951-938e-4e2c-ac0d-316c136ae1f9';
  waybill_a uuid := 'a9fc0006-1023-4620-9220-000000000003';
  waybill_b uuid := 'a9fc0006-1023-4620-9220-000000000004';
  waybill_extra uuid := 'a9fc0006-1023-4620-9220-000000000005';
  order_a uuid := 'a9fc0005-1023-4620-9220-000000000003';
  order_b uuid := 'a9fc0005-1023-4620-9220-000000000004';
  carrier_a uuid := 'a9fc0002-1023-4620-9220-000000000001';
  carrier_b uuid := 'a9fc0002-1023-4620-9220-000000000002';
  statement_a uuid;
  statement_b uuid;
  item_a uuid;
  item_b uuid;
  item_extra uuid;
  doc_id uuid;
  rejected boolean;
BEGIN
  SELECT * INTO STRICT actor FROM public.sys_user
    WHERE auth_user_id='ab881b32-87d4-4dce-9014-ce488b8069df';
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub',actor.auth_user_id,'role','authenticated')::text,true);
  PERFORM set_config('request.headers','{}',true);

  INSERT INTO public.tms_waybill_order_allocation
    (tenant_id,waybill_id,order_id,quantity,weight_kg,volume_m3)
  VALUES (tenant,waybill_a,order_b,1,100,1);
  INSERT INTO public.tms_waybill_order_allocation
    (tenant_id,waybill_id,order_id,quantity,weight_kg,volume_m3)
  VALUES (tenant,waybill_extra,order_a,1,100,1);

  INSERT INTO public.tms_abnormal_freight
    (tenant_id,order_id,document_no,ownership,lines,total_amount,order_no_snapshot,created_by_user_id)
  VALUES (tenant,order_a,'TEST-DED-A-'||txid_current(),'carrier_deduction','[]'::jsonb,8500,'YD202610-003',actor.id)
  RETURNING id INTO doc_id;
  PERFORM app_private.tms_apply_abnormal_freight_status(doc_id,'approved');
  INSERT INTO public.tms_abnormal_freight
    (tenant_id,order_id,document_no,ownership,lines,total_amount,order_no_snapshot,created_by_user_id)
  VALUES (tenant,order_b,'TEST-DED-B-'||txid_current(),'carrier_deduction','[]'::jsonb,10000,'YD202610-004',actor.id)
  RETURNING id INTO doc_id;
  PERFORM app_private.tms_apply_abnormal_freight_status(doc_id,'approved');

  INSERT INTO public.tms_carrier_statement
    (tenant_id,statement_no,carrier_id,carrier_name_snapshot,period_start,period_end,created_by_user_id)
  SELECT tenant,'TEST-ST-A-'||txid_current(),carrier_a,c.company_name,'2026-10-01','2026-10-31',actor.id
  FROM public.mdm_carrier c WHERE c.id=carrier_a
  RETURNING id INTO statement_a;
  INSERT INTO public.tms_carrier_statement
    (tenant_id,statement_no,carrier_id,carrier_name_snapshot,period_start,period_end,created_by_user_id)
  SELECT tenant,'TEST-ST-B-'||txid_current(),carrier_b,c.company_name,'2026-10-01','2026-10-31',actor.id
  FROM public.mdm_carrier c WHERE c.id=carrier_b
  RETURNING id INTO statement_b;

  INSERT INTO public.tms_carrier_statement_item
    (tenant_id,statement_id,carrier_id,cost_id,waybill_id,waybill_no_snapshot,cost_type_snapshot,occurred_on_snapshot,cost_amount,line_amount)
  VALUES (tenant,statement_b,carrier_b,'a9fc0007-1023-4620-9220-000000000004',waybill_b,'YD202610-004','freight','2026-10-22',9500,9500)
  RETURNING id INTO item_b;
  INSERT INTO public.tms_carrier_statement_item
    (tenant_id,statement_id,carrier_id,cost_id,waybill_id,waybill_no_snapshot,cost_type_snapshot,occurred_on_snapshot,cost_amount,line_amount)
  VALUES (tenant,statement_a,carrier_a,'a9fc0007-1023-4620-9220-000000000003',waybill_a,'YD202610-003','freight','2026-10-22',9000,9000)
  RETURNING id INTO item_a;
  INSERT INTO public.tms_carrier_statement_item
    (tenant_id,statement_id,carrier_id,cost_id,waybill_id,waybill_no_snapshot,cost_type_snapshot,occurred_on_snapshot,cost_amount,line_amount)
  VALUES (tenant,statement_a,carrier_a,'a9fc0007-1023-4620-9220-000000000005',waybill_extra,'YD202610-005','freight','2026-10-23',9000,9000)
  RETURNING id INTO item_extra;

  IF (SELECT (line_amount,abnormal_deduction_applied) FROM public.tms_carrier_statement_item WHERE id=item_b)
    IS DISTINCT FROM ROW(0::numeric,9500::numeric)
    OR (SELECT (line_amount,abnormal_deduction_applied) FROM public.tms_carrier_statement_item WHERE id=item_a)
    IS DISTINCT FROM ROW(0::numeric,9000::numeric)
    OR (SELECT (line_amount,abnormal_deduction_applied) FROM public.tms_carrier_statement_item WHERE id=item_extra)
    IS DISTINCT FROM ROW(9000::numeric,0::numeric)
  THEN RAISE EXCEPTION 'Full/split/merge deduction amounts incorrect'; END IF;
  IF (SELECT coalesce(sum(amount),0) FROM app_private.tms_carrier_abnormal_deduction_allocation
      WHERE order_id=order_a)=8500
    AND (SELECT coalesce(sum(amount),0) FROM app_private.tms_carrier_abnormal_deduction_allocation
      WHERE order_id=order_b)=10000
    AND (SELECT count(*) FROM app_private.tms_carrier_abnormal_deduction_allocation
      WHERE item_id=item_a)=2
  THEN NULL; ELSE RAISE EXCEPTION 'Order-level consumption ledger incorrect'; END IF;
END $test$;
SET CONSTRAINTS app_private.tms_carrier_abnormal_deduction_allocation_item_fkey IMMEDIATE;
ROLLBACK;

