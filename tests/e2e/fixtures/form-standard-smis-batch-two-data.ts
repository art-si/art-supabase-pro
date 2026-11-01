import type { SmisEquipmentInspection, SmisHazardSource, SmisMaterial } from '@smis/api'
import {
  employeeId,
  itemId,
  operationTypeId,
  organization,
  organizationId,
  recordId,
  riskOptions,
  supplier,
  tenantId,
  timestamp
} from './form-standard-smis-data'

export const inspectionCategory = {
  id: itemId,
  tenantId,
  categoryCode: 'ANNUAL',
  categoryName: '年度定检',
  status: 'enabled',
  sort: 10
}
export const inspection: SmisEquipmentInspection = {
  id: recordId,
  equipmentId: operationTypeId,
  inspectionCategoryId: itemId,
  inspectionInstitutionId: organizationId,
  inspectionNo: 'INSP-SMIS-0001',
  inspectionDate: '2026-10-31',
  conclusion: 'operable',
  nextDueDate: '2027-10-31',
  needsExtension: false,
  extensionDate: null,
  reminderMonths: 1,
  status: 'completed',
  remark: '验收年度检验记录',
  equipment: {
    id: operationTypeId,
    equipmentCode: 'EQ-SMIS',
    equipmentName: '验收检验设备',
    equipmentKind: 'general',
    model: 'EQ-100',
    categoryName: '一般设备',
    organizationId,
    organizationName: organization.organizationName
  },
  inspectionCategory,
  inspectionInstitution: {
    id: organizationId,
    supplierCode: supplier.supplierCode,
    supplierName: '验收检验机构'
  },
  images: []
}
export const hazardSource: SmisHazardSource = {
  id: recordId,
  hazardNo: 'HS-SMIS-0001',
  hazardName: '验收气瓶存放区',
  siteId: itemId,
  siteName: '验收装配区',
  hazardLevel: 'level_4',
  riskLevel: 'low',
  controlOrganizationId: organizationId,
  controlOrganizationName: organization.organizationName,
  responsibleEmployeeId: employeeId,
  responsibleEmployeeName: '验收责任人',
  responsibleEmployeeNo: 'EMP-SMIS',
  quantity: 3,
  location: '验收装配区北侧',
  evaluationDate: '2026-10-31',
  evaluationOrganization: '验收评价机构',
  filingDate: '2026-10-31',
  filingOrganization: '验收备案部门',
  filingNo: 'FILING-SMIS',
  imageUrls: [],
  recordStatus: 'submitted',
  remark: '验收危险源管控边界',
  createTime: timestamp,
  updateTime: timestamp
}
export const category = {
  id: itemId,
  tenantId,
  parentId: null,
  categoryCode: 'PPE-SMIS',
  categoryName: '验收安全用品',
  sort: 10,
  status: 'enabled',
  childCount: 0,
  materialCount: 1
}
export const unit = {
  id: itemId,
  tenantId,
  unitCode: 'KG',
  unitName: '千克',
  symbol: 'kg',
  sort: 10,
  status: 'enabled'
}
export const materialType = {
  id: operationTypeId,
  tenantId,
  typeCode: 'ppe',
  typeName: '防护用品',
  sort: 10,
  status: 'enabled'
}
export const material: SmisMaterial = {
  id: recordId,
  tenantId,
  categoryId: itemId,
  materialCode: 'PPE-SMIS-0001',
  materialName: '验收防护用品',
  specificationModel: 'PPE-100',
  drawingNo: 'DRAW-SMIS',
  basicUnit: unit.unitCode,
  materialType: materialType.typeCode,
  baseUnitId: unit.id,
  baseUnitName: unit.unitName,
  materialTypeId: materialType.id,
  materialTypeName: materialType.typeName,
  materialSource: 'purchase',
  brand: '验收品牌',
  manufacturer: '验收制造商',
  materialComposition: '验收材质',
  placeOfOrigin: '上海',
  color: '蓝色',
  imageUrls: [],
  description: '验收物料归档说明',
  status: 'enabled',
  sort: 10,
  category,
  updateBy: '验收维护人',
  updateTime: timestamp
}
export const wasteCategory = {
  ...category,
  categoryCode: 'HW08',
  categoryName: '废矿物油',
  catalogCount: 1
}
export const wasteCatalog = {
  id: recordId,
  tenantId,
  categoryId: itemId,
  wasteCode: 'HW08-SMIS',
  wasteName: '验收废矿物油',
  wasteType: '液态',
  safetyMeasure: 'sealed',
  hazardCharacteristic: 'flammable',
  unit: 'KG',
  sort: 10,
  textColor: null,
  tagStyle: 'warning',
  status: 'enabled',
  remark: '验收危废管理范围'
}
export const reportOptions = { organizations: [organization], sites: riskOptions.sites }
