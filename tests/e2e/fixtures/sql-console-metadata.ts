import { createApp } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import { initializeTheme } from '@/hooks/core/useTheme'
import SqlConsole from '@/views/data-center/sql-console/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const app = createApp(SqlConsole)
app.use(store)
initializeTheme()
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  })
)
app.use(language)
setupGlobDirectives(app)
app.mount('#sql-console-preview')
