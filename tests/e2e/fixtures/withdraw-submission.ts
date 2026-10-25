import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const kind = new URLSearchParams(location.search).get('kind') || 'stock'
const content = await renderPage()
async function renderPage() {
  if (kind === 'stock')
    return h((await import('@wms/views/initialization/initial-stock/index.vue')).default)
  if (kind === 'sales')
    return h((await import('@wms/views/initialization/initial-sales/workspace.vue')).default, {
      kind: 'initial_outbound'
    })
  if (kind === 'purchase')
    return h((await import('@wms/views/initialization/initial-purchase-inbound/index.vue')).default)
  if (kind === 'count')
    return h((await import('@wms/views/count-business/workspace.vue')).default, { kind: 'gain' })
  if (kind === 'transfer')
    return h((await import('@wms/views/transfer-business/transfer-request/index.vue')).default)
  if (kind === 'production')
    return h(
      (await import('@wms/views/production-inout/shared/production-material-workspace.vue'))
        .default,
      { kind: 'issue' }
    )
  return h((await import('@scm/views/sales-document/scm-document-workspace.vue')).default, {
    kind:
      kind === 'scm-contract'
        ? 'sales_contract'
        : kind === 'scm-order'
          ? 'sales_order'
          : 'sales_quotation'
  })
}
const app = createApp({
  render: () => h('main', { class: 'art-page-view p-4 h-screen' }, [content])
})
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: {} }]
})
app.use(store)
app.use(language)
app.use(router)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'withdraw-actor',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: true
})
await router.push('/')
await router.isReady()
app.mount('#withdraw-submission')
