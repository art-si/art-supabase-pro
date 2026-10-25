begin;
select set_config('request.jwt.claims','{"sub":"ab881b32-87d4-4dce-9014-ce488b8069df","role":"authenticated"}',true);
do $test$
declare v_rule public.sys_document_number_rule%rowtype;v_before bigint;v_number text;v_key text;
begin
  foreach v_key in array array['fms.travel_application','fms.travel_loan','fms.travel_repayment','tms.expense_reimbursement'] loop
    select * into strict v_rule from public.sys_document_number_rule
    where tenant_id='7529f951-938e-4e2c-ac0d-316c136ae1f9' and rule_key=v_key;
    if v_rule.template not like '%{SEQ:3}' or v_rule.reset_cycle<>'month' then
      raise exception 'Expense document default numbering differs from the three-digit monthly specification'; end if;
    select current_value into v_before from public.sys_document_number_counter where rule_id=v_rule.id
      and rule_version=v_rule.rule_version and period_key=app_private.document_number_period_key('month',now(),v_rule.timezone);
    v_number:=app_private.next_document_number(v_key,v_rule.tenant_id);
    if v_number !~ '^(CCSQ|JK|HK|FYBX)[0-9]{6}-[0-9]{3}$'
      or right(v_number,3)::bigint<>coalesce(v_before+1,v_rule.sequence_start) then
      raise exception 'Document sequence was reset or emitted the wrong width'; end if;
  end loop;
  if app_private.document_number_period_key('month','2026-10-31 15:59:59+00','Asia/Shanghai')
     =app_private.document_number_period_key('month','2026-10-31 16:00:00+00','Asia/Shanghai') then
    raise exception 'Document month boundary ignored the configured timezone'; end if;
end $test$;
select 'three-digit monthly rules, continued counters and Shanghai month boundary passed' result;
rollback;
