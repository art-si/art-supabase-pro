-- Existing QA return rows: planned totals remain separate from approved financial actuals.
-- Scope checks cover platform all/selected and ordinary own/forged-header reads.
begin;
do $check$
declare report jsonb; item jsonb;
begin
 perform set_config('request.jwt.claims','{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
 perform set_config('request.headers','{}',true);
 report:=public.tms_return_profit_report_secure(0,100,'2026-10-01','2026-10-31',null);
 if (report->'summary'->>'returnCount')::integer<3 then raise exception 'Platform-all return rows missing';end if;
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
 perform set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
 perform set_config('request.headers','{}',true);
 report:=public.tms_return_profit_report_secure(0,100,'2026-10-01','2026-10-31',null);
 if (report->'summary'->>'returnCount')::integer<>0 then raise exception 'Ordinary own scope mismatch';end if;
 perform set_config('request.headers','{"x-art-tenant-scope":"2824c2b5-2774-4781-b995-f55e8bcee920"}',true);
 report:=public.tms_return_profit_report_secure(0,100,'2026-10-01','2026-10-31',null);
 if (report->'summary'->>'returnCount')::integer<>0 then raise exception 'Forged header leaked return rows';end if;
end $check$;
rollback;
