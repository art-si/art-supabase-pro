import { createApp, h, ref, KeepAlive, type VNode } from 'vue'
import { financePaths } from '@/router/business-paths'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { useSettingStore } from '@/store/modules/setting'
import { initializeTheme } from '@/hooks/core/useTheme'
import { SystemThemeEnum } from '@/enums/app-enum'
import ReceivableWorkspace from '@fms/views/accounts-receivable/modules/receivable-workspace.vue'
import ArSecondaryWorkspace from '@fms/views/accounts-receivable/modules/ar-secondary-workspace.vue'
import ArWriteoffWorkspace from '@fms/views/accounts-receivable/modules/ar-writeoff-workspace.vue'
import ReceivableReceiptConditions from '@mdm/views/financial-master/receipt-condition/index.vue'
import PayablePaymentTerms from '@mdm/views/financial-master/payment-term/index.vue'
import ArReport from '@fms/views/accounts-receivable/receivable-report/index.vue'
import ApReport from '@fms/views/accounts-payable/payable-report/index.vue'
import PayableAutomationDialog from '@fms/views/accounts-payable/writeoff/modules/automation-dialog.vue'
import ArPaymentRequest from '@fms/views/accounts-receivable/payment-request/index.vue'
import PayeeInformationDialog from '@fms/views/everyone-expense/payee-information/modules/payee-information-dialog.vue'
import TravelApplicationPage from '@fms/views/everyone-expense/travel-application/index.vue'
import LoanApplicationPage from '@fms/views/everyone-expense/loan-application/index.vue'
import RepaymentPage from '@fms/views/everyone-expense/repayment/index.vue'
import PayeePage from '@fms/views/everyone-expense/payee-information/index.vue'
import ReimbursementPage from '@fms/views/everyone-expense/expense-reimbursement/index.vue'
import ReimbursementDetail from '@fms/views/everyone-expense/expense-reimbursement/detail/index.vue'
import ExpensePayeeDialog from '@fms/views/everyone-expense/shared/expense-payee-dialog.vue'
import type { TravelLoanPayeeInput } from '@fms/api'
import '@styles/core/tailwind.css'
import '@styles/index.scss'
const params = new URLSearchParams(location.search)
const fixturePermissions = (params.get('permissions') || '').split(',').filter(Boolean)
function setFixturePermissions(codes: string[]): void {
  useMenuStore(store).setButtonList(
    codes.map((name) => ({ name, path: '', type: 'button', meta: { title: '财务验收权限' } }))
  )
}
const kind = params.get('kind') || 'estimate'
const payeeDialog = ref<InstanceType<typeof PayeeInformationDialog>>()
const payableAutomationDialog = ref<InstanceType<typeof PayableAutomationDialog>>()
const expensePayeeDialog = ref<InstanceType<typeof ExpensePayeeDialog>>()
const expensePayeeSaved = ref('')
function openExpensePayee(index: number): void {
  void expensePayeeDialog.value?.handleOpen({
    tenantId: '11111111-1111-4111-8111-111111111111',
    employeeId: `employee-${index}`,
    documentType: params.get('documentType') === 'loan' ? 'loan' : 'reimbursement',
    defaultAmount: index * 100,
    payee: {
      payeeInformationId: `payee-${index}`,
      payeeName: `验收收款人${index}`,
      bankAccount: `MOCK-${index}-1234`,
      bankName: '验收银行',
      accountName: null,
      amount: index * 100,
      settlementMethod: 'bank_transfer',
      payeeType: 'person',
      remark: null
    }
  })
}
const app = createApp({
  render: () =>
    h(
      'main',
      { class: 'art-page-view p-4', style: { height: '100vh' } },
      h(
        ElConfigProvider,
        { locale: zhCn },
        {
          default: () =>
            kind === 'ap_automation'
              ? h('div', [
                  h(
                    'button',
                    { onClick: () => payableAutomationDialog.value?.handleOpen() },
                    '后台核销'
                  ),
                  h(PayableAutomationDialog, { ref: payableAutomationDialog })
                ])
              : kind === 'expense_payee_editor'
                ? h('div', [
                    ...[1, 2].map((index) =>
                      h(
                        'button',
                        { onClick: () => openExpensePayee(index) },
                        `编辑员工${index}收款`
                      )
                    ),
                    h(ExpensePayeeDialog, {
                      ref: expensePayeeDialog,
                      onSave: (value: TravelLoanPayeeInput) => {
                        expensePayeeSaved.value = `${value.payeeInformationId} · ${value.bankAccount}`
                      }
                    }),
                    h('output', { role: 'status' }, expensePayeeSaved.value)
                  ])
                : params.has('arNavigation')
                  ? h('div', [
                      h('button', { onClick: () => router.push('/ar-away') }, '打开其他页面'),
                      ...(params.has('permissionControls')
                        ? [
                            h(
                              'button',
                              { onClick: () => setFixturePermissions(fixturePermissions) },
                              '恢复操作权限'
                            )
                          ]
                        : []),
                      ...(params.has('expenseLinks')
                        ? [
                            ...[1, 2].map((i) =>
                              h(
                                'button',
                                {
                                  onClick: () =>
                                    router.push({
                                      path: '/',
                                      query: {
                                        [kind === 'expense_loan'
                                          ? 'loanId'
                                          : kind === 'expense_travel'
                                            ? 'applicationId'
                                            : 'openRepayment']: `link-${i}`
                                      }
                                    })
                                },
                                `定位关联单${i}`
                              )
                            ),
                            h('button', { onClick: () => router.push('/') }, '清除关联定位')
                          ]
                        : []),
                      ...(params.has('scopeControls')
                        ? [
                            ...[1, 2].map((i) =>
                              h(
                                'button',
                                {
                                  onClick: () =>
                                    useTenantScopeStore(store).setTenantScope(
                                      i === 1
                                        ? '11111111-1111-4111-8111-111111111111'
                                        : '22222222-2222-4222-8222-222222222222'
                                    )
                                },
                                `切换租户${i}`
                              )
                            ),
                            h(
                              'output',
                              { 'data-testid': 'scope-value' },
                              useTenantScopeStore(store).effectiveTenantId || 'all'
                            )
                          ]
                        : []),
                      h(RouterView, null, {
                        default: ({ Component }: { Component: VNode }) =>
                          h(KeepAlive, null, { default: () => Component })
                      })
                    ])
                  : params.has('loanPush') || params.has('detailLinks')
                    ? h(RouterView)
                    : kind === 'expense_reimbursement_detail'
                      ? h('div', [
                          ...(params.has('detailNavigation')
                            ? [1, 2].map((index) =>
                                h(
                                  'button',
                                  {
                                    onClick: () => router.push(`/reimbursement/detail-${index}`)
                                  },
                                  `切换详情${index}`
                                )
                              )
                            : []),
                          params.has('detailKeepAlive')
                            ? h(
                                KeepAlive,
                                {},
                                {
                                  default: () =>
                                    h(ReimbursementDetail, {
                                      key: router.currentRoute.value.path
                                    })
                                }
                              )
                            : h(ReimbursementDetail)
                        ])
                      : kind === 'expense_payee'
                        ? h(PayeePage)
                        : kind === 'expense_reimbursement'
                          ? h(ReimbursementPage)
                          : kind === 'expense_travel'
                            ? h(TravelApplicationPage)
                            : kind === 'expense_loan'
                              ? h(LoanApplicationPage)
                              : kind === 'expense_repayment'
                                ? h(RepaymentPage)
                                : kind === 'payee'
                                  ? h('div', [
                                      h(
                                        'button',
                                        { onClick: () => payeeDialog.value?.handleOpen() },
                                        '新增收款信息'
                                      ),
                                      h(PayeeInformationDialog, { ref: payeeDialog })
                                    ])
                                  : kind === 'receipt' || kind === 'refund' || kind === 'revenue'
                                    ? h(ArSecondaryWorkspace, { kind })
                                    : kind === 'writeoff'
                                      ? h(ArWriteoffWorkspace)
                                      : kind === 'condition'
                                        ? h(ReceivableReceiptConditions)
                                        : kind === 'payment_term'
                                          ? h(PayablePaymentTerms)
                                          : kind === 'payment_request'
                                            ? h(ArPaymentRequest)
                                            : kind === 'ap_report'
                                              ? h(ApReport, { class: 'art-page-view' })
                                              : kind === 'report'
                                                ? h(ArReport)
                                                : h(ReceivableWorkspace, {
                                                    kind:
                                                      kind === 'financial'
                                                        ? 'financial'
                                                        : 'estimate'
                                                  })
        }
      )
    )
})
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    {
      path: '/',
      name: params.has('arNavigation') ? 'ArNavigationSource' : undefined,
      component: params.has('arNavigation')
        ? {
            render: () =>
              kind === 'refund' || kind === 'receipt'
                ? h(ArSecondaryWorkspace, { kind })
                : kind === 'payment_request'
                  ? h(ArPaymentRequest)
                  : kind === 'report'
                    ? h(ArReport)
                    : kind === 'expense_repayment'
                      ? h(RepaymentPage)
                      : kind === 'expense_travel'
                        ? h(TravelApplicationPage)
                        : kind === 'expense_loan'
                          ? h(LoanApplicationPage)
                          : kind === 'expense_reimbursement'
                            ? h(ReimbursementPage)
                            : kind === 'expense_payee'
                              ? h(PayeePage)
                              : h(ReceivableWorkspace, {
                                  kind: kind === 'financial' ? 'financial' : 'estimate'
                                })
          }
        : params.has('loanPush')
          ? LoanApplicationPage
          : {}
    },
    {
      path: '/ar-away',
      name: 'ArNavigationAway',
      component: {
        render: () =>
          h('div', [
            h('h1', '其他业务页面'),
            h('button', { onClick: () => router.push('/') }, '返回来源页面')
          ])
      }
    },
    {
      path: financePaths.financialReceivable,
      name: 'FinanceFinancialReceivable',
      component: { render: () => h(ReceivableWorkspace, { kind: 'financial' }) }
    },
    {
      path: financePaths.receiptWriteoff,
      name: 'FinanceReceiptWriteoff',
      component: ArWriteoffWorkspace
    },
    {
      path: financePaths.revenueCost,
      name: 'FinanceRevenueCost',
      component: { render: () => h(ArSecondaryWorkspace, { kind: 'revenue' }) }
    },
    {
      path: financePaths.receivablePaymentRequest,
      name: 'FinanceReceivablePaymentRequest',
      component: ArPaymentRequest
    },
    { path: '/repayment', name: 'FinanceRepayment', component: RepaymentPage },
    { path: financePaths.payableWriteoff, name: 'FinancePayableWriteoff', component: {} },
    {
      path: '/reimbursement',
      name: 'FinanceExpenseReimbursement',
      component: ReimbursementPage
    },
    { path: '/reimbursement/:id', component: params.has('detailLinks') ? ReimbursementDetail : {} },
    {
      path: `${financePaths.expenseReimbursement}/detail/:id`,
      name: 'FinanceExpenseReimbursementDetail',
      component: ReimbursementDetail
    },
    {
      path: '/linked-waybill/:id',
      name: 'TmsWaybillDetail',
      component: {
        render: () =>
          h('div', [
            h('h1', `关联运单目标 ${router.currentRoute.value.params.id}`),
            h('button', { onClick: () => router.back() }, '返回报销')
          ])
      }
    },
    {
      path: '/fms/settlement/waybill-cost/detail/:id',
      component: {
        render: () => h('h1', `关联费用目标 ${router.currentRoute.value.params.id}`)
      }
    }
  ]
})
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'ar-preview-user',
  hrEmployeeId: params.get('employeeId') || undefined,
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: params.has('platformSuper') || !params.has('permissions')
})
if (params.has('permissions')) setFixturePermissions(fixturePermissions)
if (params.has('permissionControls')) {
  window.addEventListener('keydown', (event) => {
    if (event.altKey && event.shiftKey && event.code === 'KeyE')
      setFixturePermissions(
        fixturePermissions.filter((permission) => !permission.endsWith(':Export'))
      )
    if (event.altKey && event.shiftKey && event.code === 'KeyG')
      setFixturePermissions(
        fixturePermissions.filter((permission) => !permission.endsWith(':VoucherGenerate'))
      )
    if (event.altKey && event.shiftKey && event.code === 'KeyL')
      setFixturePermissions(
        fixturePermissions.filter((permission) => !permission.endsWith(':DeleteLine'))
      )
    if (event.altKey && event.shiftKey && event.code === 'KeyP')
      setFixturePermissions(
        fixturePermissions.filter((permission) => !permission.endsWith(':DeletePayee'))
      )
    if (event.altKey && event.shiftKey && event.code === 'KeyI')
      setFixturePermissions(
        fixturePermissions.filter((permission) => !permission.endsWith(':CopyItem'))
      )
    if (event.altKey && event.shiftKey && event.code === 'Minus')
      setFixturePermissions(
        fixturePermissions.filter((permission) => !permission.endsWith(':CrossCustomer'))
      )
    if (event.altKey && event.shiftKey && event.code === 'Equal')
      setFixturePermissions(
        fixturePermissions.filter((permission) => !permission.endsWith(':CrossCurrency'))
      )
    if (event.altKey && event.shiftKey && event.code === 'Digit1')
      setFixturePermissions(
        fixturePermissions.filter(
          (permission) => !/:(Writeoff|Special|CrossCustomer|CrossCurrency)$/.test(permission)
        )
      )
    if (event.altKey && event.shiftKey && event.code === 'Digit0')
      setFixturePermissions(
        fixturePermissions.filter((permission) => !permission.endsWith(':Copy'))
      )
    if (event.altKey && event.shiftKey && event.code === 'Digit9')
      setFixturePermissions(
        fixturePermissions.filter((permission) => !permission.endsWith(':Delete'))
      )
    if (event.altKey && event.shiftKey && event.code === 'Digit4')
      setFixturePermissions(
        fixturePermissions.filter((permission) => !/:(Add|Edit|Copy|Get)$/.test(permission))
      )
    if (event.altKey && event.shiftKey && event.code === 'Digit5')
      setFixturePermissions(fixturePermissions)
    if (event.altKey && event.shiftKey && event.code === 'Digit7')
      setFixturePermissions(
        fixturePermissions.filter((permission) => !/:(Confirm|Pay|RefreshCost)$/.test(permission))
      )
    if (event.altKey && event.shiftKey && event.code === 'Digit6' && params.has('arNavigation'))
      void router.push('/ar-away')
    if (event.altKey && event.shiftKey && event.code === 'Digit8' && params.has('arNavigation'))
      void router.push('/')
    if (event.altKey && event.shiftKey && event.code === 'Digit3')
      setFixturePermissions(
        fixturePermissions.filter((permission) => !permission.endsWith(':Submit'))
      )
  })
}
useTenantScopeStore(store).selectedTenantId =
  params.get('scopeTenant') === 'all'
    ? null
    : params.get('scopeTenant') || '11111111-1111-4111-8111-111111111111'
if (params.has('scopeControls')) {
  await useTenantScopeStore(store).loadTenantOptions(true)
  useTenantScopeStore(store).setTenantScope('11111111-1111-4111-8111-111111111111')
  window.addEventListener('keydown', (event) => {
    if (event.altKey && event.shiftKey && event.code === 'Digit2')
      useTenantScopeStore(store).setTenantScope('22222222-2222-4222-8222-222222222222')
  })
}
const settings = useSettingStore(store)
const theme = params.get('theme') === 'dark' ? SystemThemeEnum.DARK : SystemThemeEnum.LIGHT
settings.setGlobalTheme(theme, theme)
settings.boxBorderMode = params.get('box') !== 'shadow-mode'
document.documentElement.dataset.boxMode = settings.boxBorderMode ? 'border-mode' : 'shadow-mode'
initializeTheme()
settings.setCustomRadius(settings.customRadius)
await router.push(
  kind === 'expense_reimbursement_detail'
    ? `/reimbursement/${params.get('recordId') || 'detail-1'}`
    : {
        path: '/',
        query: {
          ...(params.has('recordId') ? { recordId: params.get('recordId') } : {}),
          ...(params.has('sourceDocumentId')
            ? { sourceDocumentId: params.get('sourceDocumentId') }
            : {})
        }
      }
)
await router.isReady()
app.mount('#ar-preview')
