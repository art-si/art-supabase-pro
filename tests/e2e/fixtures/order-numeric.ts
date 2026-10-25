import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import { useUserStore } from '@/store/modules/user'
import Order from '@tms/views/order-open/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const app = createApp({ render: () => h('main', { class: 'p-4' }, h(Order)) })
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'order-numeric-test',
  tenantId: 'test-tenant',
  platformSuper: true
})
app.mount('#order-numeric')
