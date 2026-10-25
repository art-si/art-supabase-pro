import { createApp, h } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import i18n from '@/locales'
import { setupGlobDirectives } from '@/directives'
import Customer from '@tms/views/basic-data/customer-price-detail/index.vue'
import Accident from '@vms/views/vehicle-manage/accident-record-detail/index.vue'
import Expense from '@fms/views/settlement/waybill-cost/detail/index.vue'
import '@/assets/styles/core/tailwind.css'
import '@/assets/styles/index.scss'
const kind = new URLSearchParams(location.search).get('kind')
const app = createApp({
  render: () => h(kind === 'customer' ? Customer : kind === 'accident' ? Accident : Expense)
})
app.use(store)
app.use(i18n)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: { render: () => null } },
    { path: '/detail/:id', component: { render: () => null } }
  ]
})
app.use(router)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'coordinate-test',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
await router.push('/detail/coordinate-test')
await router.isReady()
app.mount('#app')
