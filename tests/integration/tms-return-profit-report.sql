-- Existing QA return rows: planned totals remain separate from approved financial actuals.
-- Scope checks cover platform all/selected and ordinary own/forged-header reads.
begin;
do $check$
declare
 report jsonb;
 item jsonb;
 preview jsonb;
 detail jsonb;
 qa_search text := 'QA-RETURN-20261027';
 qa_tenant text := '7529f951-938e-4e2c-ac0d-316c136ae1f9';
begin
 perform set_config('request.jwt.claims','{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
 perform set_config('request.headers','{}',true);
 report:=public.tms_return_profit_report_secure(0,100,'2026-10-01','2026-10-31',qa_search);
 if (report->'summary'->>'returnCount')::integer<>2
   or (report->'summary'->>'projectedRevenue')::numeric<>4100
   or (report->'summary'->>'projectedGrossProfit')::numeric<>3400 then
   raise exception 'Platform-all QA return totals drifted: %',report->'summary';
 end if;
 if not exists (select 1 from jsonb_array_elements(report->'records') row
   where row->>'legId'='994a4e81-fc61-41de-9ce3-fe55bc9b0d29'
     and row->>'tenantId'=qa_tenant
     and (row->>'plannedRevenue')::numeric=1800
     and (row->>'projectedGrossProfit')::numeric=1430)
   or not exists (select 1 from jsonb_array_elements(report->'records') row
   where row->>'legId'='be9aab20-c564-4a0a-8749-0b07e28439ce'
     and row->>'tenantId'=qa_tenant
     and (row->>'plannedRevenue')::numeric=2300
     and (row->>'projectedGrossProfit')::numeric=1970) then
   raise exception 'Platform-all omitted or changed a designated QA return leg';
 end if;
 perform set_config('request.headers','{"x-art-tenant-scope":"2824c2b5-2774-4781-b995-f55e8bcee920"}',true);
 report:=public.tms_return_profit_report_secure(0,100,'2026-10-01','2026-10-31','QA-MAIN-WB-20261026');
 if (report->'summary'->>'returnCount')::integer<>3
   or (report->'summary'->>'pendingCount')::integer<>3
   or (report->'summary'->>'approvedCount')::integer<>0
   or (report->'summary'->>'projectedRevenue')::numeric<>4300
   or (report->'summary'->>'projectedCommission')::numeric<>500
   or (report->'summary'->>'projectedGrossProfit')::numeric<>3260
   or report->'summary'->'approvedGrossProfitToDate'<>'null'::jsonb then
   raise exception 'Platform-selected planned/actual return totals drifted: %',report->'summary';
 end if;
 for item in select value from jsonb_array_elements(report->'records') loop
  if item->>'tenantId'<>'2824c2b5-2774-4781-b995-f55e8bcee920'
    then raise exception 'Selected tenant leaked another tenant';
  end if;
 end loop;
 if not exists (select 1 from jsonb_array_elements(report->'records') row
   where row->>'legId'='3911375f-918f-4084-bebe-5610b3f4338b'
     and (row->>'plannedCommission')::numeric=500
     and (row->>'projectedGrossProfit')::numeric=580) then
   raise exception 'Matched return commission was not deducted in the report';
 end if;
 report:=public.tms_return_profit_report_secure(0,100,'2026-11-09','2026-11-11',
   'YWD202610300000010');
 if (report->'summary'->>'returnCount')::integer<>2
   or (report->'summary'->>'projectedRevenue')::numeric<>1800
   or (report->'summary'->>'projectedCommission')::numeric<>1000
   or (report->'summary'->>'projectedGrossProfit')::numeric<>500
   or exists (select 1 from jsonb_array_elements(report->'records') row
     where (row->>'plannedCommission')::numeric<>500
       or (row->>'projectedGrossProfit')::numeric<>250
       or row->>'plateNo'<>'测A返程02') then
   raise exception 'November QA return commission totals drifted: %',report;
 end if;
 detail:=public.tms_get_return_trip_summary_secure(
   '5b717d46-4873-42e5-93a7-613c4bdede95');
 if (detail->>'returnPlannedCommission')::numeric<>500
   or (detail->>'returnProjectedGrossProfit')::numeric<>250
   or (detail->>'returnProjectedMargin')::numeric<>27.78
   or (detail->'forwardCommissionEstimate'->>'amount')::numeric<>800
   or detail->'returnActualGrossProfit'<>'null'::jsonb then
   raise exception 'November QA detail deducted the wrong commission: %',detail;
 end if;
 preview:=public.tms_preview_return_leg_commission_secure(
   '5b717d46-4873-42e5-93a7-613c4bdede95',jsonb_build_object(
     'return_customer_id','23754bd1-d87b-4660-a45b-e69210346d01',
     'origin_station','QA广州','destination_station','QA上海',
     'planned_departure_at','2026-11-09 19:00+08',
     'distance_km',1200,'cargo_weight_tons',1,'cargo_volume_m3',3,
     'freight_income',900,'information_fee',40,'technical_service_fee',20,
     'direct_toll_fee',80,'direct_misc_fee',10,'shared_cost_allocation_pct',0,
     'driver_id','00000000-0000-0000-0000-000000000000'));
 if preview->>'matched'<>'true' or (preview->>'amount')::numeric<>500
   or (preview->>'projectedGrossProfit')::numeric<>250
   or (preview->>'projectedGrossMargin')::numeric<>27.78 then
   raise exception 'Read-only preview did not use the parent driver: %',preview;
 end if;
 perform set_config('request.headers','{"x-art-tenant-scope":"7529f951-938e-4e2c-ac0d-316c136ae1f9"}',true);
 report:=public.tms_return_profit_report_secure(0,100,'2026-10-01','2026-10-31',qa_search);
 if (report->'summary'->>'returnCount')::integer<>2
   or (report->'summary'->>'projectedRevenue')::numeric<>4100
   or (report->'summary'->>'projectedGrossProfit')::numeric<>3400
   or exists (select 1 from jsonb_array_elements(report->'records') row
     where row->>'tenantId'<>qa_tenant) then
   raise exception 'Platform-selected QA return scope or totals drifted: %',report;
 end if;
 perform set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
 perform set_config('request.headers','{}',true);
 report:=public.tms_return_profit_report_secure(0,100,'2026-10-01','2026-10-31',qa_search);
 if (report->'summary'->>'returnCount')::integer<>2
   or (report->'summary'->>'projectedRevenue')::numeric<>4100
   or (report->'summary'->>'projectedGrossProfit')::numeric<>3400 then
   raise exception 'Ordinary own QA return scope or totals drifted: %',report->'summary';
 end if;
 perform set_config('request.headers','{"x-art-tenant-scope":"2824c2b5-2774-4781-b995-f55e8bcee920"}',true);
 report:=public.tms_return_profit_report_secure(0,100,'2026-10-01','2026-10-31',qa_search);
 if (report->'summary'->>'returnCount')::integer<>2
   or (report->'summary'->>'projectedRevenue')::numeric<>4100
   or (report->'summary'->>'projectedGrossProfit')::numeric<>3400
   or exists (select 1 from jsonb_array_elements(report->'records') row
     where row->>'tenantId'<>qa_tenant) then
   raise exception 'Forged header changed ordinary QA return scope: %',report;
 end if;
 begin
   perform public.tms_preview_return_leg_commission_secure(
     '5b717d46-4873-42e5-93a7-613c4bdede95',
     jsonb_build_object('origin_station','QA广州','destination_station','QA上海'));
   raise exception 'Ordinary user previewed another tenant';
 exception when insufficient_privilege then null;
 end;
 perform set_config('request.jwt.claims',
   '{"sub":"5774aa51-3bbb-4da5-abd4-7ea44b44ea6a","role":"authenticated"}',true);
 perform set_config('request.headers','{}',true);
 report:=public.tms_return_profit_report_secure(0,100,'2026-10-01','2026-10-31',qa_search);
 if report->'summary'->'projectedCommission'<>'null'::jsonb
   or exists (select 1 from jsonb_array_elements(report->'records') row
     where row->'plannedCommission'<>'null'::jsonb) then
   raise exception 'Cost-hidden report exposed commission';
 end if;
 preview:=public.tms_preview_return_leg_commission_secure(
   'a9fc0006-1023-4620-9220-000000000008',jsonb_build_object(
     'return_customer_id','a9fc0001-1023-4620-9220-000000000001',
     'origin_station','广州','destination_station','上海','freight_income',1800));
 if preview ? 'matched' or preview ? 'amount' or preview ? 'allocatedToll'
   or preview ? 'projectedGrossProfit' or preview ? 'projectedGrossMargin' then
   raise exception 'Cost-hidden preview exposed sensitive values: %',preview;
 end if;
 if app_private.apply_jsonb_amount_access(
   '{"returnPlannedCommission":500}'::jsonb,
   array['returnPlannedCommission'],'masked')->>'returnPlannedCommission'<>'***' then
   raise exception 'Masked commission did not use the existing amount mask';
 end if;
 if app_private.tms_return_projected_gross_profit(
   900,40,20,80,10,0,0,'{"amount":550,"manualOverride":{}}'::jsonb)<>200
   or app_private.tms_return_projected_gross_profit(
     900,40,20,80,10,0,0,'{"matched":false,"amount":null}'::jsonb)<>750 then
   raise exception 'Final override amount or unmatched default was ignored';
 end if;
end $check$;
rollback;
