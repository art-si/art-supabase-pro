-- The workbench and aging report must sign credit receivables consistently.
begin;
select set_config('request.jwt.claims','{"sub":"0a872664-874c-447d-a256-d0dbdca6ed45","role":"authenticated"}',true);
select set_config('request.headers','{"x-art-tenant-scope":"2824c2b5-2774-4781-b995-f55e8bcee920"}',true);
do $test$
declare org uuid; j jsonb; report jsonb; expected numeric;
begin
 select settlement_organization_id into org from public.fms_receivable_document where tenant_id='2824c2b5-2774-4781-b995-f55e8bcee920' and kind='financial' and not is_credit limit 1;
 if org is null then raise exception 'Missing QA organization'; end if;
 j:=public.fms_receivable_writeoff_candidates_secure(jsonb_build_object('organizationId',org,'counterpartyType','customer'));
 report:=public.fms_ar_report_secure(jsonb_build_object('mode','detail','kind','financial','asOfDate',current_date));
 select coalesce(sum((value->>'balanceAmount')::numeric),0) into expected from jsonb_array_elements(report->'records')
 where coalesce(value->>'dueDate',value->>'due_date')::date between date_trunc('month',current_date)::date and (date_trunc('month',current_date)+interval '1 month - 1 day')::date;
 if (j->'summary'->>'dueThisMonthAmount')::numeric<>expected then raise exception 'Monthly due KPI disagrees with signed receivable aging: % versus %',j->'summary'->>'dueThisMonthAmount',expected;end if;
end $test$;
select 'writeoff monthly-due KPI matches signed receivable aging' result;
rollback;
