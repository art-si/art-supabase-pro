import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import { initializeTheme } from '@/hooks/core/useTheme'
import language from '@/locales'
import { store } from '@/store'
import { useSettingStore } from '@/store/modules/setting'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useUserStore } from '@/store/modules/user'
import ArtPageContent from '@/components/core/layouts/art-page-content/index.vue'
import ManufacturingPage from '@mes/views/components/manufacturing/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = '22222222-2222-4222-8222-222222222222'
const mode = new URLSearchParams(location.search).get('mode') === 'task' ? 'task' : 'order'
const scope = useTenantScopeStore(store)
const app = createApp({
  render: () =>
    h('main', { class: 'art-page-view min-w-0 p-4' }, [
      h(
        'button',
        {
          hidden: true,
          'data-testid': 'switch-tenant-b',
          onClick: () => scope.setTenantScope(tenantB)
        },
        '切换租户 B'
      ),
      h(ArtPageContent)
    ])
})

app.use(store)
initializeTheme()
document.documentElement.dataset.boxMode = useSettingStore(store).boxBorderMode
  ? 'border-mode'
  : 'shadow-mode'
app.use(language)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/mes/production-plan/work-order', component: ManufacturingPage },
    { path: '/mes/production-plan/operation-task', component: ManufacturingPage }
  ]
})
app.use(router)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'mes-overview-test',
  tenantId: tenantA,
  tenant: { tenantCode: 'A', tenantName: '租户 A', builtinType: 'platform' },
  platformSuper: true
} as Api.Auth.UserInfo)
scope.tenantOptions = [
  { id: tenantA, tenantCode: 'A', tenantName: '租户 A', builtinType: 'platform' },
  { id: tenantB, tenantCode: 'B', tenantName: '租户 B', builtinType: 'business' }
]
scope.scopeOwnerUserId = 'mes-overview-test'
scope.setTenantScope(tenantA)
await router.push(
  mode === 'order' ? '/mes/production-plan/work-order' : '/mes/production-plan/operation-task'
)
await router.isReady()
app.mount('#app')
