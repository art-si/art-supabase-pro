import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import Stock from '@wms/views/initialization/initial-stock/index.vue'
import Sales from '@wms/views/initialization/initial-sales/workspace.vue'
import PurchaseInbound from '@wms/views/initialization/initial-purchase-inbound/index.vue'
import PurchaseReturn from '@wms/views/initialization/initial-purchase-return/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const kind = new URLSearchParams(location.search).get('kind') || 'stock'
const app = createApp({
  render: () =>
    h('main', { class: 'art-page-view p-4', style: { height: '100vh' } }, [
      kind === 'stock'
        ? h(Stock)
        : kind.startsWith('sales')
          ? h(Sales, { kind: kind === 'sales-return' ? 'initial_return' : 'initial_outbound' })
          : h(kind === 'purchase-return' ? PurchaseReturn : PurchaseInbound)
    ])
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
  userId: 'fields-test',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: true
})
await router.push('/')
await router.isReady()
useUserStore(store).setDictMap({
  commonBoolean: [
    { label: '是', value: 'true', status: '1' },
    { label: '否', value: 'false', status: '1' }
  ],
  mdmStockMovementDirection: [
    { label: '入库', value: 'inbound', status: '1' },
    { label: '出库', value: 'outbound', status: '1' },
    { label: '库存转移', value: 'transfer', status: '1' }
  ]
})
app.mount('#initialization-fields')
