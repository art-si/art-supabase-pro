import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import Workspace from '../../../modules/art-supabase-scm/src/views/sales-quotation/project-quotation/modules/project-workspace.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const user = useUserStore(store)
user.setUserInfo({ userId: 'project-test-user', tenantId: 'tenant-a', platformSuper: true })
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }]
})
const app = createApp({
  render: () => h('main', { class: 'art-page-view p-4 h-screen flex flex-col' }, h(Workspace))
})
app.use(store)
app.use(language)
app.use(router)
setupGlobDirectives(app)
app.mount('#project-preview')
