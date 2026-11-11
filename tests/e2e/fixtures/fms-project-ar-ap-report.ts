import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import ProjectArApReport from '@fms/views/settlement/project-ar-ap/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const userStore = useUserStore(store)
userStore.setUserInfo({
  userId: 'fms-project-report-visual',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
useMenuStore(store).setButtonList(
  ['FinanceProjectArApReport:View', 'FinanceProjectArApReport:Export'].map((name) => ({
    name,
    path: '',
    type: 'button',
    meta: { title: name }
  }))
)

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    {
      path: '/fms/settlement/project-ar-ap',
      name: 'FinanceProjectArApReport',
      component: ProjectArApReport
    }
  ]
})
const app = createApp({
  render: () =>
    h(
      'main',
      {
        class: 'art-page-view min-h-screen p-4',
        style: { background: 'var(--el-bg-color-page)', '--art-full-height': 'calc(100dvh - 32px)' }
      },
      [h(RouterView)]
    )
})
app.use(store)
app.use(language)
app.use(router)
setupGlobDirectives(app)
await router.push('/fms/settlement/project-ar-ap')
await router.isReady()
app.mount('#fms-project-ar-ap-report')
