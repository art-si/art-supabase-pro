import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

useUserStore(store).setUserInfo({
  userId: 'tms-order-invoice-visual',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
useMenuStore(store).setButtonList(
  ['TmsOrderOpen:Create', 'TmsOrderList:Edit'].map((name) => ({
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
      path: '/tms/order-open',
      name: 'TmsOrderOpen',
      component: () => import('@tms/views/order-open/index.vue')
    },
    {
      path: '/tms/order-list',
      name: 'TmsOrderList',
      component: { render: () => h('h1', '订单列表') }
    }
  ]
})
const app = createApp({
  render: () =>
    h(
      'main',
      {
        class: 'art-page-view min-h-screen p-4',
        style: { background: 'var(--el-bg-color-page)' }
      },
      [h(RouterView)]
    )
})
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)
await router.push({ name: 'TmsOrderOpen', query: { id: '11111111-1111-4111-8111-111111111201' } })
await router.isReady()
app.mount('#tms-order-invoice-visual')
