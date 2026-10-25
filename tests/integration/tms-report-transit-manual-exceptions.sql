BEGIN;
-- Temporary fixture changes are rolled back; retained UI acceptance records remain unchanged.
DO $t$
DECLARE j jsonb; r jsonb; BEGIN
perform set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
UPDATE public.tms_order SET planned_arrival_time=now()+interval '10 days'
WHERE id in ('a9fc0005-1023-4620-9220-000000000007','a9fc0005-1023-4620-9220-000000000008');
UPDATE public.tms_order_exception SET status='in_progress'
WHERE id='9c2f677d-300e-4de1-a500-7975c3d34ca8';
j:=public.tms_management_report('order-transit','2026-09-01','2026-10-24','报表验收',0,200);
select x into r from jsonb_array_elements(j->'records') x where x->>'order_no'='YD202610-009';
if r is null or r->>'exception_flag'<>'有异常' or r->>'description' not like '%人工工单（处理中）%' then raise exception 'Active manual exception missing: %',r; end if;
select x into r from jsonb_array_elements(j->'records') x where x->>'order_no'='YD202610-010';
if r is null or r->>'exception_flag'<>'有历史异常' or r->>'description' not like '%人工工单（已结案）%' then raise exception 'Closed manual history missing: %',r; end if;
UPDATE public.tms_order SET planned_arrival_time=now()-interval '1 day'
WHERE id='a9fc0005-1023-4620-9220-000000000008';
j:=public.tms_management_report('order-transit','2026-09-01','2026-10-24','报表验收',0,200);
select x into r from jsonb_array_elements(j->'records') x where x->>'order_no'='YD202610-010';
if r->>'exception_flag'<>'有异常' or r->>'description' not like '%已超过计划到达时间%' or r->>'description' not like '%人工工单（已结案）%' then raise exception 'Closed work order must not clear overdue execution: %',r; end if;
END $t$;
ROLLBACK;

