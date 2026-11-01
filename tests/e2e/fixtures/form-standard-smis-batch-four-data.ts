import type {
  PositionRiskControl,
  SmisPpeIssuanceStandard,
  SmisRiskControlMeasure,
  SmisRiskItem,
  SmisRiskPositionOption,
  SmisSite
} from '@smis/api'
import {
  itemId,
  organization,
  organizationId,
  recordId,
  tenantId,
  timestamp
} from './form-standard-smis-data'

export const riskPosition: SmisRiskPositionOption = {
  id: itemId,
  positionCode: 'POST-SMIS',
  positionName: '验收安全岗',
  organizationId,
  organizationName: organization.organizationName
}
export const positionControl: PositionRiskControl = {
  id: recordId,
  organizationId,
  positionId: itemId,
  hazardFactor: '验收机械传动部位',
  controlMeasure: '验收隔离防护措施',
  controlMeasureCategory: 'engineering',
  controlLevel: 'team',
  standardBasis: '验收设备安全管理规程',
  failureMode: '验收防护罩失效',
  primaryHazardCategory: 'basic_management',
  secondaryHazardCategory: 'safety_rules',
  hazardLevel: 'general',
  isSpecialEquipment: false
}
export const site: SmisSite = {
  id: recordId,
  organizationId,
  siteName: '验收场所',
  categoryCode: 'workshop',
  sort: 10,
  coordinateSystem: 'gcj02',
  imageUrls: [],
  addressDetail: '验收路 8 号',
  longitude: 121.47,
  latitude: 31.23,
  remark: '验收场所通行说明',
  organization
}
export const riskItem: SmisRiskItem = {
  id: itemId,
  tenantId,
  itemNo: 'RI-SMIS',
  riskPoint: '验收传动区',
  hazardFactor: '验收机械伤害',
  sort: 10,
  status: 'evaluated',
  createTime: timestamp,
  updateTime: timestamp
}
export const riskMeasure: SmisRiskControlMeasure = {
  id: recordId,
  tenantId,
  riskItemId: itemId,
  controlMeasure: '验收固定防护罩',
  controlMeasureCategory: 'engineering',
  controlLevel: 'team',
  standardBasis: '验收安全规程',
  failureMode: '验收防护失效',
  hazardLevel: 'general',
  sort: 10,
  status: 'enabled',
  positions: [
    { positionId: itemId, frequencyCount: 1, frequencyUnit: 'day', position: riskPosition }
  ],
  createTime: timestamp,
  updateTime: timestamp
}
export const issuanceStandard: SmisPpeIssuanceStandard = {
  id: recordId,
  tenantId,
  standardNo: 'PPE-SMIS',
  standardName: '验收安全岗防护标准',
  ratedQuantity: 1,
  issuanceCycle: 'year',
  issuanceFrequency: 1,
  status: 'enabled',
  description: '验收个人防护管理范围',
  positions: [{ id: itemId, code: 'POST-SMIS', name: '验收安全岗' }],
  organizations: [{ id: organizationId, code: 'ORG-SMIS', name: organization.organizationName }],
  details: [
    {
      materialId: itemId,
      materialCode: 'PPE-001',
      materialName: '验收防护手套',
      categoryName: '验收防护用品',
      specificationModel: 'L',
      basicUnit: 'KG',
      imageUrls: [],
      quotaQuantity: 2,
      issuanceCycle: 'year',
      issuanceFrequency: 1,
      status: 'enabled',
      remark: '验收明细说明',
      sort: 10
    }
  ]
}
