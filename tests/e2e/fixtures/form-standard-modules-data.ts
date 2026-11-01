export const formStandardDictionaries = {
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
