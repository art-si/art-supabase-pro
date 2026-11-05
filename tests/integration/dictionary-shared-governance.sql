-- Shared business choices have one owner; controlled values remain curated.
begin;

do $test$
declare
  choice record;
  actual_values text[];
  actual_parent text;
  empty_types text;
begin
  if exists (
    select 1 from public.sys_dict_type
    where code in ('arViewMode', 'arAgingBasis', 'apReportAgingBasis', 'fmsPayableDocumentStatus')
  ) then
    raise exception 'Retired or duplicate dictionary types still exist';
  end if;

  if exists (
    select 1 from public.sys_dict_type t
    join public.sys_dict_type p on p.id = t.parent_id
    where p.code = 'commonBasicDirectory' and t.node_type = 'dictionary'
  ) then
    raise exception 'Shared dictionaries are not classified under common folders';
  end if;

  for choice in
    select * from (values
      ('commonDocumentDisplayMode', 'commonDocumentDirectory', array['document','line']::text[]),
      ('commonAgingBasis', 'commonFinanceDirectory', array['due','business']::text[]),
      ('commonDocumentReviewStatus', 'commonDocumentDirectory', array['draft','submitted','approved']::text[]),
      ('arBasis', 'commonFinanceDirectory', null::text[]),
      ('mdmActivityUnit', 'mdmWorkCenterActivitiesDict', null::text[]),
      ('mdmBusinessOwnerType', 'mdmBusinessTypeDirectory', null::text[]),
      ('fmsPayableMatchingProgress', 'fmsPayableDocumentDict', array['none','partial','full']::text[]),
      ('fmsPayableWriteoffProgress', 'fmsPayableWriteoffDict', array['none','partial','full']::text[]),
      ('fmsPayableFreezeProgress', 'fmsPayableDocumentDict', array['none','partial','full']::text[]),
      ('fmsPayableSettlementStatus', 'fmsPayableSettlementDict', array['draft','submitted','approved','processing','confirmed','closed','cancelled']::text[]),
      ('fmsPayablePaymentProgress', 'fmsPayableSettlementDict', array['none','partial','full']::text[]),
      ('fmsPayableRefundProgress', 'fmsPayableSettlementDict', array['none','partial','full']::text[]),
      ('fmsPayableSettlementPurpose', 'fmsPayableSettlementDict', array['purchase','advance','guarantee','other','sales_refund','other_refund','purchase_refund','advance_refund']::text[]),
      ('fmsPayableSettlementMethodCategory', 'fmsPayableSettlementDict', array['cash','cheque','remittance','bill','virtual']::text[]),
      ('fmsPayableSettlementCashMethod', 'fmsPayableSettlementDict', array['cash','bank_transfer','other']::text[]),
      ('fmsPayablePaymentInitiationType', 'fmsPayableSettlementDict', array['active','passive']::text[]),
      ('notificationLeadUnit', 'sysNotificationDirectory', array['days','months']::text[]),
      ('workflowAnalyticsPeriodDays', 'workflowRuntimeDirectory', array['7','30','90','180']::text[]),
      ('workflowTemplateCategory', 'workflowDesignDirectory', array['finance','transport','vehicle','safety','hr','scm','general']::text[]),
      ('wmsAdjustmentType', 'wmsAdjustmentDirectory', array['bin_move','material_convert','batch_convert','status_convert','unit_convert','attribute_convert']::text[]),
      ('fmsPayableSourceType', 'fmsPayableDocumentDict', array['manual','purchase_inbound','carrier_statement']::text[]),
      ('fmsPayableDirection', 'fmsPayableDocumentDict', array['false','true']::text[]),
      ('wmsOpeningBalanceType', 'wmsInitializationDirectory', array['stock','receivable','estimated_payable']::text[]),
      ('tmsDriverCommissionMethod', 'tmsDriver', array['fixed_per_trip','per_km','per_ton_km','per_volume','freight_percent']::text[]),
      ('tmsDriverCommissionDirection', 'tmsDriver', array['forward','return']::text[]),
      ('vmsMaintenanceReminderMode', 'vehicleRecordDict', array['time','mileage']::text[]),
      ('vehiclePartIssueStatus', 'vehiclePartsDict', array['in_use','returned','lost','damaged']::text[]),
      ('vehiclePartStockMovementType', 'vehiclePartsDict', array['receipt','issue','return','lost','damaged']::text[]),
      ('wmsIssueRequestStatus', 'wmsOutboundDirectory', array['draft','submitted','approved','partially_issued','fulfilled','rejected','cancelled']::text[]),
      ('mdmProductionCalendarDayType', 'mdmProductionCalendarDict', array['rest_day','statutory_holiday','work_day','half_work_day']::text[]),
      ('vehicleCertificateStatus', 'vehicleCertificateDict', array['valid','due_3_months','due_30','due_15','due_today','expired','handled','revoked']::text[]),
      ('wmsStepTransferStatus', 'wmsTransferDirectory', array['draft','in_transit','received','returned','cancelled']::text[]),
      ('smisPipelineCategory', 'smisEquipmentBasicDict', array['GC1','GC2','GC3','GD1','GD2']::text[]),
      ('smisMachineryCategory', 'smisEquipmentBasicDict', array['电动单梁起重机','冶金桥式起重机','通用桥式起重机','防爆桥式起重机','电动葫芦桥式起重机','电动葫芦门式起重机','通用门式起重机','旧目录起重机','其他起重机械']::text[]),
      ('smisElevatorCategory', 'smisEquipmentBasicDict', array['客梯','货梯','客货两用梯']::text[])
    ) as expected(code, parent_code, values)
  loop
    select p.code, array_agg(d.value order by d.sort)
      into actual_parent, actual_values
    from public.sys_dict_type t
    join public.sys_dict_type p on p.id = t.parent_id and p.node_type = 'directory'
    left join public.sys_dictionary d on d.type_id = t.id and d.status = '1'
    where t.code = choice.code and t.node_type = 'dictionary' and t.status = '1'
    group by p.code;
    if actual_parent is distinct from choice.parent_code or
       (choice.values is not null and actual_values is distinct from choice.values) then
      raise exception 'Dictionary % has an unexpected parent or enabled values', choice.code;
    end if;
  end loop;

  select string_agg(t.code, ', ' order by t.code)
    into empty_types
  from public.sys_dict_type t
  where t.node_type = 'dictionary'
    and not exists (select 1 from public.sys_dictionary d where d.type_id = t.id);
  if empty_types is not null then
    raise exception 'Dictionary types without items: %', empty_types;
  end if;

  if (select count(*) from public.sys_dictionary d
      join public.sys_dict_type t on t.id = d.type_id
      where t.code = 'wmsInventoryMovementType' and d.status = '1') <> 34 then
    raise exception 'WMS inventory movement display codes are incomplete';
  end if;

  if (select count(*) from public.sys_dictionary d
      join public.sys_dict_type t on t.id = d.type_id
      where t.code = 'fmsVoucherSourceType' and d.status = '1') <> 18 then
    raise exception 'Voucher source display codes are incomplete';
  end if;

  if (select jsonb_object_agg(d.value, d.tag_type) from public.sys_dictionary d
      join public.sys_dict_type t on t.id = d.type_id
      where t.code = 'wmsIssueRequestStatus') is distinct from
      '{"draft":"info","submitted":"info","approved":"primary","partially_issued":"warning","fulfilled":"success","rejected":"info","cancelled":"info"}'::jsonb then
    raise exception 'WMS issue request status tags are incomplete';
  end if;
end $test$;

rollback;
