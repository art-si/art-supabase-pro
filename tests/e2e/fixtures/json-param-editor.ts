import { createApp } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { setupGlobDirectives } from '@/directives'
import Fixture from './json-param-editor.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: {} }]
})
const app = createApp(Fixture)
app.use(store)
app.use(language)
app.use(router)
setupGlobDirectives(app)
await router.push('/')
await router.isReady()
app.mount('#json-param-editor-preview')
