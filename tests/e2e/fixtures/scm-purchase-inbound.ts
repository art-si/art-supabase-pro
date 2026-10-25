import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useUserStore } from '@/store/modules/user'
import PurchaseWorkspace from '@scm/views/purchase-document/purchase-workspace.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const kind =
  new URLSearchParams(location.search).get('kind') === 'receipt_notice'
    ? 'receipt_notice'
    : 'purchase_order'
const app = createApp({
  render: () =>
    h('main', { class: 'art-page-view p-4', style: { height: '100vh' } }, [
      h(PurchaseWorkspace, { kind })
    ])
})
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: {} }]
})
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'purchase-preview-user',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: true
})
useTenantScopeStore(store).selectedTenantId = '11111111-1111-4111-8111-111111111111'
await router.push('/')
await router.isReady()
app.mount('#purchase-inbound-preview')
