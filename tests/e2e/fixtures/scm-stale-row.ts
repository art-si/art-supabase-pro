import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { setupGlobDirectives } from '@/directives'
import PurchaseDialog from '@scm/views/purchase-document/modules/purchase-dialog.vue'
import SalesDialog from '@scm/views/sales-document/modules/scm-document-dialog.vue'
import type { ScmPurchaseDocument, ScmSalesDocument } from '@scm/api'
import { captureRenderedRowAction } from './capture-rendered-row-action'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const tenantId = '11111111-1111-4111-8111-111111111111'
const purchaseRef = ref<InstanceType<typeof PurchaseDialog>>()
const salesRef = ref<InstanceType<typeof SalesDialog>>()
let stalePurchaseAction: (() => void) | undefined
let staleSalesAction: (() => void) | undefined
const captured = ref({ purchase: false, sales: false })
const invoked = ref({ purchase: 0, sales: 0 })

const purchaseRecord = (suffix: 'A' | 'B'): ScmPurchaseDocument => ({
  id: `purchase-${suffix}`,
  tenantId,
  kind: 'purchase_contract',
  documentNo: `PC-${suffix}`,
  documentTypeId: 'purchase-type',
  projectId: 'project-1',
  supplierId: 'supplier-1',
  sourceId: null,
  status: 'draft',
  documentDate: '2026-11-02',
  deliveryDate: null,
  details: { title: `采购合同 ${suffix}`, paymentMode: 'amount' },
  lines: [],
  paymentPlans: [
    {
      id: `purchase-plan-${suffix}-1`,
      isAdvance: false,
      dueDate: '2026-12-01',
      ratio: 50,
      amount: 50
    },
    {
      id: `purchase-plan-${suffix}-2`,
      isAdvance: false,
      dueDate: '2026-12-31',
      ratio: 50,
      amount: 50
    }
  ],
  deliveryPlans: [],
  clauses: [],
  subtotal: 100,
  taxAmount: 0,
  totalAmount: 100,
  remark: null,
  createdAt: '',
  updatedAt: ''
})

const salesRecord = (suffix: 'A' | 'B'): ScmSalesDocument => ({
  id: `sales-${suffix}`,
  tenantId,
  kind: 'sales_contract',
  documentNo: `SC-${suffix}`,
  documentTypeId: 'sales-type',
  projectId: 'project-1',
  customerId: 'customer-1',
  sourceId: null,
  status: 'draft',
  documentDate: '2026-11-02',
  deliveryDate: null,
  currency: 'CNY',
  details: { title: `销售合同 ${suffix}`, contractTotalAmount: 100, paymentPlanMode: 'amount' },
  lines: [],
  fees: [],
  paymentPlans: [
    {
      id: `sales-plan-${suffix}-1`,
      isAdvance: false,
      dueDate: '2026-12-01',
      ratio: 50,
      amount: 50
    },
    { id: `sales-plan-${suffix}-2`, isAdvance: false, dueDate: '2026-12-31', ratio: 50, amount: 50 }
  ],
  deliveryPlans: [],
  clauses: [],
  subtotal: 100,
  feeTotal: 0,
  taxAmount: 0,
  costTotal: 0,
  totalAmount: 100,
  grossProfit: 100,
  grossMargin: 100,
  remark: null,
  createdAt: '',
  updatedAt: ''
})

const openOptions = {
  effectiveTenantId: tenantId,
  tenantOptions: [{ label: '测试租户', value: tenantId }]
}
const app = createApp({
  render: () =>
    h('main', { class: 'art-page-view p-4' }, [
      h(
        'button',
        {
          type: 'button',
          onClick: () =>
            purchaseRef.value?.handleOpen({
              kind: 'purchase_contract',
              record: purchaseRecord('A'),
              ...openOptions
            })
        },
        '打开采购合同 A'
      ),
      h(
        'button',
        {
          type: 'button',
          onClick: () =>
            purchaseRef.value?.handleOpen({
              kind: 'purchase_contract',
              record: purchaseRecord('B'),
              ...openOptions
            })
        },
        '重开采购合同 B'
      ),
      h(
        'button',
        {
          type: 'button',
          onClick: () =>
            salesRef.value?.handleOpen({
              kind: 'sales_contract',
              record: salesRecord('A'),
              ...openOptions
            })
        },
        '打开销售合同 A'
      ),
      h(
        'button',
        {
          type: 'button',
          onClick: () =>
            salesRef.value?.handleOpen({
              kind: 'sales_contract',
              record: salesRecord('B'),
              ...openOptions
            })
        },
        '重开销售合同 B'
      ),
      h(
        'button',
        {
          type: 'button',
          onClick: () => {
            stalePurchaseAction = captureRenderedRowAction(
              purchaseRef.value,
              'ArtIconButton',
              '移除付款计划'
            )
            captured.value = { ...captured.value, purchase: Boolean(stalePurchaseAction) }
          }
        },
        '捕获采购旧操作'
      ),
      h(
        'button',
        {
          type: 'button',
          onClick: () => {
            staleSalesAction = captureRenderedRowAction(
              salesRef.value,
              'ArtIconButton',
              '移除收款计划'
            )
            captured.value = { ...captured.value, sales: Boolean(staleSalesAction) }
          }
        },
        '捕获销售旧操作'
      ),
      h(
        'button',
        {
          type: 'button',
          onClick: () => {
            if (!stalePurchaseAction) return
            invoked.value = { ...invoked.value, purchase: invoked.value.purchase + 1 }
            stalePurchaseAction()
          }
        },
        '触发采购旧操作'
      ),
      h(
        'button',
        {
          type: 'button',
          onClick: () => {
            if (!staleSalesAction) return
            invoked.value = { ...invoked.value, sales: invoked.value.sales + 1 }
            staleSalesAction()
          }
        },
        '触发销售旧操作'
      ),
      h('pre', { 'data-testid': 'stale-captured' }, JSON.stringify(captured.value)),
      h('pre', { 'data-testid': 'stale-invoked' }, JSON.stringify(invoked.value)),
      h(PurchaseDialog, { ref: purchaseRef }),
      h(SalesDialog, { ref: salesRef })
    ])
})
app.use(store)
app.use(language)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: {} }]
})
app.use(router)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({ userId: 'scm-stale-row-test', tenantId, platformSuper: true })
const scope = useTenantScopeStore(store)
scope.tenantOptions = [{ id: tenantId, tenantCode: 'T', tenantName: '测试租户' }]
scope.setTenantScope(tenantId)
await router.push('/')
await router.isReady()
app.mount('#app')
