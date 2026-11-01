import { createApp } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { initializeTheme } from '@/hooks/core/useTheme'
import { setupGlobDirectives } from '@/directives'
import Fixture from './form-standard-wms-pmis.vue'
import { dictionaries } from './form-standard-wms-pmis-dictionaries'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const app = createApp(Fixture)
app.use(store)
initializeTheme()
app.use(language)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: {} }]
})
app.use(router)
setupGlobDirectives(app)
const user = useUserStore(store)
user.setUserInfo({
  userId: 'form-standard-test',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: true
} as Api.Auth.UserInfo)
const scope = useTenantScopeStore(store)
scope.tenantOptions = [
  { id: '11111111-1111-4111-8111-111111111111', tenantCode: 'TEST', tenantName: '验收租户' }
]
scope.scopeOwnerUserId = 'form-standard-test'
scope.setTenantScope('11111111-1111-4111-8111-111111111111')
user.setDictMap(dictionaries)
await router.push('/')
await router.isReady()
app.mount('#app')
