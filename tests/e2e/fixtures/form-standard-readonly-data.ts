import type { Component } from 'vue'

const id = '22222222-2222-4222-8222-222222222222'
const tenantId = '11111111-1111-4111-8111-111111111111'
const referenceId = '33333333-3333-4333-8333-333333333333'
const audit = {
  id,
  tenantId,
  createBy: '验收创建人',
  updateBy: '验收维护人',
  createTime: '2026-10-01T08:00:00Z',
  updateTime: '2026-10-31T08:00:00Z',
  createdAt: '2026-10-01T08:00:00Z',
  updatedAt: '2026-10-31T08:00:00Z'
}
const documentType = {
  ...audit,
  documentTypeCode: 'TYPE-TEST',
  documentTypeName: '验收单据类型',
  menuIds: [],
  enabled: true,
  isDefault: false,
  tagStyle: 'primary',
  textColor: '',
  sortOrder: 10,
  remark: '验收说明',
  packingEnabled: true,
  allowedIssueWarehouseTypes: ['raw_material'],
  productionReportControl: 'none',
  productionFullIssueControl: 'none',
  productionFullIssueScope: 'all',
  productionWipDeductionTiming: 'inbound_approval',
  extensionFields: [{ key: 'core', label: '芯材', sourceComponentTypeId: referenceId }]
}
const catalog = {
  ...audit,
  code: 'CATALOG-TEST',
  name: '验收主数据',
  subtitle: '跨系统主档查询',
  sourceApp: 'tms',
  sourceLabel: '客户',
  isActive: true,
  qualityScore: 100,
  qualityIssues: [],
  attributes: Array.from({ length: 6 }, (_, index) => ({
    label: `业务属性 ${index + 1}`,
    value: `验收属性值 ${index + 1}`
  }))
}
const category = {
  ...audit,
  projectId: referenceId,
  project: { projectName: '验收项目', projectCode: 'PROJECT-TEST' },
  categoryName: '验收报价项',
  quotationNo: 'QUOTE-TEST',
  quantity: 2,
  unitPrice: 10,
  feeItems: [{ expenseId: referenceId, amount: 5 }],
  feeTotal: 5,
  totalAmount: 25,
  remark: '报价核对说明'
}
export const readonlyPurchase = {
  ...audit,
  kind: 'purchase_contract',
  documentNo: 'PURCHASE-TEST',
  documentTypeId: null,
  projectId: null,
  supplierId: null,
  sourceId: null,
  status: 'draft',
  documentDate: '2026-10-31',
  deliveryDate: '2026-11-10',
  details: {},
  lines: [
    {
      lineId: referenceId,
      materialId: referenceId,
      materialDescription: '验收采购物料',
      materialCode: 'MAT-TEST',
      quantity: 2,
      unit: '件',
      unitPrice: 10,
      discountRate: 0,
      taxRate: 0,
      gift: false
    }
  ],
  paymentPlans: [
    { id: referenceId, dueDate: '2026-11-10', ratio: 100, amount: 20, isAdvance: false }
  ],
  deliveryPlans: [
    {
      id: referenceId,
      plannedDate: '2026-11-10',
      quantity: 2,
      deliveredQuantity: 0,
      location: '验收仓库',
      address: '验收路1号'
    }
  ],
  clauses: [{ id: referenceId, title: '交货条款', content: '按计划交付并完成验收。' }],
  subtotal: 20,
  taxAmount: 0,
  totalAmount: 20,
  remark: '采购核对说明'
}
export const readonlySales = {
  ...readonlyPurchase,
  kind: 'sales_quotation',
  documentNo: 'SALES-TEST',
  customerId: null,
  currency: 'CNY',
  lines: [
    {
      lineId: referenceId,
      materialDescription: '验收销售物料',
      materialCode: 'MAT-TEST',
      quantity: 2,
      salesUnit: '件',
      unitPrice: 10,
      discountRate: 0,
      taxRate: 0
    }
  ],
  fees: [],
  feeTotal: 0,
  costTotal: 0,
  grossProfit: 20,
  grossMargin: 100
}
type Entry = { load: () => Promise<{ default: Component }>; args: () => unknown[] }
const documentEntry = (production: boolean, payable = false): Entry => ({
  load: () => import('@mdm/views/document-type/modules/document-type-detail-drawer.vue'),
  args: () => [
    {
      record: documentType,
      menuPath: '验收菜单',
      isProductionType: production,
      isPayableType: payable
    }
  ]
})
export const readonlyEntries: Record<string, Entry> = {
  'business-detail': {
    load: () => import('@mdm/views/business-type/modules/business-type-detail-drawer.vue'),
    args: () => [
      {
        menuPath: '验收菜单',
        record: {
          ...audit,
          businessTypeCode: 'BUSINESS-TEST',
          businessTypeName: '验收业务类型',
          documentTypeIds: [],
          menuIds: [],
          enabled: true,
          isDefault: false,
          inventoryDirection: 'inbound',
          stockMovement: 'inbound',
          ownerType: 'self',
          inventoryAccounting: true,
          sortOrder: 10,
          tagStyle: 'primary',
          textColor: '',
          remark: '业务核对说明'
        }
      }
    ]
  },
  'document-detail': documentEntry(false),
  'document-detail-production': documentEntry(true),
  'document-detail-production-many': {
    load: () => import('@mdm/views/document-type/modules/document-type-detail-drawer.vue'),
    args: () => [
      {
        record: {
          ...documentType,
          extensionFields: Array.from({ length: 6 }, (_, index) => ({
            key: `field${index + 1}`,
            label: `排包字段 ${index + 1}`,
            sourceComponentTypeId: referenceId
          }))
        },
        menuPath: '验收菜单',
        isProductionType: true
      }
    ]
  },
  'document-detail-payable': documentEntry(false, true),
  'catalog-detail': {
    load: () => import('@mdm/views/components/catalog/modules/catalog-detail-drawer.vue'),
    args: () => [catalog]
  },
  'catalog-detail-compact': {
    load: () => import('@mdm/views/components/catalog/modules/catalog-detail-drawer.vue'),
    args: () => [{ ...catalog, attributes: catalog.attributes.slice(0, 2) }]
  },
  'bom-detail': {
    load: () => import('@mdm/views/engineering/bom-maintenance/modules/bom-detail-dialog.vue'),
    args: () => [
      {
        ...audit,
        bomCode: 'BOM-TEST',
        version: 'V1',
        purpose: 'production',
        status: 'draft',
        sort: 10,
        material: { materialName: '验收BOM物料', materialCode: 'MAT-TEST' },
        baseQuantity: 1,
        baseUnit: { unitName: '件', unitCode: 'PC' },
        effectiveFrom: '2026-10-31',
        effectiveTo: null,
        description: '验收版本说明',
        items: []
      }
    ]
  },
  'movement-detail': {
    load: () =>
      import('@mdm/views/inventory-master/movement-type/modules/movement-type-detail-drawer.vue'),
    args: () => [
      {
        ...audit,
        movementCode: '101',
        movementName: '验收入库',
        direction: 'inbound',
        reverseTypeId: null,
        reversal: false,
        otherIo: false,
        status: 'enabled',
        remark: '移动类型核对说明'
      }
    ]
  },
  'expense-detail': {
    load: () =>
      import('@scm/views/sales-quotation/expense-definition/modules/expense-detail-drawer.vue'),
    args: () => [
      {
        ...audit,
        expenseCode: 'EXP-TEST',
        expenseName: '验收费用',
        enabled: true,
        sortOrder: 10,
        textColor: '',
        tagStyle: 'plain',
        remark: '费用核对说明'
      }
    ]
  },
  'category-detail': {
    load: () =>
      import('@scm/views/sales-quotation/item-category/modules/category-detail-drawer.vue'),
    args: () => [category]
  },
  'category-detail-compact': {
    load: () =>
      import('@scm/views/sales-quotation/item-category/modules/category-detail-drawer.vue'),
    args: () => [{ ...category, feeItems: [], feeTotal: 0, totalAmount: 20 }]
  },
  'purchase-detail': {
    load: () => import('@scm/views/purchase-document/modules/purchase-detail-drawer.vue'),
    args: () => [readonlyPurchase]
  },
  'sales-detail': {
    load: () => import('@scm/views/sales-document/modules/scm-document-detail-drawer.vue'),
    args: () => [readonlySales]
  }
}
