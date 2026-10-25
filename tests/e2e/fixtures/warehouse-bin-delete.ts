import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import WarehouseBinPage from '../../../modules/art-supabase-mdm/src/views/inventory-master/bin/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', name: 'MdmWarehouseBin', component: {} }]
})
const app = createApp({
  render: () =>
    h(
      'main',
      { class: 'art-page-view', style: { height: '100vh', '--art-full-height': '100vh' } },
      [h(WarehouseBinPage)]
    )
})
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'test-user',
  tenantId: 'test-tenant',
  platformSuper: true
})
await router.isReady()
app.mount('#warehouse-bin-delete')
