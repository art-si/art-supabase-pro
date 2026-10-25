-- Shared form choices must exist as enabled dictionaries under business directories.
begin;
do $test$
declare
  choice record;
  actual_values text[];
  parent_code text;
begin
  for choice in
    select * from (values
      ('commonDocumentDisplayMode', 'commonBasicDirectory', array['document','line']::text[]),
      ('scmLoadingOutboundStatus', 'scmSalesDocuments', array['pending','partial','complete','all']::text[]),
      ('sysFieldPermissionSubjectType', 'sysIdentityDirectory', array['role','user']::text[]),
      ('mdmProductionEquipmentScopeMode', 'mdmProductionEquipmentDirectory', array['category','department','location']::text[]),
      ('hrTalentInventoryFilter', 'hrPeopleAnalytics', array['all','gap','high','unassessed']::text[]),
      ('hrSkillMatrixFilter', 'hrPeopleAnalytics', array['all','gap','ready','unassessed','unmodelled']::text[]),
      ('hrWorkforceRiskFilter', 'hrPeopleAnalytics', array['all','contract','qualification','probation','headcount']::text[]),
      ('hrFullTimeFlag', 'hrEmployeeBasic', array['true','false']::text[]),
      ('tmsWaybillSplitBasis', 'tmsWaybill', array['quantity','weight','volume']::text[]),
      ('tmsDispatchOperatorMode', 'tmsWaybill', array['carrier','self_operated','individual_driver']::text[]),
      ('scmPurchaseAllocationMode', 'scmPurchaseDocuments', array['ratio','amount']::text[]),
      ('pmisTaskExecutionResult', 'pmisMaintenancePlanDirectory', array['ok','ng','exempt']::text[]),
      ('mdmAccessoryCodingFilter', 'mdmProduction', array['all','pending','coded']::text[]),
      ('fmsExceptionSeverity', 'fmsExceptionManagement', array['critical','warning','attention']::text[]),
      ('commonDashboardTrendPeriod', 'commonBasicDirectory', array['today','week','month','year']::text[]),
      ('sysAiOperationsWindowDays', 'aiRuntimeDirectory', array['7','30','90']::text[]),
      ('tmsCapacityPlanningHorizonDays', 'tmsWaybill', array['7','14','30']::text[]),
      ('tmsRoutePerformanceWindowDays', 'tmsWaybill', array['30','90','180']::text[])
    ) as expected(code, parent, values)
  loop
    select p.code, array_agg(d.value order by d.sort)
      into parent_code, actual_values
    from public.sys_dict_type t
    join public.sys_dict_type p on p.id = t.parent_id and p.node_type = 'directory'
    join public.sys_dictionary d on d.type_id = t.id and d.status = '1'
    where t.code = choice.code and t.node_type = 'dictionary' and t.status = '1'
    group by p.code;
    if parent_code is distinct from choice.parent or actual_values is distinct from choice.values then
      raise exception 'Dictionary % is missing, misplaced or has unexpected enabled items', choice.code;
    end if;
  end loop;
end $test$;
rollback;
