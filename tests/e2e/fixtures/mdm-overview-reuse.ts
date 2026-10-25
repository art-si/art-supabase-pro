import { createApp } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import Overview from '@mdm/views/workbench/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const app = createApp(Overview)
setupGlobDirectives(app)
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
useUserStore(store).setUserInfo({
  userId: 'overview-test',
  tenantId: 'test-tenant',
  platformSuper: true
})
app.mount('#mdm-overview')
