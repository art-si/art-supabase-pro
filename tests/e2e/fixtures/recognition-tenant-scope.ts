import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { setupGlobDirectives } from '@/directives'
import { useMenuStore } from '@/store/modules/menu'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useUserStore } from '@/store/modules/user'
import { writePlatformTenantScopeActive, writeTenantScopeId } from '@/utils/tenant-scope-context'
import Workbench from '@/views/intelligent-recognition/workbench/index.vue'
import Review from '@/views/intelligent-recognition/review/index.vue'
import Records from '@/views/intelligent-recognition/records/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const ownTenant = '55555555-5555-4555-8555-555555555555'
const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = '22222222-2222-4222-8222-222222222222'
const params = new URLSearchParams(location.search)
const mode = params.get('mode') ?? 'platform-selected'
const view = params.get('view') ?? 'workbench'
const platform = mode.startsWith('platform')

useUserStore(store).setUserInfo({
  userId: 'recognition-scope-test',
  tenantId: ownTenant,
  platformSuper: platform
})
useMenuStore(store).setButtonList([])

const scope = useTenantScopeStore(store)
scope.tenantOptions = [
  { id: ownTenant, tenantCode: 'OWN', tenantName: '当前租户' },
  { id: tenantA, tenantCode: 'A', tenantName: '租户 A' },
  { id: tenantB, tenantCode: 'B', tenantName: '租户 B' }
]
scope.selectedTenantId =
  mode === 'platform-selected' ? tenantA : mode === 'ordinary-forged' ? tenantB : null
writePlatformTenantScopeActive(platform)
writeTenantScopeId(scope.selectedTenantId)

function selectScope(id: string | null): void {
  scope.setTenantScope(id)
}

window.addEventListener('recognition-test-select-scope', (event) => {
  selectScope((event as CustomEvent<string | null>).detail)
})

const page = view === 'review' ? Review : view === 'records' ? Records : Workbench
const app = createApp({
  render: () =>
    h('main', { class: 'art-page-view min-h-screen p-4' }, [
      platform
        ? h('nav', { 'aria-label': '测试租户范围', class: 'mb-4 flex gap-4' }, [
            h('button', { type: 'button', onClick: () => selectScope(null) }, '全部租户'),
            h('button', { type: 'button', onClick: () => selectScope(tenantA) }, '租户 A'),
            h('button', { type: 'button', onClick: () => selectScope(tenantB) }, '租户 B')
          ])
        : null,
      h(
        'output',
        { 'data-testid': 'effective-tenant', class: 'sr-only' },
        scope.effectiveTenantId ?? 'all'
      ),
      h(page)
    ])
})
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: {} }]
})
app.use(store)
app.use(language)
app.use(router)
setupGlobDirectives(app)
await router.push('/')
await router.isReady()
app.mount('#recognition-tenant-scope')
