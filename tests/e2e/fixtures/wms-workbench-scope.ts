import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { writePlatformTenantScopeActive, writeTenantScopeId } from '@/utils/tenant-scope-context'
import Workbench from '@wms/views/workbench/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const ownTenant = '55555555-5555-4555-8555-555555555555'
const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = '22222222-2222-4222-8222-222222222222'
const mode = new URLSearchParams(location.search).get('mode') ?? 'ordinary'
const platform = mode.startsWith('platform')
const scope = useTenantScopeStore(store)
function selectScope(id: string | null): void {
  scope.selectedTenantId = id
  writePlatformTenantScopeActive(platform)
  writeTenantScopeId(id)
}
useUserStore(store).setUserInfo({
  userId: 'wms-scope-test',
  tenantId: ownTenant,
  platformSuper: platform
})
useMenuStore(store).setButtonList([])
selectScope(mode === 'platform-selected' ? tenantA : mode === 'ordinary-forged' ? tenantB : null)
const app = createApp({
  render: () =>
    h('main', { class: 'art-page-view h-screen overflow-auto p-4' }, [
      platform
        ? h('nav', { 'aria-label': '测试租户范围', class: 'flex gap-4 mb-4' }, [
            h('button', { type: 'button', onClick: () => selectScope(null) }, '全部租户'),
            h('button', { type: 'button', onClick: () => selectScope(tenantA) }, '租户 A'),
            h('button', { type: 'button', onClick: () => selectScope(tenantB) }, '租户 B')
          ])
        : null,
      h(Workbench)
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
app.mount('#wms-workbench-scope')
