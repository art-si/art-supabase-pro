import { createApp, defineComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { useSettingStore } from '@/store/modules/setting'
import { SystemThemeEnum } from '@/enums/app-enum'
import { initializeTheme } from '@/hooks/core/useTheme'
import FundTransferDetailDrawer from '../../../modules/art-supabase-fms/src/views/treasury/fund-transfer/modules/fund-transfer-detail-drawer.vue'
import BankReconciliationDetailDrawer from '../../../modules/art-supabase-fms/src/views/treasury/bank-reconciliation/modules/bank-reconciliation-detail-drawer.vue'
import AccountingPeriodDrawer from '../../../modules/art-supabase-fms/src/views/accounting/account-set/modules/accounting-period-drawer.vue'
import CommercialBillDetailDrawer from '../../../modules/art-supabase-fms/src/views/specialized-accounting/commercial-bill/modules/commercial-bill-detail-drawer.vue'
import PeriodCloseDetailDrawer from '../../../modules/art-supabase-fms/src/views/specialized-accounting/period-close/modules/period-close-detail-drawer.vue'
import FundTransferDialog from '../../../modules/art-supabase-fms/src/views/treasury/fund-transfer/modules/fund-transfer-dialog.vue'
import CommercialBillDialog from '../../../modules/art-supabase-fms/src/views/specialized-accounting/commercial-bill/modules/commercial-bill-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const tenantId = '11111111-1111-4111-8111-111111111111'
const otherTenantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const accountSetId = '33333333-3333-4333-8333-333333333333'
const fixtureParams = new URLSearchParams(location.search)
const bankContext = fixtureParams.has('bank-context')
const bankOrdinary = fixtureParams.has('bank-ordinary')
const bankPermissions = [
  'FinanceBankReconciliation:AutoMatch',
  'FinanceBankReconciliation:Complete',
  'FinanceBankReconciliation:Void',
  'FinanceBankReconciliation:Ignore',
  'FinanceBankReconciliation:Unmatch'
]

const transfer: Api.Fms.FundTransferRecord = {
  id: '44444444-4444-4444-8444-444444444444',
  tenantId,
  accountSetId,
  transferNo: 'TEST-TRANSFER-001',
  transferDate: '2026-10-02',
  amount: 10,
  purpose: '验收测试',
  status: 'draft',
  version: 1,
  createTime: '2026-10-02T08:00:00Z',
  updateTime: '2026-10-02T08:00:00Z',
  sourceAccountName: '测试账户 A',
  targetAccountName: '测试账户 B',
  currencyCode: 'CNY',
  currencyName: '人民币',
  fieldAccess: { transferAccounts: 'read', transferAmounts: 'read' }
}

const bankBatch: Api.Fms.BankReconciliationBatchRecord = {
  id: '55555555-5555-4555-8555-555555555555',
  tenantId,
  accountSetId,
  fundAccountId: '66666666-6666-4666-8666-666666666666',
  batchNo: 'TEST-BANK-001',
  statementStartDate: '2026-10-01',
  statementEndDate: '2026-10-02',
  importedAt: '2026-10-02T08:00:00Z',
  importedBy: '测试用户',
  status: 'draft',
  version: 1,
  createTime: '2026-10-02T08:00:00Z',
  updateTime: '2026-10-02T08:00:00Z',
  accountCode: 'TEST-ACCOUNT',
  accountName: '测试银行账户',
  currencyCode: 'CNY',
  lineCount: 0,
  matchedCount: 0,
  partialCount: 0,
  ignoredCount: 0,
  unmatchedCount: 0,
  fieldAccess: { statementAmounts: 'read' }
}
const bankBatchB: Api.Fms.BankReconciliationBatchRecord = {
  ...bankBatch,
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  batchNo: 'TEST-BANK-002'
}

const accountSet: Api.Fms.AccountSetRecord = {
  id: accountSetId,
  tenantId,
  accountSetCode: 'TEST-BOOK',
  accountSetName: '测试账套',
  legalEntityName: '测试主体',
  status: 'active',
  isDefault: true,
  baseCurrencyCode: 'CNY',
  enabledOn: '2026-10-01',
  fiscalYearStartMonth: 1,
  fieldAccess: { accountingPolicy: 'read' }
}

const commercialBill: Api.Fms.CommercialBillRecord = {
  id: '77777777-7777-4777-8777-777777777777',
  tenantId,
  accountSetId,
  billNo: 'TEST-BILL-001',
  direction: 'receivable',
  billType: 'bank_acceptance',
  status: 'draft',
  issueDate: '2026-10-02',
  dueDate: '2026-11-02',
  currencyCode: 'CNY',
  transferable: true,
  version: 1,
  createTime: '2026-10-02T08:00:00Z',
  updateTime: '2026-10-02T08:00:00Z',
  fieldAccess: { billAmounts: 'read', billParties: 'read', billReferences: 'read' }
}

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/other', component: { template: '<div />' } }
  ]
})

const Preview = defineComponent({
  setup() {
    const transferDrawer = ref<InstanceType<typeof FundTransferDetailDrawer> | null>(null)
    const bankDrawer = ref<InstanceType<typeof BankReconciliationDetailDrawer> | null>(null)
    const periodDrawer = ref<InstanceType<typeof AccountingPeriodDrawer> | null>(null)
    const billDrawer = ref<InstanceType<typeof CommercialBillDetailDrawer> | null>(null)
    const closeDrawer = ref<InstanceType<typeof PeriodCloseDetailDrawer> | null>(null)
    const transferDialog = ref<InstanceType<typeof FundTransferDialog> | null>(null)
    const billDialog = ref<InstanceType<typeof CommercialBillDialog> | null>(null)
    const bankChanged = ref(0)
    return () =>
      h('main', [
        ...(new URLSearchParams(location.search).has('currency')
          ? [
              h(
                'button',
                { type: 'button', onClick: () => void transferDialog.value?.handleOpen(transfer) },
                '打开资金调拨编辑'
              ),
              h(
                'button',
                {
                  type: 'button',
                  onClick: () => void billDialog.value?.handleOpen(commercialBill)
                },
                '打开商业票据编辑'
              ),
              h(FundTransferDialog, { ref: transferDialog }),
              h(CommercialBillDialog, { ref: billDialog })
            ]
          : []),
        h(
          'button',
          { type: 'button', onClick: () => void transferDrawer.value?.handleOpen(transfer) },
          '打开资金调拨详情'
        ),
        h(
          'button',
          { type: 'button', onClick: () => void bankDrawer.value?.handleOpen(bankBatch) },
          '打开银行对账详情'
        ),
        ...(bankContext
          ? [
              h(
                'output',
                { 'data-testid': 'bank-context' },
                `${router.currentRoute.value.path}:${useTenantScopeStore(store).effectiveTenantId ?? 'all'}`
              ),
              h('output', { 'data-testid': 'bank-changed' }, String(bankChanged.value)),
              h('output', { 'data-testid': 'bank-auth' }, bankOrdinary ? 'ordinary' : 'super'),
              h(
                'output',
                { 'data-testid': 'bank-grants' },
                String(useMenuStore(store).buttonList.length)
              ),
              h(
                'button',
                { type: 'button', onClick: () => void bankDrawer.value?.handleOpen(bankBatchB) },
                '打开银行对账详情 B'
              ),
              h(
                'button',
                { type: 'button', onClick: () => void router.push('/other') },
                '切换测试路由'
              ),
              h(
                'button',
                {
                  type: 'button',
                  onClick: () => useTenantScopeStore(store).setTenantScope(otherTenantId)
                },
                '切换测试租户'
              ),
              h(
                'button',
                { type: 'button', onClick: () => useMenuStore(store).setButtonList([]) },
                '撤销银行权限'
              )
            ]
          : []),
        h(
          'button',
          { type: 'button', onClick: () => void periodDrawer.value?.handleOpen(accountSet) },
          '打开会计期间'
        ),
        h(
          'button',
          { type: 'button', onClick: () => void billDrawer.value?.handleOpen(commercialBill) },
          '打开商业票据详情'
        ),
        h(
          'button',
          {
            type: 'button',
            onClick: () =>
              void closeDrawer.value?.handleOpen({
                id: '88888888-8888-4888-8888-888888888888',
                tenantId,
                accountSetId,
                accountingPeriodId: '99999999-9999-4999-8999-999999999999',
                runNo: 'TEST-CLOSE-001',
                status: 'checking',
                createTime: '2026-10-02T08:00:00Z'
              })
          },
          '打开关账检查详情'
        ),
        h(PeriodCloseDetailDrawer, { ref: closeDrawer }),
        h(FundTransferDetailDrawer, { ref: transferDrawer }),
        h(BankReconciliationDetailDrawer, {
          ref: bankDrawer,
          onChanged: () => (bankChanged.value += 1)
        }),
        h(AccountingPeriodDrawer, { ref: periodDrawer }),
        h(CommercialBillDetailDrawer, { ref: billDrawer })
      ])
  }
})

const app = createApp(Preview)
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)
const settings = useSettingStore(store)
settings.systemThemeType =
  fixtureParams.get('theme') === 'dark' ? SystemThemeEnum.DARK : SystemThemeEnum.LIGHT
settings.systemThemeMode = settings.systemThemeType
settings.boxBorderMode = fixtureParams.get('box') !== 'shadow'
initializeTheme()
document.documentElement.dataset.boxMode = settings.boxBorderMode ? 'border-mode' : 'shadow-mode'

const userStore = useUserStore(store)
userStore.setUserInfo({
  userId: '22222222-2222-4222-8222-222222222222',
  tenantId,
  tenant: { tenantCode: 'visual-test', tenantName: '视觉验收业务租户' },
  platformSuper: bankContext && !bankOrdinary
})
const tenantScope = useTenantScopeStore(store)
tenantScope.selectedTenantId = tenantId
if (bankContext) {
  tenantScope.tenantOptions = [
    { id: tenantId, tenantCode: 'A', tenantName: '测试租户 A' },
    { id: otherTenantId, tenantCode: 'B', tenantName: '测试租户 B' }
  ]
}
if (new URLSearchParams(location.search).has('readability')) {
  useMenuStore(store).setButtonList([
    {
      name: 'FinanceBankReconciliation:Match',
      path: '',
      type: 'button',
      meta: { title: '手工匹配' }
    }
  ])
}
if (bankContext) {
  useMenuStore(store).setButtonList(
    bankPermissions.map((name) => ({ name, path: '', type: 'button', meta: { title: name } }))
  )
}

app.mount('#fms-detail-preview')
