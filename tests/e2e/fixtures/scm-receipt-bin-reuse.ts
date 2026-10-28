import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import PurchaseDialog from '@scm/views/purchase-document/modules/purchase-dialog.vue'
import type { ScmPurchaseDocument } from '@scm/api'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const tenantId = '11111111-1111-4111-8111-111111111111'
const dialogRef = ref<InstanceType<typeof PurchaseDialog>>()
const record: ScmPurchaseDocument = {
  id: 'receipt-1',
  tenantId,
  kind: 'receipt_notice',
  documentNo: 'RCPT-001',
  documentTypeId: null,
  projectId: null,
  supplierId: null,
  sourceId: null,
  status: 'draft',
  documentDate: '2026-10-27',
  deliveryDate: null,
  details: {},
  lines: [
    {
      lineId: 'line-1',
      lineNo: 10,
      materialId: 'material-1',
      materialCode: 'MAT-001',
      materialDescription: '测试物料',
      specification: '',
      unit: '件',
      quantity: 5,
      unitPrice: 10,
      taxRate: 13,
      discountRate: 0,
      gift: false,
      warehouseId: 'warehouse-1',
      stockQuantity: 5
    }
  ],
  paymentPlans: [],
  deliveryPlans: [],
  clauses: [],
  subtotal: 50,
  taxAmount: 6.5,
  totalAmount: 56.5,
  remark: null,
  createdAt: '2026-10-27T00:00:00Z',
  updatedAt: '2026-10-27T00:00:00Z'
}

const app = createApp({
  render: () =>
    h('main', { class: 'art-page-view', style: { padding: '16px' } }, [
      h(
        'button',
        {
          type: 'button',
          onClick: () =>
            void dialogRef.value?.handleOpen({
              kind: 'receipt_notice',
              record,
              tenantOptions: [{ label: '测试租户', value: tenantId }],
              effectiveTenantId: tenantId
            })
        },
        '编辑收料通知单'
      ),
      h(PurchaseDialog, { ref: dialogRef })
    ])
})
app.use(store)
app.use(language)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: {} }]
})
app.use(router)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({ userId: 'scm-receipt-test', tenantId, platformSuper: true })
const scope = useTenantScopeStore(store)
scope.tenantOptions = [{ id: tenantId, tenantCode: 'A', tenantName: '测试租户' }]
scope.setTenantScope(tenantId)
await router.push('/')
await router.isReady()
app.mount('#app')
