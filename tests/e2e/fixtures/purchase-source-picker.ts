import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import Workspace from '@/components/business/wms-purchase-document-workspace/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

useUserStore(store).setUserInfo({
  userId: 'fixture-user',
  tenantId: 'tenant-a',
  platformSuper: true
})
const permissions = {
  View: 'Test:View',
  Add: 'Test:Add',
  Edit: 'Test:Edit',
  Delete: 'Test:Delete',
  Import: 'Test:Import',
  Export: 'Test:Export',
  Push: 'Test:Push',
  Submit: 'Test:Submit',
  Approve: 'Test:Approve'
}
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', name: 'TestPurchase', component: {} }]
})
const app = createApp({
  render: () =>
    h('main', { class: 'art-page-view h-screen p-4', style: { '--art-full-height': '100vh' } }, [
      h(Workspace, { kind: 'purchase_inbound', permissions })
    ])
})
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)
await router.isReady()
app.mount('#purchase-source-picker')
