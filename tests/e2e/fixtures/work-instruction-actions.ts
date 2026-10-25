import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import WorkInstructionPage from '@smis/views/basic-data/position-work-instruction/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const app = createApp({
  render: () => h('main', { class: 'h-screen p-4' }, h(WorkInstructionPage))
})
app.use(store)
app.use(language)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: {} }]
})
app.use(router)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'instruction-test',
  tenantId: 'test-tenant',
  platformSuper: false
})
useMenuStore(store).setButtonList(
  ['View', 'Edit', 'Delete'].map((action) => ({
    name: `SmisPositionWorkInstruction:${action}`,
    path: '',
    type: 'button',
    meta: { title: '测试权限' }
  }))
)
await router.isReady()
app.mount('#app')
