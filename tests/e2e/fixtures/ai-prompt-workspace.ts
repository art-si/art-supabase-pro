import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { writePlatformTenantScopeActive } from '@/utils/tenant-scope-context'
import { setupGlobDirectives } from '@/directives'
import PromptPage from '@/views/system/ai-prompt/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const ordinary = new URLSearchParams(location.search).get('ordinary') === 'true'
const tenantId = '00000000-0000-4000-8000-000000000002'
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', name: 'AiPrompt', component: {} }]
})
const app = createApp({
  render: () =>
    h('main', { class: 'art-page-view', style: { height: '100vh', overflow: 'auto' } }, [
      !ordinary
        ? h('nav', [
            h('button', { onClick: () => scope.setTenantScope(null) }, '全部租户测试'),
            h('button', { onClick: () => scope.setTenantScope(tenantId) }, '指定租户测试')
          ])
        : null,
      h(PromptPage)
    ])
})
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'permission-test-user',
  tenantId,
  platformSuper: !ordinary
})
const scope = useTenantScopeStore(store)
scope.tenantOptions = [{ id: tenantId, tenantName: '测试租户', tenantCode: 'test' }]
writePlatformTenantScopeActive(!ordinary)
await router.isReady()
app.mount('#ai-prompt-workspace')
