import { createApp, h } from 'vue'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import { initializeTheme } from '@/hooks/core/useTheme'
import { useUserStore } from '@/store/modules/user'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import SqlConsole from '@/views/data-center/sql-console/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const app = createApp({ render: () => h(ElConfigProvider, { locale: zhCn }, () => h(SqlConsole)) })
app.use(store)
const previewParams = new URLSearchParams(location.search)
const previewActor = previewParams.get('actor')
if (previewActor) {
  useUserStore().setUserInfo({
    userId: previewActor,
    tenantId: previewParams.get('tenant') || 'sql-preview-tenant',
    platformSuper: previewParams.get('ordinary') !== '1'
  })
  useTenantScopeStore().selectedTenantId = previewParams.get('tenant')
  window.addEventListener('sql-preview-tenant-change', (event) => {
    if (event instanceof CustomEvent && typeof event.detail === 'string')
      useTenantScopeStore().selectedTenantId = event.detail
  })
} else {
  const userStore = useUserStore()
  userStore.setUserInfo({ ...userStore.getUserInfo, platformSuper: true })
}
initializeTheme()
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  })
)
app.use(language)
setupGlobDirectives(app)
app.mount('#sql-console-preview')
