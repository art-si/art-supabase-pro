export const tenantId = '11111111-1111-4111-8111-111111111111'
export const organization = {
  id: 'org-1',
  tenantId,
  organizationId: 'org-1',
  organizationCode: 'ORG-1',
  organizationName: '验收库存组织',
  organizationType: 'company',
  status: 'enabled',
  enabled: 'enabled',
  enabledOn: '2026-12-31',
  isDefault: true,
  initializationClosedAt: null,
  parentId: null,
  children: []
}
export const warehouse = {
  id: 'warehouse-1',
  tenantId,
  organizationId: organization.id,
  warehouseCode: 'WH-1',
  warehouseName: '验收仓库',
  status: 'enabled',
  enabled: true,
  enableLocations: false
}
export const equipment = {
  id: 'equipment-1',
  tenantId,
  equipmentCode: 'EQ-1',
  equipmentName: '验收设备',
  operationStatus: 'operating',
  status: 'enabled'
}
export const employee = {
  id: 'employee-1',
  tenantId,
  employeeNo: 'EMP-1',
  employeeName: '验收员工',
  employmentStatus: 'active'
}
export const material = {
  id: 'material-1',
  tenantId,
  materialCode: 'MAT-1',
  code: 'MAT-1',
  materialName: '验收物料',
  name: '验收物料',
  description: '验收物料',
  specificationModel: '1000×50',
  inventoryUnitId: 'unit-1',
  baseUnitId: 'unit-1',
  inventoryUnit: { id: 'unit-1', unitName: '件' },
  baseUnit: { id: 'unit-1', unitName: '件' },
  unitConversions: [],
  serialManagementEnabled: false,
  batchManagementEnabled: false
}
export const plan = {
  id: 'plan-1',
  tenantId,
  planKind: 'inspection',
  planName: '验收巡检方案',
  frequency: 'daily',
  frequencyValue: null,
  advanceDays: 0,
  requiredDays: 1,
  holidayPolicy: 'postpone',
  notificationRules: [],
  requirePhoto: false,
  sopFiles: [],
  status: 'enabled',
  remark: '验收说明',
  createTime: '2026-10-31T00:00:00Z',
  updateTime: '2026-10-31T00:00:00Z',
  items: [
    {
      id: 'item-1',
      itemName: '检查油位',
      requirement: '处于刻度线范围',
      judgmentRule: '',
      requirePhoto: false,
      sort: 10
    }
  ],
  equipmentBindings: [{ equipment }],
  responsibleBindings: [{ employee }]
}
export const task = {
  id: 'task-1',
  tenantId,
  taskNo: 'TASK-1',
  plannedDate: '2026-10-31',
  status: 'pending',
  displayStatus: 'pending',
  completedAt: null,
  executionSummary: '',
  remark: '',
  beforePhotoFiles: [],
  afterPhotoFiles: [],
  results: [],
  equipment,
  responsible: employee,
  plan
}
export const repair = {
  id: 'repair-1',
  tenantId,
  workOrderNo: 'REPAIR-1',
  equipment,
  urgency: 'normal',
  faultSymptom: '设备有异响',
  faultPhotoFiles: [],
  reporter: employee,
  repairer: null,
  confirmer: null,
  faultAnalysis: '',
  faultCause: '',
  solution: '',
  repairPhotoFiles: [],
  status: 'reported'
}
export const setting = {
  id: 'setting-1',
  tenantId,
  departmentId: 'department-1',
  requireAlbumPhoto: false,
  notificationMethods: ['wechat'],
  employees: [],
  escalationRules: [],
  urgencyRules: []
}
export const batch = {
  id: 'batch-1',
  tenantId,
  materialId: material.id,
  material,
  quantity: 10,
  warehouseId: warehouse.id,
  warehouse,
  organizationId: organization.id,
  projectId: null,
  constructionNo: null,
  ownerType: 'self',
  ownerId: null,
  batchNo: 'BATCH-1',
  binId: null,
  packId: null,
  status: 'normal'
}
export const initialLine = {
  lineNo: 10,
  materialId: material.id,
  material,
  projectId: null,
  constructionNo: null,
  gift: false,
  inventoryUnitId: 'unit-1',
  baseUnitId: 'unit-1',
  openingQuantity: 0,
  quantity: 0,
  baseQuantity: 0,
  yearlyOpeningQuantity: 0,
  yearlyReceivedQuantity: 0,
  yearlyIssuedQuantity: 0,
  unitPrice: 1,
  amount: 0,
  warehouseId: warehouse.id,
  binId: null,
  stockType: 'normal',
  stockStatus: 'available',
  ownerType: 'self',
  ownerId: null,
  batchNo: 'BATCH-1',
  keeperId: null,
  auxiliaryUnitId: null,
  auxiliaryQuantity: null,
  auxiliaryUnit2Id: null,
  auxiliaryQuantity2: null,
  openingAuxQuantity: null,
  inboundDate: '2026-10-31',
  productionDate: null,
  expiryDate: null,
  trackingNo: null,
  sourceDocument: null,
  sourceLineNo: null,
  remark: null,
  serialNos: []
}
export const stockDocument = {
  id: 'stock-doc-1',
  tenantId,
  organizationId: organization.id,
  organization,
  documentNo: 'OPEN-1',
  documentTypeId: 'doc-type-1',
  businessTypeId: 'business-type-1',
  businessDate: '2026-10-31',
  accountingDate: '2026-10-31',
  keeperId: null,
  status: 'draft',
  remark: '表头备注',
  currencyCode: 'CNY',
  amountEntryEnabled: false,
  createdAt: '2026-10-31T00:00:00Z',
  updatedAt: '2026-10-31T00:00:00Z',
  approvedAt: null,
  lines: [initialLine]
}
export const adjustmentRow = {
  ...stockDocument,
  id: 'adjustment-doc-1',
  lineId: 'line-1',
  lineNo: 10,
  kind: 'gain',
  materialId: material.id,
  material,
  materialCode: material.materialCode,
  materialName: material.materialName,
  materialDescription: material.description,
  inventoryUnitId: 'unit-1',
  baseUnitId: 'unit-1',
  unitConversions: [],
  warehouseId: warehouse.id,
  warehouse,
  bookQuantity: 10,
  varianceQuantity: 0,
  unitPrice: 1,
  ownerType: 'self',
  ownerId: null,
  stockType: 'normal',
  stockStatus: 'available'
}
export const transferRow = {
  ...adjustmentRow,
  id: 'transfer-doc-1',
  documentId: 'transfer-doc-1',
  applicationDate: '2026-10-31',
  quantity: 0,
  sourceOrganizationId: organization.id,
  targetOrganizationId: organization.id,
  sourceWarehouseId: warehouse.id,
  targetWarehouseId: warehouse.id,
  sourceBinId: null,
  targetBinId: null
}

declare global {
  interface Window {
    __formStandardCalls: Array<{ name: string; args: unknown[] }>
    __formStandardApi: (name: string, args: unknown[]) => unknown
  }
}
window.__formStandardCalls = []
window.__formStandardApi = (name, args) => {
  window.__formStandardCalls.push({ name, args })
  const page = (data: unknown[]) => ({ data, total: data.length, current: 1, size: 20 })
  if (/^(save|create|post|complete|update|record)/.test(name)) return Promise.resolve('saved-1')
  if (name === 'fetchWmsInventoryOrganizations') return Promise.resolve(page([organization]))
  if (name === 'fetchWmsWarehouses') return Promise.resolve([warehouse])
  if (name === 'fetchWmsInventoryLocations')
    return Promise.resolve({ warehouses: [], zones: [], bins: [] })
  if (name === 'fetchWmsInitialStockMenuId' || name === 'fetchWmsInitialMenuId')
    return Promise.resolve('menu-1')
  if (
    name === 'fetchWmsInitialDocumentTypes' ||
    (name === 'fetchWmsInitialOptions' && args[0] === 'mdm_document_type')
  )
    return Promise.resolve([
      {
        id: 'doc-type-1',
        code: 'DEFAULT',
        name: '验收单据类型',
        enabled: true,
        isDefault: true,
        menuIds: ['menu-1']
      }
    ])
  if (name === 'fetchWmsInitialOptions' && args[0] === 'mdm_business_type')
    return Promise.resolve([
      {
        id: 'business-type-1',
        code: 'DEFAULT',
        name: '验收业务类型',
        enabled: true,
        isDefault: true,
        documentTypeIds: ['doc-type-1'],
        menuIds: ['menu-1']
      }
    ])
  if (name === 'fetchWmsUnitOptions')
    return Promise.resolve([{ id: 'unit-1', unitCode: 'PC', unitName: '件' }])
  if (name === 'fetchWmsInitialMaterials' || name === 'fetchWmsMaterialOptions')
    return Promise.resolve(page([material]))
  if (name === 'fetchWmsStockPage')
    return Promise.resolve(page([batch, { ...batch, id: 'batch-2', batchNo: 'BATCH-2' }]))
  if (name === 'fetchWmsCountAdjustment') return Promise.resolve([adjustmentRow])
  if (name === 'fetchWmsTransferRequest') return Promise.resolve([transferRow])
  if (name === 'fetchWmsInitialSalesDocument')
    return Promise.resolve({
      ...stockDocument,
      customerId: null,
      sourceLinks: [],
      businessKind: 'initial_outbound',
      lines: [
        {
          ...initialLine,
          taxRate: 13,
          discountMethod: 'none',
          unitDiscountRate: 0,
          taxInclusiveUnitPrice: 1.13,
          priceBasis: 'untaxed',
          taxAmount: 0,
          totalAmount: 0,
          discountAmount: 0
        }
      ]
    })
  if (name === 'fetchPmisPlans') return Promise.resolve(page([plan]))
  if (name === 'fetchPmisTasks') return Promise.resolve(page([task]))
  if (name === 'fetchPmisDepartmentTree')
    return Promise.resolve([
      {
        id: 'department-1',
        tenantId,
        departmentCode: 'DEP-1',
        departmentName: '验收部门',
        children: []
      }
    ])
  if (name === 'fetchPmisEquipmentPage') return Promise.resolve(page([equipment]))
  if (/Page$/.test(name)) return Promise.resolve(page([]))
  return Promise.resolve([])
}
