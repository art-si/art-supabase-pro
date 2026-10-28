import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import { useUserStore } from '@/store/modules/user'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import HeadcountPage from '../../../modules/art-supabase-hr/src/views/operations/headcount/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

document.documentElement.style.setProperty('--art-full-height', 'calc(100vh - 32px)')

const app = createApp({
  render: () =>
    h('main', { class: 'art-page-view', style: { padding: '16px', minWidth: 0 } }, [
      h('div', { style: { display: 'flex', gap: '8px', marginBottom: '8px' } }, [
        h('button', { onClick: () => tenantScope.setTenantScope(tenantA) }, '切换租户甲'),
        h('button', { onClick: () => tenantScope.setTenantScope(tenantB) }, '切换租户乙')
      ]),
      h(HeadcountPage)
    ])
})
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
const tenantA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const tenantB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
useUserStore(store).setUserInfo({
  userId: 'headcount-race-test',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: true
})
const tenantScope = useTenantScopeStore(store)
tenantScope.tenantOptions = [
  { id: tenantA, tenantCode: 'A', tenantName: '租户甲', status: '1' },
  { id: tenantB, tenantCode: 'B', tenantName: '租户乙', status: '1' }
]
tenantScope.selectedTenantId = null
app.mount('#app')
