import { createApp } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import ReportPage from '../../../modules/art-supabase-smis/src/views/safety-production/emergency-rescue/emergency-drill-report/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const app = createApp(ReportPage)
app.use(store)
app.use(language)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  })
)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: '22222222-2222-4222-8222-222222222222',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: true
} as Api.Auth.UserInfo)
app.mount('#report-preview')
