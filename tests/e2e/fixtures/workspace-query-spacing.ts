import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { store } from '@/store'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import { initializeTheme } from '@/hooks/core/useTheme'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { useSettingStore } from '@/store/modules/setting'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const entries = {
  trailer: () => import('@vms/views/trailer-manage/index.vue'),
  insurance: () => import('@vms/views/vehicle-manage/vehicle-insurance/index.vue'),
  'insurance-company': () => import('@vms/views/basic-info/insurance-company/index.vue'),
  supplier: () => import('@vms/views/basic-info/supplier/index.vue'),
  'alert-center': () => import('@tms/views/alert-center/index.vue'),
  'fms-account-set': () => import('@fms/views/accounting/account-set/index.vue'),
  'fms-accounting-subject': () => import('@fms/views/accounting/accounting-subject/index.vue'),
  'fms-accounting-currency': () => import('@fms/views/accounting/accounting-currency/index.vue'),
  'fms-accounting-auxiliary': () => import('@fms/views/accounting/accounting-auxiliary/index.vue'),
  'fms-opening-balance': () => import('@fms/views/accounting/opening-balance/index.vue'),
  project: () => import('@wms/views/project-warehouse/project-report/index.vue'),
  operation: () => import('@wms/views/receipt-issue/stock-operation/index.vue')
}
const isWorkspaceEntry = (value: string | null): value is keyof typeof entries =>
  value !== null && Object.hasOwn(entries, value)
const requested = new URLSearchParams(location.search).get('entry')
const entry = isWorkspaceEntry(requested) ? requested : 'trailer'
const Page = (await entries[entry]()).default
const app = createApp({
  render: () =>
    h(ElConfigProvider, { locale: zhCn }, () =>
      h('main', { class: 'art-page-view p-4' }, [h(Page)])
    )
})
app.use(store)
app.use(language)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: {} }]
})
app.use(router)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'spacing-test-user',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
useMenuStore(store).setButtonList(
  [
    'TrailerManage:View',
    'VehicleInsurance:View',
    'TmsAlertCenter:View',
    'WmsProjectReport:View',
    'WmsStockOperation:View'
  ].map((name) => ({
    name,
    type: 'button',
    path: '',
    meta: { title: name }
  }))
)
await router.push(`/spacing/${entry}`)
await router.isReady()
initializeTheme()
document.documentElement.dataset.uiScope = 'workspace'
document.documentElement.dataset.boxMode = useSettingStore(store).boxBorderMode
  ? 'border-mode'
  : 'shadow-mode'
document.documentElement.style.setProperty('--art-full-height', 'calc(100vh - 32px)')
app.mount('#app')
