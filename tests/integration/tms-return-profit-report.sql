-- Existing QA return rows: planned totals remain separate from approved financial actuals.
-- Scope checks cover platform all/selected and ordinary own/forged-header reads.
begin;
do $check$
declare
 report jsonb;
 item jsonb;
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
   or (report->'summary'->>'projectedGrossProfit')::numeric<>3760
   or report->'summary'->'approvedGrossProfitToDate'<>'null'::jsonb then
   raise exception 'Platform-selected planned/actual return totals drifted: %',report->'summary';
 end if;
 for item in select value from jsonb_array_elements(report->'records') loop
  if item->>'tenantId'<>'2824c2b5-2774-4781-b995-f55e8bcee920'
    then raise exception 'Selected tenant leaked another tenant';
  end if;
 end loop;
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
end $check$;
rollback;
