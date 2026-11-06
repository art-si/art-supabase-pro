import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import Order from '@tms/views/order-open/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const app = createApp({ render: () => h('main', { class: 'p-4' }, h(Order)) })
app.use(store)
app.use(language)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/tms/order-open', name: 'TmsOrderOpen', component: {} }]
})
app.use(router)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'order-numeric-test',
  tenantId: 'test-tenant',
  platformSuper: new URLSearchParams(location.search).get('role') !== 'ordinary'
})
useMenuStore(store).setButtonList(
  ['TmsOrderOpen:Create', 'TmsOrderList:Edit'].map((name) => ({
    name,
    path: '',
    type: 'button',
    meta: { title: name }
  }))
)
await router.push('/tms/order-open')
await router.isReady()
app.mount('#order-numeric')
