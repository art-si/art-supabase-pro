import { createApp } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import { initializeTheme } from '@/hooks/core/useTheme'
import Fixture from './address-input-style.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const app = createApp(Fixture)
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
initializeTheme()
document.documentElement.dataset.uiScope = 'workspace'
app.mount('#app')
