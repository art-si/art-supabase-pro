BEGIN;
SET LOCAL jit = off;

CREATE FUNCTION pg_temp.assert_payable_stock_cost(p_first integer,p_last integer)
RETURNS void LANGUAGE plpgsql AS $stock_cost$
DECLARE
 root_actor uuid;
 ordinary_actor uuid;
 other_tenant uuid;
 cost_menu uuid;
 cost_role uuid;
 cost_role_code text := 'QA_COST_ROLE_'||upper(left(gen_random_uuid()::text,8));
 source_template public.wms_purchase_document;
 line_template public.wms_purchase_document_line;
 movement_template public.wms_inventory_movement;
 source_id uuid;
 source_line_id uuid;
 cost_batch_id uuid;
 stock_movement_id uuid;
 issued_movement_id uuid;
 conversion_unit uuid;
 expected_basic_quantity numeric;
 source_date date;
 cost_date date := app_private.payable_business_date();
 period_start date;
 batch_code text;
 scenario integer;
 part_index integer;
 part_count integer;
 source_quantity numeric;
 source_price numeric;
 source_amount numeric;
 original_stock_price numeric;
 part_quantity numeric;
 price_value numeric;
 tax_rate numeric;
 estimate_excludes_tax boolean;
 finance_excludes_tax boolean;
 estimate jsonb;
 second_estimate jsonb;
 saved_preview jsonb;
 source_payload jsonb;
 stock_payload jsonb;
 financial jsonb;
 line_value jsonb;
 preview jsonb;
 matched_result jsonb;
 report jsonb;
 expected_adjustment numeric;
 expected_stock numeric;
 matched_quantity numeric;
 original_allocated numeric;
 snapshot_count bigint;
 movement_count bigint;
 stock_value numeric;
 blocked boolean;
BEGIN
 SELECT auth_user_id INTO STRICT root_actor FROM public.sys_user
 WHERE system_protected AND 'R_SUPER'=ANY(user_roles) AND status='1' ORDER BY id LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',root_actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',root_actor,'role','authenticated')::text,true);
 PERFORM set_config('request.headers','{}',true);
 SELECT * INTO STRICT source_template FROM public.wms_purchase_document
 WHERE tenant_id='111e83d3-190e-4405-84c8-440d484d13a6' AND remark='QA_AUTO_STOCK_1' AND status='approved';
 SELECT auth_user_id INTO STRICT ordinary_actor FROM public.sys_user
 WHERE tenant_id=source_template.tenant_id AND NOT system_protected AND status='1' AND auth_user_id IS NOT NULL ORDER BY id LIMIT 1;
 SELECT id INTO STRICT other_tenant FROM public.sys_tenant WHERE id<>source_template.tenant_id AND status='1' AND builtin_type IS DISTINCT FROM 'platform'
 AND(service_start_date IS NULL OR service_start_date<=cost_date) AND(service_end_date IS NULL OR service_end_date>=cost_date) ORDER BY id LIMIT 1;
 SELECT id INTO cost_menu FROM public.sys_menu WHERE name='FinancePurchasePayable:CostMatch';
 IF cost_menu IS NULL THEN
  INSERT INTO public.sys_menu SELECT(jsonb_populate_record(NULL::public.sys_menu,to_jsonb(menu)||jsonb_build_object(
   'id',gen_random_uuid(),'name','FinancePurchasePayable:CostMatch','path','CostMatch',
   'meta',menu.meta||jsonb_build_object('title','成本勾稽')))).* FROM public.sys_menu menu
  WHERE menu.name='FinancePurchasePayable:Approve' RETURNING id INTO STRICT cost_menu;
 END IF;
 INSERT INTO public.sys_role(tenant_id,role_code,role_name,enabled)
 VALUES(source_template.tenant_id,cost_role_code,'事务回滚成本勾稽角色',true) RETURNING id INTO cost_role;
 INSERT INTO public.sys_role_menu(tenant_id,role_id,menu_id)
 SELECT source_template.tenant_id,cost_role,id FROM public.sys_menu WHERE id=cost_menu OR name='FinancePurchasePayable:View';
 UPDATE public.sys_user SET user_roles=ARRAY[cost_role_code] WHERE auth_user_id=ordinary_actor;
 SELECT * INTO STRICT line_template FROM public.wms_purchase_document_line WHERE document_id=source_template.id ORDER BY line_no LIMIT 1;
 SELECT * INTO STRICT movement_template FROM public.wms_inventory_movement WHERE id=line_template.movement_id;
 SELECT start_date INTO STRICT period_start FROM public.fms_accounting_period
 WHERE account_set_id='cf3eeddd-49b0-4e62-97a9-cab2769cb633' AND status='open' AND cost_date BETWEEN start_date AND end_date;
 source_date:=greatest(period_start,cost_date-1);
 IF source_date>=cost_date THEN RAISE EXCEPTION 'Stock cost regression needs two calendar days in the open QA period';END IF;
 UPDATE public.fms_payable_accrual_policy SET enabled=false,effective_from=least(effective_from,source_date)
 WHERE tenant_id=source_template.tenant_id AND organization_id=source_template.organization_id;
 UPDATE public.wms_inventory_initialization SET enabled_on=least(enabled_on,source_date)
 WHERE tenant_id=source_template.tenant_id AND organization_id=source_template.organization_id;
 INSERT INTO public.mdm_unit_of_measure(tenant_id,unit_code,unit_name,base_unit_id,conversion_factor)
 VALUES(source_template.tenant_id,'QAC'||upper(left(gen_random_uuid()::text,8)),'小金额大换算验收单位'||p_first,line_template.base_unit_id,1000000) RETURNING id INTO conversion_unit;
 UPDATE public.mdm_material SET unit_conversions=unit_conversions||jsonb_build_array(jsonb_build_object('source_unit_id',conversion_unit,'source_factor',1,'base_factor',1000000))
 WHERE id=line_template.material_id AND tenant_id=source_template.tenant_id;

 FOR scenario IN p_first..p_last LOOP
  source_id:=gen_random_uuid();source_line_id:=gen_random_uuid();cost_batch_id:=gen_random_uuid();stock_movement_id:=gen_random_uuid();
  batch_code:='QA_COST_'||upper(left(source_id::text,8));
  source_quantity:=CASE scenario WHEN 2 THEN 2 WHEN 3 THEN 10000 WHEN 4 THEN 3 WHEN 9 THEN 3 WHEN 11 THEN 2 ELSE 1 END;
  source_price:=CASE scenario WHEN 3 THEN 1 WHEN 4 THEN 0.0033 WHEN 9 THEN 0.0033 WHEN 10 THEN 0.01 ELSE 100 END;
  expected_basic_quantity:=CASE WHEN scenario=10 THEN 1000000 ELSE source_quantity END;
  source_amount:=round(source_quantity*source_price,2);
  tax_rate:=CASE WHEN scenario IN(6,7,8) THEN 13 ELSE 0 END;
  estimate_excludes_tax:=scenario NOT IN(6,8);
  finance_excludes_tax:=scenario NOT IN(6,7);
  stock_payload:=(to_jsonb(line_template)-ARRAY['id','document_id','movement_id','source_batch_id','source_order_target_line_id','source_document','source_line_no','create_by','create_time','update_by','update_time'])||jsonb_build_object(
   'line_no',10,'quantity',source_quantity,'base_quantity',source_quantity,
   'unit_price',source_price,'tax_inclusive_unit_price',round(source_price*(1+tax_rate/100),4),'tax_rate',tax_rate,
   'amount',source_amount,'tax_amount',round(source_amount*tax_rate/100,2),'total_amount',source_amount+round(source_amount*tax_rate/100,2),
   'batch_no',batch_code,'gift',false,'discount_method','none','unit_discount_rate',0,'discount_amount',0);
  IF scenario=10 THEN stock_payload:=stock_payload||jsonb_build_object('inventory_unit_id',conversion_unit,'base_quantity',expected_basic_quantity);END IF;
  source_payload:=(to_jsonb(source_template)-ARRAY['id','document_no','status','approved_at','create_by','create_time','update_by','update_time'])||jsonb_build_object(
   'business_date',source_date,'accounting_date',source_date,'remark','事务回滚库存成本测试','lines',jsonb_build_array(stock_payload));
  source_id:=public.wms_save_purchase_document_secure(source_payload);
  PERFORM public.wms_change_purchase_document_status_secure(source_id,'submit');
  PERFORM public.wms_change_purchase_document_status_secure(source_id,'approve');
  SELECT id,movement_id INTO STRICT source_line_id,stock_movement_id FROM public.wms_purchase_document_line WHERE document_id=source_id;
  SELECT target_batch_id,unit_cost INTO STRICT cost_batch_id,original_stock_price FROM public.wms_inventory_movement WHERE id=stock_movement_id;
  IF scenario=10 AND round(original_stock_price*expected_basic_quantity,2)<>source_amount THEN RAISE EXCEPTION 'Purchase posting rounded a valid tiny unit cost down to zero';END IF;
  SELECT count(*) INTO movement_count FROM public.wms_inventory_movement WHERE tenant_id=source_template.tenant_id;

  estimate:=public.wms_push_purchase_payables_secure('estimated',jsonb_build_array(jsonb_build_object('document_id',source_id)))->0;
  estimate:=public.fms_save_purchase_payable_secure(app_private.purchase_payable_json((estimate->>'id')::uuid)||jsonb_build_object('tax_excluded_from_cost',estimate_excludes_tax));
  IF scenario=9 THEN
   estimate:=public.fms_save_purchase_payable_secure(jsonb_set(estimate,'{lines}',jsonb_build_array(estimate->'lines'->0||jsonb_build_object('quantity',1,'base_quantity',1))));
   second_estimate:=public.wms_push_purchase_payables_secure('estimated',jsonb_build_array(jsonb_build_object('document_id',source_id)))->0;
  ELSE
   PERFORM public.fms_act_purchase_payable_secure(ARRAY[(estimate->>'id')::uuid],'submit');
   PERFORM public.fms_act_purchase_payable_secure(ARRAY[(estimate->>'id')::uuid],'approve');
  END IF;
  part_count:=CASE scenario WHEN 2 THEN 2 WHEN 4 THEN 3 ELSE 1 END;
  expected_adjustment:=0;matched_quantity:=0;original_allocated:=0;
  FOR part_index IN 1..part_count LOOP
   financial:=public.wms_push_purchase_payables_secure('financial',jsonb_build_array(jsonb_build_object('document_id',source_id)))->0;
   financial:=app_private.purchase_payable_json((financial->>'id')::uuid);
   part_quantity:=CASE WHEN part_count>1 THEN 1 ELSE source_quantity END;
   price_value:=CASE scenario WHEN 3 THEN 1 WHEN 4 THEN 0.01 WHEN 9 THEN 0.01 WHEN 10 THEN 0.02 WHEN 2 THEN CASE WHEN part_index=1 THEN 110 ELSE 110.01 END ELSE 110 END;
   line_value:=financial->'lines'->0||jsonb_build_object('quantity',part_quantity,'base_quantity',CASE WHEN scenario=10 THEN expected_basic_quantity ELSE part_quantity END,
    'unit_price',price_value,'tax_inclusive_unit_price',round(price_value*(1+tax_rate/100),4),'price_basis','net',
    'gift',scenario=5,'tax_rate',tax_rate);
   IF scenario=11 THEN line_value:=line_value||jsonb_build_object('base_unit_id',conversion_unit,'base_quantity',0.000002,'base_quantity_edited',true);END IF;
   IF scenario=3 THEN line_value:=line_value||jsonb_build_object('total_amount',10000.01);END IF;
   financial:=public.fms_save_purchase_payable_secure(financial||jsonb_build_object('input_amount',scenario=3,
    'input_tax_inclusive_price',scenario=3,'tax_excluded_from_cost',finance_excludes_tax,'lines',jsonb_build_array(line_value)));
   IF scenario=9 THEN
    PERFORM public.fms_act_purchase_payable_secure(ARRAY[(estimate->>'id')::uuid,(second_estimate->>'id')::uuid],'submit');
    PERFORM public.fms_act_purchase_payable_secure(ARRAY[(estimate->>'id')::uuid,(second_estimate->>'id')::uuid],'approve');
   END IF;
   PERFORM public.fms_act_purchase_payable_secure(ARRAY[(financial->>'id')::uuid],'submit');
   PERFORM public.fms_act_purchase_payable_secure(ARRAY[(financial->>'id')::uuid],'approve');
   preview:=public.fms_preview_payable_stock_cost_secure((financial->>'id')::uuid);
   IF NOT(preview->'lines'->0->>'all_stock')::boolean OR(preview->'lines'->0->>'valuation_gap')::numeric<>0 THEN
    RAISE EXCEPTION 'Unchanged full stock failed quantity/value proof in scenario %: %',scenario,preview;
   END IF;
   expected_adjustment:=expected_adjustment+(select sum((value->>'adjustment_amount')::numeric) from jsonb_array_elements(preview->'lines'));
   matched_quantity:=matched_quantity+(select sum((value->>'basic_quantity')::numeric) from jsonb_array_elements(preview->'lines'));
   original_allocated:=original_allocated+(select sum((value->>'original_amount')::numeric) from jsonb_array_elements(preview->'lines'));
   IF(app_private.purchase_payable_json((financial->>'id')::uuid)->>'matched_amount')::numeric<>0 THEN RAISE EXCEPTION 'Source association was falsely shown as completed stock costing';END IF;
   IF scenario=9 AND(jsonb_array_length(preview->'lines')<>2 OR preview->'lines'->0->'batches'->0->>'after_unit_cost' IS DISTINCT FROM preview->'lines'->1->'batches'->0->>'unit_cost') THEN
    RAISE EXCEPTION 'Split estimated tranches did not receive an ordered cumulative batch preview';END IF;
   IF scenario=1 THEN
    blocked:=false;
    BEGIN PERFORM public.fms_match_payable_stock_cost_secure((financial->>'id')::uuid);
    EXCEPTION WHEN serialization_failure THEN blocked:=SQLERRM LIKE '%重新预览%';END;
    IF NOT blocked THEN RAISE EXCEPTION 'Cost matching without a preview token was accepted';END IF;
    UPDATE public.wms_inventory_batch SET unit_cost=unit_cost+1 WHERE id=cost_batch_id;
    blocked:=false;
    BEGIN PERFORM public.fms_match_payable_stock_cost_secure((financial->>'id')::uuid,cost_date,true,preview->>'preview_token');
    EXCEPTION WHEN serialization_failure THEN blocked:=SQLERRM LIKE '%重新预览%';END;
    IF NOT blocked THEN RAISE EXCEPTION 'Changed valuation bypassed the confirmed preview';END IF;
    UPDATE public.wms_inventory_batch SET unit_cost=original_stock_price WHERE id=cost_batch_id;
    preview:=public.fms_preview_payable_stock_cost_secure((financial->>'id')::uuid);
   END IF;
   IF scenario IN(6,8) THEN
    IF(preview->'lines'->0->>'baseline_difference')::numeric<>13 THEN RAISE EXCEPTION 'Tax-in-cost stock baseline bridge was lost';END IF;
    blocked:=false;
    BEGIN PERFORM public.fms_match_payable_stock_cost_secure((financial->>'id')::uuid,cost_date,false,preview->>'preview_token');
    EXCEPTION WHEN check_violation THEN blocked:=SQLERRM LIKE '%基线差额%';END;
    IF NOT blocked THEN RAISE EXCEPTION 'Unacknowledged stock baseline difference was accepted';END IF;
    blocked:=false;
    BEGIN PERFORM public.fms_match_payable_stock_cost_secure((financial->>'id')::uuid,cost_date,NULL,preview->>'preview_token');
    EXCEPTION WHEN check_violation THEN blocked:=SQLERRM LIKE '%基线差额%';END;
    IF NOT blocked THEN RAISE EXCEPTION 'NULL baseline acknowledgement bypassed explicit confirmation';END IF;
   END IF;
   IF scenario=7 THEN PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',source_template.tenant_id)::text,true);END IF;
   IF scenario=5 THEN
    PERFORM set_config('request.jwt.claim.sub',ordinary_actor::text,true);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ordinary_actor,'role','authenticated')::text,true);
    PERFORM set_config('request.headers','{}',true);
    EXECUTE 'SET LOCAL ROLE authenticated';
   END IF;
   IF scenario=8 THEN
    PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
    blocked:=false;
    BEGIN PERFORM public.fms_preview_payable_stock_cost_secure((financial->>'id')::uuid);
    EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
    IF NOT blocked THEN RAISE EXCEPTION 'Platform-selected cost preview escaped the selected tenant';END IF;
    PERFORM set_config('request.headers','{}',true);
    PERFORM public.fms_preview_payable_stock_cost_secure((financial->>'id')::uuid);
    PERFORM set_config('request.jwt.claim.sub',ordinary_actor::text,true);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ordinary_actor,'role','authenticated')::text,true);
    PERFORM public.fms_preview_payable_stock_cost_secure((financial->>'id')::uuid);
    PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
    EXECUTE 'SET LOCAL ROLE authenticated';
   END IF;
   matched_result:=public.fms_match_payable_stock_cost_secure((financial->>'id')::uuid,cost_date,true,preview->>'preview_token');
   IF scenario=7 THEN PERFORM set_config('request.headers','{}',true);END IF;
   IF scenario=5 THEN
    EXECUTE 'RESET ROLE';
    IF NOT EXISTS(SELECT 1 FROM public.fms_payable_stock_cost_match WHERE document_id=(financial->>'id')::uuid AND actor=ordinary_actor AND tenant_id=source_template.tenant_id) THEN
     RAISE EXCEPTION 'Ordinary own-tenant matching did not retain its actual tenant and actor';END IF;
    PERFORM set_config('request.jwt.claim.sub',root_actor::text,true);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',root_actor,'role','authenticated')::text,true);
   END IF;
   IF scenario=8 THEN
    EXECUTE 'RESET ROLE';
    IF NOT EXISTS(SELECT 1 FROM public.fms_payable_stock_cost_match WHERE document_id=(financial->>'id')::uuid AND actor=ordinary_actor AND tenant_id=source_template.tenant_id) THEN
     RAISE EXCEPTION 'Ordinary forged-header execution changed the actual tenant or actor';END IF;
    DELETE FROM public.sys_role_menu WHERE role_id=cost_role AND menu_id=cost_menu;
    blocked:=false;
    BEGIN PERFORM public.fms_preview_payable_stock_cost_secure((financial->>'id')::uuid);
    EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
    IF NOT blocked THEN RAISE EXCEPTION 'Revoked cost permission still allowed preview';END IF;
    INSERT INTO public.sys_role_menu(tenant_id,role_id,menu_id) VALUES(source_template.tenant_id,cost_role,cost_menu);
    DELETE FROM public.sys_role_menu WHERE role_id=cost_role AND menu_id IN(SELECT id FROM public.sys_menu WHERE name='FinancePurchasePayable:View');
    blocked:=false;
    BEGIN PERFORM public.fms_preview_payable_stock_cost_secure((financial->>'id')::uuid);
    EXCEPTION WHEN insufficient_privilege THEN blocked:=true;END;
    IF NOT blocked THEN RAISE EXCEPTION 'Cost permission bypassed the document View permission';END IF;
    PERFORM set_config('request.jwt.claim.sub',root_actor::text,true);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',root_actor,'role','authenticated')::text,true);
    PERFORM set_config('request.headers','{}',true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    blocked:=false;
    BEGIN UPDATE public.wms_inventory_batch SET unit_cost=unit_cost+1 WHERE id=cost_batch_id;
    EXCEPTION WHEN check_violation THEN blocked:=SQLERRM LIKE '%受控成本调整%';END;
    EXECUTE 'RESET ROLE';
    IF NOT blocked THEN RAISE EXCEPTION 'Direct authenticated batch update bypassed the cost journal';END IF;
   END IF;
   IF(matched_result->>'affected')::integer<>(CASE WHEN scenario=9 THEN 2 ELSE 1 END) THEN RAISE EXCEPTION 'Cost matching did not post every planned line';END IF;
   IF(app_private.purchase_payable_json((financial->>'id')::uuid)->>'matched_amount')::numeric<>(app_private.purchase_payable_json((financial->>'id')::uuid)->>'total_amount')::numeric THEN
    RAISE EXCEPTION 'Completed costing did not update the actual matched payable amount';END IF;
   IF app_private.purchase_payable_json((financial->>'id')::uuid)->>'matching_status'<>'full' THEN RAISE EXCEPTION 'Completed zero-value or ordinary costing did not become fully matched';END IF;
   SELECT round(quantity*unit_cost,2) INTO stock_value FROM public.wms_inventory_batch WHERE id=cost_batch_id;
   IF stock_value<>source_amount+expected_adjustment OR(SELECT quantity FROM public.wms_inventory_batch WHERE id=cost_batch_id)<>expected_basic_quantity THEN
    RAISE EXCEPTION 'Stock value or quantity mismatch in scenario %',scenario;
   END IF;
   SELECT count(*) INTO snapshot_count FROM public.fms_payable_stock_cost_entry entry WHERE entry.batch_id=cost_batch_id;
   IF(public.fms_match_payable_stock_cost_secure((financial->>'id')::uuid,cost_date,true,preview->>'preview_token')->>'affected')::integer<>0
    OR(SELECT count(*) FROM public.fms_payable_stock_cost_entry entry WHERE entry.batch_id=cost_batch_id)<>snapshot_count THEN
    RAISE EXCEPTION 'Cost matching replay posted twice';END IF;
   IF app_private.stock_unit_cost_at(cost_batch_id,source_date,0)<>original_stock_price THEN RAISE EXCEPTION 'Historic inventory unit cost was rewritten';END IF;
  END LOOP;
  expected_stock:=CASE scenario WHEN 1 THEN 110 WHEN 2 THEN 220.01 WHEN 3 THEN 10000.01 WHEN 4 THEN 0.03 WHEN 5 THEN 0 WHEN 6 THEN 124.3 WHEN 7 THEN 124.3 WHEN 8 THEN 110 WHEN 9 THEN 0.03 WHEN 10 THEN 0.02 WHEN 11 THEN 220 END;
  IF stock_value<>expected_stock OR matched_quantity<>expected_basic_quantity OR original_allocated<>source_amount THEN
   RAISE EXCEPTION 'Final cost, cumulative quantity or baseline cents do not reconcile in scenario %',scenario;
  END IF;
  IF(SELECT count(*) FROM public.wms_inventory_movement WHERE tenant_id=source_template.tenant_id)<>movement_count
   OR(SELECT unit_cost FROM public.wms_inventory_movement WHERE id=stock_movement_id)<>original_stock_price THEN
   RAISE EXCEPTION 'Cost matching invented or repriced physical stock movements';END IF;
  report:=public.wms_inventory_report_secure(p_kind=>'ledger',p_date_start=>source_date,p_date_end=>source_date,p_batch_no=>batch_code,p_tenant_id=>source_template.tenant_id);
  IF jsonb_array_length(report->'data')<>1 OR round((report->'data'->0->>'amount')::numeric,2)<>source_amount THEN RAISE EXCEPTION 'Historical ledger value was rewritten';END IF;
  report:=public.wms_inventory_report_secure(p_kind=>'ledger',p_date_start=>source_date,p_date_end=>cost_date,p_batch_no=>batch_code,p_tenant_id=>source_template.tenant_id);
  IF round((report->'data'->0->>'amount')::numeric,2)<>expected_stock THEN RAISE EXCEPTION 'Current ledger omitted cost adjustment';END IF;
  report:=public.wms_inventory_report_secure(p_kind=>'movement',p_date_start=>source_date,p_date_end=>cost_date,p_batch_no=>batch_code,p_tenant_id=>source_template.tenant_id);
  IF jsonb_array_length(report->'data')<>(CASE WHEN scenario=9 THEN 3 ELSE part_count+1 END)
   OR(select sum((value->>'amount')::numeric) from jsonb_array_elements(report->'data'))<>expected_stock
   OR exists(select 1 from jsonb_array_elements(report->'data') where (value->>'is_cost_adjustment')::boolean AND((value->>'inventory_quantity')::numeric<>0 OR value->>'source_document_kind'<>'financial_payable' OR value->>'source_document_id' IS NULL)) THEN
   RAISE EXCEPTION 'Value-only cost entries, original source link or movement amount reconciliation failed in scenario %: %',scenario,report;END IF;
  blocked:=false;
  BEGIN
   INSERT INTO public.wms_inventory_movement
   SELECT(jsonb_populate_record(NULL::public.wms_inventory_movement,to_jsonb(movement_template)||jsonb_build_object(
    'id',gen_random_uuid(),'movement_type','other_out','source_batch_id',cost_batch_id,'target_batch_id',NULL,
    'quantity',1,'unit_cost',source_price,'reference_no',batch_code,'occurred_at',source_date))).*;
  EXCEPTION WHEN check_violation THEN blocked:=SQLERRM LIKE '%成本勾稽%';END;
  IF NOT blocked THEN RAISE EXCEPTION 'Backdated stock movement bypassed cost history';END IF;
  IF scenario=9 THEN
   saved_preview:=public.fms_preview_payable_stock_cost_secure((financial->>'id')::uuid);
   issued_movement_id:=public.wms_post_inventory_movement_secure(jsonb_build_object('movement_type','other_out','batch_id',cost_batch_id,'quantity',1,'reference_no','QA_COST_HISTORY'));
   INSERT INTO public.wms_inventory_movement
   SELECT(jsonb_populate_record(NULL::public.wms_inventory_movement,to_jsonb(issued)||jsonb_build_object(
    'id',gen_random_uuid(),'reference_no','QA_COST_DAY_EDGE','occurred_at',((cost_date-1)::timestamp+interval '20 hours') AT TIME ZONE 'UTC'))).* FROM public.wms_inventory_movement issued WHERE id=issued_movement_id;
   UPDATE public.wms_inventory_batch SET quantity=quantity-1 WHERE id=cost_batch_id;
   report:=public.wms_inventory_report_secure(p_kind=>'ledger',p_date_start=>cost_date,p_date_end=>cost_date,p_batch_no=>batch_code,p_tenant_id=>source_template.tenant_id);
   IF(report->'data'->0->>'opening_quantity')::numeric<>3 OR(report->'data'->0->>'outbound_quantity')::numeric<>2 OR(report->'data'->0->>'closing_quantity')::numeric<>1 THEN
    RAISE EXCEPTION 'China-business-date inventory quantities did not reconcile across the UTC boundary';END IF;
   report:=public.wms_inventory_report_secure(p_kind=>'movement',p_date_start=>source_date,p_date_end=>source_date,p_batch_no=>batch_code,p_tenant_id=>source_template.tenant_id);
   IF EXISTS(select 1 from jsonb_array_elements(report->'data') where value->>'direction'='out') THEN RAISE EXCEPTION 'China business-date outflow leaked into the previous calendar day';END IF;
   UPDATE public.fms_payable_accrual_policy SET effective_from=cost_date+1 WHERE tenant_id=source_template.tenant_id AND organization_id=source_template.organization_id;
   preview:=public.fms_preview_payable_stock_cost_secure((financial->>'id')::uuid);
   IF preview->'lines' IS DISTINCT FROM saved_preview->'lines' OR preview->>'preview_token' IS DISTINCT FROM saved_preview->>'preview_token' THEN
    RAISE EXCEPTION 'Completed costing preview changed with later stock or policy changes';END IF;
   UPDATE public.fms_payable_accrual_policy SET effective_from=source_date WHERE tenant_id=source_template.tenant_id AND organization_id=source_template.organization_id;
  END IF;
  IF scenario=10 THEN
   DELETE FROM public.sys_role_menu WHERE role_id=cost_role AND menu_id IN(SELECT id FROM public.sys_menu WHERE name='FinancePurchasePayable:View');
   INSERT INTO public.sys_role_menu(tenant_id,role_id,menu_id)
   SELECT source_template.tenant_id,cost_role,id FROM public.sys_menu WHERE name IN('WmsStock:View','WmsInventoryLedger:View','WmsStockLedger:View','WmsMaterialReceiptIssue:View','MdmMaterialArchive:View') ON CONFLICT DO NOTHING;
   PERFORM set_config('request.jwt.claim.sub',ordinary_actor::text,true);
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',ordinary_actor,'role','authenticated')::text,true);
   PERFORM set_config('request.headers',jsonb_build_object('x-art-tenant-scope',other_tenant)::text,true);
   EXECUTE 'SET LOCAL ROLE authenticated';
   IF app_private.has_permission('FinancePurchasePayable:View') THEN RAISE EXCEPTION 'Warehouse-only cost report inherited financial View authority';END IF;
   report:=public.wms_inventory_report_secure(p_kind=>'movement',p_date_start=>source_date,p_date_end=>cost_date,p_batch_no=>batch_code,p_tenant_id=>source_template.tenant_id);
   IF NOT EXISTS(select 1 from jsonb_array_elements(report->'data') where(value->>'is_cost_adjustment')::boolean AND(value->>'amount')::numeric=0.01 AND value->>'source_document_id'=financial->>'id' AND value->>'document_no'=financial->>'document_no') THEN
    RAISE EXCEPTION 'Warehouse-only report lost its monetary adjustment or readable source reference';END IF;
   EXECUTE 'RESET ROLE';
   DELETE FROM public.sys_role_menu WHERE role_id=cost_role AND menu_id IN(SELECT id FROM public.sys_menu WHERE name IN('WmsStock:View','WmsInventoryLedger:View','WmsStockLedger:View','WmsMaterialReceiptIssue:View'));
   EXECUTE 'SET LOCAL ROLE authenticated';
   IF EXISTS(SELECT 1 FROM public.fms_payable_stock_cost_entry WHERE batch_id=cost_batch_id) THEN RAISE EXCEPTION 'Material View or a lone CostMatch action exposed inventory valuation records';END IF;
   EXECUTE 'RESET ROLE';
   PERFORM set_config('request.jwt.claim.sub',root_actor::text,true);
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',root_actor,'role','authenticated')::text,true);
   PERFORM set_config('request.headers','{}',true);
  END IF;
 END LOOP;
 IF has_function_privilege('anon','public.fms_match_payable_stock_cost_secure(uuid,date,boolean,text)','EXECUTE')
  OR has_function_privilege('anon','public.fms_preview_payable_stock_cost_secure(uuid)','EXECUTE')
  OR has_function_privilege('authenticated','app_private.payable_stock_cost_context(uuid,jsonb)','EXECUTE') THEN
  RAISE EXCEPTION 'Stock costing exposed anonymous or unguarded private execution';END IF;
 IF has_table_privilege('authenticated','public.fms_payable_stock_cost_match','INSERT')
  OR has_table_privilege('authenticated','public.fms_payable_stock_cost_entry','UPDATE')
  OR has_table_privilege('anon','public.fms_payable_stock_cost_entry','SELECT') THEN
  RAISE EXCEPTION 'Cost journal direct grants bypassed the controlled writer';END IF;
END $stock_cost$;

SELECT pg_temp.assert_payable_stock_cost(1,1);
SELECT pg_temp.assert_payable_stock_cost(2,2);
SELECT pg_temp.assert_payable_stock_cost(3,3);
SELECT pg_temp.assert_payable_stock_cost(4,4);
SELECT pg_temp.assert_payable_stock_cost(5,5);
SELECT pg_temp.assert_payable_stock_cost(6,6);
SELECT pg_temp.assert_payable_stock_cost(7,7);
SELECT pg_temp.assert_payable_stock_cost(8,8);
SELECT pg_temp.assert_payable_stock_cost(9,9);
SELECT pg_temp.assert_payable_stock_cost(10,10);
SELECT pg_temp.assert_payable_stock_cost(11,11);

ROLLBACK;
