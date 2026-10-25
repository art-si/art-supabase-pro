import { createApp } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import { useMenuStore } from '@/store/modules/menu'
import { useUserStore } from '@/store/modules/user'
import CustomerPage from '@mdm/views/components/operational-master/index.vue'
import ProcessRoutePage from '@mdm/views/process-master/process-route/index.vue'
import ManufacturingPage from '@mes/views/components/manufacturing/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const mode = new URLSearchParams(window.location.search).get('mode')
const app = createApp(
  mode === 'customer' ? CustomerPage : mode === 'route' ? ProcessRoutePage : ManufacturingPage
)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: {} }]
})
app.use(store)
app.use(language)
app.use(router)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'import-test-user',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
useMenuStore(store).setButtonList(
  ['MdmSalesCustomer', 'MdmProcessRoute', 'MesWorkOrder'].flatMap((name) =>
    ['View', 'Import'].map((action) => ({
      name: `${name}:${action}`,
      type: 'button',
      path: '',
      meta: { title: action }
    }))
  )
)
await router.push(
  mode === 'customer'
    ? '/sales-master/customer'
    : mode === 'route'
      ? '/process-master/process-route'
      : '/manufacturing/work-order'
)
await router.isReady()
app.mount('#business-import-preview')
