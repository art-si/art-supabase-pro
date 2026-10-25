import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import { useUserStore } from '@/store/modules/user'
import Workbench from '@fms/views/workbench/index.vue'
import Profit from '@fms/views/settlement/waybill-profit/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

document.documentElement.style.setProperty('--art-full-height', 'calc(100vh - 32px)')
const app = createApp({
  render: () =>
    h(
      'main',
      { class: 'p-4' },
      h(new URLSearchParams(location.search).get('page') === 'profit' ? Profit : Workbench)
    )
})
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'finance-money-test',
  tenantId: 'test-tenant',
  platformSuper: true
})
app.mount('#finance')
