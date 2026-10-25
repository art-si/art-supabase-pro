-- Reference labels identify parent business documents; every scope check rolls back.
begin;
set local role authenticated;
do $test$
declare actor text; scope text; kind integer; ids text[]; reader text; n integer;
begin
 foreach kind in array array[1,2] loop
  reader:=case kind when 1 then 'get_fms_payee_delete_dependencies_secure' else 'get_fms_repayment_delete_dependencies_secure' end;
  ids:=case kind when 1 then array['30a23f3c-f3f4-4501-a42e-aa40d726f05a'] else array['1cd2304f-f4c0-4440-9c2f-072ad65c6d45'] end;
  if has_function_privilege('anon','public.'||reader||'(text[],text)','EXECUTE') then raise exception 'Anonymous reader exposed'; end if;
  foreach actor in array array['0a872664-874c-447d-a256-d0dbdca6ed45','ab881b32-87d4-4dce-9014-ce488b8069df'] loop
   foreach scope in array array['','7529f951-938e-4e2c-ac0d-316c136ae1f9','6675a0d6-3ff6-4ab7-bb09-232d85ae96ad'] loop
    perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
    perform set_config('request.headers',case when scope='' then '{}' else jsonb_build_object('x-art-tenant-scope',scope)::text end,true);
    begin
     execute format('select count(*) from public.%I($1)',reader) into n using ids;
     if actor='0a872664-874c-447d-a256-d0dbdca6ed45' and scope='6675a0d6-3ff6-4ab7-bb09-232d85ae96ad' then raise exception 'Selected foreign references leaked'; end if;
     if n<2 then raise exception 'Expected business references missing'; end if;
    exception when insufficient_privilege then
     if not(actor='0a872664-874c-447d-a256-d0dbdca6ed45' and scope='6675a0d6-3ff6-4ab7-bb09-232d85ae96ad') then raise; end if;
    end;
   end loop;
  end loop;
 end loop;
 perform set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
 perform set_config('request.headers','{}',true);
 if not exists(select 1 from public.get_fms_payee_delete_dependencies_secure(array['30a23f3c-f3f4-4501-a42e-aa40d726f05a'])
  where source_table='fms_travel_loan' and record_no like 'JK%' and record_status='paid' and target_id<>'') then raise exception 'Loan number/status/navigation not readable'; end if;
 if not exists(select 1 from public.get_fms_payee_delete_dependencies_secure(array['30a23f3c-f3f4-4501-a42e-aa40d726f05a'])
  where source_table='tms_expense_reimbursement' and record_no like 'FYBX%' and target_id<>'') then raise exception 'Report number/navigation not readable'; end if;
 if not exists(select 1 from public.get_fms_repayment_delete_dependencies_secure(array['1cd2304f-f4c0-4440-9c2f-072ad65c6d45'])
  where source_table='fms_travel_repayment_receipt' and record_no='DEMO-HK202610-003-FINAL' and record_status='collected'
  and target_id='1cd2304f-f4c0-4440-9c2f-072ad65c6d45') then raise exception 'Receipt reference/status/navigation missing'; end if;
 begin
  perform public.get_fms_payee_delete_dependencies_secure(array['30a23f3c-f3f4-4501-a42e-aa40d726f05a','00000000-0000-0000-0000-000000000000']);
  raise exception 'Mixed missing references did not fail closed';
 exception when insufficient_privilege then null; end;
end $test$;
select 'payee and repayment deletion scope, parent numbering, receipt references and navigation passed' result;
rollback;
