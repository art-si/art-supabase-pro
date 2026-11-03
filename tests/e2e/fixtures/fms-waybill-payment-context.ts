import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import { store } from '@/store'
import { SystemThemeEnum } from '@/enums/app-enum'
import { initializeTheme } from '@/hooks/core/useTheme'
import { useMenuStore } from '@/store/modules/menu'
import { useSettingStore } from '@/store/modules/setting'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useUserStore } from '@/store/modules/user'
import PaymentDialog from '../../../modules/art-supabase-fms/src/views/settlement/waybill-cost/modules/payment-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const query = new URLSearchParams(location.search)
const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const platform = query.has('platform')
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/other', component: { template: '<div />' } }
  ]
})

const reimbursement = (
  id: string,
  tenantId: string,
  no: string,
  totalAmount: number,
  paidAmount: number
): Api.Fms.ExpenseReimbursementRecord => ({
  id,
  tenantId,
  isDemo: false,
  reimbursementNo: no,
  sourceType: 'waybill',
  reimbursementDate: '2026-11-02',
  applicantNameSnapshot: '隔离验收申请人',
  payeeName: `收款方 ${no}`,
  plannedPaymentDate: '2026-11-03',
  paymentMethod: 'cash',
  totalAmount,
  paidAmount,
  remainingAmount: totalAmount - paidAmount,
  status: paidAmount ? 'partially_paid' : 'approved',
  itemCount: 1,
  waybillCount: 1,
  paymentCount: paidAmount ? 1 : 0,
  createTime: '2026-11-02T08:00:00Z',
  updateTime: '2026-11-02T08:00:00Z',
  fieldAccess: {
    reimbursementAmounts: 'read',
    payeeDetails: 'read',
    paymentExecution: 'edit'
  }
})
const rowA = reimbursement('44444444-4444-4444-8444-444444444444', tenantA, 'PAY-A-001', 200, 50)
const rowB = reimbursement('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', tenantA, 'PAY-B-001', 300, 100)
const rowOther = reimbursement(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  tenantB,
  'PAY-OTHER-001',
  90,
  0
)

const app = createApp({
  setup() {
    const payment = ref<InstanceType<typeof PaymentDialog>>()
    const changed = ref(0)
    const scope = useTenantScopeStore()
    const menu = useMenuStore()
    return () =>
      h('main', { class: 'art-page-view min-w-0 p-4' }, [
        h('div', { class: 'flex min-w-0 flex-wrap gap-2', 'data-testid': 'payment-controls' }, [
          h(
            'output',
            { class: 'w-full min-w-0 break-all', 'data-testid': 'payment-context' },
            `${router.currentRoute.value.path}:${scope.effectiveTenantId ?? 'all'}:${platform ? 'platform' : 'ordinary'}`
          ),
          h('output', { 'data-testid': 'payment-changed' }, String(changed.value)),
          h('output', { 'data-testid': 'payment-grants' }, String(menu.buttonList.length)),
          h(
            'button',
            { type: 'button', onClick: () => void payment.value?.handleOpen(rowA) },
            '打开付款 A'
          ),
          h(
            'button',
            {
              type: 'button',
              'data-testid': 'open-payment-b',
              onClick: () => void payment.value?.handleOpen(rowB)
            },
            '打开付款 B'
          ),
          h(
            'button',
            { type: 'button', onClick: () => void payment.value?.handleOpen(rowOther) },
            '打开外租户付款'
          ),
          h('button', { type: 'button', onClick: () => menu.setButtonList([]) }, '撤销付款权限'),
          h(
            'button',
            { type: 'button', onClick: () => scope.setTenantScope(tenantB) },
            '切换测试租户'
          ),
          h('button', { type: 'button', onClick: () => void router.push('/other') }, '切换测试路由')
        ]),
        h(PaymentDialog, { ref: payment, onSuccess: () => (changed.value += 1) })
      ])
  }
})

app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)
const settings = useSettingStore(store)
settings.systemThemeType =
  query.get('theme') === 'dark' ? SystemThemeEnum.DARK : SystemThemeEnum.LIGHT
settings.systemThemeMode = settings.systemThemeType
settings.boxBorderMode = query.get('box') !== 'shadow'
initializeTheme()
document.documentElement.dataset.boxMode = settings.boxBorderMode ? 'border-mode' : 'shadow-mode'

useUserStore(store).setUserInfo({
  userId: 'fms-waybill-payment-user',
  tenantId: tenantA,
  tenant: { tenantCode: 'A', tenantName: '隔离付款租户' },
  platformSuper: platform
})
const scope = useTenantScopeStore(store)
scope.tenantOptions = [
  { id: tenantA, tenantCode: 'A', tenantName: '测试租户 A' },
  { id: tenantB, tenantCode: 'B', tenantName: '测试租户 B' }
]
scope.selectedTenantId = platform ? null : tenantA
useMenuStore(store).setButtonList([
  { name: 'FinanceWaybillCost:Pay', path: '', type: 'button', meta: { title: '出纳付款' } }
])
app.mount('#fms-waybill-payment-preview')
