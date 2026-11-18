import { createApp } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import ProjectPlanner from '@/views/system/ai-project-planner/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const platformSuper = new URLSearchParams(window.location.search).get('access') !== 'tenant'
useUserStore(store).setUserInfo({
  userId: 'planner-test-user',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper
})

const app = createApp(ProjectPlanner)
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
app.mount('#app')
