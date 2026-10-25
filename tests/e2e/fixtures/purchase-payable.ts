import { createApp, h, KeepAlive, type VNode } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useUserStore } from '@/store/modules/user'
import { useSettingStore } from '@/store/modules/setting'
import { useMenuStore } from '@/store/modules/menu'
import { initializeTheme } from '@/hooks/core/useTheme'
import { SystemThemeEnum } from '@/enums/app-enum'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import EstimatedPayablePage from '@fms/views/accounts-payable/estimated-payable/index.vue'
import FinancialPayablePage from '@fms/views/accounts-payable/purchase-payable/index.vue'
import PayablePaymentTerms from '@mdm/views/financial-master/payment-term/index.vue'
import { financePaths } from '@/router/business-paths'
import '@styles/core/tailwind.css'
import '@styles/index.scss'
const parameters = new URLSearchParams(location.search)
const pages = [
  {
    kind: 'purchase_contract',
    component: () => import('@scm/views/purchase-management/purchase-contract/index.vue')
  },
  {
    kind: 'purchase_order',
    component: () => import('@scm/views/purchase-management/purchase-order/index.vue')
  },
  { kind: 'estimated', component: EstimatedPayablePage },
  { kind: 'financial', component: FinancialPayablePage },
  { kind: 'payment-term', component: PayablePaymentTerms },
  {
    kind: 'application',
    component: () => import('@fms/views/accounts-payable/payment-application/index.vue')
  },
  { kind: 'payment', component: () => import('@fms/views/accounts-payable/payment/index.vue') },
  {
    kind: 'refund',
    component: () => import('@fms/views/accounts-payable/payment-refund/index.vue')
  },
  { kind: 'cash', component: () => import('@fms/views/settlement/cash-transaction/index.vue') },
  {
    kind: 'purpose',
    component: () => import('@mdm/views/financial-master/payment-purpose/index.vue')
  },
  {
    kind: 'method',
    component: () => import('@mdm/views/financial-master/settlement-method/index.vue')
  },
  { kind: 'writeoff', component: () => import('@fms/views/accounts-payable/writeoff/index.vue') }
]
const app = createApp({
  render: () =>
    h('main', { class: 'art-page-view p-4', style: { height: '100vh' } }, [
      ...(parameters.has('navigationTest')
        ? [h('button', { onClick: () => router.push('/audit-away') }, '打开其他页面')]
        : []),
      h(
        ElConfigProvider,
        { locale: zhCn },
        {
          default: () =>
            parameters.has('keepAlive')
              ? h(RouterView, null, {
                  default: ({ Component }: { Component: VNode }) =>
                    h(KeepAlive, null, { default: () => Component })
                })
              : h(RouterView)
        }
      )
    ])
})
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    {
      path: financePaths.estimatedPayable,
      name: 'FinanceEstimatedPayable',
      component: EstimatedPayablePage
    },
    {
      path: financePaths.financialPayable,
      component: FinancialPayablePage
    },
    {
      path: financePaths.voucherCenter,
      component: {
        render: () =>
          h('div', [
            h('h1', '凭证中心导航目标'),
            h('p', String(router.currentRoute.value.query.recordId || ''))
          ])
      }
    },
    {
      path: '/audit-away',
      component: {
        render: () =>
          h('div', [
            h('h1', '其他业务页面'),
            h('button', { onClick: () => router.push('/') }, '返回来源页面')
          ])
      }
    },
    {
      path: '/',
      component:
        pages.find((page) => page.kind === parameters.get('kind'))?.component ||
        EstimatedPayablePage
    },
    {
      path: financePaths.payableApplication,
      component: () => import('@fms/views/accounts-payable/payment-application/index.vue')
    },
    {
      path: financePaths.payablePayment,
      component: () => import('@fms/views/accounts-payable/payment/index.vue')
    },
    {
      path: financePaths.payableRefund,
      component: () => import('@fms/views/accounts-payable/payment-refund/index.vue')
    }
  ]
})
app.use(store)
app.use(language)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'purchase-preview-user',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: parameters.get('kind') !== 'cash' && !parameters.has('permissions')
})
if (parameters.get('kind') === 'cash') {
  const permissions = [
    'FinanceCashTransaction:View',
    'FinanceCashTransaction:Void',
    'FinancePayablePayment:View'
  ]
  if (!parameters.has('withoutConfirm')) permissions.push('FinancePayablePayment:Confirm')
  if (parameters.has('withAllocate')) permissions.push('FinanceCashTransaction:Allocate')
  useMenuStore(store).setButtonList(
    permissions.map((name) => ({ name, path: name, type: 'button', meta: { title: name } }))
  )
  useUserStore(store).setDictMap({
    tmsCashDirection: [
      { name: '付款', label: '付款', code: 'payment', value: 'payment', status: '1' }
    ],
    tmsCashPaymentMethod: [
      { name: '现金', label: '现金', code: 'cash', value: 'cash', status: '1' }
    ],
    tmsCashTransactionStatus: [
      {
        name: '待核销',
        label: '待核销',
        code: 'pending_allocation',
        value: 'pending_allocation',
        status: '1'
      },
      { name: '已作废', label: '已作废', code: 'voided', value: 'voided', status: '1' }
    ]
  })
}
if (parameters.has('permissions'))
  useMenuStore(store).setButtonList(
    (parameters.get('permissions') || '')
      .split(',')
      .filter(Boolean)
      .map((name) => ({ name, path: '', type: 'button', meta: { title: '应付验收权限' } }))
  )
if (parameters.has('permissionControls')) {
  window.addEventListener('keydown', (event) => {
    if (event.altKey && event.shiftKey && event.code === 'Digit4') {
      const permissions = (parameters.get('permissions') || '').split(',').filter(Boolean)
      useMenuStore(store).setButtonList(
        permissions
          .filter((name) => !/:(Add|Edit)$/.test(name))
          .map((name) => ({ name, path: name, type: 'button', meta: { title: name } }))
      )
    }
    if (event.altKey && event.shiftKey && ['Digit7', 'Digit5'].includes(event.code)) {
      const permissions = (parameters.get('permissions') || '').split(',').filter(Boolean)
      useMenuStore(store).setButtonList(
        permissions
          .filter((name) => event.code === 'Digit5' || !name.endsWith(':Import'))
          .map((name) => ({ name, path: name, type: 'button', meta: { title: name } }))
      )
    }
  })
}
useTenantScopeStore(store).selectedTenantId =
  parameters.get('scope') === 'all' ? null : '11111111-1111-4111-8111-111111111111'
const setting = useSettingStore(store)
const requestedTheme =
  parameters.get('theme') ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
const theme = requestedTheme === 'dark' ? SystemThemeEnum.DARK : SystemThemeEnum.LIGHT
setting.setGlobalTheme(theme, theme)
setting.boxBorderMode = parameters.get('box') !== 'shadow-mode'
document.documentElement.dataset.boxMode = setting.boxBorderMode ? 'border-mode' : 'shadow-mode'
initializeTheme()
setting.setCustomRadius(setting.customRadius)
await router.push({
  path: '/',
  query: parameters.get('recordId') ? { recordId: parameters.get('recordId') } : {}
})
await router.isReady()
app.use(router)
app.mount('#purchase-payable-preview')
