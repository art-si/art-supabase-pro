import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import { useUserStore } from '@/store/modules/user'
import Reference from '@mdm/views/components/material-reference/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

document.documentElement.style.setProperty('--art-full-height', 'calc(100vh - 32px)')
const app = createApp({ render: () => h('main', { class: 'p-4' }, h(Reference)) })
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:kind', component: {} }]
})
app.use(store)
app.use(language)
app.use(router)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'reference-cell-test',
  tenantId: 'test-tenant',
  platformSuper: true
})
await router.push(`/${new URLSearchParams(location.search).get('kind') || 'material-type'}`)
await router.isReady()
app.mount('#reference')
