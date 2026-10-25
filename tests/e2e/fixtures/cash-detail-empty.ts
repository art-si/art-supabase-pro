import { createApp, defineComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useUserStore } from '@/store/modules/user'
import CashTransactionDetailDrawer from '../../../modules/art-supabase-fms/src/views/settlement/cash-transaction/modules/cash-transaction-detail-drawer.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const tenantId = '11111111-1111-4111-8111-111111111111'
const cashTransaction: Api.Fms.CashTransactionRecord = {
  id: '44444444-4444-4444-8444-444444444444',
  tenantId,
  transactionNo: 'TEST-RECEIPT-001',
  direction: 'receipt',
  counterpartyName: '测试客户',
  status: 'pending_allocation',
  transactionDate: '2026-10-02',
  amount: 10,
  allocatedAmount: 0,
  unallocatedAmount: 10,
  allocationCount: 0,
  paymentMethod: 'bank_transfer',
  voucherUrls: [],
  allocations: [],
  createTime: '2026-10-02T08:00:00Z',
  updateTime: '2026-10-02T08:00:00Z',
  fieldAccess: {
    transactionAmounts: 'read',
    bankDetails: 'read',
    voucherEvidence: 'read'
  }
}

const Preview = defineComponent({
  setup() {
    const drawer = ref<InstanceType<typeof CashTransactionDetailDrawer> | null>(null)
    return () =>
      h('main', [
        h(
          'button',
          {
            type: 'button',
            onClick: () => void drawer.value?.handleOpen(cashTransaction)
          },
          '打开收款详情'
        ),
        h(CashTransactionDetailDrawer, { ref: drawer })
      ])
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
  userId: '22222222-2222-4222-8222-222222222222',
  tenantId,
  tenant: { tenantCode: 'visual-test', tenantName: '视觉验收业务租户' },
  platformSuper: false
})
useTenantScopeStore(store).selectedTenantId = tenantId
app.mount('#cash-detail-preview')
