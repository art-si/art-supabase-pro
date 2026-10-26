import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import CapacityPlanning from '@tms/views/capacity-planning/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

useUserStore(store).setUserInfo({
  userId: 'capacity-planning-layout',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
useMenuStore(store).setButtonList(
  ['TmsCapacityPlanning:View', 'TmsLoadedWaybillList:View'].map((name) => ({
    name,
    path: '',
    type: 'button',
    meta: { title: name }
  }))
)

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/tms/capacity-planning', name: 'TmsCapacityPlanning', component: CapacityPlanning },
    {
      path: '/tms/waybill-management/detail/:id',
      component: { render: () => h('h1', '运单详情目标页') }
    }
  ]
})

const app = createApp({
  render: () =>
    h(
      'main',
      { class: 'art-page-view min-h-screen p-4', style: { background: 'var(--el-bg-color-page)' } },
      [h(RouterView)]
    )
})
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)
await router.push('/tms/capacity-planning')
await router.isReady()
app.mount('#capacity-planning-layout')
