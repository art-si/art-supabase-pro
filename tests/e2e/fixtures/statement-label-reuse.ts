import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import Reports from '@fms/views/accounting/financial-reports/index.vue'
import ConfigDrawer from '@fms/views/accounting/financial-reports/modules/statement-config-drawer.vue'
import CashFlowPanel from '@fms/views/accounting/voucher-center/modules/cash-flow-allocation-panel.vue'
import VoucherEntryLines from '@fms/views/modules/voucher-entry-lines.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const parameters = new URLSearchParams(location.search)
const mode = parameters.get('mode')
const configAccess = parameters.get('configAccess')
const drawer = ref<InstanceType<typeof ConfigDrawer>>()
const cashPanel = ref<InstanceType<typeof CashFlowPanel>>()
const cashReadonly = ref(true)
const entryPanel = ref<InstanceType<typeof VoucherEntryLines>>()
const entryReadonly = ref(true)
const entryMode = parameters.get('entryMode') === 'template' ? 'template' : 'voucher'
const entryValidation = ref('尚未验证')
const validationResult = ref('尚未验证')
const allocations = ref<Api.Fms.VoucherCashFlowAllocationDraft[]>([
  { voucherLineNo: 1, statementItemId: '', amount: 10, remark: null }
])
const cashItems: Api.Fms.FinancialStatementItemRecord[] = ['receipt', 'payment'].map(
  (direction, index) => ({
    id: `cash-item-${index + 1}`,
    accountSetId: 'test-account',
    statementType: 'cash_flow_statement',
    itemCode: `CF-${index + 1}`,
    itemName: index === 0 ? '经营现金流入' : '经营现金流出',
    lineNo: index + 1,
    itemLevel: 1,
    displayStyle: 'normal',
    calculationMethod: 'mapping',
    cashFlowDirection: direction === 'receipt' ? 'receipt' : 'payment',
    isEnabled: true,
    createTime: '',
    updateTime: ''
  })
)
const subjects: Api.Fms.SubjectRecord[] = [
  {
    id: 'cash-subject',
    tenantId: 'test-tenant',
    accountSetId: 'test-account',
    subjectCode: '1001',
    subjectName: '测试现金科目',
    category: 'asset',
    balanceDirection: 'debit',
    level: 1,
    isSystem: false,
    isEnabled: true,
    allowQuantity: false,
    allowForeignCurrency: false,
    allowPeriodEndRevaluation: false,
    cashFlowRequired: true,
    sort: 0,
    createTime: '',
    updateTime: ''
  }
]
const lines: Api.Fms.VoucherLineRecord[] = [1, 2].map((lineNo) => ({
  lineNo,
  summary: '公共方向标签测试',
  subjectId: 'cash-subject',
  auxiliaryValues: {},
  exchangeRate: 1,
  originalAmount: 10,
  quantity: 0,
  debitAmount: lineNo === 1 ? 10 : 0,
  creditAmount: lineNo === 2 ? 10 : 0
}))
const entryLines = ref<Api.Fms.VoucherLineRecord[]>(
  lines.map((line) => ({
    ...line,
    currencyId: 'eur',
    currencyCodeSnapshot: 'EUR',
    auxiliaryValues: { center: 'cost-center' },
    entryDirection: line.lineNo === 1 ? 'debit' : 'credit'
  }))
)
const entrySubjects: Api.Fms.SubjectRecord[] = subjects.map((subject) => ({
  ...subject,
  parentId: 'parent-subject',
  allowForeignCurrency: true,
  auxiliaryConfigs: [
    {
      auxiliaryTypeId: 'center',
      isRequired: true,
      sort: 0,
      auxiliaryType: {
        id: 'center',
        typeCode: 'CENTER',
        typeName: '成本中心',
        sourceType: 'manual',
        isEnabled: true
      }
    }
  ]
}))
entrySubjects.unshift({
  ...subjects[0],
  id: 'parent-subject',
  subjectCode: '1000',
  subjectName: '测试父级科目'
})
const entryCurrencies: Api.Fms.CurrencyRecord[] = [
  {
    id: 'eur',
    tenantId: 'test-tenant',
    accountSetId: 'test-account',
    currencyCode: 'EUR',
    currencyName: '欧元',
    decimalPlaces: 2,
    isBase: false,
    isEnabled: true,
    sort: 0,
    createTime: '',
    updateTime: ''
  }
]
const entryAuxiliaryItems: Api.Fms.AuxiliaryItemRecord[] = [
  {
    id: 'cost-center',
    tenantId: 'test-tenant',
    accountSetId: 'test-account',
    auxiliaryTypeId: 'center',
    itemCode: 'CC-001',
    itemName: '测试成本中心',
    isEnabled: true,
    sort: 0,
    createTime: '',
    updateTime: ''
  }
]
useUserStore(store).setUserInfo({
  userId: 'statement-label-test',
  tenantId: 'test-tenant',
  platformSuper: false
})
useMenuStore(store).setButtonList([
  { name: 'FinanceFinancialReports:View', type: 'button', path: '', meta: { title: '查看报表' } },
  ...(configAccess
    ? [
        {
          name: `FinanceFinancialReports:${configAccess === 'edit' ? 'EditConfig' : 'ViewConfig'}`,
          type: 'button',
          path: '',
          meta: { title: '报表口径' }
        }
      ]
    : [])
])
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }]
})
const app = createApp({
  render: () =>
    h(ElConfigProvider, { locale: zhCn }, () =>
      h(
        'main',
        { class: 'art-page-view p-4', style: '--art-full-height: calc(100dvh - 32px)' },
        mode === 'report'
          ? h(Reports)
          : mode === 'cash'
            ? h(CashFlowPanel, { lines, subjects, statementItems: [], readonly: true })
            : mode === 'cash-edit'
              ? [
                  h(
                    'button',
                    {
                      type: 'button',
                      onClick: () => {
                        cashReadonly.value = !cashReadonly.value
                      }
                    },
                    '切换归集编辑'
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      onClick: async () => {
                        validationResult.value = String(await cashPanel.value?.validate())
                      }
                    },
                    '验证归集'
                  ),
                  h('output', { 'aria-label': '归集验证结果' }, validationResult.value),
                  h(CashFlowPanel, {
                    ref: cashPanel,
                    lines,
                    subjects,
                    statementItems: cashItems,
                    readonly: cashReadonly.value,
                    modelValue: allocations.value,
                    'onUpdate:modelValue': (value: Api.Fms.VoucherCashFlowAllocationDraft[]) => {
                      allocations.value = value
                    }
                  })
                ]
              : mode === 'entries'
                ? [
                    h(
                      'button',
                      {
                        type: 'button',
                        onClick: () => {
                          entryReadonly.value = !entryReadonly.value
                        }
                      },
                      '切换分录编辑'
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        onClick: async () => {
                          entryValidation.value = String(
                            (await entryPanel.value?.validate())?.valid
                          )
                        }
                      },
                      '验证分录'
                    ),
                    h('output', { 'aria-label': '分录验证结果' }, entryValidation.value),
                    h(VoucherEntryLines, {
                      ref: entryPanel,
                      modelValue: entryLines.value,
                      'onUpdate:modelValue': (value: Api.Fms.VoucherLineRecord[]) => {
                        entryLines.value = value
                      },
                      subjects: entrySubjects,
                      currencies: entryCurrencies,
                      auxiliaryItems: entryAuxiliaryItems,
                      readonly: entryReadonly.value,
                      mode: entryMode,
                      directionOptions: [
                        { label: '借方', value: 'debit' },
                        { label: '贷方', value: 'credit' }
                      ]
                    })
                  ]
                : [
                    h(
                      'button',
                      {
                        type: 'button',
                        onClick: () =>
                          void drawer.value?.handleOpen('test-account', 'cash_flow_statement')
                      },
                      '查看报表口径'
                    ),
                    h(ConfigDrawer, { ref: drawer })
                  ]
      )
    )
})
app.use(store)
app.use(language)
app.use(router)
setupGlobDirectives(app)
await router.push('/fms/accounting/financial-reports')
app.mount('#statement-label-preview')
