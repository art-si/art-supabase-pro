import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

useUserStore(store).setUserInfo({
  userId: 'agreement-label-fixture',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
useMenuStore(store).setButtonList(
  ['View', 'Add', 'Edit', 'Export'].map((action) => ({
    name: `TmsTransportAgreement:${action}`,
    path: '',
    type: 'button',
    meta: { title: action }
  }))
)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    {
      path: '/tms/basic-data/transport-agreement',
      name: 'TmsTransportAgreement',
      component: () => import('@tms/views/basic-data/transport-agreement/index.vue')
    }
  ]
})
const app = createApp({
  render: () =>
    h(ElConfigProvider, { locale: zhCn }, () =>
      h(
        'main',
        {
          class: 'art-page-view h-screen p-4',
          style: { background: 'var(--el-bg-color-page)' }
        },
        [h(RouterView)]
      )
    )
})
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)
await router.push('/tms/basic-data/transport-agreement')
await router.isReady()
app.mount('#tms-agreement-label')
