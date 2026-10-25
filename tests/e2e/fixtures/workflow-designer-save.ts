import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import Workspace from '@/views/workflow/definition/modules/workflow-designer-workspace.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

useUserStore(store).setUserInfo({
  userId: 'fixture-admin',
  tenantId: 'tenant-a',
  platformSuper: true
})
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: {} }]
})
const app = createApp({ render: () => h(Workspace, { definitionId: 'definition-a' }) })
app.use(store)
app.use(language)
app.use(router)
setupGlobDirectives(app)
await router.isReady()
app.mount('#designer-save')
