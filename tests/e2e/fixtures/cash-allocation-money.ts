import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import { useUserStore } from '@/store/modules/user'
import Receipt from '@fms/views/settlement/cash-transaction/modules/customer-receipt-dialog.vue'
import Payment from '@fms/views/settlement/cash-transaction/modules/carrier-payment-dialog.vue'
import PaymentApplication from '@fms/views/settlement/payment-application/modules/payment-application-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const query = new URLSearchParams(location.search)
const receipt = query.get('mode') === 'receipt'
const applicationMode = query.get('mode') === 'application'
const amount = Number(query.get('amount') ?? 1234.5)
const dialog = ref<InstanceType<typeof Receipt> | InstanceType<typeof Payment>>()
const applicationDialog = ref<InstanceType<typeof PaymentApplication>>()
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
  allocatableAmount: amount,
  unallocatedAmount: amount,
  allocationCount: 0,
  paymentMethod: 'bank_transfer',
  status: 'pending_allocation',
  createTime: '2026-10-09T08:00:00Z',
  updateTime: '2026-10-09T08:00:00Z',
  fieldAccess: { transactionAmounts: 'edit' }
}
const application: Api.Fms.CarrierPaymentApplicationRecord = {
  id: 'test-application',
  tenantId: 'test-tenant',
  applicationNo: 'APP-001',
  carrierId: 'test-carrier',
  carrierName: '测试承运商',
  plannedPaymentDate: '2026-10-09',
  amount,
  paymentMethod: 'bank_transfer',
  status: 'draft',
  statementCount: 1,
  statementNos: 'ST-001',
  createTime: '2026-10-09T08:00:00Z',
  updateTime: '2026-10-09T08:00:00Z',
  fieldAccess: { applicationAmounts: 'edit', basisEvidence: 'edit' },
  items: [
    {
      id: 'test-application-item',
      applicationId: 'test-application',
      statementId: 'test-statement',
      carrierId: 'test-carrier',
      statementNoSnapshot: 'ST-001',
      statementAmountSnapshot: amount,
      outstandingAmountSnapshot: amount,
      appliedAmount: 0,
      createTime: '2026-10-09T08:00:00Z',
      updateTime: '2026-10-09T08:00:00Z'
    }
  ]
}
const app = createApp({
  render: () =>
    h('main', { class: 'p-4' }, [
      applicationMode
        ? h(
            'button',
            { onClick: () => void applicationDialog.value?.handleOpen(application) },
            '打开付款申请'
          )
        : h('button', { onClick: () => void dialog.value?.handleOpen(transaction) }, '打开核销'),
      applicationMode
        ? h(PaymentApplication, { ref: applicationDialog })
        : h(receipt ? Receipt : Payment, { ref: dialog })
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
