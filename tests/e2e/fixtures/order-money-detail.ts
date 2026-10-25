import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import { useUserStore } from '@/store/modules/user'
import Detail from '@tms/views/order-list/detail/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: {} },
    { path: '/order/:id', component: {} }
  ]
})
const app = createApp({ render: () => h('main', { class: 'p-4' }, h(Detail)) })
app.use(store)
app.use(language)
app.use(router)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'order-money-test',
  tenantId: 'test-tenant',
  platformSuper: true
})
await router.push('/order/money-test')
await router.isReady()
app.mount('#order-detail')
