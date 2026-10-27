import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import ProductionWorkspace from '../../../modules/art-supabase-mes/src/views/production-execution/modules/production-workspace.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const app = createApp({
  render: () =>
    h(
      'main',
      { class: 'h-screen min-w-0 p-4', style: { '--art-full-height': 'calc(100dvh - 32px)' } },
      h(ProductionWorkspace, { entry: 'report' })
    )
})
app.use(store)
useUserStore().setUserInfo({ userId: 'user-test', tenantId: 'tenant-test', platformSuper: false })
useMenuStore().setButtonList(
  [
    'MesProductionReport:View',
    'MesProductionReport:Start',
    'MesProductionReport:Report',
    'MesWorkOrder:View'
  ].map((name) => ({ name, path: '', type: 'button' }))
)
app.use(language)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  })
)
setupGlobDirectives(app)
app.mount('#operation-preview')
