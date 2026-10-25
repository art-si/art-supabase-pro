import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import Inventory from '../../../modules/art-supabase-hr/src/views/talent/talent-inventory/index.vue'
import WorkforceRisk from '../../../modules/art-supabase-hr/src/views/operations/workforce-risk/index.vue'
import PeopleAnalytics from '../../../modules/art-supabase-hr/src/views/operations/people-analytics/index.vue'
import SkillMatrix from '../../../modules/art-supabase-hr/src/views/talent/skill-matrix/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

document.documentElement.style.setProperty('--art-full-height', 'calc(100vh - 32px)')
const component =
  new URLSearchParams(location.search).get('page') === 'skills'
    ? SkillMatrix
    : new URLSearchParams(location.search).get('page') === 'analytics'
      ? PeopleAnalytics
      : new URLSearchParams(location.search).get('page') === 'risk'
        ? WorkforceRisk
        : Inventory
const app = createApp({ render: () => h('main', { style: { padding: '16px' } }, h(component)) })
app.use(store)
app.use(language)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: {} },
      { path: '/hr/personnel/employee-detail/:id', component: {} }
    ]
  })
)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'inventory-test',
  tenantId: 'inventory-test-tenant',
  platformSuper: true
})
useUserStore(store).setDictMap({ hrPeopleAnalyticsPeriod: [{ label: '12 个月', value: '12' }] })
app.mount('#inventory')
