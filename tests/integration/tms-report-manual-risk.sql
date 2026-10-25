BEGIN;
DO $t$ DECLARE j jsonb; n int; BEGIN
perform set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
j:=public.tms_management_report('business-risk','2026-09-01','2026-10-24','报表验收',0,200);
select count(*) into n from jsonb_array_elements(j->'records') r where r->>'exception_source'='manual' and r->>'status'='已结案'
and r->>'exception_id' in ('9c2f677d-300e-4de1-a500-7975c3d34ca8','b943b4e4-b121-40e8-8cdc-bbfab7fd88da');
if n<>2 then raise exception 'Manual risks missing: %',j; end if;
if exists(select 1 from jsonb_array_elements(j->'records') r where r->>'order_no' in ('YD202610-009','YD202610-010') and r->>'status'='待核实') then raise exception 'Duplicate delay prompts'; end if;
if not exists(select 1 from jsonb_array_elements(j->'records') r where r->>'exception_id'='9c2f677d-300e-4de1-a500-7975c3d34ca8' and (r->>'risk_amount')::numeric=100 and r->>'currency'='CNY') then raise exception 'Manual amount mismatch'; end if;
END $t$;
ROLLBACK;
