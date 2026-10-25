import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { setupGlobDirectives } from '@/directives'
import RecognitionWorkspace from '../../../modules/art-supabase-mdm/src/views/engineering/accessory-processing/modules/recognition-workspace.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: {} }]
})
const app = createApp({
  render: () =>
    h('main', [
      h(
        'button',
        { onClick: () => useTenantScopeStore(store).setTenantScope('tenant-b') },
        '切换测试租户'
      ),
      h(RecognitionWorkspace)
    ])
})
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({ userId: 'test-user', tenantId: 'tenant-a', platformSuper: true })
useTenantScopeStore(store).selectedTenantId = 'tenant-a'
useTenantScopeStore(store).tenantOptions = [
  { id: 'tenant-a', tenantCode: 'test-a', tenantName: '测试租户 A' },
  { id: 'tenant-b', tenantCode: 'test-b', tenantName: '测试租户 B' }
]
await router.isReady()
app.mount('#recognition-history')
