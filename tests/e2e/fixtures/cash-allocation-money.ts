import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import { useUserStore } from '@/store/modules/user'
import Receipt from '@fms/views/settlement/cash-transaction/modules/customer-receipt-dialog.vue'
import Payment from '@fms/views/settlement/cash-transaction/modules/carrier-payment-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const query = new URLSearchParams(location.search)
const receipt = query.get('mode') === 'receipt'
const amount = Number(query.get('amount') ?? 1234.5)
const dialog = ref<InstanceType<typeof Receipt> | InstanceType<typeof Payment>>()
const transaction: Api.Fms.CashTransactionRecord = {
  id: 'test-cash',
  tenantId: 'test-tenant',
  transactionNo: 'CASH-001',
  direction: receipt ? 'receipt' : 'payment',
  customerId: 'test-customer',
  carrierId: 'test-carrier',
  counterpartyName: '测试往来单位',
  transactionDate: '2026-10-09',
  amount,
  allocatedAmount: 0,
  unallocatedAmount: amount,
  allocationCount: 0,
  paymentMethod: 'bank_transfer',
  status: 'pending_allocation',
  createTime: '2026-10-09T08:00:00Z',
  updateTime: '2026-10-09T08:00:00Z',
  fieldAccess: { transactionAmounts: 'edit' }
}
const app = createApp({
  render: () =>
    h('main', { class: 'p-4' }, [
      h('button', { onClick: () => void dialog.value?.handleOpen(transaction) }, '打开核销'),
      h(receipt ? Receipt : Payment, { ref: dialog })
    ])
})
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'cash-money-test',
  tenantId: 'test-tenant',
  platformSuper: true
})
app.mount('#cash-money')
