import { createApp, defineComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter, RouterView, useRoute } from 'vue-router'
import { ElButton, ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { store } from '@/store'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { useSettingStore } from '@/store/modules/setting'
import { initializeTheme } from '@/hooks/core/useTheme'
import { SystemThemeEnum } from '@/enums/app-enum'
import VoucherDialog from '@fms/views/accounting/voucher-center/modules/voucher-dialog.vue'
import VoucherDetailDrawer from '@fms/views/accounting/voucher-center/modules/voucher-detail-drawer.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const parameters = new URLSearchParams(location.search)
const tenantId = '11111111-1111-4111-8111-111111111111'
const accountSetId = '22222222-2222-4222-8222-222222222222'
const voucherId = (index: number) => `${index}1111111-1111-4111-8111-111111111111`
const fixture = defineComponent({
  setup() {
    const editor = ref<InstanceType<typeof VoucherDialog>>()
    const detail = ref<InstanceType<typeof VoucherDetailDrawer>>()
    const seed = (index: number): Api.Fms.SecureVoucherRecord => ({
      id: voucherId(index),
      tenantId,
      accountSetId,
      accountingPeriodId: 'period',
      voucherNo: `转-202610-00${index}`,
      voucherType: 'transfer',
      voucherDate: '2026-10-24',
      fiscalYear: 2026,
      periodNo: 10,
      status: 'draft',
      sourceType: 'system',
      summary: '脱敏验收凭证',
      attachments: [],
      totalDebit: 216,
      totalCredit: 216,
      lineCount: 2,
      version: 1,
      createTime: '2026-10-24T00:00:00Z',
      updateTime: '2026-10-24T00:00:00Z'
    })
    return () =>
      h('main', { class: 'art-page-view p-4' }, [
        ...[1, 2].map((index) =>
          h(
            ElButton,
            { onClick: () => detail.value?.handleOpen(voucherId(index)) },
            () => `查看凭证${index}`
          )
        ),
        h(
          ElButton,
          {
            onClick: () =>
              editor.value?.handleOpen(
                {
                  accountSet: {
                    value: accountSetId,
                    label: '脱敏验收账套',
                    tenantId,
                    status: 'active'
                  },
                  subjects: ['2241', '2202'].map((code, index) => ({
                    id: `subject-${index + 1}`,
                    tenantId,
                    accountSetId,
                    subjectCode: code,
                    subjectName: index ? '应付账款' : '其他应付款',
                    category: 'liability',
                    balanceDirection: 'credit',
                    level: 1,
                    isSystem: false,
                    isEnabled: true,
                    allowQuantity: false,
                    allowForeignCurrency: true,
                    allowPeriodEndRevaluation: false,
                    cashFlowRequired: false,
                    sort: index + 1,
                    createTime: '2026-10-24T00:00:00Z',
                    updateTime: '2026-10-24T00:00:00Z'
                  })),
                  currencies: ['EUR', 'USD'].map((code, index) => ({
                    id: `currency-${code}`,
                    tenantId,
                    accountSetId,
                    currencyCode: code,
                    currencyName: code === 'EUR' ? '欧元' : '美元',
                    decimalPlaces: 2,
                    isBase: false,
                    isEnabled: true,
                    sort: index + 1,
                    createTime: '2026-10-24T00:00:00Z',
                    updateTime: '2026-10-24T00:00:00Z'
                  })),
                  auxiliaryItems: [],
                  templates: []
                },
                seed(1)
              )
          },
          () => '编辑凭证1'
        ),
        h(VoucherDetailDrawer, { ref: detail }),
        h(VoucherDialog, { ref: editor }),
        h(RouterView)
      ])
  }
})
const destination = defineComponent({
  setup() {
    const route = useRoute()
    return () =>
      h(
        'p',
        {
          'data-destination': String(route.name),
          'data-record-id': String(route.query.recordId || '')
        },
        '关联单据已定位'
      )
  }
})
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: { render: () => null } },
    ...[
      'FinancePayableWriteoff',
      'FinancePurchasePayable',
      'FinanceEstimatedPayable',
      'FinancePayablePayment',
      'FinancePayableRefund',
      'FinanceFinancialReceivable',
      'FinanceReceipt',
      'FinanceVoucherCenter'
    ].map((name) => ({ name, path: `/${name}`, component: destination }))
  ]
})
const app = createApp({
  render: () => h(ElConfigProvider, { locale: zhCn }, { default: () => h(fixture) })
})
app.use(store)
app.use(language)
setupGlobDirectives(app)
const user = useUserStore(store)
user.setUserInfo({ userId: 'voucher-fixture-user', tenantId, platformSuper: false })
useMenuStore(store).setButtonList(
  [
    'FinanceVoucherCenter:View',
    'FinanceVoucherCenter:Edit',
    'FinancePurchasePayable:View',
    'FinancePayablePayment:View',
    'FinancePayableRefund:View',
    'FinanceFinancialReceivable:View',
    'FinanceReceipt:View',
    ...(parameters.has('denyWriteoff') ? [] : ['FinancePayableWriteoff:View'])
  ]
    .filter((name) => name !== parameters.get('denyTarget'))
    .map((name) => ({ name, path: '', type: 'button', meta: { title: name } }))
)
const dictionary = (values: Array<[string, string]>) =>
  values.map(([value, label]) => ({ value, label, code: value, name: label, status: '1' }))
user.setDictMap({
  fmsVoucherStatus: dictionary([['draft', '草稿']]),
  fmsVoucherType: dictionary([['transfer', '转账凭证']]),
  fmsVoucherSourceType: dictionary([['system', '系统生成']]),
  fmsPostingWaybillCostType: [],
  fmsBillEventType: [],
  fmsTaxType: []
})
const setting = useSettingStore(store)
const theme = parameters.get('theme') === 'dark' ? SystemThemeEnum.DARK : SystemThemeEnum.LIGHT
setting.setGlobalTheme(theme, theme)
setting.boxBorderMode = parameters.get('box') !== 'shadow-mode'
document.documentElement.dataset.boxMode = setting.boxBorderMode ? 'border-mode' : 'shadow-mode'
initializeTheme()
setting.setCustomRadius(setting.customRadius)
await router.push('/')
await router.isReady()
app.use(router)
app.mount('#voucher-related-preview')
