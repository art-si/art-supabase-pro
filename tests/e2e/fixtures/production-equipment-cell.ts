import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import { useUserStore } from '@/store/modules/user'
import Equipment from '@mdm/views/engineering/production-equipment/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

document.documentElement.style.setProperty('--art-full-height', 'calc(100vh - 32px)')
const app = createApp({ render: () => h('main', { class: 'p-4' }, h(Equipment)) })
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'equipment-cell-test',
  tenantId: 'test-tenant',
  platformSuper: true
})
app.mount('#equipment')
