import { createApp } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import { initializeTheme } from '@/hooks/core/useTheme'
import Fixture from './shared-derived-state.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const app = createApp(Fixture)
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'derived-state-test',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: true
})
initializeTheme()
app.mount('#app')
