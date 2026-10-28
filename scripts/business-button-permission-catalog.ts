export interface BusinessButtonDefinition {
  action: string
  title: string
  code?: string
}

export interface BusinessMenuButtonCatalogEntry {
  menuName: string
  buttons: BusinessButtonDefinition[]
}

const button = (action: string, title: string, code?: string): BusinessButtonDefinition => ({
  action,
  title,
  code
})

const crud = (
  options: {
    view?: boolean
    import?: boolean
    export?: boolean
  } = {}
): BusinessButtonDefinition[] => [
  ...(options.view ? [button('View', '查看')] : []),
  button('Add', '新增'),
  button('Edit', '编辑'),
  button('Delete', '删除'),
  ...(options.import ? [button('Import', '导入')] : []),
  ...(options.export ? [button('Export', '导出')] : [])
]

export const businessButtonPermissionCatalog: BusinessMenuButtonCatalogEntry[] = [
  {
    menuName: 'FuelCardArchive',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Edit', '启停'),
      button('Export', '导出')
    ]
  },
  {
    menuName: 'FuelCardLedger',
    buttons: [
      button('View', '查看'),
      button('Recharge', '充值'),
      button('Consume', '消费'),
      button('Reverse', '冲正'),
      button('AttachVoucher', '补传现场凭证'),
      button('Export', '导出')
    ]
  },
  {
    menuName: 'ElectricCardLedger',
    buttons: [
      button('View', '查看'),
      button('Recharge', '充值'),
      button('Consume', '消费'),
      button('Reverse', '冲正'),
      button('AttachVoucher', '补传现场凭证')
    ]
  },
  {
    menuName: 'TmsCompanyCertification',
    buttons: [
      button('View', '查看公司认证信息', 'TmsCompanyCertification:View'),
      button('Submit', '提交认证申请', 'TmsCompanyCertification:Submit'),
      button('ViewSensitive', '查看敏感认证附件', 'TmsCompanyCertification:ViewSensitive'),
      button('Review', '审核认证申请', 'TmsCompanyCertification:Review')
    ]
  },
  {
    menuName: 'TmsReportVehicleDispatch',
    buttons: [button('EditPlan', '维护调度计划')]
  },
  {
    menuName: 'TmsReportMonthlyOverview',
    buttons: [button('MaintainBudget', '维护预算与目标')]
  },
  {
    menuName: 'TmsReportReceiptTracking',
    buttons: [button('EditFollowup', '登记回单跟进')]
  },
  {
    menuName: 'TmsReportCustomerProfit',
    buttons: [button('EditReview', '维护经营复盘')]
  },
  {
    menuName: 'TmsReportReceivables',
    buttons: [button('AddCollection', '登记催收'), button('ViewCollection', '查看催收历史')]
  },
  {
    menuName: 'TmsReportOrderExceptions',
    buttons: [
      button('ViewHistory', '查看处理历史'),
      button('Add', '登记异常'),
      button('Process', '处理异常'),
      button('Close', '结案确认')
    ]
  },
  {
    menuName: 'WorkflowDefinition',
    buttons: [
      button('Add', '新建流程'),
      button('Edit', '编辑流程'),
      button('Publish', '发布流程'),
      button('Enable', '启停流程')
    ]
  },
  {
    menuName: 'MdmPurchaseSupplier',
    buttons: [
      ...crud({ view: true, export: true }),
      button('ManageGroup', '管理供应商分组'),
      button('ManageBank', '管理银行信息'),
      button('ManageContact', '管理联系人')
    ]
  },
  {
    menuName: 'MdmGovernance',
    buttons: [
      button('View', '查看治理中心'),
      button('AssignSteward', '配置数据责任人'),
      button('ManageRules', '管理质量规则'),
      button('RunQuality', '执行质量检测'),
      button('ResolveIssue', '处理质量问题'),
      button('CreateChange', '发起主数据变更'),
      button('SubmitChange', '提交或撤回变更'),
      button('ReviewChange', '审核主数据变更'),
      button('PublishChange', '发布到期变更'),
      button('ManageMatch', '扫描与评审匹配'),
      button('MergeRecord', '合并或拆分黄金记录'),
      button('ManageConsumers', '管理下游消费者'),
      button('ReplayEvent', '重放失败事件')
    ]
  },
  {
    menuName: 'MdmAccessoryProcessing',
    buttons: [
      button('View', '查看配件加工清单'),
      button('Recognize', '识别清单'),
      button('SaveDraft', '保存草稿'),
      button('Add', '新增配件加工件'),
      button('Copy', '复制配件加工件'),
      button('Edit', '编辑配件加工件'),
      button('Delete', '删除配件加工件'),
      button('GenerateMaterial', '生成物料编码'),
      button('GenerateBom', '生成项目 BOM'),
      button('GenerateWorkOrder', '生成生产工单'),
      button('Generate', '生成加工单据')
    ]
  },
  ...[
    'MdmUnitOfMeasure',
    'MdmMaterialType',
    'MdmMaterialCategory',
    'MdmMaterialAttributeGroup',
    'MdmMaterialCodeRule',
    'MdmMaterialArchive'
  ].map((menuName) => ({
    menuName,
    buttons: [
      ...crud({ view: true, export: true }),
      button('Copy', '复制'),
      button('Enable', '启用'),
      button('Disable', '停用')
    ]
  })),
  {
    menuName: 'MdmWarehouseDefinition',
    buttons: [
      ...crud({ view: true, export: true }),
      button('Copy', '复制'),
      button('Enable', '启用'),
      button('Disable', '禁用'),
      button('ManageGroup', '管理分组')
    ]
  },
  {
    menuName: 'MdmStockMovementType',
    buttons: [...crud({ view: true, export: true }), button('Copy', '复制')]
  },
  {
    menuName: 'MdmWarehouseZone',
    buttons: [...crud({ view: true }), button('Sort', '调整排序')]
  },
  {
    menuName: 'MdmWarehouseBin',
    buttons: [...crud({ view: true }), button('Generate', '生成货架')]
  },
  {
    menuName: 'MdmWarehouseBin3d',
    buttons: [button('View', '查看')]
  },
  {
    menuName: 'MdmInventoryBatch',
    buttons: [
      button('View', '查看'),
      button('Receive', '入库'),
      button('Issue', '出库'),
      button('Transfer', '调拨'),
      button('Configure', '配置呆滞天数')
    ]
  },
  {
    menuName: 'MdmInventoryReservation',
    buttons: [button('View', '查看'), button('Add', '新增预留'), button('Release', '释放预留')]
  },
  {
    menuName: 'MdmInventoryPackage',
    buttons: [button('View', '查看'), button('Assign', '绑定库位'), button('Unassign', '解绑库位')]
  },
  {
    menuName: 'MdmInventorySerial',
    buttons: [button('View', '查看'), button('Add', '新增'), button('Edit', '编辑')]
  },
  ...['MdmSupplyChainCodeRule', 'MdmOutboundRule'].map((menuName) => ({
    menuName,
    buttons: [
      ...crud({ view: true, export: true }),
      button('Copy', '复制'),
      button('Enable', '启用'),
      button('Disable', '停用')
    ]
  })),
  {
    menuName: 'MdmComponentType',
    buttons: [...crud({ view: true }), button('ManageGroup', '管理行业分组')]
  },
  {
    menuName: 'MdmBomMaintenance',
    buttons: [
      ...crud({ view: true, export: true }),
      button('Copy', '复制'),
      button('ManageGroup', '管理分组'),
      button('Submit', '提交审核'),
      button('Approve', '审核通过'),
      button('Archive', '归档或作废')
    ]
  },
  {
    menuName: 'MdmBomStructure',
    buttons: [button('View', '查看')]
  },
  {
    menuName: 'MdmEsop',
    buttons: [
      ...crud({ view: true, import: true, export: true }),
      button('Copy', '复制'),
      button('Enable', '启用'),
      button('Disable', '停用')
    ]
  },
  {
    menuName: 'MdmProductionEquipment',
    buttons: [
      ...crud({ view: true, import: true, export: true }),
      button('Copy', '复制'),
      button('Enable', '启用'),
      button('Disable', '停用')
    ]
  },
  {
    menuName: 'MdmOperationTemplate',
    buttons: [
      ...crud({ view: true, export: true }),
      button('Copy', '复制'),
      button('Enable', '启用'),
      button('Disable', '禁用'),
      button('Bind', '绑定'),
      button('Unbind', '解绑')
    ]
  },
  {
    menuName: 'MdmWorkCenter',
    buttons: [
      ...crud({ view: true, import: true, export: true }),
      button('Copy', '复制'),
      button('ExportQr', '导出二维码'),
      button('Configure', '设置'),
      button('Personnel', '人员安排'),
      button('Devices', '配置设备'),
      button('UpdateProcess', '更新产品工艺')
    ]
  },
  {
    menuName: 'MdmPersonnelWorkCenter',
    buttons: crud({ view: true, export: true })
  },
  {
    menuName: 'MdmProcessRoute',
    buttons: [
      ...crud({ view: true, import: true, export: true }),
      button('Copy', '复制'),
      button('ManageGroup', '管理分组')
    ]
  },
  ...['MdmSalesCustomer', 'MdmSalesProject', 'MdmOperationSet'].map((menuName) => ({
    menuName,
    buttons: [
      ...crud({ view: true, import: true, export: true }),
      button('Copy', '复制'),
      button('ManageGroup', '管理分组')
    ]
  })),
  ...['MdmDocumentType', 'MdmBusinessType', 'MdmOperationControlCode', 'MdmWorkstation'].map(
    (menuName) => ({
      menuName,
      buttons: [...crud({ view: true, export: true }), button('Copy', '复制')]
    })
  ),
  {
    menuName: 'MdmActivityFormula',
    buttons: [
      ...crud({ view: true, export: true }),
      button('Copy', '复制'),
      button('ManageParameter', '管理公式参数')
    ]
  },
  {
    menuName: 'MesWorkOrder',
    buttons: [
      ...crud({ view: true, import: true, export: true }),
      button('Copy', '复制'),
      button('Get', '获取工单'),
      button('Print', '打印'),
      button('Annotate', '批注'),
      button('Confirm', '确认'),
      button('MarkAbnormal', '标记异常'),
      button('Report', '报工'),
      button('Deliver', '交货'),
      button('Close', '结案'),
      button('FinancialClose', '财务关闭'),
      button('Reopen', '重新打开'),
      button('Restore', '恢复'),
      button('MaintainDueDate', '交期维护'),
      button('ReloadSnapshot', '重读 BOM/工艺')
    ]
  },
  {
    menuName: 'MesOperationTask',
    buttons: [
      button('View', '查看'),
      button('Export', '导出'),
      button('Schedule', '排程'),
      button('Close', '关闭'),
      button('Reopen', '重新打开'),
      button('Delete', '删除'),
      button('Annotate', '工序批注'),
      button('MaintainDueDate', '要求完工日期维护')
    ]
  },
  {
    menuName: 'MesScheduling',
    buttons: [
      button('View', '查看'),
      button('AutoSchedule', '自动排产'),
      button('ConfigureRule', '规则配置')
    ]
  },
  {
    menuName: 'MesSchedulingRule',
    buttons: crud({ view: true })
  },
  {
    menuName: 'MesSchedulingGantt',
    buttons: [button('View', '查看')]
  },
  {
    menuName: 'MdmProductionDepartment',
    buttons: [
      ...crud({ view: true, import: true, export: true }),
      button('Enable', '启用'),
      button('Disable', '禁用')
    ]
  },
  {
    menuName: 'MdmProductionPersonnel',
    buttons: [
      ...crud({ view: true, import: true, export: true }),
      button('Enable', '启用'),
      button('Disable', '禁用')
    ]
  },
  {
    menuName: 'MdmFactoryCalendar',
    buttons: [
      button('View', '查看'),
      button('Configure', '设置日历'),
      button('AddPattern', '新增轮班模式'),
      button('EditPattern', '编辑轮班模式'),
      button('DeletePattern', '删除轮班模式'),
      button('ReferencePattern', '参考轮班模式'),
      button('Reminder', '设置日历提醒')
    ]
  },
  {
    menuName: 'MdmShiftScheduling',
    buttons: crud({ view: true })
  },
  {
    menuName: 'PmisInspectionSheet',
    buttons: [
      button('ViewDetail', '查看明细'),
      button('Export', '导出'),
      button('Execute', '执行点检')
    ]
  },
  { menuName: 'PmisInspectionAnalysis', buttons: [button('Export', '导出')] },
  {
    menuName: 'PmisInspectionPlan',
    buttons: [...crud({ view: true, import: true, export: true }), button('Copy', '复制')]
  },
  {
    menuName: 'PmisInspectionDetail',
    buttons: [button('ViewDetail', '查看明细'), button('Export', '导出')]
  },
  { menuName: 'PmisInspectionDashboard', buttons: [button('ViewDetail', '查看明细')] },
  {
    menuName: 'PmisInspectionReport',
    buttons: [button('ViewDetail', '查看明细'), button('Export', '导出')]
  },
  {
    menuName: 'PmisPatrolTask',
    buttons: [button('View', '查看'), button('Export', '导出'), button('Execute', '执行巡检')]
  },
  { menuName: 'PmisPatrolAnalysis', buttons: [button('Export', '导出')] },
  {
    menuName: 'PmisPatrolPlan',
    buttons: [...crud({ view: true, import: true, export: true }), button('Copy', '复制')]
  },
  { menuName: 'PmisPatrolDetail', buttons: [button('View', '查看'), button('Export', '导出')] },
  { menuName: 'PmisPatrolReport', buttons: [button('View', '查看'), button('Export', '导出')] },
  { menuName: 'PmisMaintenanceSetting', buttons: crud({ view: true, export: true }) },
  {
    menuName: 'PmisMaintenancePlan',
    buttons: [...crud({ view: true, import: true, export: true }), button('Copy', '复制')]
  },
  {
    menuName: 'PmisMaintenanceTask',
    buttons: [
      ...crud({ view: true, export: true }),
      button('Copy', '复制'),
      button('Execute', '执行保养'),
      button('Confirm', '确认保养')
    ]
  },
  { menuName: 'PmisMaintenanceAnalysis', buttons: [button('Export', '导出')] },
  {
    menuName: 'PmisMaintenanceDetail',
    buttons: [button('View', '查看'), button('Export', '导出')]
  },
  {
    menuName: 'PmisMaintenanceReport',
    buttons: [button('View', '查看'), button('Export', '导出')]
  },
  { menuName: 'PmisRepairSetting', buttons: crud({ view: true, export: true }) },
  {
    menuName: 'PmisRepairTask',
    buttons: [...crud({ view: true, export: true }), button('Copy', '复制')]
  },
  { menuName: 'PmisRepairAnalysis', buttons: [button('Export', '导出')] },
  {
    menuName: 'PmisPreventivePlan',
    buttons: [...crud({ view: true, import: true, export: true }), button('Copy', '复制')]
  },
  {
    menuName: 'PmisPreventiveTask',
    buttons: [
      ...crud({ view: true, export: true }),
      button('Copy', '复制'),
      button('Execute', '执行预防维修')
    ]
  },
  { menuName: 'PmisPreventiveAnalysis', buttons: [button('Export', '导出')] },
  { menuName: 'PmisPreventiveDetail', buttons: [button('View', '查看'), button('Export', '导出')] },
  { menuName: 'TmsCargo', buttons: crud({ import: true, export: true }) },
  { menuName: 'TmsCarrier', buttons: crud({ view: true, import: true, export: true }) },
  { menuName: 'TmsCarrierDetail', buttons: [button('AiAnalyze', 'AI 经营评估')] },
  { menuName: 'TmsCarrierPrice', buttons: crud({ view: true, export: true }) },
  { menuName: 'TmsCarrierPriceEdit', buttons: [button('Save', '保存承运商价')] },
  { menuName: 'TmsContract', buttons: crud({ view: true, export: true }) },
  { menuName: 'TmsCustomer', buttons: crud({ view: true, import: true, export: true }) },
  {
    menuName: 'TmsCustomerAddress',
    buttons: [...crud(), button('Geofence', '维护地址围栏')]
  },
  { menuName: 'TmsCustomerPrice', buttons: crud({ view: true, export: true }) },
  { menuName: 'TmsCustomerPriceEdit', buttons: [button('Save', '保存客户价')] },
  {
    menuName: 'TmsDriver',
    buttons: [
      ...crud({ view: true, import: true, export: true }),
      button('Invite', '邀请司机'),
      button('Ocr', '司机证件识别'),
      button('UploadDocument', '司机证件上传'),
      button('Audit', '审核司机证件'),
      button('ConfirmCommission', '确认提成方案'),
      button('NotifyCommission', '通知提成方案')
    ]
  },
  {
    menuName: 'TmsDriverQuery',
    buttons: [button('View', '查看'), button('Export', '导出')]
  },
  {
    menuName: 'TmsDriverBlacklist',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Delete', '删除'),
      button('Export', '导出')
    ]
  },
  { menuName: 'TmsServiceCase', buttons: crud({ view: true, export: true }) },
  {
    menuName: 'TmsElectronicContract',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Copy', '复制'),
      button('Delete', '删除'),
      button('Terminate', '终止')
    ]
  },
  { menuName: 'TmsTransportAgreement', buttons: crud({ view: true, export: true }) },
  { menuName: 'TmsFavoriteRoute', buttons: crud() },
  {
    menuName: 'TmsStation',
    buttons: [...crud({ import: true, export: true }), button('Toggle', '启停站点')]
  },
  {
    menuName: 'TmsOrderOpen',
    buttons: [
      button('Create', '开单'),
      button('AiFill', 'AI 智能填单'),
      button('PrintWaybill', '打印运单'),
      button('PrintLabel', '打印标签'),
      button('DoublePrint', '运单标签双打')
    ]
  },
  {
    menuName: 'TmsOrderList',
    buttons: [
      button('View', '查看'),
      button('Edit', '编辑'),
      button('Delete', '删除'),
      button('Cancel', '取消订单'),
      button('EditFreight', '修改运费'),
      button('Quote', '报价'),
      button('AddExpense', '新增费用'),
      button('AddReturnTrip', '新增返程配货'),
      button('Export', '导出')
    ]
  },
  {
    menuName: 'TmsOrderQuery',
    buttons: [button('View', '查看'), button('Export', '导出')]
  },
  { menuName: 'TmsMainlineScreen', buttons: [button('View', '查看')] },
  {
    menuName: 'TmsPendingWaybillList',
    buttons: [
      button('View', '查看'),
      button('Dispatch', '配载调度'),
      button('OverrideCertificateRisk', '证件过期强制派单'),
      button('ViewAgreement', '查看协议'),
      button('RemindSignature', '提醒签署'),
      button('RemindRevision', '提醒修改'),
      button('Merge', '合单配载'),
      button('Split', '拆单配载'),
      button('Cancel', '取消订单'),
      button('Export', '导出')
    ]
  },
  {
    menuName: 'TmsLoadedWaybillList',
    buttons: [
      button('View', '查看'),
      button('GenerateReceivable', '生成暂估应收'),
      button('Export', '导出'),
      button('Print', '打印'),
      button('Accept', '确认接单', 'TmsWaybill:Accept'),
      button('Loading', '装货', 'TmsWaybill:Loading'),
      button('Depart', '确认发车', 'TmsWaybill:Depart'),
      button('Arrive', '确认到达', 'TmsWaybill:Arrive'),
      button('Unloading', '卸货', 'TmsWaybill:Unloading'),
      button('Sign', '签收', 'TmsWaybill:Sign'),
      button('Complete', '确认完成', 'TmsWaybill:Complete'),
      button('Cancel', '取消运单', 'TmsWaybill:Cancel')
    ]
  },
  {
    menuName: 'TmsWaybillDetail',
    buttons: [button('OverrideCommission', '调整司机提成')]
  },
  ...['TmsPickupAppointment', 'TmsDeliveryAppointment'].map((menuName) => ({
    menuName,
    buttons: [
      button('Add', '新增预约'),
      button('Edit', '编辑预约'),
      button('Delete', '删除预约'),
      button('Confirm', '确认预约'),
      button('Complete', '完结预约'),
      button('Arrival', '记录到场')
    ]
  })),
  {
    menuName: 'TmsDeliveryManagement',
    buttons: [
      button('View', '查看'),
      button('ArchiveReceipt', '归档回单'),
      button('OcrReceipt', 'AI 回单识别'),
      button('ManageException', '处理回单异常')
    ]
  },
  {
    menuName: 'TmsInTransitMonitor',
    buttons: [
      button('View', '查看监控详情'),
      button('AiAnalyze', 'AI 运输异常分析'),
      button('ContactDriver', '联系司机'),
      button('SendReminder', '发送在途提醒')
    ]
  },
  {
    menuName: 'TmsTransportEvent',
    buttons: [button('View', '查看运输事件')]
  },
  {
    menuName: 'TmsRoutePerformance',
    buttons: [button('View', '查看线路效能')]
  },

  { menuName: 'InsuranceCompany', buttons: crud({ import: true, export: true }) },
  { menuName: 'Parts', buttons: crud({ import: true, export: true }) },
  { menuName: 'PartsCategory', buttons: crud({ import: true, export: true }) },
  { menuName: 'Supplier', buttons: crud({ import: true, export: true }) },
  {
    menuName: 'VehicleArchiveManage',
    buttons: [
      ...crud({ view: true, import: true, export: true }).map((item) => ({
        ...item,
        code: `VehicleArchive:${item.action}`
      })),
      button('Copy', '复制车辆档案', 'VehicleArchive:Copy'),
      button('Ocr', '证件智能识别', 'VehicleArchive:Ocr'),
      button('Submit', '提交车辆档案审核', 'VehicleArchive:Submit'),
      button('TabBasic', '页签 · 基础信息', 'VehicleArchive:TabBasic'),
      button('TabBody', '页签 · 车身参数', 'VehicleArchive:TabBody'),
      button('TabEngine', '页签 · 发动机参数', 'VehicleArchive:TabEngine'),
      button('TabOther', '页签 · 其他信息', 'VehicleArchive:TabOther'),
      button('TabTypes', '页签 · 车型', 'VehicleArchive:TabTypes'),
      button('TabApprovalHistory', '页签 · 审批历程', 'VehicleArchive:TabApprovalHistory'),
      button('TypeAdd', '新增车型规格', 'VehicleArchive:TypeAdd'),
      button('TypeEdit', '编辑车型规格', 'VehicleArchive:TypeEdit'),
      button('TypeDelete', '删除车型规格', 'VehicleArchive:TypeDelete')
    ]
  },
  {
    menuName: 'TrailerManage',
    buttons: [
      button('View', '查看挂车', 'TrailerManage:View'),
      button('Add', '新增挂车', 'TrailerManage:Add'),
      button('Edit', '编辑挂车', 'TrailerManage:Edit')
    ]
  },
  {
    menuName: 'CertificateCenter',
    buttons: [
      button('View', '查看证件', 'CertificateCenter:View'),
      button('Add', '新增证件', 'CertificateCenter:Add'),
      button('Edit', '编辑证件', 'CertificateCenter:Edit'),
      button('Handle', '处理预警', 'CertificateCenter:Handle')
    ]
  },
  {
    menuName: 'VehicleAccident',
    buttons: crud({ view: true, export: true }).map((item) => ({
      ...item,
      code: `VehicleAccident:${item.action}`
    }))
  },
  {
    menuName: 'VehicleMaintenance',
    buttons: crud({ view: true, export: true }).map((item) => ({
      ...item,
      code: `VehicleMaintenance:${item.action}`
    }))
  },
  {
    menuName: 'VehiclePartsManage',
    buttons: crud({ view: true }).map((item) => ({
      ...item,
      code: `VehiclePartUsage:${item.action}`
    }))
  },
  {
    menuName: 'VehicleRoutineInspection',
    buttons: crud({ view: true, export: true }).map((item) => ({
      ...item,
      code: `VehicleRoutineInspection:${item.action}`
    }))
  },
  {
    menuName: 'VehicleInspection',
    buttons: crud({ export: true }).map((item) => ({
      ...item,
      code: `VehicleInspection:${item.action}`
    }))
  },
  {
    menuName: 'VehicleInsurance',
    buttons: crud({ view: true, export: true }).map((item) => ({
      ...item,
      code: `VehicleInsurance:${item.action}`
    }))
  },
  {
    menuName: 'VehicleMileage',
    buttons: [button('Export', '导出', 'VehicleMileage:Export')]
  },
  {
    menuName: 'VehicleViolation',
    buttons: [
      button('Export', '导出', 'VehicleViolation:Export'),
      button('LinkDriver', '关联司机', 'VehicleViolation:LinkDriver')
    ]
  },
  ...[
    'VehicleInspectionExpiry',
    'VehicleInsuranceExpiry',
    'VehicleMaintenanceExpiry',
    'VehiclePartServiceLife',
    'VehicleServiceLife'
  ].map((menuName) => ({
    menuName,
    buttons: [
      button('View', '查看工单'),
      button('CreateWorkOrder', '创建工单'),
      button('TransitionWorkOrder', '处理工单')
    ]
  })),
  {
    menuName: 'VehicleQuery',
    buttons: [
      button('View', '查看'),
      button('Export', '导出'),
      button('AiAnalyze', 'AI 健康分析'),
      button('TabBasic', '页签 · 基础信息'),
      button('TabBody', '页签 · 车身参数'),
      button('TabEngine', '页签 · 发动机参数'),
      button('TabOther', '页签 · 其他信息')
    ]
  },
  {
    menuName: 'VehicleFleetHealth',
    buttons: [button('View', '查看车队健康', 'VehicleFleetHealth:View')]
  },

  {
    menuName: 'TmsCapacityPlanning',
    buttons: [button('View', '查看运力容量', 'TmsCapacityPlanning:View')]
  },
  {
    menuName: 'FinanceExceptionCenter',
    buttons: [button('View', '查看财务异常', 'FinanceExceptionCenter:View')]
  },
  {
    menuName: 'HrSkillMatrix',
    buttons: [button('View', '查看技能矩阵', 'Hr:SkillMatrix:View')]
  },

  {
    menuName: 'SmisPositionSafetyResponsibility',
    buttons: [
      button('View', '查看岗位安全责任制', 'SmisPositionSafetyResponsibility:View'),
      button('Add', '新增隐患排查标准', 'SmisPositionSafetyResponsibility:Add'),
      button('Edit', '编辑隐患排查标准', 'SmisPositionSafetyResponsibility:Edit'),
      button('Delete', '删除隐患排查标准', 'SmisPositionSafetyResponsibility:Delete'),
      button('Import', '导入隐患排查标准', 'SmisPositionSafetyResponsibility:Import'),
      button(
        'DownloadTemplate',
        '下载导入模板',
        'SmisPositionSafetyResponsibility:DownloadTemplate'
      )
    ]
  },
  {
    menuName: 'SmisPositionRiskList',
    buttons: [
      button('View', '查看岗位风险清单', 'SmisPositionRiskList:View'),
      button('Add', '新增隐患控制措施', 'SmisPositionRiskList:Add'),
      button('Edit', '编辑隐患控制措施', 'SmisPositionRiskList:Edit'),
      button('Delete', '删除隐患控制措施', 'SmisPositionRiskList:Delete')
    ]
  },
  {
    menuName: 'SmisDualControlPersonnelChecklist',
    buttons: [
      button('View', '查看人员双控清单', 'SmisDualControlPersonnelChecklist:View'),
      button('Export', '导出人员双控清单', 'SmisDualControlPersonnelChecklist:Export'),
      button('ViewShift', '查看人员倒班表', 'SmisDualControlPersonnelChecklist:ViewShift'),
      button('ViewRisk', '查看人员岗位风险', 'SmisDualControlPersonnelChecklist:ViewRisk'),
      button(
        'ViewInspection',
        '查看人员排查清单',
        'SmisDualControlPersonnelChecklist:ViewInspection'
      ),
      button(
        'ViewResponsibility',
        '查看人员岗位责任',
        'SmisDualControlPersonnelChecklist:ViewResponsibility'
      )
    ]
  },
  {
    menuName: 'SmisDualControlRiskControlInformationChecklist',
    buttons: [
      button('View', '查看风险管控信息清单', 'SmisDualControlRiskControlInformationChecklist:View'),
      button(
        'ViewDetail',
        '查看风险管控详情',
        'SmisDualControlRiskControlInformationChecklist:ViewDetail'
      ),
      button(
        'Export',
        '导出风险管控信息清单',
        'SmisDualControlRiskControlInformationChecklist:Export'
      )
    ]
  },
  {
    menuName: 'SmisDualControlHiddenHazardGovernanceLedger',
    buttons: [
      button('View', '查看隐患治理信息台账', 'SmisDualControlHiddenHazardGovernanceLedger:View'),
      button(
        'ViewDetail',
        '查看隐患治理详情',
        'SmisDualControlHiddenHazardGovernanceLedger:ViewDetail'
      ),
      button('Export', '导出隐患治理信息台账', 'SmisDualControlHiddenHazardGovernanceLedger:Export')
    ]
  },
  {
    menuName: 'SmisDualControlPositionRiskChecklist',
    buttons: [
      button('View', '查看岗位风险清单', 'SmisDualControlPositionRiskChecklist:View'),
      button('Export', '导出岗位风险清单', 'SmisDualControlPositionRiskChecklist:Export'),
      button(
        'ViewIdentificationUnit',
        '查看风险辨识单位',
        'SmisDualControlPositionRiskChecklist:ViewIdentificationUnit'
      )
    ]
  },
  {
    menuName: 'SmisDualControlAccidentHiddenHazardInspectionChecklist',
    buttons: [
      button(
        'View',
        '查看事故隐患排查清单',
        'SmisDualControlAccidentHiddenHazardInspectionChecklist:View'
      ),
      button(
        'Export',
        '导出事故隐患排查清单',
        'SmisDualControlAccidentHiddenHazardInspectionChecklist:Export'
      )
    ]
  },
  {
    menuName: 'SmisDualControlPositionSafetyResponsibilityChecklist',
    buttons: [
      button(
        'View',
        '查看岗位安全责任制清单',
        'SmisDualControlPositionSafetyResponsibilityChecklist:View'
      ),
      button(
        'Export',
        '导出岗位安全责任制清单',
        'SmisDualControlPositionSafetyResponsibilityChecklist:Export'
      )
    ]
  },
  {
    menuName: 'SmisPositionWorkInstruction',
    buttons: [
      button('View', '查看岗位作业指导书', 'SmisPositionWorkInstruction:View'),
      button('Add', '新增岗位作业指导书', 'SmisPositionWorkInstruction:Add'),
      button('Edit', '编辑岗位作业指导书', 'SmisPositionWorkInstruction:Edit'),
      button('Delete', '删除岗位作业指导书', 'SmisPositionWorkInstruction:Delete')
    ]
  },
  {
    menuName: 'SmisLeaveInformation',
    buttons: [
      button('View', '查看请假信息', 'SmisLeaveInformation:View'),
      button('Add', '新增请假信息', 'SmisLeaveInformation:Add'),
      button('Edit', '编辑请假信息', 'SmisLeaveInformation:Edit'),
      button('Delete', '删除请假信息', 'SmisLeaveInformation:Delete'),
      button('Export', '导出请假信息', 'SmisLeaveInformation:Export')
    ]
  },
  {
    menuName: 'MdmStatutoryHoliday',
    buttons: [
      button('View', '查看法定节假日', 'MdmStatutoryHoliday:View'),
      button('Add', '新增法定节假日', 'MdmStatutoryHoliday:Add'),
      button('Edit', '编辑法定节假日', 'MdmStatutoryHoliday:Edit'),
      button('Delete', '删除法定节假日', 'MdmStatutoryHoliday:Delete'),
      button('Import', '导入法定节假日', 'MdmStatutoryHoliday:Import'),
      button('Export', '导出法定节假日', 'MdmStatutoryHoliday:Export')
    ]
  },
  {
    menuName: 'SmisSite',
    buttons: [
      button('View', '查看场所', 'SmisSite:View'),
      button('Add', '新增场所', 'SmisSite:Add'),
      button('Edit', '编辑场所', 'SmisSite:Edit'),
      button('Delete', '删除场所', 'SmisSite:Delete'),
      button('Import', '导入场所', 'SmisSite:Import'),
      button('Export', '导出场所', 'SmisSite:Export')
    ]
  },
  {
    menuName: 'SmisInspectionCategory',
    buttons: [
      button('View', '查看检验类别', 'SmisInspectionCategory:View'),
      button('Add', '新增检验类别', 'SmisInspectionCategory:Add'),
      button('Edit', '编辑检验类别', 'SmisInspectionCategory:Edit'),
      button('Delete', '删除检验类别', 'SmisInspectionCategory:Delete')
    ]
  },
  {
    menuName: 'SmisDualControlHazardFactorCategory',
    buttons: [
      button('View', '查看危害因素类别', 'SmisDualControlHazardFactorCategory:View'),
      button('Add', '新增危害因素类别', 'SmisDualControlHazardFactorCategory:Add'),
      button('Edit', '编辑危害因素类别', 'SmisDualControlHazardFactorCategory:Edit'),
      button('Delete', '删除危害因素类别', 'SmisDualControlHazardFactorCategory:Delete')
    ]
  },
  {
    menuName: 'SmisDualControlRiskIdentification',
    buttons: [
      button('View', '查看风险辨识', 'SmisDualControlRiskIdentification:View'),
      button('Add', '新增风险点', 'SmisDualControlRiskIdentification:Add'),
      button('Edit', '编辑风险点', 'SmisDualControlRiskIdentification:Edit'),
      button('Delete', '删除风险点', 'SmisDualControlRiskIdentification:Delete'),
      button('Copy', '复制风险点', 'SmisDualControlRiskIdentification:Copy'),
      button('Generate', '生成所有风险点', 'SmisDualControlRiskIdentification:Generate'),
      button('Import', '导入风险点', 'SmisDualControlRiskIdentification:Import'),
      button('Export', '导出风险点', 'SmisDualControlRiskIdentification:Export'),
      button(
        'MaintainHazards',
        '维护危害因素',
        'SmisDualControlRiskIdentification:MaintainHazards'
      ),
      button('Void', '作废危害因素', 'SmisDualControlRiskIdentification:Void')
    ]
  },
  {
    menuName: 'SmisDualControlInspectionStandard',
    buttons: [
      button('View', '查看排查标准', 'SmisDualControlInspectionStandard:View'),
      button('Add', '新增排查标准或排查项', 'SmisDualControlInspectionStandard:Add'),
      button('Edit', '编辑排查标准或排查项', 'SmisDualControlInspectionStandard:Edit'),
      button('Delete', '删除排查标准或排查项', 'SmisDualControlInspectionStandard:Delete'),
      button('Export', '导出排查项', 'SmisDualControlInspectionStandard:Export'),
      button('Void', '作废排查标准或排查项', 'SmisDualControlInspectionStandard:Void')
    ]
  },
  {
    menuName: 'SmisDualControlInspectionType',
    buttons: [
      button('View', '查看排查类型', 'SmisDualControlInspectionType:View'),
      button('Add', '新增排查类型', 'SmisDualControlInspectionType:Add'),
      button('Edit', '编辑排查类型', 'SmisDualControlInspectionType:Edit'),
      button('Delete', '删除排查类型', 'SmisDualControlInspectionType:Delete'),
      button('Export', '导出排查类型', 'SmisDualControlInspectionType:Export'),
      button('Void', '作废排查类型', 'SmisDualControlInspectionType:Void')
    ]
  },
  {
    menuName: 'SmisDualControlSafetyInspection',
    buttons: [
      button('View', '查看安全检查', 'SmisDualControlSafetyInspection:View'),
      button('Add', '新增安全检查', 'SmisDualControlSafetyInspection:Add'),
      button('Copy', '复制安全检查', 'SmisDualControlSafetyInspection:Copy'),
      button('Edit', '编辑安全检查', 'SmisDualControlSafetyInspection:Edit'),
      button('Delete', '删除安全检查', 'SmisDualControlSafetyInspection:Delete'),
      button('Export', '导出安全检查', 'SmisDualControlSafetyInspection:Export'),
      button(
        'RectificationNotice',
        '安全检查整改指令书',
        'SmisDualControlSafetyInspection:RectificationNotice'
      )
    ]
  },
  {
    menuName: 'SmisDualControlRiskFourColorMap',
    buttons: [
      button('View', '查看风险四色图', 'SmisDualControlRiskFourColorMap:View'),
      button('AddScene', '新增四色图场景', 'SmisDualControlRiskFourColorMap:AddScene'),
      button('EditScene', '编辑四色图场景', 'SmisDualControlRiskFourColorMap:EditScene'),
      button('DeleteScene', '删除四色图场景', 'SmisDualControlRiskFourColorMap:DeleteScene'),
      button('Save', '保存四色图配置', 'SmisDualControlRiskFourColorMap:Save'),
      button('Export', '下载四色图', 'SmisDualControlRiskFourColorMap:Export')
    ]
  },
  {
    menuName: 'SmisDualControlDuplicateConfiguration',
    buttons: [
      button('View', '查看重复配置', 'SmisDualControlDuplicateConfiguration:View'),
      button('Add', '新增重复配置', 'SmisDualControlDuplicateConfiguration:Add'),
      button('Edit', '编辑重复配置', 'SmisDualControlDuplicateConfiguration:Edit'),
      button('Delete', '删除重复配置', 'SmisDualControlDuplicateConfiguration:Delete'),
      button('Export', '导出重复配置', 'SmisDualControlDuplicateConfiguration:Export'),
      button('Void', '作废重复配置', 'SmisDualControlDuplicateConfiguration:Void')
    ]
  },
  {
    menuName: 'SmisDualControlRiskAssessmentStandardModel',
    buttons: [
      button('View', '查看风险评估标准模型', 'SmisDualControlRiskAssessmentStandardModel:View'),
      button('Add', '新增风险判定标准', 'SmisDualControlRiskAssessmentStandardModel:Add'),
      button('Edit', '编辑风险评估标准模型', 'SmisDualControlRiskAssessmentStandardModel:Edit'),
      button('Delete', '删除风险判定标准', 'SmisDualControlRiskAssessmentStandardModel:Delete')
    ]
  },
  {
    menuName: 'SmisDualControlRiskEvaluationControl',
    buttons: [
      button('View', '查看风险评价及管控', 'SmisDualControlRiskEvaluationControl:View'),
      button('Evaluate', '执行定量风险评价', 'SmisDualControlRiskEvaluationControl:Evaluate'),
      button('AddMeasure', '新增风险控制措施', 'SmisDualControlRiskEvaluationControl:AddMeasure'),
      button('EditMeasure', '编辑风险控制措施', 'SmisDualControlRiskEvaluationControl:EditMeasure'),
      button(
        'DeleteMeasure',
        '删除风险控制措施',
        'SmisDualControlRiskEvaluationControl:DeleteMeasure'
      ),
      button('VoidMeasure', '作废风险控制措施', 'SmisDualControlRiskEvaluationControl:VoidMeasure'),
      button('Export', '导出风险评价及措施', 'SmisDualControlRiskEvaluationControl:Export')
    ]
  },
  {
    menuName: 'SmisDualControlSafetyRiskList',
    buttons: [
      button('View', '查看安全风险清单', 'SmisDualControlSafetyRiskList:View'),
      button('Add', '新增安全风险', 'SmisDualControlSafetyRiskList:Add'),
      button('Edit', '编辑安全风险', 'SmisDualControlSafetyRiskList:Edit'),
      button('Delete', '删除安全风险', 'SmisDualControlSafetyRiskList:Delete'),
      button('Export', '导出安全风险清单', 'SmisDualControlSafetyRiskList:Export')
    ]
  },
  {
    menuName: 'SmisDualControlRiskClassificationControl',
    buttons: [
      button('View', '查看风险分级管控', 'SmisDualControlRiskClassificationControl:View'),
      button('Add', '新增风险管控配置', 'SmisDualControlRiskClassificationControl:Add'),
      button('Edit', '编辑风险管控配置', 'SmisDualControlRiskClassificationControl:Edit'),
      button('Delete', '删除风险管控配置', 'SmisDualControlRiskClassificationControl:Delete'),
      button('Import', '导入风险管控配置', 'SmisDualControlRiskClassificationControl:Import'),
      button('Export', '导出风险管控配置', 'SmisDualControlRiskClassificationControl:Export'),
      button('Configure', '设置风险分级管控', 'SmisDualControlRiskClassificationControl:Configure')
    ]
  },
  {
    menuName: 'SmisDualControlRiskListSummary',
    buttons: [
      button('View', '查看风险清单汇总', 'SmisDualControlRiskListSummary:View'),
      button('Export', '导出风险清单汇总', 'SmisDualControlRiskListSummary:Export')
    ]
  },
  {
    menuName: 'SmisDualControlManagementReport',
    buttons: [
      button('View', '查看双控管控报表', 'SmisDualControlManagementReport:View'),
      button('Export', '导出双控管控报表', 'SmisDualControlManagementReport:Export')
    ]
  },
  {
    menuName: 'SmisDualControlHiddenHazardInspectionReport',
    buttons: [
      button('View', '查看隐患排查报表', 'SmisDualControlHiddenHazardInspectionReport:View'),
      button('Export', '导出隐患排查报表', 'SmisDualControlHiddenHazardInspectionReport:Export')
    ]
  },
  {
    menuName: 'SmisDualControlHiddenHazardGovernanceReport',
    buttons: [
      button('View', '查看隐患治理报表', 'SmisDualControlHiddenHazardGovernanceReport:View'),
      button('Export', '导出隐患治理报表', 'SmisDualControlHiddenHazardGovernanceReport:Export')
    ]
  },
  {
    menuName: 'SmisDualControlInspectionRateStatistics',
    buttons: [
      button('View', '查看排查率统计', 'SmisDualControlInspectionRateStatistics:View'),
      button('ViewDetail', '查看排查率明细', 'SmisDualControlInspectionRateStatistics:ViewDetail'),
      button('Export', '导出排查率统计', 'SmisDualControlInspectionRateStatistics:Export')
    ]
  },
  {
    menuName: 'SmisDualControlMissedInspectionRateStatistics',
    buttons: [
      button('View', '查看漏查率统计', 'SmisDualControlMissedInspectionRateStatistics:View'),
      button(
        'ViewDetail',
        '查看漏查率明细',
        'SmisDualControlMissedInspectionRateStatistics:ViewDetail'
      ),
      button('Export', '导出漏查率统计', 'SmisDualControlMissedInspectionRateStatistics:Export')
    ]
  },
  {
    menuName: 'SmisDualControlHiddenHazardInspectionRecord',
    buttons: [
      button('View', '查看隐患排查记录', 'SmisDualControlHiddenHazardInspectionRecord:View'),
      button(
        'ViewDetail',
        '查看隐患排查明细',
        'SmisDualControlHiddenHazardInspectionRecord:ViewDetail'
      ),
      button('Export', '导出隐患排查记录', 'SmisDualControlHiddenHazardInspectionRecord:Export')
    ]
  },
  {
    menuName: 'SmisDualControlNoHiddenHazardPersonnelStatistics',
    buttons: [
      button(
        'View',
        '查看未提隐患人员统计',
        'SmisDualControlNoHiddenHazardPersonnelStatistics:View'
      ),
      button(
        'Export',
        '导出未提隐患人员统计',
        'SmisDualControlNoHiddenHazardPersonnelStatistics:Export'
      )
    ]
  },
  {
    menuName: 'SmisDualControlTeamSelfInspectionCoverage',
    buttons: [
      button('View', '查看班组自查涵盖率', 'SmisDualControlTeamSelfInspectionCoverage:View'),
      button('Export', '导出班组自查涵盖率', 'SmisDualControlTeamSelfInspectionCoverage:Export')
    ]
  },
  {
    menuName: 'SmisDualControlSpecialEquipmentRiskControlStatistics',
    buttons: [
      button(
        'View',
        '查看特种设备风控统计',
        'SmisDualControlSpecialEquipmentRiskControlStatistics:View'
      ),
      button(
        'Export',
        '导出特种设备风控统计',
        'SmisDualControlSpecialEquipmentRiskControlStatistics:Export'
      )
    ]
  },
  {
    menuName: 'SmisDualControlRiskInspectionTask',
    buttons: [
      button('View', '查看风险巡查任务', 'SmisDualControlRiskInspectionTask:View'),
      button('Export', '导出风险巡查任务', 'SmisDualControlRiskInspectionTask:Export'),
      button('Cancel', '取消风险巡查任务', 'SmisDualControlRiskInspectionTask:Cancel'),
      button('Transfer', '转交风险巡查任务', 'SmisDualControlRiskInspectionTask:Transfer'),
      button('Execute', '执行风险巡查任务', 'SmisDualControlRiskInspectionTask:Execute')
    ]
  },
  {
    menuName: 'SmisDualControlHiddenHazardInspectionPlan',
    buttons: [
      button('View', '查看隐患排查计划', 'SmisDualControlHiddenHazardInspectionPlan:View'),
      button('Add', '新增隐患排查计划', 'SmisDualControlHiddenHazardInspectionPlan:Add'),
      button('Edit', '编辑隐患排查计划', 'SmisDualControlHiddenHazardInspectionPlan:Edit'),
      button('Delete', '删除隐患排查计划', 'SmisDualControlHiddenHazardInspectionPlan:Delete'),
      button('Void', '作废隐患排查计划', 'SmisDualControlHiddenHazardInspectionPlan:Void'),
      button('Export', '导出隐患排查计划', 'SmisDualControlHiddenHazardInspectionPlan:Export')
    ]
  },
  {
    menuName: 'SmisDualControlHiddenHazardInspectionTask',
    buttons: [
      button('View', '查看隐患排查任务', 'SmisDualControlHiddenHazardInspectionTask:View'),
      button('Cancel', '取消隐患排查任务', 'SmisDualControlHiddenHazardInspectionTask:Cancel'),
      button('Transfer', '转交隐患排查任务', 'SmisDualControlHiddenHazardInspectionTask:Transfer'),
      button('Execute', '执行隐患排查任务', 'SmisDualControlHiddenHazardInspectionTask:Execute'),
      button('Export', '导出隐患排查任务', 'SmisDualControlHiddenHazardInspectionTask:Export')
    ]
  },
  {
    menuName: 'SmisDualControlHiddenHazardGovernanceTracking',
    buttons: [
      button('View', '查看隐患治理跟踪', 'SmisDualControlHiddenHazardGovernanceTracking:View'),
      button('Register', '登记隐患', 'SmisDualControlHiddenHazardGovernanceTracking:Register'),
      button('Approve', '核准隐患', 'SmisDualControlHiddenHazardGovernanceTracking:Approve'),
      button('Rectify', '提交隐患整改', 'SmisDualControlHiddenHazardGovernanceTracking:Rectify'),
      button('Accept', '验收隐患', 'SmisDualControlHiddenHazardGovernanceTracking:Accept'),
      button(
        'AiForecast',
        'AI 隐患风险趋势',
        'SmisDualControlHiddenHazardGovernanceTracking:AiForecast'
      ),
      button('Export', '导出隐患治理跟踪', 'SmisDualControlHiddenHazardGovernanceTracking:Export')
    ]
  },
  {
    menuName: 'SmisDualControlQuickReport',
    buttons: [
      button('View', '查看随手拍', 'SmisDualControlQuickReport:View'),
      button('Submit', '提交随手拍', 'SmisDualControlQuickReport:Submit'),
      button('AiAnalyze', 'AI 现场分析', 'SmisDualControlQuickReport:AiAnalyze')
    ]
  },
  {
    menuName: 'SmisDualControlPublicHiddenHazardReport',
    buttons: [
      button('View', '查看公众举报隐患', 'SmisDualControlPublicHiddenHazardReport:View'),
      button('Register', '登记公众举报隐患', 'SmisDualControlPublicHiddenHazardReport:Register'),
      button('Export', '导出公众举报隐患', 'SmisDualControlPublicHiddenHazardReport:Export')
    ]
  },
  {
    menuName: 'SmisDualControlHiddenHazardRectificationNotice',
    buttons: [
      button('View', '查看隐患整改通知书', 'SmisDualControlHiddenHazardRectificationNotice:View'),
      button(
        'Export',
        '导出隐患整改通知书',
        'SmisDualControlHiddenHazardRectificationNotice:Export'
      ),
      button('Print', '打印隐患整改通知书', 'SmisDualControlHiddenHazardRectificationNotice:Print')
    ]
  },
  {
    menuName: 'SmisDualControlHiddenHazardInspectionRectification',
    buttons: [
      button(
        'View',
        '查看隐患检查落实整改',
        'SmisDualControlHiddenHazardInspectionRectification:View'
      ),
      button(
        'Create',
        '新增整改落实记录',
        'SmisDualControlHiddenHazardInspectionRectification:Create'
      ),
      button(
        'Export',
        '导出整改落实记录',
        'SmisDualControlHiddenHazardInspectionRectification:Export'
      )
    ]
  },
  {
    menuName: 'SmisHazardousWasteWarehouseDefinition',
    buttons: [
      button('View', '查看危废仓库', 'SmisHazardousWasteWarehouseDefinition:View'),
      button('Add', '新增危废仓库', 'SmisHazardousWasteWarehouseDefinition:Add'),
      button('Edit', '编辑危废仓库', 'SmisHazardousWasteWarehouseDefinition:Edit'),
      button('Delete', '删除危废仓库', 'SmisHazardousWasteWarehouseDefinition:Delete'),
      button('Export', '导出危废仓库', 'SmisHazardousWasteWarehouseDefinition:Export')
    ]
  },
  {
    menuName: 'SmisHazardousWasteCatalog',
    buttons: [
      button('View', '查看危废名录', 'SmisHazardousWasteCatalog:View'),
      button('AddCategory', '新增危废分类', 'SmisHazardousWasteCatalog:AddCategory'),
      button('EditCategory', '编辑危废分类', 'SmisHazardousWasteCatalog:EditCategory'),
      button('DeleteCategory', '删除危废分类', 'SmisHazardousWasteCatalog:DeleteCategory'),
      button('Add', '新增危废名录', 'SmisHazardousWasteCatalog:Add'),
      button('Edit', '编辑危废名录', 'SmisHazardousWasteCatalog:Edit'),
      button('Delete', '删除危废名录', 'SmisHazardousWasteCatalog:Delete'),
      button('Export', '导出危废名录', 'SmisHazardousWasteCatalog:Export')
    ]
  },
  {
    menuName: 'SmisHazardousWasteInbound',
    buttons: [
      button('View', '查看危废入库', 'SmisHazardousWasteInbound:View'),
      button('Add', '新增危废入库', 'SmisHazardousWasteInbound:Add'),
      button('Edit', '编辑危废入库', 'SmisHazardousWasteInbound:Edit'),
      button('Delete', '删除危废入库', 'SmisHazardousWasteInbound:Delete'),
      button('Export', '导出危废入库', 'SmisHazardousWasteInbound:Export'),
      button('Submit', '提交危废入库', 'SmisHazardousWasteInbound:Submit'),
      button('Review', '审核危废入库', 'SmisHazardousWasteInbound:Review')
    ]
  },
  {
    menuName: 'SmisHazardousWasteOutbound',
    buttons: [
      button('View', '查看危废出库', 'SmisHazardousWasteOutbound:View'),
      button('Add', '新增危废出库', 'SmisHazardousWasteOutbound:Add'),
      button('Edit', '编辑危废出库', 'SmisHazardousWasteOutbound:Edit'),
      button('Delete', '删除危废出库', 'SmisHazardousWasteOutbound:Delete'),
      button('Export', '导出危废出库', 'SmisHazardousWasteOutbound:Export'),
      button('Submit', '提交危废出库', 'SmisHazardousWasteOutbound:Submit'),
      button('Review', '审核危废出库', 'SmisHazardousWasteOutbound:Review')
    ]
  },
  {
    menuName: 'SmisEquipmentCategory',
    buttons: [
      button('View', '查看设备分类', 'SmisEquipmentCategory:View'),
      button('Add', '新增设备分类', 'SmisEquipmentCategory:Add'),
      button('Edit', '编辑设备分类', 'SmisEquipmentCategory:Edit'),
      button('Delete', '删除设备分类', 'SmisEquipmentCategory:Delete')
    ]
  },
  {
    menuName: 'SmisMaterialCategory',
    buttons: [
      button('View', '查看物料类别', 'SmisMaterialCategory:View'),
      button('Add', '新增物料类别', 'SmisMaterialCategory:Add'),
      button('Edit', '编辑物料类别', 'SmisMaterialCategory:Edit'),
      button('Delete', '删除物料类别', 'SmisMaterialCategory:Delete')
    ]
  },
  {
    menuName: 'SmisMaterialInformation',
    buttons: [
      button('View', '查看物料信息', 'SmisMaterialInformation:View'),
      button('Add', '新增物料信息', 'SmisMaterialInformation:Add'),
      button('Edit', '编辑物料信息', 'SmisMaterialInformation:Edit'),
      button('Delete', '删除物料信息', 'SmisMaterialInformation:Delete'),
      button('Export', '导出物料信息', 'SmisMaterialInformation:Export')
    ]
  },
  {
    menuName: 'SmisPpeIssuanceStandard',
    buttons: [
      button('View', '查看发放标准', 'SmisPpeIssuanceStandard:View'),
      button('Add', '新增发放标准', 'SmisPpeIssuanceStandard:Add'),
      button('Edit', '编辑发放标准', 'SmisPpeIssuanceStandard:Edit'),
      button('Delete', '删除发放标准', 'SmisPpeIssuanceStandard:Delete'),
      button('Export', '导出发放标准', 'SmisPpeIssuanceStandard:Export')
    ]
  },
  {
    menuName: 'SmisPpePersonalStandard',
    buttons: [
      button('View', '查看个人标准', 'SmisPpePersonalStandard:View'),
      button('Generate', '生成个人标准', 'SmisPpePersonalStandard:Generate'),
      button('Schedule', '设置领用计划', 'SmisPpePersonalStandard:Schedule'),
      button('Export', '导出个人标准', 'SmisPpePersonalStandard:Export')
    ]
  },
  {
    menuName: 'SmisPpeIssuanceRecord',
    buttons: [
      button('View', '查看发放记录', 'SmisPpeIssuanceRecord:View'),
      button('Add', '新增发放记录', 'SmisPpeIssuanceRecord:Add'),
      button('Copy', '复制并新增', 'SmisPpeIssuanceRecord:Copy'),
      button('Edit', '编辑发放记录', 'SmisPpeIssuanceRecord:Edit'),
      button('Delete', '删除发放记录', 'SmisPpeIssuanceRecord:Delete'),
      button('Issue', '发放过账', 'SmisPpeIssuanceRecord:Issue'),
      button('Import', '导入发放记录', 'SmisPpeIssuanceRecord:Import'),
      button('DownloadTemplate', '下载导入模板', 'SmisPpeIssuanceRecord:DownloadTemplate'),
      button('Export', '导出发放记录', 'SmisPpeIssuanceRecord:Export'),
      button('Statistics', '发放统计分析', 'SmisPpeIssuanceRecord:Statistics'),
      button('Print', '打印劳保单', 'SmisPpeIssuanceRecord:Print')
    ]
  },
  {
    menuName: 'SmisPpePersonalRequisition',
    buttons: [
      button('View', '查看个人领用', 'SmisPpePersonalRequisition:View'),
      button('Generate', '生成到期领用单', 'SmisPpePersonalRequisition:Generate'),
      button('Push', '下推发放', 'SmisPpePersonalRequisition:Push'),
      button('Confirm', '确认本人领用', 'SmisPpePersonalRequisition:Confirm'),
      button('Export', '导出个人领用', 'SmisPpePersonalRequisition:Export'),
      button('Statistics', '个人领用统计', 'SmisPpePersonalRequisition:Statistics'),
      button('Configure', '配置自动确认', 'SmisPpePersonalRequisition:Configure')
    ]
  },
  {
    menuName: 'SmisToolIssuanceStandard',
    buttons: [
      button('View', '查看发放标准', 'SmisToolIssuanceStandard:View'),
      button('Add', '新增发放标准', 'SmisToolIssuanceStandard:Add'),
      button('Edit', '编辑发放标准', 'SmisToolIssuanceStandard:Edit'),
      button('Delete', '删除发放标准', 'SmisToolIssuanceStandard:Delete'),
      button('Export', '导出发放标准', 'SmisToolIssuanceStandard:Export')
    ]
  },
  {
    menuName: 'SmisToolPersonalStandard',
    buttons: [
      button('View', '查看个人标准', 'SmisToolPersonalStandard:View'),
      button('Generate', '生成个人标准', 'SmisToolPersonalStandard:Generate'),
      button('Schedule', '设置领用计划', 'SmisToolPersonalStandard:Schedule'),
      button('Export', '导出个人标准', 'SmisToolPersonalStandard:Export')
    ]
  },
  {
    menuName: 'SmisToolIssuanceRecord',
    buttons: [
      button('View', '查看发放记录', 'SmisToolIssuanceRecord:View'),
      button('Add', '新增发放记录', 'SmisToolIssuanceRecord:Add'),
      button('Copy', '复制并新增', 'SmisToolIssuanceRecord:Copy'),
      button('Edit', '编辑发放记录', 'SmisToolIssuanceRecord:Edit'),
      button('Delete', '删除发放记录', 'SmisToolIssuanceRecord:Delete'),
      button('Issue', '发放过账', 'SmisToolIssuanceRecord:Issue'),
      button('Import', '导入发放记录', 'SmisToolIssuanceRecord:Import'),
      button('DownloadTemplate', '下载导入模板', 'SmisToolIssuanceRecord:DownloadTemplate'),
      button('Export', '导出发放记录', 'SmisToolIssuanceRecord:Export'),
      button('Statistics', '发放统计分析', 'SmisToolIssuanceRecord:Statistics'),
      button('Print', '打印工器具发放单', 'SmisToolIssuanceRecord:Print')
    ]
  },
  {
    menuName: 'SmisToolPersonalRequisition',
    buttons: [
      button('View', '查看个人领用', 'SmisToolPersonalRequisition:View'),
      button('Generate', '生成到期领用单', 'SmisToolPersonalRequisition:Generate'),
      button('Push', '下推发放', 'SmisToolPersonalRequisition:Push'),
      button('Confirm', '确认本人领用', 'SmisToolPersonalRequisition:Confirm'),
      button('Export', '导出个人领用', 'SmisToolPersonalRequisition:Export'),
      button('Statistics', '个人领用统计', 'SmisToolPersonalRequisition:Statistics'),
      button('Configure', '配置自动确认', 'SmisToolPersonalRequisition:Configure')
    ]
  },
  {
    menuName: 'SmisToolRequisitionReturn',
    buttons: [
      button('View', '查看归还单', 'SmisToolRequisitionReturn:View'),
      button('Add', '新增归还单', 'SmisToolRequisitionReturn:Add'),
      button('Copy', '复制并新增', 'SmisToolRequisitionReturn:Copy'),
      button('Edit', '编辑归还单', 'SmisToolRequisitionReturn:Edit'),
      button('Delete', '删除归还单', 'SmisToolRequisitionReturn:Delete'),
      button('Return', '发起归还', 'SmisToolRequisitionReturn:Return'),
      button('Submit', '提交归还审批', 'SmisToolRequisitionReturn:Submit'),
      button('Export', '导出归还单', 'SmisToolRequisitionReturn:Export')
    ]
  },
  {
    menuName: 'SmisThreeViolationEducation',
    buttons: [
      button('View', '查看三违教育信息', 'SmisThreeViolationEducation:View'),
      button('Add', '新增三违人员信息', 'SmisThreeViolationEducation:Add'),
      button('Copy', '复制并新增', 'SmisThreeViolationEducation:Copy'),
      button('Edit', '编辑三违人员信息', 'SmisThreeViolationEducation:Edit'),
      button('Delete', '删除三违人员信息', 'SmisThreeViolationEducation:Delete'),
      button('RecordEducation', '记录教育信息', 'SmisThreeViolationEducation:RecordEducation'),
      button('Export', '导出三违教育信息', 'SmisThreeViolationEducation:Export'),
      button('Print', '打印安全教育台账', 'SmisThreeViolationEducation:Print')
    ]
  },
  {
    menuName: 'SmisViolationCategory',
    buttons: [
      button('View', '查看违章分类', 'SmisViolationCategory:View'),
      button('Add', '新增违章分类', 'SmisViolationCategory:Add'),
      button('Edit', '编辑违章分类', 'SmisViolationCategory:Edit'),
      button('Delete', '删除违章分类', 'SmisViolationCategory:Delete'),
      button('Export', '导出违章分类', 'SmisViolationCategory:Export')
    ]
  },
  {
    menuName: 'SmisWorkItem',
    buttons: [
      button('View', '查看作业项目', 'SmisWorkItem:View'),
      button('Add', '新增作业项目', 'SmisWorkItem:Add'),
      button('Edit', '编辑作业项目', 'SmisWorkItem:Edit'),
      button('Delete', '删除作业项目', 'SmisWorkItem:Delete'),
      button('Export', '导出作业项目', 'SmisWorkItem:Export')
    ]
  },
  {
    menuName: 'SmisSpecialOperationType',
    buttons: [
      button('View', '查看作业类型', 'SmisSpecialOperationType:View'),
      button('Add', '新增作业类型', 'SmisSpecialOperationType:Add'),
      button('Edit', '编辑作业类型', 'SmisSpecialOperationType:Edit'),
      button('Delete', '删除作业类型', 'SmisSpecialOperationType:Delete'),
      button('Export', '导出作业类型', 'SmisSpecialOperationType:Export'),
      button('Void', '作废作业类型', 'SmisSpecialOperationType:Void')
    ]
  },
  {
    menuName: 'SmisSpecialOperationSafetyChecklist',
    buttons: [
      button('View', '查看安全检查表', 'SmisSpecialOperationSafetyChecklist:View'),
      button('Add', '新增安全排查项', 'SmisSpecialOperationSafetyChecklist:Add'),
      button('Edit', '编辑安全排查项', 'SmisSpecialOperationSafetyChecklist:Edit'),
      button('Delete', '删除安全排查项', 'SmisSpecialOperationSafetyChecklist:Delete'),
      button('Export', '导出安全检查表', 'SmisSpecialOperationSafetyChecklist:Export'),
      button('Void', '作废安全排查项', 'SmisSpecialOperationSafetyChecklist:Void')
    ]
  },
  {
    menuName: 'SmisSpecialOperationHazardFactor',
    buttons: [
      button('View', '查看危害因素', 'SmisSpecialOperationHazardFactor:View'),
      button('Add', '新增危害因素', 'SmisSpecialOperationHazardFactor:Add'),
      button('Edit', '编辑危害因素', 'SmisSpecialOperationHazardFactor:Edit'),
      button('Delete', '删除危害因素', 'SmisSpecialOperationHazardFactor:Delete'),
      button('Export', '导出危害因素', 'SmisSpecialOperationHazardFactor:Export'),
      button('Void', '作废危害因素', 'SmisSpecialOperationHazardFactor:Void')
    ]
  },
  {
    menuName: 'SmisSpecialOperationSiteAnalysisForm',
    buttons: [
      button('View', '查看现场分析表', 'SmisSpecialOperationSiteAnalysisForm:View'),
      button('Add', '新增现场分析项', 'SmisSpecialOperationSiteAnalysisForm:Add'),
      button('Edit', '编辑现场分析项', 'SmisSpecialOperationSiteAnalysisForm:Edit'),
      button('Delete', '删除现场分析项', 'SmisSpecialOperationSiteAnalysisForm:Delete'),
      button('Export', '导出现场分析表', 'SmisSpecialOperationSiteAnalysisForm:Export'),
      button('Void', '作废现场分析项', 'SmisSpecialOperationSiteAnalysisForm:Void')
    ]
  },
  {
    menuName: 'SmisSpecialOperationWorkbench',
    buttons: [
      button('View', '查看特殊作业票', 'SmisSpecialOperationWorkbench:View'),
      button('Add', '新增特殊作业票', 'SmisSpecialOperationWorkbench:Add'),
      button('Copy', '复制特殊作业票', 'SmisSpecialOperationWorkbench:Copy'),
      button('Edit', '编辑特殊作业票', 'SmisSpecialOperationWorkbench:Edit'),
      button('Delete', '删除特殊作业票', 'SmisSpecialOperationWorkbench:Delete'),
      button('Export', '导出特殊作业台账', 'SmisSpecialOperationWorkbench:Export'),
      button('Void', '作废特殊作业票', 'SmisSpecialOperationWorkbench:Void'),
      button('Start', '审批并开始作业', 'SmisSpecialOperationWorkbench:Start'),
      button(
        'RequestAcceptance',
        '申请特殊作业验收',
        'SmisSpecialOperationWorkbench:RequestAcceptance'
      ),
      button('Accept', '验收特殊作业票', 'SmisSpecialOperationWorkbench:Accept'),
      button('AiPrecheck', 'AI 作业票预审', 'SmisSpecialOperationWorkbench:AiPrecheck'),
      button('Print', '打印特殊作业票', 'SmisSpecialOperationWorkbench:Print')
    ]
  },
  {
    menuName: 'SmisHotWorkApplication',
    buttons: [
      button('View', '查看动火作业票', 'SmisHotWorkApplication:View'),
      button('Add', '新增动火作业票', 'SmisHotWorkApplication:Add'),
      button('Copy', '复制动火作业票', 'SmisHotWorkApplication:Copy'),
      button('Edit', '编辑动火作业票', 'SmisHotWorkApplication:Edit'),
      button('Delete', '删除动火作业票', 'SmisHotWorkApplication:Delete'),
      button('Export', '导出动火作业台账', 'SmisHotWorkApplication:Export'),
      button('Void', '作废动火作业票', 'SmisHotWorkApplication:Void'),
      button('Start', '审批并开始动火作业', 'SmisHotWorkApplication:Start'),
      button('RequestAcceptance', '申请动火作业验收', 'SmisHotWorkApplication:RequestAcceptance'),
      button('Accept', '验收动火作业票', 'SmisHotWorkApplication:Accept'),
      button('AiPrecheck', 'AI 动火票预审', 'SmisHotWorkApplication:AiPrecheck'),
      button('Print', '打印动火作业票', 'SmisHotWorkApplication:Print')
    ]
  },
  {
    menuName: 'SmisWorkAtHeightApplication',
    buttons: [
      button('View', '查看高处作业票', 'SmisWorkAtHeightApplication:View'),
      button('Add', '新增高处作业票', 'SmisWorkAtHeightApplication:Add'),
      button('Copy', '复制高处作业票', 'SmisWorkAtHeightApplication:Copy'),
      button('Edit', '编辑高处作业票', 'SmisWorkAtHeightApplication:Edit'),
      button('Delete', '删除高处作业票', 'SmisWorkAtHeightApplication:Delete'),
      button('Export', '导出高处作业台账', 'SmisWorkAtHeightApplication:Export'),
      button('Void', '作废高处作业票', 'SmisWorkAtHeightApplication:Void'),
      button('Start', '审批并开始高处作业', 'SmisWorkAtHeightApplication:Start'),
      button(
        'RequestAcceptance',
        '申请高处作业验收',
        'SmisWorkAtHeightApplication:RequestAcceptance'
      ),
      button('Accept', '验收高处作业票', 'SmisWorkAtHeightApplication:Accept'),
      button('AiPrecheck', 'AI 高处作业票预审', 'SmisWorkAtHeightApplication:AiPrecheck'),
      button('Print', '打印高处作业票', 'SmisWorkAtHeightApplication:Print')
    ]
  },
  {
    menuName: 'SmisLiftingOperationApplication',
    buttons: [
      button('View', '查看吊装作业票', 'SmisLiftingOperationApplication:View'),
      button('Add', '新增吊装作业票', 'SmisLiftingOperationApplication:Add'),
      button('Copy', '复制吊装作业票', 'SmisLiftingOperationApplication:Copy'),
      button('Edit', '编辑吊装作业票', 'SmisLiftingOperationApplication:Edit'),
      button('Delete', '删除吊装作业票', 'SmisLiftingOperationApplication:Delete'),
      button('Export', '导出吊装作业台账', 'SmisLiftingOperationApplication:Export'),
      button('Void', '作废吊装作业票', 'SmisLiftingOperationApplication:Void'),
      button('Start', '审批并开始吊装作业', 'SmisLiftingOperationApplication:Start'),
      button(
        'RequestAcceptance',
        '申请吊装作业验收',
        'SmisLiftingOperationApplication:RequestAcceptance'
      ),
      button('Accept', '验收吊装作业票', 'SmisLiftingOperationApplication:Accept'),
      button('AiPrecheck', 'AI 吊装作业票预审', 'SmisLiftingOperationApplication:AiPrecheck'),
      button('Print', '打印吊装作业票', 'SmisLiftingOperationApplication:Print')
    ]
  },
  {
    menuName: 'SmisConfinedSpaceOperationApplication',
    buttons: [
      button('View', '查看受限空间作业票', 'SmisConfinedSpaceOperationApplication:View'),
      button('Add', '新增受限空间作业票', 'SmisConfinedSpaceOperationApplication:Add'),
      button('Copy', '复制受限空间作业票', 'SmisConfinedSpaceOperationApplication:Copy'),
      button('Edit', '编辑受限空间作业票', 'SmisConfinedSpaceOperationApplication:Edit'),
      button('Delete', '删除受限空间作业票', 'SmisConfinedSpaceOperationApplication:Delete'),
      button('Export', '导出受限空间作业台账', 'SmisConfinedSpaceOperationApplication:Export'),
      button('Void', '作废受限空间作业票', 'SmisConfinedSpaceOperationApplication:Void'),
      button('Start', '审批并开始受限空间作业', 'SmisConfinedSpaceOperationApplication:Start'),
      button(
        'RequestAcceptance',
        '申请受限空间作业验收',
        'SmisConfinedSpaceOperationApplication:RequestAcceptance'
      ),
      button('Accept', '验收受限空间作业票', 'SmisConfinedSpaceOperationApplication:Accept'),
      button(
        'AiPrecheck',
        'AI 受限空间作业票预审',
        'SmisConfinedSpaceOperationApplication:AiPrecheck'
      ),
      button('Print', '打印受限空间作业票', 'SmisConfinedSpaceOperationApplication:Print')
    ]
  },
  {
    menuName: 'SmisTemporaryElectricityApplication',
    buttons: [
      button('View', '查看临时用电作业票', 'SmisTemporaryElectricityApplication:View'),
      button('Add', '新增临时用电作业票', 'SmisTemporaryElectricityApplication:Add'),
      button('Copy', '复制临时用电作业票', 'SmisTemporaryElectricityApplication:Copy'),
      button('Edit', '编辑临时用电作业票', 'SmisTemporaryElectricityApplication:Edit'),
      button('Delete', '删除临时用电作业票', 'SmisTemporaryElectricityApplication:Delete'),
      button('Export', '导出临时用电作业台账', 'SmisTemporaryElectricityApplication:Export'),
      button('Void', '作废临时用电作业票', 'SmisTemporaryElectricityApplication:Void'),
      button('Start', '审批并开始临时用电作业', 'SmisTemporaryElectricityApplication:Start'),
      button(
        'RequestAcceptance',
        '申请临时用电作业验收',
        'SmisTemporaryElectricityApplication:RequestAcceptance'
      ),
      button('Accept', '验收临时用电作业票', 'SmisTemporaryElectricityApplication:Accept'),
      button(
        'AiPrecheck',
        'AI 临时用电作业票预审',
        'SmisTemporaryElectricityApplication:AiPrecheck'
      ),
      button('Print', '打印临时用电作业票', 'SmisTemporaryElectricityApplication:Print')
    ]
  },
  {
    menuName: 'SmisRoadBreakingOperationApplication',
    buttons: [
      button('View', '查看断路作业票', 'SmisRoadBreakingOperationApplication:View'),
      button('Add', '新增断路作业票', 'SmisRoadBreakingOperationApplication:Add'),
      button('Copy', '复制断路作业票', 'SmisRoadBreakingOperationApplication:Copy'),
      button('Edit', '编辑断路作业票', 'SmisRoadBreakingOperationApplication:Edit'),
      button('Delete', '删除断路作业票', 'SmisRoadBreakingOperationApplication:Delete'),
      button('Export', '导出断路作业台账', 'SmisRoadBreakingOperationApplication:Export'),
      button('Void', '作废断路作业票', 'SmisRoadBreakingOperationApplication:Void'),
      button('Start', '审批并开始断路作业', 'SmisRoadBreakingOperationApplication:Start'),
      button(
        'RequestAcceptance',
        '申请断路作业验收',
        'SmisRoadBreakingOperationApplication:RequestAcceptance'
      ),
      button('Accept', '验收断路作业票', 'SmisRoadBreakingOperationApplication:Accept'),
      button('AiPrecheck', 'AI 断路作业票预审', 'SmisRoadBreakingOperationApplication:AiPrecheck'),
      button('Print', '打印断路作业票', 'SmisRoadBreakingOperationApplication:Print')
    ]
  },
  {
    menuName: 'SmisBlindPlateOperationApplication',
    buttons: [
      button('View', '查看盲板抽堵作业票', 'SmisBlindPlateOperationApplication:View'),
      button('Add', '新增盲板抽堵作业票', 'SmisBlindPlateOperationApplication:Add'),
      button('Copy', '复制盲板抽堵作业票', 'SmisBlindPlateOperationApplication:Copy'),
      button('Edit', '编辑盲板抽堵作业票', 'SmisBlindPlateOperationApplication:Edit'),
      button('Delete', '删除盲板抽堵作业票', 'SmisBlindPlateOperationApplication:Delete'),
      button('Export', '导出盲板抽堵作业台账', 'SmisBlindPlateOperationApplication:Export'),
      button('Void', '作废盲板抽堵作业票', 'SmisBlindPlateOperationApplication:Void'),
      button('Start', '审批并开始盲板抽堵作业', 'SmisBlindPlateOperationApplication:Start'),
      button(
        'RequestAcceptance',
        '申请盲板抽堵作业验收',
        'SmisBlindPlateOperationApplication:RequestAcceptance'
      ),
      button('Accept', '验收盲板抽堵作业票', 'SmisBlindPlateOperationApplication:Accept'),
      button(
        'AiPrecheck',
        'AI 盲板抽堵作业票预审',
        'SmisBlindPlateOperationApplication:AiPrecheck'
      ),
      button('Print', '打印盲板抽堵作业票', 'SmisBlindPlateOperationApplication:Print')
    ]
  },
  {
    menuName: 'SmisWorkCategory',
    buttons: [
      button('View', '查看作业类别', 'SmisWorkCategory:View'),
      button('Add', '新增作业类别', 'SmisWorkCategory:Add'),
      button('Edit', '编辑作业类别', 'SmisWorkCategory:Edit'),
      button('Delete', '删除作业类别', 'SmisWorkCategory:Delete'),
      button('Export', '导出作业类别', 'SmisWorkCategory:Export')
    ]
  },
  {
    menuName: 'SmisPermittedOperationItem',
    buttons: [
      button('View', '查看准操项目', 'SmisPermittedOperationItem:View'),
      button('Add', '新增准操项目', 'SmisPermittedOperationItem:Add'),
      button('Edit', '编辑准操项目', 'SmisPermittedOperationItem:Edit'),
      button('Delete', '删除准操项目', 'SmisPermittedOperationItem:Delete'),
      button('Export', '导出准操项目', 'SmisPermittedOperationItem:Export')
    ]
  },
  {
    menuName: 'SmisSpecialEquipmentPersonnelCertificateLedger',
    buttons: [
      button('View', '查看人员证件台账', 'SmisPersonnelCertificateLedger:View'),
      button('Add', '新增人员证件', 'SmisPersonnelCertificateLedger:Add'),
      button('Copy', '复制并新增', 'SmisPersonnelCertificateLedger:Copy'),
      button('Edit', '编辑人员证件', 'SmisPersonnelCertificateLedger:Edit'),
      button('Delete', '删除人员证件', 'SmisPersonnelCertificateLedger:Delete'),
      button('Export', '导出人员证件台账', 'SmisPersonnelCertificateLedger:Export'),
      button('AiAnalyze', 'AI 证件识别', 'SmisPersonnelCertificateLedger:AiAnalyze'),
      button('ViewHistory', '查看复审记录', 'SmisPersonnelCertificateLedger:ViewHistory')
    ]
  },
  {
    menuName: 'SmisSpecialEquipmentOperatorCertificateLedger',
    buttons: [
      button('View', '查看作业人员证件台账', 'SmisSpecialEquipmentOperatorCertificateLedger:View'),
      button('Add', '新增作业人员证件', 'SmisSpecialEquipmentOperatorCertificateLedger:Add'),
      button('Copy', '复制并新增', 'SmisSpecialEquipmentOperatorCertificateLedger:Copy'),
      button('Edit', '编辑作业人员证件', 'SmisSpecialEquipmentOperatorCertificateLedger:Edit'),
      button('Delete', '删除作业人员证件', 'SmisSpecialEquipmentOperatorCertificateLedger:Delete'),
      button(
        'Export',
        '导出作业人员证件台账',
        'SmisSpecialEquipmentOperatorCertificateLedger:Export'
      ),
      button('AiAnalyze', 'AI 证件识别', 'SmisSpecialEquipmentOperatorCertificateLedger:AiAnalyze'),
      button(
        'ViewHistory',
        '查看作业人员复审记录',
        'SmisSpecialEquipmentOperatorCertificateLedger:ViewHistory'
      )
    ]
  },
  {
    menuName: 'SmisSpecialOperationCertificate',
    buttons: [
      button('View', '查看特种作业操作证', 'SmisSpecialOperationCertificate:View'),
      button('Add', '新增特种作业操作证', 'SmisSpecialOperationCertificate:Add'),
      button('Copy', '复制并新增', 'SmisSpecialOperationCertificate:Copy'),
      button('Edit', '编辑特种作业操作证', 'SmisSpecialOperationCertificate:Edit'),
      button('Delete', '删除特种作业操作证', 'SmisSpecialOperationCertificate:Delete'),
      button('Export', '导出特种作业操作证', 'SmisSpecialOperationCertificate:Export'),
      button('AiAnalyze', 'AI 证件识别', 'SmisSpecialOperationCertificate:AiAnalyze'),
      button('ViewHistory', '查看特种作业复审记录', 'SmisSpecialOperationCertificate:ViewHistory')
    ]
  },
  {
    menuName: 'SmisSafetyManagerCertificate',
    buttons: [
      button('View', '查看安全管理人员证', 'SmisSafetyManagerCertificate:View'),
      button('Add', '新增安全管理人员证', 'SmisSafetyManagerCertificate:Add'),
      button('Copy', '复制并新增', 'SmisSafetyManagerCertificate:Copy'),
      button('Edit', '编辑安全管理人员证', 'SmisSafetyManagerCertificate:Edit'),
      button('Delete', '删除安全管理人员证', 'SmisSafetyManagerCertificate:Delete'),
      button('Export', '导出安全管理人员证', 'SmisSafetyManagerCertificate:Export'),
      button('AiAnalyze', 'AI 证件识别', 'SmisSafetyManagerCertificate:AiAnalyze'),
      button(
        'ViewHistory',
        '查看安全管理人员证复审记录',
        'SmisSafetyManagerCertificate:ViewHistory'
      )
    ]
  },
  {
    menuName: 'SmisRegisteredSafetyEngineerLedger',
    buttons: [
      button('View', '查看注册安全工程师台账', 'SmisRegisteredSafetyEngineerLedger:View'),
      button('Add', '新增注册安全工程师证', 'SmisRegisteredSafetyEngineerLedger:Add'),
      button('Copy', '复制并新增', 'SmisRegisteredSafetyEngineerLedger:Copy'),
      button('Edit', '编辑注册安全工程师证', 'SmisRegisteredSafetyEngineerLedger:Edit'),
      button('Delete', '删除注册安全工程师证', 'SmisRegisteredSafetyEngineerLedger:Delete'),
      button('Export', '导出注册安全工程师台账', 'SmisRegisteredSafetyEngineerLedger:Export'),
      button('AiAnalyze', 'AI 证件识别', 'SmisRegisteredSafetyEngineerLedger:AiAnalyze'),
      button(
        'ViewHistory',
        '查看注册安全工程师复审记录',
        'SmisRegisteredSafetyEngineerLedger:ViewHistory'
      )
    ]
  },
  {
    menuName: 'SmisSafetyQualificationReportAnalysis',
    buttons: [button('View', '查看安全资质报表分析', 'SmisSafetyQualificationReportAnalysis:View')]
  },
  {
    menuName: 'SmisAntiViolationStandardLibrary',
    buttons: [
      button('View', '查看反违章标准', 'SmisAntiViolationStandardLibrary:View'),
      button('Add', '新增反违章标准', 'SmisAntiViolationStandardLibrary:Add'),
      button('Edit', '编辑反违章标准', 'SmisAntiViolationStandardLibrary:Edit'),
      button('Delete', '删除反违章标准', 'SmisAntiViolationStandardLibrary:Delete'),
      button('Import', '导入反违章标准', 'SmisAntiViolationStandardLibrary:Import'),
      button('Export', '导出反违章标准', 'SmisAntiViolationStandardLibrary:Export')
    ]
  },
  {
    menuName: 'SmisViolationRecord',
    buttons: [
      button('View', '查看违章记录', 'SmisViolationRecord:View'),
      button('Add', '新增违章记录', 'SmisViolationRecord:Add'),
      button('Copy', '复制并新增', 'SmisViolationRecord:Copy'),
      button('Edit', '编辑违章记录', 'SmisViolationRecord:Edit'),
      button('Delete', '删除违章记录', 'SmisViolationRecord:Delete'),
      button('Export', '导出违章记录', 'SmisViolationRecord:Export')
    ]
  },
  {
    menuName: 'SmisAnnouncementCategory',
    buttons: [
      button('View', '查看公告分类', 'SmisAnnouncementCategory:View'),
      button('Add', '新增公告分类', 'SmisAnnouncementCategory:Add'),
      button('Edit', '编辑公告分类', 'SmisAnnouncementCategory:Edit'),
      button('Delete', '删除公告分类', 'SmisAnnouncementCategory:Delete'),
      button('Export', '导出公告分类', 'SmisAnnouncementCategory:Export')
    ]
  },
  {
    menuName: 'SmisViolationAnnouncement',
    buttons: [
      button('View', '查看公告', 'SmisViolationAnnouncement:View'),
      button('Add', '新建公告', 'SmisViolationAnnouncement:Add'),
      button('Edit', '编辑公告草稿', 'SmisViolationAnnouncement:Edit'),
      button('Delete', '删除公告草稿', 'SmisViolationAnnouncement:Delete'),
      button('Publish', '发布公告', 'SmisViolationAnnouncement:Publish'),
      button('Withdraw', '撤回公告', 'SmisViolationAnnouncement:Withdraw'),
      button('ReadStats', '查看查阅情况', 'SmisViolationAnnouncement:ReadStats')
    ]
  },
  {
    menuName: 'SmisStorageLocation',
    buttons: [
      button('View', '查看存放位置', 'SmisStorageLocation:View'),
      button('Add', '新增存放位置', 'SmisStorageLocation:Add'),
      button('Edit', '编辑存放位置', 'SmisStorageLocation:Edit'),
      button('Delete', '删除存放位置', 'SmisStorageLocation:Delete')
    ]
  },
  {
    menuName: 'SmisEquipmentLedgerList',
    buttons: [
      button('View', '查看设备台账', 'SmisEquipmentLedger:View'),
      button('Add', '新增设备', 'SmisEquipmentLedger:Add'),
      button('Edit', '编辑设备', 'SmisEquipmentLedger:Edit'),
      button('Delete', '删除设备', 'SmisEquipmentLedger:Delete'),
      button('Attachment', '维护设备附件', 'SmisEquipmentLedger:Attachment'),
      button('Inspection', '维护设备检验', 'SmisEquipmentLedger:Inspection')
    ]
  },
  {
    menuName: 'SmisEquipmentDepreciation',
    buttons: [
      button('View', '查看折旧方法', 'SmisEquipmentDepreciation:View'),
      button('Add', '新增折旧方法', 'SmisEquipmentDepreciation:Add'),
      button('Edit', '编辑折旧方法', 'SmisEquipmentDepreciation:Edit'),
      button('Delete', '删除折旧方法', 'SmisEquipmentDepreciation:Delete')
    ]
  },
  {
    menuName: 'SmisInspectionDeclaration',
    buttons: [
      button('View', '查看检验申报', 'SmisInspectionDeclaration:View'),
      button('Add', '新增检验申报', 'SmisInspectionDeclaration:Add'),
      button('Edit', '编辑检验申报', 'SmisInspectionDeclaration:Edit'),
      button('Delete', '删除检验申报', 'SmisInspectionDeclaration:Delete'),
      button('AiAnalyze', 'AI 检验报告识别', 'SmisInspectionDeclaration:AiAnalyze')
    ]
  },
  {
    menuName: 'SmisSpecialEquipmentAnalysis',
    buttons: [button('View', '查看特种设备统计', 'SmisSpecialEquipmentAnalysis:View')]
  },
  {
    menuName: 'SmisSpecialEquipmentLedger',
    buttons: [
      button('View', '查看特种设备台账', 'SmisSpecialEquipmentLedger:View'),
      button('ReminderView', '查看设备提醒', 'SmisEquipmentReminder:View'),
      button('ReminderManage', '维护设备提醒', 'SmisEquipmentReminder:Manage')
    ]
  },
  {
    menuName: 'SmisSupplier',
    buttons: [
      button('View', '查看供应商', 'SmisSupplier:View'),
      button('Add', '新增供应商', 'SmisSupplier:Add'),
      button('Edit', '编辑供应商', 'SmisSupplier:Edit'),
      button('Delete', '删除供应商', 'SmisSupplier:Delete'),
      button('Export', '导出供应商', 'SmisSupplier:Export')
    ]
  },
  {
    menuName: 'SmisAllDocuments',
    buttons: [
      button('View', '查看全部文档', 'SmisAllDocuments:View'),
      button('Add', '新增文档', 'SmisAllDocuments:Add'),
      button('Upload', '上传文档或新版本', 'SmisAllDocuments:Upload'),
      button('Edit', '编辑文档', 'SmisAllDocuments:Edit'),
      button('Delete', '删除草稿文档', 'SmisAllDocuments:Delete'),
      button('Export', '导出文档清单', 'SmisAllDocuments:Export'),
      button('Follow', '关注或取消关注文档', 'SmisAllDocuments:Follow'),
      button('Share', '分享文档', 'SmisAllDocuments:Share'),
      button('CategoryAdd', '新增文档分类', 'SmisAllDocuments:CategoryAdd'),
      button('CategoryEdit', '编辑文档分类', 'SmisAllDocuments:CategoryEdit'),
      button('CategoryDelete', '删除文档分类', 'SmisAllDocuments:CategoryDelete')
    ]
  },
  {
    menuName: 'SmisRequiredKnowledge',
    buttons: [
      button('View', '查看应知应会', 'SmisRequiredKnowledge:View'),
      button('Add', '新增应知应会', 'SmisRequiredKnowledge:Add'),
      button('Edit', '编辑应知应会', 'SmisRequiredKnowledge:Edit'),
      button('Delete', '删除应知应会', 'SmisRequiredKnowledge:Delete'),
      button('Export', '导出应知应会', 'SmisRequiredKnowledge:Export'),
      button('CategoryAdd', '新增文档分类', 'SmisRequiredKnowledge:CategoryAdd'),
      button('CategoryEdit', '编辑文档分类', 'SmisRequiredKnowledge:CategoryEdit'),
      button('CategoryDelete', '删除文档分类', 'SmisRequiredKnowledge:CategoryDelete')
    ]
  },
  {
    menuName: 'SmisSafetyManagementSystem',
    buttons: [
      button('View', '查看安全管理制度', 'SmisSafetyManagementSystem:View'),
      button('Add', '新增安全管理制度', 'SmisSafetyManagementSystem:Add'),
      button('Edit', '编辑安全管理制度', 'SmisSafetyManagementSystem:Edit'),
      button('Delete', '删除安全管理制度', 'SmisSafetyManagementSystem:Delete'),
      button('Export', '导出安全管理制度', 'SmisSafetyManagementSystem:Export')
    ]
  },
  {
    menuName: 'SmisLegalRegulation',
    buttons: [
      button('View', '查看法律法规', 'SmisLegalRegulation:View'),
      button('Add', '新增法律法规', 'SmisLegalRegulation:Add'),
      button('Copy', '复制并新增法律法规', 'SmisLegalRegulation:Copy'),
      button('Edit', '编辑法律法规', 'SmisLegalRegulation:Edit'),
      button('Delete', '删除法律法规', 'SmisLegalRegulation:Delete'),
      button('Export', '导出法律法规', 'SmisLegalRegulation:Export'),
      button('ComplianceView', '查看合规性评价', 'SmisLegalRegulation:ComplianceView'),
      button('ComplianceAdd', '新增合规性评价', 'SmisLegalRegulation:ComplianceAdd'),
      button('ComplianceCopy', '复制并新增合规性评价', 'SmisLegalRegulation:ComplianceCopy'),
      button('ComplianceEdit', '编辑合规性评价', 'SmisLegalRegulation:ComplianceEdit'),
      button('ComplianceDelete', '删除合规性评价', 'SmisLegalRegulation:ComplianceDelete')
    ]
  },
  {
    menuName: 'SmisHazardSourceLedger',
    buttons: [
      button('View', '查看危险源台账', 'SmisHazardSourceLedger:View'),
      button('Add', '新增危险源', 'SmisHazardSourceLedger:Add'),
      button('Edit', '编辑危险源', 'SmisHazardSourceLedger:Edit'),
      button('Delete', '删除危险源', 'SmisHazardSourceLedger:Delete'),
      button('Submit', '提交危险源', 'SmisHazardSourceLedger:Submit'),
      button('Import', '导入危险源', 'SmisHazardSourceLedger:Import'),
      button('Export', '导出危险源', 'SmisHazardSourceLedger:Export'),
      button('Statistics', '危险源统计分析', 'SmisHazardSourceLedger:Statistics'),
      button('DownloadTemplate', '下载危险源导入模板', 'SmisHazardSourceLedger:DownloadTemplate')
    ]
  },
  {
    menuName: 'SmisAccidentFlashReport',
    buttons: [
      button('View', '查看事故快报', 'SmisAccidentFlashReport:View'),
      button('Add', '新增事故快报', 'SmisAccidentFlashReport:Add'),
      button('Edit', '编辑事故快报', 'SmisAccidentFlashReport:Edit'),
      button('Delete', '删除事故快报', 'SmisAccidentFlashReport:Delete'),
      button('Export', '导出事故快报', 'SmisAccidentFlashReport:Export')
    ]
  },
  {
    menuName: 'SmisHistoricalAccidentCases',
    buttons: [
      button('View', '查看历史事故案例', 'SmisHistoricalAccidentCases:View'),
      button('Add', '新增历史事故案例', 'SmisHistoricalAccidentCases:Add'),
      button('Edit', '编辑历史事故案例', 'SmisHistoricalAccidentCases:Edit'),
      button('Delete', '删除历史事故案例', 'SmisHistoricalAccidentCases:Delete'),
      button('Export', '导出历史事故案例', 'SmisHistoricalAccidentCases:Export')
    ]
  },
  {
    menuName: 'SmisSafetyAccidentStatistics',
    buttons: [button('View', '查看安全事故统计', 'SmisSafetyAccidentStatistics:View')]
  },
  {
    menuName: 'SmisWorkInjuryDeclaration',
    buttons: [
      button('View', '查看工伤申报', 'SmisWorkInjuryDeclaration:View'),
      button('Add', '新增工伤申报', 'SmisWorkInjuryDeclaration:Add'),
      button('Edit', '编辑工伤申报', 'SmisWorkInjuryDeclaration:Edit'),
      button('Delete', '删除工伤申报', 'SmisWorkInjuryDeclaration:Delete'),
      button('Export', '导出工伤申报', 'SmisWorkInjuryDeclaration:Export')
    ]
  },
  {
    menuName: 'SmisAccidentInvestigation',
    buttons: [
      button('View', '查看事故分析单', 'SmisAccidentInvestigation:View'),
      button('Add', '新增事故分析单', 'SmisAccidentInvestigation:Add'),
      button('Edit', '编辑事故分析单', 'SmisAccidentInvestigation:Edit'),
      button('Delete', '删除事故分析单', 'SmisAccidentInvestigation:Delete'),
      button('Export', '导出事故分析单', 'SmisAccidentInvestigation:Export')
    ]
  },
  {
    menuName: 'SmisEmergencyRescuePlan',
    buttons: [
      button('View', '查看应急预案', 'SmisEmergencyRescuePlan:View'),
      button('Add', '新增应急预案', 'SmisEmergencyRescuePlan:Add'),
      button('Edit', '编辑应急预案', 'SmisEmergencyRescuePlan:Edit'),
      button('Delete', '删除应急预案', 'SmisEmergencyRescuePlan:Delete'),
      button('Submit', '提交应急预案', 'SmisEmergencyRescuePlan:Submit'),
      button('Void', '置废应急预案', 'SmisEmergencyRescuePlan:Void'),
      button('Activate', '恢复有效预案', 'SmisEmergencyRescuePlan:Activate'),
      button('Push', '下推演练计划', 'SmisEmergencyRescuePlan:Push')
    ]
  },
  {
    menuName: 'SmisEmergencyDrillPlan',
    buttons: [
      button('View', '查看演练计划', 'SmisEmergencyDrillPlan:View'),
      button('Add', '新增演练计划', 'SmisEmergencyDrillPlan:Add'),
      button('Edit', '编辑演练计划', 'SmisEmergencyDrillPlan:Edit'),
      button('Delete', '删除演练计划', 'SmisEmergencyDrillPlan:Delete'),
      button('Submit', '提交演练计划', 'SmisEmergencyDrillPlan:Submit'),
      button('Push', '下推演练记录', 'SmisEmergencyDrillPlan:Push')
    ]
  },
  {
    menuName: 'SmisEmergencyDrillRecord',
    buttons: [
      button('View', '查看演练记录', 'SmisEmergencyDrillRecord:View'),
      button('Add', '新增演练记录', 'SmisEmergencyDrillRecord:Add'),
      button('Edit', '编辑演练记录', 'SmisEmergencyDrillRecord:Edit'),
      button('Delete', '删除演练记录', 'SmisEmergencyDrillRecord:Delete'),
      button('Submit', '提交演练记录', 'SmisEmergencyDrillRecord:Submit')
    ]
  },
  {
    menuName: 'SmisEmergencyDrillReport',
    buttons: [
      button('View', '查看演练报表', 'SmisEmergencyDrillReport:View'),
      button('Export', '导出演练报表', 'SmisEmergencyDrillReport:Export')
    ]
  },
  {
    menuName: 'SmisSafetyTrainingPlan',
    buttons: [
      button('View', '查看培训计划', 'SmisSafetyTrainingPlan:View'),
      button('Add', '新增培训计划', 'SmisSafetyTrainingPlan:Add'),
      button('Copy', '复制并新增培训计划', 'SmisSafetyTrainingPlan:Copy'),
      button('Edit', '编辑培训计划', 'SmisSafetyTrainingPlan:Edit'),
      button('Delete', '删除培训计划', 'SmisSafetyTrainingPlan:Delete'),
      button('Publish', '发布培训计划', 'SmisSafetyTrainingPlan:Publish'),
      button('CreateRecord', '创建培训记录', 'SmisSafetyTrainingPlan:CreateRecord'),
      button('Export', '导出培训计划', 'SmisSafetyTrainingPlan:Export')
    ]
  },
  {
    menuName: 'SmisSafetyTrainingRecord',
    buttons: [
      button('View', '查看培训记录', 'SmisSafetyTrainingRecord:View'),
      button('Add', '新增培训记录', 'SmisSafetyTrainingRecord:Add'),
      button('Edit', '编辑培训记录及签到', 'SmisSafetyTrainingRecord:Edit'),
      button('Delete', '删除培训记录', 'SmisSafetyTrainingRecord:Delete'),
      button('Submit', '提交培训记录', 'SmisSafetyTrainingRecord:Submit'),
      button('Export', '导出培训记录', 'SmisSafetyTrainingRecord:Export')
    ]
  },
  {
    menuName: 'SmisTrainingStatisticsReport',
    buttons: [
      button('View', '查看培训统计报表', 'SmisTrainingStatisticsReport:View'),
      button('Export', '导出培训统计报表', 'SmisTrainingStatisticsReport:Export')
    ]
  },
  {
    menuName: 'SmisCourseManagement',
    buttons: [
      button('View', '查看课程', 'SmisCourseManagement:View'),
      button('Add', '新增课程', 'SmisCourseManagement:Add'),
      button('Edit', '编辑课程', 'SmisCourseManagement:Edit'),
      button('Delete', '删除课程', 'SmisCourseManagement:Delete'),
      button('Publish', '发布或关闭课程', 'SmisCourseManagement:Publish'),
      button('Assign', '分配学习人员', 'SmisCourseManagement:Assign'),
      button('Learn', '开始或继续学习', 'SmisCourseManagement:Learn'),
      button('ViewLearningRecord', '查看学习记录', 'SmisCourseManagement:ViewLearningRecord'),
      button('Export', '导出课程及学习记录', 'SmisCourseManagement:Export')
    ]
  },
  {
    menuName: 'SmisExamManagement',
    buttons: [
      button('View', '查看试卷', 'SmisExamManagement:View'),
      button('Add', '创建试卷', 'SmisExamManagement:Add'),
      button('Edit', '编辑试卷', 'SmisExamManagement:Edit'),
      button('Delete', '删除试卷', 'SmisExamManagement:Delete'),
      button('Generate', '随机生成试题', 'SmisExamManagement:Generate'),
      button('Publish', '发布或关闭试卷', 'SmisExamManagement:Publish'),
      button('Assign', '分配考试人员', 'SmisExamManagement:Assign'),
      button('Preview', '考试预览', 'SmisExamManagement:Preview'),
      button('Take', '开始或继续考试', 'SmisExamManagement:Take'),
      button('ViewRecord', '查看考试记录', 'SmisExamManagement:ViewRecord'),
      button('ViewDetail', '查看试卷与答卷详情', 'SmisExamManagement:ViewDetail'),
      button('Export', '导出考试记录', 'SmisExamManagement:Export')
    ]
  },
  {
    menuName: 'SmisQuestionBankManagement',
    buttons: [
      button('View', '查看题库', 'SmisQuestionBankManagement:View'),
      button('Add', '新增题目', 'SmisQuestionBankManagement:Add'),
      button('Edit', '编辑题目', 'SmisQuestionBankManagement:Edit'),
      button('Delete', '删除题目', 'SmisQuestionBankManagement:Delete'),
      button('ManageCategory', '维护题库分类', 'SmisQuestionBankManagement:ManageCategory'),
      button('ToggleStatus', '启用或停用题目', 'SmisQuestionBankManagement:ToggleStatus'),
      button('Export', '导出题库', 'SmisQuestionBankManagement:Export')
    ]
  },

  {
    menuName: 'HrEmployeeRoster',
    buttons: [
      button('View', '查看员工', 'Hr:Employee:View'),
      button('Add', '新增员工', 'Hr:Employee:Add'),
      button('Edit', '编辑员工', 'Hr:Employee:Edit'),
      button('Delete', '删除员工', 'Hr:Employee:Delete')
    ]
  },
  {
    menuName: 'HrOrganizationPosition',
    buttons: [button('View', '查看组织岗位人员', 'Hr:OrganizationPosition:View')]
  },
  {
    menuName: 'HrPosition',
    buttons: [
      button('View', '查看岗位', 'Hr:Position:View'),
      button('Add', '新增岗位', 'Hr:Position:Add'),
      button('Edit', '编辑岗位', 'Hr:Position:Edit'),
      button('Delete', '删除岗位', 'Hr:Position:Delete')
    ]
  },
  {
    menuName: 'HrJobArchitecture',
    buttons: [
      button('JobFamilyView', '查看职族', 'Hr:JobFamily:View'),
      button('JobFamilyAdd', '新增职族', 'Hr:JobFamily:Add'),
      button('JobFamilyEdit', '编辑职族', 'Hr:JobFamily:Edit'),
      button('JobFamilyDelete', '删除职族', 'Hr:JobFamily:Delete'),
      button('GradeView', '查看职级', 'Hr:Grade:View'),
      button('GradeAdd', '新增职级', 'Hr:Grade:Add'),
      button('GradeEdit', '编辑职级', 'Hr:Grade:Edit'),
      button('GradeDelete', '删除职级', 'Hr:Grade:Delete'),
      button('JobProfileView', '查看标准职务', 'Hr:JobProfile:View'),
      button('JobProfileAdd', '新增标准职务', 'Hr:JobProfile:Add'),
      button('JobProfileEdit', '编辑标准职务', 'Hr:JobProfile:Edit'),
      button('JobProfileDelete', '删除标准职务', 'Hr:JobProfile:Delete')
    ]
  },
  {
    menuName: 'HrPersonnelChange',
    buttons: [
      button('View', '查看异动', 'Hr:PersonnelChange:View'),
      button('Add', '新增异动', 'Hr:PersonnelChange:Add'),
      button('Edit', '编辑异动', 'Hr:PersonnelChange:Edit'),
      button('Delete', '删除异动', 'Hr:PersonnelChange:Delete'),
      button('Submit', '提交审批', 'Hr:PersonnelChange:Submit'),
      button('Effect', '生效异动', 'Hr:PersonnelChange:Effect')
    ]
  },
  {
    menuName: 'HrLifecycle',
    buttons: [
      button('View', '查看事项', 'Hr:Lifecycle:View'),
      button('Add', '新增事项', 'Hr:Lifecycle:Add'),
      button('Edit', '编辑事项', 'Hr:Lifecycle:Edit'),
      button('Delete', '删除事项', 'Hr:Lifecycle:Delete'),
      button('Submit', '提交审批', 'Hr:Lifecycle:Submit'),
      button('CompleteTask', '完成任务', 'Hr:Lifecycle:CompleteTask'),
      button('Start', '启动或推进事项', 'Hr:Lifecycle:Start'),
      button('CompleteCase', '办结生命周期事项', 'Hr:Lifecycle:CompleteCase'),
      button('WaiveTask', '豁免生命周期任务', 'Hr:Lifecycle:WaiveTask'),
      button('ManageTemplate', '管理标准任务包', 'Hr:Lifecycle:ManageTemplate')
    ]
  },
  {
    menuName: 'HrCompliance',
    buttons: [
      button('View', '查看合同资质', 'Hr:Compliance:View'),
      button('Add', '新增合同或资质', 'Hr:Compliance:Add'),
      button('Edit', '编辑合同资质', 'Hr:Compliance:Edit'),
      button('Delete', '删除合规草稿', 'Hr:Compliance:Delete'),
      button('ContractRenew', '续签劳动合同', 'Hr:Compliance:Contract:Renew'),
      button('ContractTerminate', '终止劳动合同', 'Hr:Compliance:Contract:Terminate'),
      button('QualificationVerify', '核验员工资质', 'Hr:Compliance:Qualification:Verify'),
      button('QualificationRevoke', '撤销员工资质', 'Hr:Compliance:Qualification:Revoke')
    ]
  },
  {
    menuName: 'HrEmployeeRelations',
    buttons: [
      button('View', '查看员工关系案件', 'Hr:EmployeeRelations:View'),
      button('Add', '新增员工关系案件', 'Hr:EmployeeRelations:Add'),
      button('Edit', '编辑员工关系案件', 'Hr:EmployeeRelations:Edit'),
      button('Delete', '删除员工关系案件草稿', 'Hr:EmployeeRelations:Delete'),
      button('Assign', '分派与分级员工关系案件', 'Hr:EmployeeRelations:Assign'),
      button('Investigate', '调查员工关系案件', 'Hr:EmployeeRelations:Investigate'),
      button('Resolve', '提交员工关系案件解决结论', 'Hr:EmployeeRelations:Resolve'),
      button('Close', '结案或重新开启员工关系案件', 'Hr:EmployeeRelations:Close'),
      button('ActionManage', '管理员工关系处置行动', 'Hr:EmployeeRelations:Action:Manage'),
      button('SensitiveView', '查看员工关系敏感内容', 'Hr:EmployeeRelations:Sensitive:View')
    ]
  },
  {
    menuName: 'HrBenefits',
    buttons: [
      button('View', '查看福利与参保', 'Hr:Benefits:View'),
      button('PlanManage', '管理福利计划', 'Hr:Benefits:Plan:Manage'),
      button('EnrollmentManage', '管理员工参保', 'Hr:Benefits:Enrollment:Manage'),
      button('Approve', '审核员工参保', 'Hr:Benefits:Approve'),
      button('EventManage', '管理福利人生事件', 'Hr:Benefits:Event:Manage'),
      button('AmountView', '查看福利缴费金额', 'Hr:Benefits:Amount:View'),
      button('PayrollExport', '导出福利薪资输入', 'Hr:Benefits:Payroll:Export'),
      button('AmountEdit', '维护福利缴费金额', 'Hr:Benefits:Amount:Edit'),
      button('EvidenceView', '查看福利人生事件附件', 'Hr:Benefits:Evidence:View')
    ]
  },
  {
    menuName: 'HrEmployeeExperience',
    buttons: [
      button('View', '查看员工体验工作台', 'Hr:Experience:View'),
      button('SurveyManage', '管理员工体验调查', 'Hr:Experience:Survey:Manage'),
      button('QuestionManage', '管理员工体验调查题目', 'Hr:Experience:Question:Manage'),
      button('Launch', '发布、开放或关闭员工体验调查', 'Hr:Experience:Launch'),
      button('Respond', '填写匿名员工体验调查', 'Hr:Experience:Respond'),
      button('InsightsView', '查看匿名聚合洞察', 'Hr:Experience:Insights:View'),
      button('CommentsView', '查看匿名开放评论', 'Hr:Experience:Comments:View'),
      button('ActionManage', '管理员工体验改善行动', 'Hr:Experience:Action:Manage'),
      button('ActionClose', '验收员工体验改善行动', 'Hr:Experience:Action:Close')
    ]
  },
  {
    menuName: 'HrPeopleAnalytics',
    buttons: [button('View', '查看人力分析', 'Hr:PeopleAnalytics:View')]
  },
  {
    menuName: 'HrHeadcount',
    buttons: [
      button('View', '查看人力规划与编制', 'Hr:Headcount:View'),
      button('Add', '新增规划或有效编制', 'Hr:Headcount:Add'),
      button('Edit', '编辑规划或有效编制', 'Hr:Headcount:Edit'),
      button('Delete', '删除规划或有效编制', 'Hr:Headcount:Delete'),
      button('Submit', '提交人力规划', 'Hr:Headcount:Submit'),
      button('Approve', '审批人力规划', 'Hr:Headcount:Approve'),
      button('Activate', '启用人力规划', 'Hr:Headcount:Activate'),
      button('Close', '关闭人力规划', 'Hr:Headcount:Close')
    ]
  },
  {
    menuName: 'HrCompensation',
    buttons: [
      button('View', '查看薪酬管理', 'Hr:Compensation:View'),
      button('PolicyAdd', '新增薪酬政策', 'Hr:Compensation:Policy:Add'),
      button('PolicyEdit', '编辑薪酬政策', 'Hr:Compensation:Policy:Edit'),
      button('PolicyDelete', '删除薪酬政策', 'Hr:Compensation:Policy:Delete'),
      button('RecordAdd', '新增员工薪酬', 'Hr:Compensation:Record:Add'),
      button('RecordEdit', '编辑员工薪酬', 'Hr:Compensation:Record:Edit'),
      button('RecordDelete', '删除员工薪酬', 'Hr:Compensation:Record:Delete'),
      button('AmountView', '查看薪酬金额', 'Hr:Compensation:Amount:View'),
      button('AmountEdit', '编辑薪酬金额', 'Hr:Compensation:Amount:Edit'),
      button('Approve', '批准与终止薪酬', 'Hr:Compensation:Approve')
    ]
  },
  {
    menuName: 'HrCompensationReview',
    buttons: [
      button('View', '查看调薪复核', 'Hr:CompensationReview:View'),
      button('CycleManage', '管理调薪周期', 'Hr:CompensationReview:Cycle:Manage'),
      button('BudgetManage', '管理调薪预算', 'Hr:CompensationReview:Budget:Manage'),
      button('Recommend', '提交调薪建议', 'Hr:CompensationReview:Recommend'),
      button('Calibrate', '执行调薪校准', 'Hr:CompensationReview:Calibrate'),
      button('Approve', '批准调薪结果', 'Hr:CompensationReview:Approve'),
      button('Effect', '批量生效调薪', 'Hr:CompensationReview:Effect'),
      button('AmountView', '查看调薪金额', 'Hr:CompensationReview:Amount:View'),
      button('AmountEdit', '编辑调薪金额', 'Hr:CompensationReview:Amount:Edit')
    ]
  },
  {
    menuName: 'HrContingentWorkforce',
    buttons: [
      button('View', '查看外部用工', 'Hr:ContingentWorkforce:View'),
      button('VendorManage', '管理用工供应商', 'Hr:ContingentWorkforce:Vendor:Manage'),
      button('WorkerManage', '管理外部人员', 'Hr:ContingentWorkforce:Worker:Manage'),
      button('EngagementManage', '管理用工任务', 'Hr:ContingentWorkforce:Engagement:Manage'),
      button('ControlManage', '管理准入控制', 'Hr:ContingentWorkforce:Control:Manage'),
      button('Activate', '激活外部用工', 'Hr:ContingentWorkforce:Activate'),
      button('End', '执行外部人员退场', 'Hr:ContingentWorkforce:End'),
      button('PiiView', '查看外部人员联系方式', 'Hr:ContingentWorkforce:PII:View'),
      button('CostView', '查看外部用工成本', 'Hr:ContingentWorkforce:Cost:View'),
      button('CostEdit', '编辑外部用工成本', 'Hr:ContingentWorkforce:Cost:Edit')
    ]
  },
  {
    menuName: 'HrPolicyAcknowledgement',
    buttons: [
      button('View', '查看政策与签收', 'Hr:PolicyAcknowledgement:View'),
      button('PolicyManage', '管理政策草稿', 'Hr:PolicyAcknowledgement:Policy:Manage'),
      button('Publish', '发布与退役政策', 'Hr:PolicyAcknowledgement:Publish'),
      button('ReceiptManage', '管理政策签收', 'Hr:PolicyAcknowledgement:Receipt:Manage'),
      button('EvidenceView', '查看签收凭证', 'Hr:PolicyAcknowledgement:Evidence:View')
    ]
  },
  {
    menuName: 'HrOrganizationDesign',
    buttons: [
      button('View', '查看组织变革方案', 'Hr:OrganizationDesign:View'),
      button('ScenarioManage', '管理组织变革草稿', 'Hr:OrganizationDesign:Scenario:Manage'),
      button('ImpactReview', '提交影响评审', 'Hr:OrganizationDesign:Impact:Review'),
      button('Approve', '审批组织变革方案', 'Hr:OrganizationDesign:Approve'),
      button('Handoff', '移交组织主数据执行', 'Hr:OrganizationDesign:Handoff')
    ]
  },
  {
    menuName: 'HrInternalMobility',
    buttons: [
      button('View', '查看内部人才市场', 'Hr:InternalMobility:View'),
      button('OpportunityManage', '管理内部机会草稿', 'Hr:InternalMobility:Opportunity:Manage'),
      button('Publish', '发布与关闭内部机会', 'Hr:InternalMobility:Publish'),
      button('ApplicationSelf', '提交本人内部申请', 'Hr:InternalMobility:Application:Self'),
      button('ApplicationManage', '评审内部申请', 'Hr:InternalMobility:Application:Manage'),
      button('Convert', '转正式人事异动', 'Hr:InternalMobility:Convert')
    ]
  },
  {
    menuName: 'HrAbsence',
    buttons: [
      button('View', '查看假勤管理', 'Hr:Absence:View'),
      button('PolicyAdd', '新增假别与政策', 'Hr:Absence:Policy:Add'),
      button('PolicyEdit', '编辑假别与政策', 'Hr:Absence:Policy:Edit'),
      button('PolicyDelete', '删除假别与政策', 'Hr:Absence:Policy:Delete'),
      button('BalanceAdjust', '调整休假余额', 'Hr:Absence:Balance:Adjust'),
      button('RequestAdd', '新增休假申请', 'Hr:Absence:Request:Add'),
      button('RequestEdit', '编辑休假申请', 'Hr:Absence:Request:Edit'),
      button('RequestDelete', '删除休假申请', 'Hr:Absence:Request:Delete'),
      button('Submit', '提交与撤销休假', 'Hr:Absence:Submit'),
      button('Approve', '审批休假申请', 'Hr:Absence:Approve'),
      button('ReasonView', '查看休假原因与证明', 'Hr:Absence:Reason:View')
    ]
  },
  {
    menuName: 'HrWorkforceRisk',
    buttons: [button('View', '查看人力风险', 'Hr:WorkforceRisk:View')]
  },
  {
    menuName: 'HrTalentInventory',
    buttons: [button('View', '查看人才盘点', 'Hr:TalentInventory:View')]
  },
  {
    menuName: 'HrSuccession',
    buttons: [
      button('View', '查看继任规划', 'Hr:Succession:View'),
      button('PlanAdd', '新增继任计划', 'Hr:Succession:Plan:Add'),
      button('PlanEdit', '编辑继任计划', 'Hr:Succession:Plan:Edit'),
      button('PlanDelete', '删除继任计划', 'Hr:Succession:Plan:Delete'),
      button('CandidateAdd', '提名继任候选人', 'Hr:Succession:Candidate:Add'),
      button('CandidateEdit', '编辑继任候选人', 'Hr:Succession:Candidate:Edit'),
      button('CandidateDelete', '删除继任候选人', 'Hr:Succession:Candidate:Delete'),
      button('CandidateReview', '评审继任候选人', 'Hr:Succession:Candidate:Review'),
      button('ActionAdd', '新增发展行动', 'Hr:Succession:Action:Add'),
      button('ActionEdit', '编辑发展行动', 'Hr:Succession:Action:Edit'),
      button('ActionDelete', '删除发展行动', 'Hr:Succession:Action:Delete')
    ]
  },
  {
    menuName: 'HrAttendance',
    buttons: [
      button('View', '查看考勤', 'Hr:Attendance:View'),
      button('Add', '新增考勤排班', 'Hr:Attendance:Add'),
      button('Edit', '编辑考勤排班', 'Hr:Attendance:Edit'),
      button('Delete', '删除考勤排班', 'Hr:Attendance:Delete'),
      button('Evaluate', '执行工时核算', 'Hr:Attendance:Evaluate'),
      button('ReviewCorrection', '审核考勤修正', 'Hr:Attendance:ReviewCorrection'),
      button('ClosePeriod', '考勤期间封账', 'Hr:Attendance:ClosePeriod')
    ]
  },
  {
    menuName: 'HrSelfService',
    buttons: [
      button('View', '查看员工申请', 'Hr:SelfService:View'),
      button('Add', '新增员工申请', 'Hr:SelfService:Add'),
      button('Edit', '编辑员工申请', 'Hr:SelfService:Edit'),
      button('Delete', '删除员工申请', 'Hr:SelfService:Delete'),
      button('Submit', '提交员工服务工单', 'Hr:SelfService:Submit'),
      button('Assign', '分派员工服务工单', 'Hr:SelfService:Assign'),
      button('Resolve', '处理员工服务工单', 'Hr:SelfService:Resolve'),
      button('CatalogManage', '管理员工服务目录', 'Hr:SelfService:Catalog:Manage')
    ]
  },
  {
    menuName: 'HrPerformance',
    buttons: [
      button('View', '查看绩效', 'Hr:Performance:View'),
      button('Add', '新增绩效', 'Hr:Performance:Add'),
      button('Edit', '编辑绩效', 'Hr:Performance:Edit'),
      button('Delete', '删除绩效', 'Hr:Performance:Delete'),
      button('Activate', '启动或取消绩效周期', 'Hr:Performance:Activate'),
      button('Review', '提交绩效评价', 'Hr:Performance:Review'),
      button('Calibrate', '维护绩效校准结果', 'Hr:Performance:Calibrate'),
      button('Complete', '定案绩效结果', 'Hr:Performance:Complete')
    ]
  },
  {
    menuName: 'HrTalentDevelopment',
    buttons: [
      button('View', '查看人才发展', 'Hr:Talent:View'),
      button('Add', '新增人才发展记录', 'Hr:Talent:Add'),
      button('Edit', '编辑人才发展记录', 'Hr:Talent:Edit'),
      button('Delete', '删除人才发展记录', 'Hr:Talent:Delete'),
      button('PlanTransition', '推进培养计划', 'Hr:Talent:Plan:Transition'),
      button('CourseAdd', '新增课程', 'Hr:Talent:Course:Add'),
      button('CourseEdit', '编辑课程', 'Hr:Talent:Course:Edit'),
      button('CoursePublish', '发布与停用课程', 'Hr:Talent:Course:Publish'),
      button('CourseCompetency', '维护课程能力映射', 'Hr:Talent:Course:Competency'),
      button('SessionAdd', '新增培训班次', 'Hr:Talent:Session:Add'),
      button('SessionEdit', '编辑培训班次', 'Hr:Talent:Session:Edit'),
      button('SessionTransition', '推进培训班次', 'Hr:Talent:Session:Transition'),
      button('EnrollmentAdd', '安排员工学习', 'Hr:Talent:Enrollment:Add'),
      button('EnrollmentManage', '登记学习结果', 'Hr:Talent:Enrollment:Manage'),
      button('CertificateManage', '管理学习证书', 'Hr:Talent:Certificate:Manage')
    ]
  },
  {
    menuName: 'HrRecruitment',
    buttons: [
      button('View', '查看招聘', 'Hr:Recruitment:View'),
      button('Add', '新增招聘记录', 'Hr:Recruitment:Add'),
      button('Edit', '编辑招聘记录', 'Hr:Recruitment:Edit'),
      button('Delete', '删除招聘记录', 'Hr:Recruitment:Delete'),
      button('Submit', '提交招聘审批', 'Hr:Recruitment:Submit'),
      button('Effect', '启动招聘', 'Hr:Recruitment:Effect'),
      button('CandidateMove', '推进候选人阶段', 'Hr:Recruitment:Candidate:Move'),
      button('SensitiveView', '查看招聘敏感信息', 'Hr:Recruitment:Sensitive:View'),
      button('InterviewAdd', '安排面试', 'Hr:Recruitment:Interview:Add'),
      button('InterviewEdit', '调整或取消面试', 'Hr:Recruitment:Interview:Edit'),
      button('InterviewComplete', '提交面试评价', 'Hr:Recruitment:Interview:Complete'),
      button('OfferAdd', '创建 Offer', 'Hr:Recruitment:Offer:Add'),
      button('OfferEdit', '编辑 Offer', 'Hr:Recruitment:Offer:Edit'),
      button('OfferSubmit', '提交 Offer 审批', 'Hr:Recruitment:Offer:Submit'),
      button('OfferApprove', '审批 Offer', 'Hr:Recruitment:Offer:Approve'),
      button('OfferSend', '发送或撤回 Offer', 'Hr:Recruitment:Offer:Send'),
      button('OfferRespond', '登记 Offer 反馈', 'Hr:Recruitment:Offer:Respond'),
      button('HandoffAdd', '创建入职交接', 'Hr:Recruitment:Handoff:Add'),
      button('HandoffEdit', '编辑入职交接', 'Hr:Recruitment:Handoff:Edit'),
      button('HandoffComplete', '推进入职交接', 'Hr:Recruitment:Handoff:Complete'),
      button('TaskManage', '管理入职任务', 'Hr:Recruitment:Task:Manage')
    ]
  },
  {
    menuName: 'FinanceAccountSet',
    buttons: [
      button('View', '查看会计期间'),
      button('Add', '新增账套'),
      button('Edit', '编辑账套'),
      button('Active', '启用账套'),
      button('Suspended', '停用账套'),
      button('Archived', '归档账套'),
      button('ManagePeriod', '维护会计期间')
    ]
  },
  {
    menuName: 'FinanceAccountingSubject',
    buttons: [
      button('Initialize', '初始化核算基础'),
      button('Add', '新增科目'),
      button('Edit', '编辑科目'),
      button('Toggle', '启停科目')
    ]
  },
  {
    menuName: 'FinanceAccountingAuxiliary',
    buttons: [
      button('AddType', '新增维度'),
      button('EditType', '编辑维度'),
      button('DeleteType', '删除维度'),
      button('Sync', '同步主数据'),
      button('Add', '新增核算项目'),
      button('Edit', '编辑核算项目'),
      button('Toggle', '启停核算项目')
    ]
  },
  {
    menuName: 'FinanceAccountingCurrency',
    buttons: [
      button('AddCurrency', '新增外币'),
      button('EditCurrency', '编辑币种'),
      button('Toggle', '启停币种'),
      button('Add', '新增汇率'),
      button('Edit', '编辑汇率')
    ]
  },
  {
    menuName: 'FinanceOpeningBalance',
    buttons: [
      button('Add', '录入余额'),
      button('Edit', '编辑余额'),
      button('Delete', '删除余额'),
      button('Confirm', '确认并锁定'),
      button('Reopen', '反确认')
    ]
  },
  {
    menuName: 'FinanceVoucherCenter',
    buttons: [
      button('View', '查看'),
      button('Add', '新增凭证'),
      button('Edit', '编辑凭证'),
      button('Export', '导出'),
      button('Submit', '提交'),
      button('Approve', '审核通过'),
      button('Reject', '驳回'),
      button('Post', '过账'),
      button('Void', '作废'),
      button('Reverse', '冲销')
    ]
  },
  { menuName: 'FinanceVoucherTemplate', buttons: crud() },
  {
    menuName: 'FinanceAutoPosting',
    buttons: [
      button('Add', '新增规则'),
      button('Edit', '编辑规则'),
      button('Delete', '删除规则'),
      button('ProcessPending', '批量处理待办'),
      button('Retry', '重试事件'),
      button('View', '查看事件')
    ]
  },
  {
    menuName: 'FinanceFinancialReports',
    buttons: [
      button('ViewConfig', '查看取数口径'),
      button('EditConfig', '维护取数口径'),
      button('Export', '导出')
    ]
  },
  {
    menuName: 'FinanceLedgerCenter',
    buttons: [button('View', '查看账簿'), button('Export', '导出')]
  },
  {
    menuName: 'FinanceFixedAsset',
    buttons: [
      button('Add', '新增资产'),
      button('Edit', '编辑资产'),
      button('Delete', '删除资产'),
      button('ManageCategory', '维护资产类别'),
      button('Activate', '确认转固'),
      button('Suspend', '暂停折旧'),
      button('Resume', '恢复使用'),
      button('Dispose', '资产处置'),
      button('Depreciation', '折旧管理')
    ]
  },
  {
    menuName: 'FinanceAssetPayable',
    buttons: [button('View', '查看'), button('Approve', '审核应付')]
  },
  ...['FinanceEstimatedReceivable', 'FinanceFinancialReceivable'].map((menuName) => ({
    menuName,
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Edit', '编辑'),
      button('Copy', '复制'),
      button('Submit', '提交'),
      button('Approve', '审核'),
      button('Delete', '删除'),
      button('Push', '下推'),
      button('VoucherPreview', '预览凭证'),
      button('VoucherGenerate', '生成凭证'),
      button('Print', '打印'),
      button('Export', '导出'),
      ...(menuName === 'FinanceFinancialReceivable'
        ? [
            button('Writeoff', '应收核销'),
            button('Adjust', '应收调整'),
            button('AdjustApprove', '审核应收调整'),
            button('Match', '先开票后续勾稽')
          ]
        : [])
    ]
  })),
  {
    menuName: 'FinanceReceipt',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Edit', '编辑'),
      button('Submit', '提交'),
      button('Approve', '审核'),
      button('Confirm', '确认收款'),
      button('Cancel', '取消供应商退款收款'),
      button('VoucherPreview', '预览供应商收款凭证'),
      button('VoucherGenerate', '生成供应商收款凭证'),
      button('Delete', '删除'),
      button('Print', '打印'),
      button('Export', '导出')
    ]
  },
  {
    menuName: 'FinanceReceiptRefund',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Submit', '提交'),
      button('Approve', '审核'),
      button('Pay', '确认付款'),
      button('Delete', '删除'),
      button('PaymentRequest', '生成付款申请'),
      button('Print', '打印'),
      button('Export', '导出')
    ]
  },
  {
    menuName: 'FinanceReceivablePaymentRequest',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Submit', '提交'),
      button('Approve', '审核'),
      button('Pay', '确认付款'),
      button('Delete', '删除'),
      button('Print', '打印'),
      button('Export', '导出')
    ]
  },
  {
    menuName: 'FinanceRevenueCost',
    buttons: [
      button('View', '查看'),
      button('Add', '下推'),
      button('Submit', '提交'),
      button('Approve', '审核'),
      button('Delete', '删除'),
      button('RefreshCost', '刷新实际成本'),
      button('VoucherPreview', '预览凭证'),
      button('VoucherGenerate', '生成凭证'),
      button('Print', '打印'),
      button('Export', '导出')
    ]
  },
  {
    menuName: 'FinanceReceiptWriteoff',
    buttons: [
      button('View', '查看'),
      button('Check', '单据查验'),
      button('Writeoff', '核销'),
      button('Special', '特殊核销'),
      button('Reverse', '反核销'),
      button('CrossCustomer', '跨往来核销'),
      button('CrossCurrency', '异币核销'),
      button('Scheme', '维护核销方案'),
      button('Export', '导出')
    ]
  },
  {
    menuName: 'MdmReceiptCondition',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Edit', '编辑'),
      button('Delete', '删除')
    ]
  },
  {
    menuName: 'FinanceReceivableReport',
    buttons: [button('View', '查看'), button('Export', '导出')]
  },
  {
    menuName: 'FinancePayableReport',
    buttons: [button('View', '查看'), button('Export', '导出'), button('Print', '打印')]
  },
  {
    menuName: 'FinanceEstimatedPayable',
    buttons: [
      button('Accrual', '自动暂估参数'),
      button('AccrualDelete', '删除自动暂估参数'),
      button('AccrualExecute', '补提暂估'),
      button('View', '查看'),
      button('Add', '新增'),
      button('Edit', '编辑'),
      button('Submit', '提交'),
      button('Approve', '审核'),
      button('Delete', '删除'),
      button('Import', '导入TMS'),
      button('Push', '下推'),
      button('Voucher', '生成凭证'),
      button('Print', '打印'),
      button('Export', '导出')
    ]
  },
  {
    menuName: 'FinancePurchasePayable',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Edit', '编辑'),
      button('Submit', '提交'),
      button('Approve', '审核'),
      button('Delete', '删除'),
      button('Import', '导入TMS'),
      button('Push', '下推'),
      button('Voucher', '生成凭证'),
      button('Print', '打印'),
      button('Export', '导出'),
      button('Freeze', '冻结/解冻'),
      button('CostMatch', '库存成本勾稽')
    ]
  },
  {
    menuName: 'MdmPaymentTerm',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Edit', '编辑'),
      button('Delete', '删除')
    ]
  },
  {
    menuName: 'FinancePayableApplication',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Edit', '编辑'),
      button('Submit', '提交'),
      button('Approve', '审核'),
      button('Delete', '删除'),
      button('Push', '下推'),
      button('Freeze', '冻结/解冻'),
      button('Close', '关闭'),
      button('Print', '打印'),
      button('Export', '导出')
    ]
  },
  {
    menuName: 'FinancePayablePayment',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Edit', '编辑'),
      button('Submit', '提交'),
      button('Approve', '审核'),
      button('Delete', '删除'),
      button('Push', '下推付款退款'),
      button('GuaranteeConvert', '保证金转货款'),
      button('Confirm', '确认/取消付款'),
      button('Void', '作废未付款单'),
      button('Voucher', '生成凭证'),
      button('Print', '打印'),
      button('Export', '导出')
    ]
  },
  {
    menuName: 'FinancePayableRefund',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Edit', '编辑'),
      button('Submit', '提交'),
      button('Approve', '审核'),
      button('Delete', '删除'),
      button('Confirm', '确认/取消到账'),
      button('Void', '作废未到账退款'),
      button('Voucher', '预览/生成凭证'),
      button('Print', '打印'),
      button('Export', '导出')
    ]
  },
  {
    menuName: 'FinancePayableWriteoff',
    buttons: [
      button('View', '查看'),
      button('Automation', '维护后台核销配置'),
      button('AutomationRetry', '重试后台核销任务'),
      button('AutomationDelete', '删除后台核销配置'),
      button('Writeoff', '核销'),
      button('AutoWriteoff', '按方案自动核销'),
      button('Reverse', '反核销'),
      button('Scheme', '维护核销方案'),
      button('Voucher', '生成凭证')
    ]
  },
  {
    menuName: 'MdmPaymentPurpose',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Edit', '编辑'),
      button('Delete', '删除')
    ]
  },
  {
    menuName: 'MdmSettlementMethod',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Edit', '编辑'),
      button('Delete', '删除')
    ]
  },
  {
    menuName: 'WmsInventoryEnable',
    buttons: [button('View', '查看'), button('Enable', '启用'), button('Disable', '反启用')]
  },
  {
    menuName: 'WmsInitialStock',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Copy', '复制'),
      button('Edit', '编辑'),
      button('Delete', '删除'),
      button('Export', '导出'),
      button('Submit', '提交'),
      button('Withdraw', '撤回提交'),
      button('Approve', '审核')
    ]
  },
  {
    menuName: 'WmsInitialSalesOutbound',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Copy', '复制'),
      button('Edit', '编辑'),
      button('Delete', '删除'),
      button('Import', '导入'),
      button('Export', '导出'),
      button('Push', '下推'),
      button('Submit', '提交'),
      button('Withdraw', '撤回提交'),
      button('Approve', '审核')
    ]
  },
  {
    menuName: 'WmsInitialSalesReturn',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Copy', '复制'),
      button('Edit', '编辑'),
      button('Delete', '删除'),
      button('Import', '导入'),
      button('Export', '导出'),
      button('Push', '下推'),
      button('Submit', '提交'),
      button('Withdraw', '撤回提交'),
      button('Approve', '审核')
    ]
  },
  {
    menuName: 'WmsInitialPurchaseInbound',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Copy', '复制'),
      button('Edit', '编辑'),
      button('Delete', '删除'),
      button('Import', '导入'),
      button('Export', '导出'),
      button('Push', '下推'),
      button('Submit', '提交'),
      button('Withdraw', '撤回提交'),
      button('Approve', '审核')
    ]
  },
  {
    menuName: 'WmsInitialPurchaseReturn',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Copy', '复制'),
      button('Edit', '编辑'),
      button('Delete', '删除'),
      button('Import', '导入'),
      button('Export', '导出'),
      button('Push', '下推'),
      button('Submit', '提交'),
      button('Withdraw', '撤回提交'),
      button('Approve', '审核')
    ]
  },
  ...[
    'WmsPurchaseInbound',
    'WmsPurchaseReturn',
    'WmsEntrustedProcessingInbound',
    'WmsEntrustedProcessingReturn',
    'WmsSalesOutbound',
    'WmsSalesReturnDocument'
  ].map((menuName) => ({
    menuName,
    buttons: [
      ...([
        'WmsPurchaseInbound',
        'WmsPurchaseReturn',
        'WmsEntrustedProcessingInbound',
        'WmsEntrustedProcessingReturn',
        'WmsSalesOutbound',
        'WmsSalesReturnDocument'
      ].includes(menuName)
        ? [button('Print', '批量打印')]
        : []),
      button('View', '查看'),
      button('Add', '新增'),
      button('Copy', '复制'),
      button('Edit', '编辑'),
      button('Delete', '删除'),
      button('Import', '导入'),
      button('Export', '导出'),
      button('Push', '下推'),
      button('Submit', '提交'),
      button('Withdraw', '撤回提交'),
      button('Approve', '审核')
    ]
  })),
  {
    menuName: 'WmsSalesInvoice',
    buttons: [button('View', '查看'), button('Add', '下推创建'), button('Edit', '编辑草稿')]
  },
  {
    menuName: 'WmsOtherInbound',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Copy', '复制'),
      button('Edit', '编辑'),
      button('Delete', '删除'),
      button('Import', '导入'),
      button('Export', '导出'),
      button('Select', '选单'),
      button('Push', '下推'),
      button('Submit', '提交'),
      button('Withdraw', '撤回提交'),
      button('Approve', '审核')
    ]
  },
  {
    menuName: 'WmsOtherOutbound',
    buttons: [
      button('Print', '批量打印'),
      button('View', '查看'),
      button('Add', '新增'),
      button('Copy', '复制'),
      button('Edit', '编辑'),
      button('Delete', '删除'),
      button('Import', '导入'),
      button('Export', '导出'),
      button('Select', '选单'),
      button('Push', '下推'),
      button('Submit', '提交'),
      button('Withdraw', '撤回提交'),
      button('Approve', '审核')
    ]
  },
  {
    menuName: 'WmsInitializationClose',
    buttons: [button('View', '查看'), button('Close', '结束初始化'), button('Reopen', '反初始化')]
  },
  {
    menuName: 'WmsReceiptInbound',
    buttons: [
      button('View', '查看'),
      button('AssignScope', '指定施工号'),
      button('AssignBin', '指定入库库位'),
      button('CaptureSN', '录入收料 SN'),
      button('Confirm', '确认入库')
    ]
  },
  {
    menuName: 'WmsProjectSection',
    buttons: [button('View', '查看'), button('Manage', '维护施工号')]
  },
  {
    menuName: 'WmsStock',
    buttons: [button('View', '查看'), button('TransferProject', '项目调拨')]
  },
  {
    menuName: 'WmsStockOperation',
    buttons: [
      button('View', '查看'),
      button('Receive', '办理入库'),
      button('Issue', '办理出库'),
      button('Transfer', '直接调拨')
    ]
  },
  {
    menuName: 'WmsIssueRequest',
    buttons: [
      button('View', '查看'),
      button('Create', '从工单新增'),
      button('Add', '新增'),
      button('Copy', '复制'),
      button('Delete', '删除'),
      button('Export', '导出'),
      button('Submit', '提交'),
      button('Approve', '审核'),
      button('Cancel', '取消'),
      button('Issue', '按申请出库'),
      button('Push', '下推其他出库单')
    ]
  },
  ...['WmsProductionIssue', 'WmsProductionReturn'].map((menuName) => ({
    menuName,
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Copy', '复制'),
      button('Edit', '编辑'),
      button('Delete', '删除'),
      button('Import', '导入'),
      button('Export', '导出'),
      button('Select', '选单'),
      button('Push', '下推'),
      button('Submit', '提交'),
      button('Withdraw', '撤回提交'),
      button('Approve', '审核'),
      button('Close', '关闭'),
      button('Void', '作废')
    ]
  })),
  ...['WmsFinishedInbound', 'WmsFinishedReturn'].map((menuName) => ({
    menuName,
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Copy', '复制'),
      button('Edit', '编辑'),
      button('Delete', '删除'),
      ...(menuName === 'WmsFinishedInbound' ? [button('Import', '导入')] : []),
      ...(menuName === 'WmsFinishedInbound' ? [button('SaveAndPost', '保存并入库')] : []),
      button('Export', '导出'),
      button('Select', '选单'),
      button('Push', '过账'),
      button('Submit', '提交'),
      button('Withdraw', '撤回提交'),
      button('Approve', '审核'),
      button('Close', '关闭'),
      button('Void', '作废')
    ]
  })),
  {
    menuName: 'WmsSalesReturn',
    buttons: [button('View', '查看'), button('Receive', '确认退货入库')]
  },
  {
    menuName: 'WmsDirectTransfer',
    buttons: [
      button('View', '查看'),
      button('Create', '新增'),
      button('Copy', '复制'),
      button('Edit', '编辑'),
      button('Delete', '删除'),
      button('Import', '导入'),
      button('Export', '导出'),
      button('Submit', '提交'),
      button('Withdraw', '撤回'),
      button('Approve', '审核'),
      button('Return', '调拨退回')
    ]
  },
  {
    menuName: 'WmsStepTransfer',
    buttons: [
      button('View', '查看'),
      button('Create', '新增'),
      button('Copy', '复制'),
      button('Edit', '编辑'),
      button('Delete', '批量删除'),
      button('Export', '导出'),
      button('Submit', '提交'),
      button('Withdraw', '撤回'),
      button('Approve', '审核调出'),
      button('Receive', '转储收货'),
      button('Return', '调出退回')
    ]
  },
  {
    menuName: 'WmsTransfer',
    buttons: [
      button('View', '查看'),
      button('Create', '申请调拨'),
      button('Copy', '复制'),
      button('Edit', '编辑'),
      button('Delete', '删除'),
      button('Import', '导入'),
      button('Export', '导出'),
      button('Push', '下推'),
      button('Submit', '提交'),
      button('Withdraw', '撤回提交'),
      button('Approve', '审核'),
      button('Dispatch', '确认调出'),
      button('Receive', '确认入库')
    ]
  },
  ...['WmsCountGain', 'WmsCountLoss'].map((menuName) => ({
    menuName,
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Copy', '复制'),
      button('Edit', '编辑'),
      button('Delete', '删除'),
      button('Import', '导入'),
      button('Export', '导出'),
      button('Submit', '提交'),
      button('Withdraw', '撤回提交'),
      button('Approve', '审核')
    ]
  })),
  {
    menuName: 'WmsCount',
    buttons: [
      button('View', '查看'),
      button('Create', '生成盘点方案'),
      button('Count', '录入实盘'),
      button('Post', '确认盘盈盘亏'),
      button('Approve', '审核盘点方案')
    ]
  },
  {
    menuName: 'WmsCountSheet',
    buttons: [
      button('View', '查看盘点表'),
      button('Count', '录入初盘'),
      button('Recount', '录入复盘'),
      button('AddLine', '新增账外物料'),
      button('Adjust', '选单调整'),
      button('ImportSerial', '导入序列号'),
      button('Submit', '提交盘点表'),
      button('Approve', '审核盘点表'),
      button('Return', '退回盘点表'),
      button('Delete', '删除盘点表')
    ]
  },
  {
    menuName: 'WmsAdjustment',
    buttons: [button('View', '查看'), button('Post', '办理调整')]
  },
  {
    menuName: 'WmsAssembly',
    buttons: [button('View', '查看'), button('Post', '办理组装')]
  },
  {
    menuName: 'WmsSerialTrace',
    buttons: [button('View', '查看'), button('Reserve', '预留 SN'), button('Bind', '绑定装配 SN')]
  },
  {
    menuName: 'WmsInventoryLedger',
    buttons: [button('View', '查看')]
  },
  {
    menuName: 'WmsStockLedger',
    buttons: [button('View', '查看')]
  },
  {
    menuName: 'WmsMaterialReceiptIssue',
    buttons: [button('View', '查看')]
  },
  {
    menuName: 'WmsProjectReport',
    buttons: [button('View', '查看')]
  },
  {
    menuName: 'FinanceCommercialBill',
    buttons: [
      button('View', '查看'),
      button('Add', '新增票据'),
      button('Edit', '编辑票据'),
      button('Delete', '删除票据'),
      button('Receive', '确认收票'),
      button('Issue', '确认出票'),
      button('Endorse', '背书转让'),
      button('Discount', '票据贴现'),
      button('Settle', '到期结算'),
      button('Cancel', '取消票据')
    ]
  },
  {
    menuName: 'FinancePayroll',
    buttons: [
      button('View', '查看'),
      button('Add', '新增批次'),
      button('Edit', '编辑批次'),
      button('Calculate', '计算薪资'),
      button('Approve', '审批并计提'),
      button('Pay', '确认发放'),
      button('Cancel', '取消批次')
    ]
  },
  {
    menuName: 'FinanceTaxManagement',
    buttons: [
      button('View', '查看'),
      button('Add', '新增税务期间'),
      button('Edit', '编辑税务期间'),
      button('Calculate', '计算税额'),
      button('Review', '复核税额'),
      button('File', '确认申报'),
      button('Pay', '确认缴税'),
      button('Cancel', '取消期间')
    ]
  },
  {
    menuName: 'FinancePeriodClose',
    buttons: [
      button('View', '查看'),
      button('Add', '发起关账'),
      button('Carryforward', '生成损益结转凭证'),
      button('Recheck', '重新检查'),
      button('Close', '确认结账'),
      button('Cancel', '取消关账'),
      button('Reopen', '反结账')
    ]
  },
  { menuName: 'FinanceFundAccount', buttons: crud() },
  {
    menuName: 'FinanceCashForecast',
    buttons: [button('View', '查看资金预测')]
  },
  {
    menuName: 'FinanceReceivableAging',
    buttons: [button('View', '查看应收账龄')]
  },
  {
    menuName: 'FinanceFundTransfer',
    buttons: [
      button('View', '查看'),
      button('Add', '新增调拨'),
      button('Edit', '编辑调拨'),
      button('Delete', '删除调拨'),
      button('Submit', '提交审批'),
      button('Approve', '审批通过'),
      button('Reject', '驳回'),
      button('Execute', '执行入账'),
      button('Reverse', '冲销调拨')
    ]
  },
  {
    menuName: 'FinanceBankReconciliation',
    buttons: [
      button('Add', '导入银行流水'),
      button('View', '进入对账'),
      button('AutoMatch', '自动匹配'),
      button('Match', '手工匹配'),
      button('Unmatch', '取消匹配'),
      button('Ignore', '忽略流水'),
      button('Complete', '完成对账'),
      button('Void', '作废对账')
    ]
  },
  {
    menuName: 'FinanceCashTransaction',
    buttons: [
      button('Import', 'AI 批量导入流水'),
      button('Add', '登记客户收款'),
      button('CreatePayment', '发起承运商付款申请'),
      button('View', '查看'),
      button('Allocate', '继续核销'),
      button('Void', '作废收付款'),
      button('Export', '导出')
    ]
  },
  {
    menuName: 'FinanceInvoiceManagement',
    buttons: [
      button('View', '查看'),
      button('Add', '登记发票'),
      button('Edit', '编辑'),
      button('Delete', '删除'),
      button('Submit', '提交复核'),
      button('Approve', '审核通过'),
      button('Reject', '驳回'),
      button('Void', '作废'),
      button('AiAudit', 'AI 合规审核'),
      button('Export', '导出')
    ]
  },
  ...['FinanceCarrierSettlement', 'FinanceCustomerSettlement'].map((menuName) => ({
    menuName,
    buttons: [
      button('View', '查看'),
      button('Add', '生成对账单'),
      button('Submit', '提交审核'),
      button('Approve', '审核通过'),
      button('Reject', '驳回'),
      button('Void', '作废'),
      button('Delete', '删除'),
      button('Export', '导出')
    ]
  })),
  {
    menuName: 'FinanceCarrierPaymentApplication',
    buttons: [
      button('View', '查看'),
      button('Add', '新建付款申请'),
      button('Edit', '编辑'),
      button('Delete', '删除'),
      button('Submit', '提交审批'),
      button('ViewApproval', '查看审批'),
      button('Execute', '付款登记'),
      button('Cancel', '取消'),
      button('Export', '导出')
    ]
  },
  {
    menuName: 'FinanceWaybillCost',
    buttons: [
      button('View', '查看'),
      button('Add', '新增运单费用'),
      button('Edit', '编辑费用'),
      button('Delete', '删除费用'),
      button('Submit', '提交审核'),
      button('Convert', '转费用报销'),
      button('Pay', '出纳付款'),
      button('AiAudit', 'AI 费用审核'),
      button('OcrLogs', 'OCR 识别记录'),
      button('ApprovalHistory', '审批记录')
    ]
  },
  { menuName: 'FinanceExpenseItem', buttons: [...crud(), button('AddChild', '新增下级')] },
  {
    menuName: 'FinanceExpenseReimbursement',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Edit', '编辑'),
      button('Copy', '复制'),
      button('Delete', '删除'),
      button('Print', '批量打印'),
      button('Submit', '提交审批'),
      button('DeleteLine', '删除费用明细'),
      button('DeletePayee', '删除收款明细'),
      button('Pay', '登记付款'),
      button('SimulatePayment', '模拟付款'),
      button('Delegate', '管理费用委托')
    ]
  },
  {
    menuName: 'FinancePayeeInformation',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Edit', '编辑'),
      button('Copy', '复制'),
      button('Delete', '删除'),
      button('Get', '一键获取员工')
    ]
  },
  {
    menuName: 'FinanceTravelApplication',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Edit', '编辑'),
      button('Copy', '复制'),
      button('Delete', '删除'),
      button('Print', '打印'),
      button('DeleteLine', '删除行程'),
      button('Submit', '提交审批'),
      button('PushReimbursement', '下推差旅报销')
    ]
  },
  {
    menuName: 'FinanceLoanApplication',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Edit', '编辑'),
      button('Copy', '复制'),
      button('Delete', '删除'),
      button('Print', '批量打印'),
      button('PushReimbursement', '下推差旅报销'),
      button('PushRepayment', '下推还款单'),
      button('DeleteItem', '删除借款明细'),
      button('DeletePayee', '删除收款明细'),
      button('CopyItem', '复制借款明细'),
      button('CopyPayee', '复制收款明细'),
      button('Submit', '提交审批'),
      button('Pay', '登记付款'),
      button('SimulatePayment', '模拟付款')
    ]
  },
  {
    menuName: 'FinanceRepayment',
    buttons: [
      button('View', '查看'),
      button('Add', '新增'),
      button('Edit', '编辑'),
      button('Copy', '复制'),
      button('Delete', '删除'),
      button('Submit', '提交审批'),
      button('Print', '批量打印'),
      button('Collect', '确认收款'),
      button('CopyItem', '复制还款明细'),
      button('DeleteItem', '删除还款明细')
    ]
  },
  {
    menuName: 'FinanceWaybillProfit',
    buttons: [button('AiProfitAnalysis', 'AI 利润诊断'), button('Export', '导出')]
  },
  {
    menuName: 'ScmQuoteExpense',
    buttons: crud({ view: true, import: true, export: true })
  },
  {
    menuName: 'ScmQuoteCategory',
    buttons: [...crud({ view: true, import: true, export: true }), button('Copy', '复制')]
  },
  {
    menuName: 'ScmSalesQuotationDoc',
    buttons: [
      ...crud({ view: true, import: true, export: true }),
      button('Copy', '复制'),
      button('Convert', '报价转单'),
      button('GenerateMaterial', '生成物料编码'),
      button('GenerateWorkOrder', '转生产工单'),
      button('GenerateBom', '转报价BOM'),
      button('Submit', '提交审批'),
      button('Withdraw', '撤回提交'),
      button('Activate', '生效'),
      button('Expire', '失效')
    ]
  },
  {
    menuName: 'ScmProjectQuotation',
    buttons: [
      ...crud({ view: true, export: true }),
      button('Copy', '复制'),
      button('Activate', '生效'),
      button('Complete', '完结'),
      button('Close', '关闭'),
      button('GenerateContract', '生成合同'),
      button('GeneratePlan', '生成计划')
    ]
  },
  {
    menuName: 'ScmSalesContract',
    buttons: [
      ...crud({ view: true, export: true }),
      button('Copy', '复制'),
      button('Submit', '提交评审'),
      button('Withdraw', '撤回'),
      button('Approve', '审核'),
      button('Activate', '生效'),
      button('Terminate', '终止'),
      button('Archive', '归档')
    ]
  },
  {
    menuName: 'ScmSalesOrder',
    buttons: [
      ...crud({ view: true, export: true }),
      button('Copy', '复制'),
      button('Import', '导入'),
      button('Push', '下推发货单'),
      button('Submit', '提交'),
      button('Withdraw', '撤回'),
      button('Approve', '审核'),
      button('Fulfill', '履约'),
      button('Complete', '完结'),
      button('Cancel', '取消')
    ]
  },
  {
    menuName: 'ScmShippingNotice',
    buttons: [
      ...crud({ view: true, export: true }),
      button('Copy', '复制'),
      button('Submit', '提交'),
      button('Withdraw', '撤回'),
      button('Ship', '确认发货'),
      button('Complete', '完成')
    ]
  },
  {
    menuName: 'ScmLoading',
    buttons: [
      ...crud({ view: true, export: true }),
      button('Copy', '复制'),
      button('Load', '确认装车'),
      button('Complete', '完成')
    ]
  },
  {
    menuName: 'ScmLoadingOutbound',
    buttons: [button('View', '查看'), button('Issue', '销售出库')]
  },
  {
    menuName: 'ScmPurchaseContract',
    buttons: [
      ...crud({ view: true, export: true }),
      button('Copy', '复制'),
      button('Submit', '提交'),
      button('Withdraw', '撤回'),
      button('Approve', '审核'),
      button('Push', '下推预付款申请'),
      button('Activate', '生效'),
      button('Expire', '失效')
    ]
  },
  {
    menuName: 'ScmPurchaseRequest',
    buttons: [
      ...crud({ view: true, export: true }),
      button('Copy', '复制'),
      button('Import', '导入'),
      button('Push', '下推'),
      button('Submit', '提交'),
      button('Print', '打印')
    ]
  },
  {
    menuName: 'ScmPurchaseOrder',
    buttons: [
      ...crud({ view: true, export: true }),
      button('Copy', '复制'),
      button('Import', '导入'),
      button('Push', '下推'),
      button('Submit', '提交'),
      button('Withdraw', '撤回'),
      button('Approve', '审核'),
      button('Complete', '完结'),
      button('Print', '批量打印'),
      button('RecentPrice', '获取最近采购价')
    ]
  },
  {
    menuName: 'ScmReceiptNotice',
    buttons: [
      ...crud({ view: true, export: true }),
      button('Copy', '复制'),
      button('Submit', '提交'),
      button('Withdraw', '撤回'),
      button('GenerateBatch', '生成批号'),
      button('GenerateSerial', '生成序列号'),
      button('Import', '导入'),
      button('Push', '下推')
    ]
  }
]

export const systemButtonPermissionCatalog: BusinessMenuButtonCatalogEntry[] = [
  {
    menuName: 'ColumnConfig',
    buttons: [button('Manage', '维护列方案'), button('Sync', '同步前端列目录')]
  },
  { menuName: 'Organization', buttons: crud({ view: true }) },
  {
    menuName: 'Menu',
    buttons: [
      button('View', '查看菜单'),
      button('Add', '新增菜单'),
      button('Edit', '编辑菜单'),
      button('Delete', '删除菜单')
    ]
  },
  {
    menuName: 'Tenant',
    buttons: [button('Add', '新增租户'), button('Edit', '编辑租户'), button('Delete', '停用租户')]
  },
  {
    menuName: 'SystemParam',
    buttons: [
      button('Add', '新增参数', 'System:SystemParam:Add'),
      button('Edit', '编辑参数', 'System:SystemParam:Edit'),
      button('Delete', '删除参数', 'System:SystemParam:Delete')
    ]
  },
  {
    menuName: 'DocumentNumberRule',
    buttons: [
      button('Add', '新增编号规则', 'System:DocumentNumberRule:Add'),
      button('Edit', '编辑编号规则', 'System:DocumentNumberRule:Edit')
    ]
  },
  {
    menuName: 'User',
    buttons: [
      button('Add', '新增用户'),
      button('Edit', '编辑用户'),
      button('Delete', '注销用户'),
      button('AssignRole', '分配角色'),
      button('ResetPassword', '初始化密码')
    ]
  },
  {
    menuName: 'Role',
    buttons: [
      button('Add', '新增角色'),
      button('Edit', '编辑角色'),
      button('Delete', '删除角色'),
      button('AssignPermission', '配置菜单权限')
    ]
  },
  {
    menuName: 'WebsiteConfig',
    buttons: [button('Publish', '保存并发布配置'), button('GenerateWordmark', 'AI 生成品牌字图')]
  },
  {
    menuName: 'AiConfiguration',
    buttons: [button('Edit', '编辑 AI 配置')]
  },
  {
    menuName: 'AiPrompt',
    buttons: [
      button('Add', '新建 Prompt 版本'),
      button('Edit', '编辑 Prompt 草稿'),
      button('Publish', '发布或回滚 Prompt'),
      button('Clone', '复制 Prompt 版本'),
      button('Delete', '删除 Prompt 草稿')
    ]
  },
  {
    menuName: 'AiProjectPlanner',
    buttons: [button('ManageWorkflow', '推进建议状态')]
  },
  {
    menuName: 'GeofenceConfig',
    buttons: [button('Edit', '编辑电子围栏')]
  },
  {
    menuName: 'FieldPermission',
    buttons: [button('Manage', '维护字段权限')]
  },
  {
    menuName: 'NotificationReminder',
    buttons: [
      button('View', '查看提醒配置'),
      button('AddRule', '新增提醒规则'),
      button('EditRule', '编辑提醒规则'),
      button('DeleteRule', '删除提醒规则'),
      button('EditChannel', '配置通知渠道'),
      button('TestChannel', '测试通知渠道'),
      button('Dispatch', '立即执行提醒')
    ]
  }
].map((entry) => ({
  ...entry,
  buttons: entry.buttons.map((definition) => ({
    ...definition,
    code: definition.code ?? `System:${entry.menuName}:${definition.action}`
  }))
}))

export const managedButtonPermissionCatalog = [
  ...businessButtonPermissionCatalog,
  ...systemButtonPermissionCatalog
]

export const resolveCatalogPermissionCode = (
  menuName: string,
  definition: BusinessButtonDefinition
): string => definition.code ?? `${menuName}:${definition.action}`
