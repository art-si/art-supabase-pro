export const formStandardCompensationPlan = {
  id: '44444444-4444-4444-8444-444444444444',
  tenantId: '11111111-1111-4111-8111-111111111111',
  planCode: 'PLAN-TEST',
  planName: '验收薪酬方案',
  currencyCode: 'CNY',
  payFrequency: 'monthly',
  enabled: true,
  sort: 0,
  items: [
    {
      componentId: 'fixed',
      componentCode: 'MEAL',
      componentName: '餐费补贴',
      category: 'earning',
      amountType: 'fixed',
      defaultAmount: 100,
      defaultRate: null,
      required: true,
      sort: 1
    },
    {
      componentId: 'rate',
      componentCode: 'BONUS',
      componentName: '绩效比例',
      category: 'earning',
      amountType: 'rate',
      defaultAmount: null,
      defaultRate: 0.1,
      required: false,
      sort: 2
    }
  ]
}

export const formStandardDictionaries = {
  hrCompensationComponentCategory: [{ label: '收入项目', value: 'earning' }],
  hrCompensationAmountType: [
    { label: '固定金额', value: 'fixed' },
    { label: '比例', value: 'rate' },
    { label: '核算录入', value: 'variable' }
  ],
  hrPayFrequency: [{ label: '按月', value: 'monthly' }],
  hrEmploymentStatus: [{ label: '在职', value: 'active' }],
  hrEmploymentType: [{ label: '全职', value: 'full_time' }],
  hrFullTimeFlag: [
    { label: '全日制', value: 'true' },
    { label: '非全日制', value: 'false' }
  ],
  hrContractType: [{ label: '固定期限', value: 'fixed_term' }],
  hrContractStatus: [{ label: '有效', value: 'active' }],
  hrTrainingType: [{ label: '内部培训', value: 'internal' }],
  hrRewardType: [{ label: '奖励', value: 'reward' }],
  supplierCategory: [{ label: '物料供应商', value: 'material' }],
  supplierType: [{ label: '普通供应商', value: 'general' }],
  enterpriseNature: [{ label: '民营企业', value: 'private' }],
  supplierIndustry: [{ label: '制造业', value: 'manufacturing' }],
  mdmProcessRouteType: [{ label: '标准路线', value: 'standard' }],
  mdmProcessRouteAllocationMode: [{ label: '数量分配', value: 'quantity' }],
  mdmProcessRouteSource: [{ label: '手工维护', value: 'manual' }],
  mdmWarehouseType: [{ label: '原材料仓', value: 'raw_material' }],
  mdmDocumentExtensionValueType: [
    { label: '数值', value: 'number' },
    { label: '文本', value: 'text' },
    { label: '物料', value: 'material' }
  ],
  mdmProductionReportControl: [{ label: '不控制', value: 'none' }],
  mdmProductionFullIssueScope: [{ label: '全部组件', value: 'all' }],
  mdmProductionWipDeductionTiming: [{ label: '入库审核', value: 'inbound_approval' }],
  mdmFormulaPurpose: [{ label: '报工准备', value: 'report_preparation' }],
  mdmActivityType: [{ label: '机器', value: 'machine' }],
  commonBoolean: [
    { label: '否', value: 'false' },
    { label: '是', value: 'true' }
  ],
  commonEnabledStatus: [
    { label: '启用', value: 'enabled' },
    { label: '停用', value: 'disabled' }
  ],
  mdmMaterialValuationMethod: [{ label: '移动平均', value: 'moving_average' }]
}
