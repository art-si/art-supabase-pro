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
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const entries = {
  trailer: () => import('@vms/views/trailer-manage/index.vue'),
  project: () => import('@wms/views/project-warehouse/project-report/index.vue'),
  operation: () => import('@wms/views/receipt-issue/stock-operation/index.vue')
}
const requested = new URLSearchParams(location.search).get('entry')
const entry = requested === 'project' || requested === 'operation' ? requested : 'trailer'
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
  ['TrailerManage:View', 'WmsProjectReport:View', 'WmsStockOperation:View'].map((name) => ({
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
document.documentElement.style.setProperty('--art-full-height', 'calc(100vh - 32px)')
app.mount('#app')
