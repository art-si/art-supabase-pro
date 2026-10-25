import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import WmsInitializationReconciliation from '@/components/business/wms-initialization-reconciliation/index.vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useUserStore } from '@/store/modules/user'
import type {
  WmsPurchaseDocument,
  WmsPurchaseLine,
  WmsPurchaseKind
} from '@/api/wms-purchase.types'
import PurchaseDocumentDrawer from '@/components/business/wms-purchase-document-workspace/modules/wms-purchase-document-drawer.vue'
import type {
  WmsInitialSalesDocument,
  WmsInitialSalesKind
} from '../../../modules/art-supabase-wms/src/api/initial-sales.types'
import InitialSalesDrawer from '../../../modules/art-supabase-wms/src/views/initialization/initial-sales/modules/initial-sales-drawer.vue'
import InitialStockDrawer from '../../../modules/art-supabase-wms/src/views/initialization/initial-stock/modules/initial-stock-drawer.vue'
import type { WmsInitialStockDocument } from '../../../modules/art-supabase-wms/src/api/initialization.types'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const tenantId = '11111111-1111-4111-8111-111111111111'
const query = new URLSearchParams(window.location.search)
const salesKinds: WmsInitialSalesKind[] = [
  'initial_outbound',
  'initial_return',
  'outbound',
  'return',
  'other_outbound',
  'other_return'
]
const purchaseKinds: WmsPurchaseKind[] = [
  'initial_inbound',
  'initial_return',
  'purchase_inbound',
  'purchase_return',
  'other_inbound',
  'other_return',
  'entrusted_processing_inbound',
  'entrusted_processing_return'
]
const salesKind = salesKinds.find((kind) => kind === query.get('salesKind')) ?? 'initial_outbound'
const purchaseKind =
  purchaseKinds.find((kind) => kind === query.get('purchaseKind')) ?? 'initial_inbound'
const document: WmsInitialSalesDocument = {
  id: '22222222-2222-4222-8222-222222222222',
  tenantId,
  organizationId: '33333333-3333-4333-8333-333333333333',
  organization: { organizationName: '测试库存组织', organizationCode: 'TEST-ORG' },
  kind: salesKind,
  documentNo: 'TEST-SALES-001',
  documentTypeId: '44444444-4444-4444-8444-444444444444',
  businessTypeId: '55555555-5555-4555-8555-555555555555',
  businessDate: '2026-10-01',
  accountingDate: '2026-10-02',
  customerId: '66666666-6666-4666-8666-666666666666',
  salespersonId: null,
  salesDepartmentId: null,
  keeperId: null,
  status: 'draft',
  isInitialization: salesKind.startsWith('initial_'),
  remark: null,
  createdAt: '2026-10-01T08:00:00Z',
  updatedAt: '2026-10-01T08:00:00Z',
  approvedAt: null,
  lines: [
    {
      lineNo: 1,
      returnType: salesKind.includes('return') ? 'replace' : null,
      materialId: '77777777-7777-4777-8777-777777777777',
      material: {
        id: '77777777-7777-4777-8777-777777777777',
        tenantId,
        code: 'TEST-MATERIAL',
        name: '测试序列号物料',
        description: null,
        specificationModel: 'TEST-MODEL',
        inventoryUnitId: null,
        baseUnitId: null,
        auxiliaryUnitId: null,
        auxiliaryUnit2Id: null,
        unitConversions: [],
        serialManagementEnabled: query.get('withoutSerial') !== 'true'
      },
      projectId: null,
      constructionNo: null,
      gift: false,
      inventoryUnitId: '88888888-8888-4888-8888-888888888888',
      quantity: 2,
      baseUnitId: null,
      baseQuantity: 2,
      unitPrice: 10,
      taxInclusiveUnitPrice: 11.3,
      taxRate: 13,
      discountMethod: 'none',
      unitDiscountRate: 0,
      discountAmount: 0,
      amount: 20,
      taxAmount: 2.6,
      totalAmount: 22.6,
      batchNo: null,
      warehouseId: null,
      binId: null,
      stockType: 'normal',
      ownerType: 'self',
      ownerId: null,
      stockStatus: 'available',
      keeperId: null,
      auxiliaryUnitId: null,
      auxiliaryQuantity: null,
      auxiliaryUnit2Id: null,
      auxiliaryQuantity2: null,
      productionDate: null,
      expiryDate: null,
      trackingNo: null,
      sourceDocument: null,
      sourceLineNo: null,
      remark: null,
      serialNos: []
    }
  ]
}

const purchaseLine: WmsPurchaseLine = {
  ...document.lines[0],
  sourceBatchId: null,
  receivedQuantity: 0,
  unreceivedQuantity: 2,
  returnedQuantity: 0,
  unreturnedQuantity: 0
}
const purchaseDocument: WmsPurchaseDocument = {
  ...document,
  kind: purchaseKind,
  isInitialization: purchaseKind.startsWith('initial_'),
  supplierId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  customerId: purchaseKind.startsWith('entrusted_processing_') ? document.customerId : null,
  purchaserId: null,
  purchaseDepartmentId: null,
  warehouseId: null,
  createTime: document.createdAt,
  updateTime: document.updatedAt,
  lines: [purchaseLine]
}

if (query.get('layoutRows') === '10') {
  purchaseDocument.lines = Array.from({ length: 10 }, (_, index) => ({
    ...purchaseLine,
    lineNo: (index + 1) * 10,
    materialId: `layout-material-${index}`,
    material: purchaseLine.material
      ? { ...purchaseLine.material, id: `layout-material-${index}` }
      : null
  }))
}

const initialStockDocument: WmsInitialStockDocument = {
  ...document,
  documentNo: 'TEST-STOCK-001',
  organization: {
    id: document.organizationId,
    organizationName: '测试库存组织',
    organizationCode: 'TEST-ORG'
  },
  currencyCode: 'CNY',
  amountEntryEnabled: false,
  lines: [
    {
      ...document.lines[0],
      warehouseId: 'warehouse-test',
      openingQuantity: 2,
      yearlyOpeningQuantity: 0,
      yearlyReceivedQuantity: 0,
      yearlyIssuedQuantity: 0,
      inboundDate: null,
      openingAuxQuantity: null,
      yearlyOpeningAuxQuantity: null,
      yearlyReceivedAuxQuantity: null,
      yearlyIssuedAuxQuantity: null
    }
  ]
}

if (query.get('twoLines') === 'true') {
  document.lines.push({ ...document.lines[0], lineNo: 2, returnType: null })
  purchaseDocument.lines.push({ ...purchaseLine, lineNo: 2 })
  initialStockDocument.lines.push({ ...initialStockDocument.lines[0], lineNo: 2 })
}
if (query.get('validSave') === 'true') {
  for (const lines of [document.lines, purchaseDocument.lines]) {
    lines.forEach((line, index) => {
      line.warehouseId = 'warehouse-test'
      line.serialNos = [`SN-SAVE-${index}-1`, `SN-SAVE-${index}-2`]
    })
  }
}
if (query.get('initialDefaults') === 'true') {
  purchaseDocument.warehouseId = 'warehouse-test'
  purchaseDocument.purchaserId = 'purchaser-header'
  purchaseDocument.keeperId = 'keeper-header'
  purchaseDocument.lines.forEach((line, index) => {
    line.warehouseId = index === 0 ? null : 'warehouse-override'
    line.purchaserId = index === 0 ? null : 'purchaser-override'
    line.keeperId = index === 0 ? null : 'keeper-override'
    line.binId = null
    if (index > 0) {
      line.purchaser = {
        id: 'purchaser-override',
        tenantId,
        employeeNo: 'P002',
        employeeName: '行采购员',
        employmentStatus: 'active'
      }
      line.keeper = {
        id: 'keeper-override',
        tenantId,
        employeeNo: 'K002',
        employeeName: '行仓管员',
        employmentStatus: 'active'
      }
    }
  })
}
if (query.get('storedReturnQuantity') === 'true') {
  for (const [kind, lines] of [
    [salesKind, document.lines],
    [purchaseKind, purchaseDocument.lines]
  ] as const) {
    if (kind.includes('return')) {
      for (const line of lines) line.quantity = -Math.abs(line.quantity)
    }
  }
}
if (query.get('openingReturnValues') === 'true') {
  for (const lines of [document.lines, purchaseDocument.lines]) {
    for (const line of lines) {
      line.quantity = -2
      line.baseQuantity = -4
      line.auxiliaryQuantity = -6
      line.auxiliaryQuantity2 = -8
      line.amount = -20
      line.discountAmount = -1
      line.taxAmount = -2.6
      line.totalAmount = -22.6
    }
  }
}
if (query.get('missingStockWarehouse') === 'true') {
  initialStockDocument.lines.forEach((line) => {
    line.warehouseId = null
  })
}
if (query.get('missingStockUnit') === 'true') {
  initialStockDocument.lines.forEach((line) => {
    line.inventoryUnitId = ''
  })
}
if (query.get('ownerNames') === 'true') {
  for (const lines of [document.lines, purchaseDocument.lines, initialStockDocument.lines]) {
    lines.forEach((line, index) => {
      line.ownerType = index === 0 ? 'supplier' : 'customer'
      line.ownerId =
        index === 0
          ? 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
          : '66666666-6666-4666-8666-666666666666'
    })
  }
}

if (query.get('binRace') === 'true') {
  for (const lines of [document.lines, purchaseDocument.lines, initialStockDocument.lines]) {
    lines[0].warehouseId = 'warehouse-A'
    lines[1].warehouseId = 'warehouse-B'
  }
}
if (query.get('binDisplay') === 'true') {
  for (const lines of [document.lines, purchaseDocument.lines]) {
    lines[0].binId = 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb'
    lines[0].bin = null
    lines[1].binId = 'cccccccc-1111-4111-8111-cccccccccccc'
    lines[1].bin = { binName: '可识别测试仓位', binCode: 'BIN-TEST' }
  }
  initialStockDocument.lines[0].binId = 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb'
  initialStockDocument.lines[0].bin = null
  initialStockDocument.lines[1].binId = 'cccccccc-1111-4111-8111-cccccccccccc'
  initialStockDocument.lines[1].bin = { binName: '可识别测试仓位' }
}
if (query.get('missingMaterial') === 'true') {
  for (const lines of [document.lines, purchaseDocument.lines, initialStockDocument.lines]) {
    lines[0].material = undefined
    lines[0].materialId = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
    const second = lines[1]
    if (second?.material)
      second.material = { ...second.material, name: '', code: 'CODE-ONLY-DOCUMENT' }
  }
}
const Preview = defineComponent({
  setup() {
    const drawer = ref<InstanceType<typeof InitialSalesDrawer> | null>(null)
    const purchaseDrawer = ref<InstanceType<typeof PurchaseDocumentDrawer> | null>(null)
    const initialStockDrawer = ref<InstanceType<typeof InitialStockDrawer> | null>(null)
    return () =>
      h(
        'main',
        query.get('reconciliation') === 'true'
          ? [
              h(WmsInitializationReconciliation, {
                organizationId: document.organizationId,
                organizationName: '测试库存组织'
              })
            ]
          : [
              h(
                'button',
                {
                  type: 'button',
                  onClick: () => void drawer.value?.handleOpen({ mode: 'create' })
                },
                '新增销售单据'
              ),
              h(
                'button',
                {
                  type: 'button',
                  onClick: () => void purchaseDrawer.value?.handleOpen({ mode: 'create' })
                },
                '新增采购单据'
              ),
              h(
                'button',
                {
                  type: 'button',
                  onClick: () =>
                    void initialStockDrawer.value?.handleOpen({
                      mode: 'edit',
                      document: initialStockDocument
                    })
                },
                '打开初始库存单'
              ),
              h(InitialStockDrawer, { ref: initialStockDrawer }),
              h(
                'button',
                {
                  type: 'button',
                  onClick: () => void initialStockDrawer.value?.handleOpen({ mode: 'create' })
                },
                '新增初始库存单'
              ),
              h(
                'button',
                {
                  type: 'button',
                  onClick: () =>
                    void initialStockDrawer.value?.handleOpen({
                      mode: 'view',
                      document: initialStockDocument
                    })
                },
                '查看初始库存单'
              ),
              h(
                'button',
                {
                  type: 'button',
                  onClick: () => void drawer.value?.handleOpen({ mode: 'copy', document })
                },
                '复制销售单据'
              ),
              h(
                'button',
                {
                  type: 'button',
                  onClick: () =>
                    void purchaseDrawer.value?.handleOpen({
                      mode: 'copy',
                      document: purchaseDocument
                    })
                },
                '复制采购单据'
              ),
              h(
                'button',
                {
                  type: 'button',
                  onClick: () =>
                    void drawer.value?.handleOpen(
                      query.get('loadFromApi') === 'true'
                        ? { mode: 'view', documentId: document.id }
                        : { mode: 'view', document }
                    )
                },
                '查看销售单据'
              ),
              h(
                'button',
                {
                  type: 'button',
                  onClick: () =>
                    void purchaseDrawer.value?.handleOpen(
                      query.get('loadFromApi') === 'true'
                        ? { mode: 'view', documentId: purchaseDocument.id }
                        : { mode: 'view', document: purchaseDocument }
                    )
                },
                '查看采购单据'
              ),
              h(
                'button',
                {
                  type: 'button',
                  onClick: () => void drawer.value?.handleOpen({ mode: 'edit', document })
                },
                '打开销售单据'
              ),
              h(
                'button',
                {
                  type: 'button',
                  onClick: () =>
                    void purchaseDrawer.value?.handleOpen({
                      mode: 'edit',
                      document: purchaseDocument
                    })
                },
                '打开采购单据'
              ),
              h(
                'button',
                {
                  type: 'button',
                  onClick: () =>
                    void drawer.value?.handleOpen({ mode: 'edit', documentId: document.id })
                },
                '读取销售单据'
              ),
              h(
                'button',
                {
                  type: 'button',
                  onClick: () =>
                    void purchaseDrawer.value?.handleOpen({
                      mode: 'edit',
                      documentId: purchaseDocument.id
                    })
                },
                '读取采购单据'
              ),
              h(InitialSalesDrawer, {
                ref: drawer,
                kind: salesKind,
                importPermission: 'WmsInitialSalesOutbound:Import'
              }),
              h(PurchaseDocumentDrawer, {
                ref: purchaseDrawer,
                kind: purchaseKind,
                permissionPrefix: 'WmsInitialPurchaseInbound',
                importPermission: 'WmsInitialPurchaseInbound:Import'
              })
            ]
      )
  }
})

const app = createApp(Preview)
app.use(store)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  })
)
app.use(language)
setupGlobDirectives(app)

const userStore = useUserStore(store)
userStore.setUserInfo({
  userId: '99999999-9999-4999-8999-999999999999',
  tenantId,
  tenant: { tenantCode: 'visual-test', tenantName: '视觉验收业务租户' },
  platformSuper: true
})
useTenantScopeStore(store).selectedTenantId = tenantId
await nextTick()
userStore.setDictMap({
  scmTaxRate: [
    { name: '税率', code: 'scmTaxRate', label: '0%', value: '0', status: '1' },
    { name: '税率', code: 'scmTaxRate', label: '13%', value: '13', status: '1' }
  ],
  commonDocumentReviewStatus: [
    {
      name: '单据状态',
      code: 'commonDocumentReviewStatus',
      label: '草稿',
      value: 'draft',
      status: '1'
    }
  ],
  wmsInitialStockType: [
    {
      name: '库存类型',
      code: 'wmsInitialStockType',
      label: '正常库存',
      value: 'normal',
      status: '1'
    }
  ],
  wmsInitialStockCondition: [
    {
      name: '库存状态',
      code: 'wmsInitialStockCondition',
      label: '可用',
      value: 'available',
      status: '1'
    }
  ],
  mdmBusinessOwnerType: [
    { name: '货主类型', code: 'mdmBusinessOwnerType', label: '自有', value: 'self', status: '1' },
    {
      name: '货主类型',
      code: 'mdmBusinessOwnerType',
      label: '供应商',
      value: 'supplier',
      status: '1'
    },
    {
      name: '货主类型',
      code: 'mdmBusinessOwnerType',
      label: '客户',
      value: 'customer',
      status: '1'
    }
  ],
  wmsInitialSalesReturnType: [
    {
      name: '退货类型',
      code: 'wmsInitialSalesReturnType',
      label: '退货',
      value: 'return',
      status: '1'
    }
  ]
})
app.mount('#wms-document-serials-preview')
