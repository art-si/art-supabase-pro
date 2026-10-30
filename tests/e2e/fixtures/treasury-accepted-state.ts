import { KeepAlive, createApp, h, type Component } from 'vue'
import { RouterView, createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import { SystemThemeEnum } from '@/enums/app-enum'
import { initializeTheme } from '@/hooks/core/useTheme'
import language from '@/locales'
import { store } from '@/store'
import { useMenuStore } from '@/store/modules/menu'
import { useSettingStore } from '@/store/modules/setting'
import { useUserStore } from '@/store/modules/user'
import { financePaths, financeRouteNames } from '@/router/business-paths'
import BankReconciliation from '@fms/views/treasury/bank-reconciliation/index.vue'
import FundAccount from '@fms/views/treasury/fund-account/index.vue'
import FundJournal from '@fms/views/treasury/fund-journal/index.vue'
import FundTransfer from '@fms/views/treasury/fund-transfer/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const query = new URLSearchParams(location.search)
const mode = query.get('mode')
const paths = {
  account: financePaths.fundAccount,
  journal: financePaths.fundJournal,
  transfer: financePaths.fundTransfer,
  bank: financePaths.bankReconciliation,
  idle: '/treasury-fixture/idle'
} as const
type Mode = keyof typeof paths
const initialMode: Mode =
  mode === 'journal' || mode === 'transfer' || mode === 'bank' ? mode : 'account'
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: paths.account, name: financeRouteNames.fundAccount, component: FundAccount },
    { path: paths.journal, name: financeRouteNames.fundJournal, component: FundJournal },
    { path: paths.transfer, name: financeRouteNames.fundTransfer, component: FundTransfer },
    { path: paths.bank, name: financeRouteNames.bankReconciliation, component: BankReconciliation },
    {
      path: paths.idle,
      name: 'TreasuryFixtureIdle',
      component: { render: () => h('div', { 'data-testid': 'treasury-idle' }, '测试空白路由') }
    }
  ]
})
const app = createApp({
  render: () =>
    h(
      'main',
      { class: 'art-page-view min-w-0 p-4' },
      h(RouterView, null, {
        default: ({ Component: current }: { Component?: Component }) =>
          h(KeepAlive, null, { default: () => (current ? h(current) : null) })
      })
    )
})
app.use(store)
const theme = query.get('theme') === 'dark' ? SystemThemeEnum.DARK : SystemThemeEnum.LIGHT
useSettingStore(store).setGlobalTheme(theme, theme)
initializeTheme()
app.use(language)
app.use(router)
setupGlobDirectives(app)
const userStore = useUserStore(store)
userStore.setUserInfo({
  userId: 'treasury-accepted-test',
  tenantId: 'tenant-a',
  platformSuper: false
})
const buttonNames = [
  'FinanceFundAccount:Add',
  'FinanceFundAccount:Edit',
  'FinanceFundAccount:Delete',
  'FinanceFundTransfer:View',
  'FinanceFundTransfer:Add',
  'FinanceBankReconciliation:View',
  'FinanceBankReconciliation:Add'
]
useMenuStore(store).setButtonList(
  buttonNames.map((name) => ({ name, path: '', type: 'button', meta: { title: name } }))
)
Object.assign(window, {
  __treasuryAcceptedTest: {
    authorization() {
      return { platformSuper: userStore.isPlatformSuper, buttons: [...buttonNames] }
    },
    switchTenant(tenantId: string) {
      userStore.setUserInfo({ userId: 'treasury-accepted-test', tenantId, platformSuper: false })
    },
    navigate(target: Mode) {
      return router.push(paths[target])
    }
  }
})
await router.replace(paths[initialMode])
await router.isReady()
app.mount('#app')
