import { createApp } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { initializeTheme } from '@/hooks/core/useTheme'
import { setupGlobDirectives } from '@/directives'
import Fixture from './core-model-forwarding.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const app = createApp(Fixture)
app.use(store)
app.use(language)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  })
)
setupGlobDirectives(app)
initializeTheme()
app.mount('#app')
