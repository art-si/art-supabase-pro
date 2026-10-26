import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import OrderQueryDetail from '@tms/views/order-query/detail/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

useUserStore(store).setUserInfo({
  userId: 'tms-order-contract-visual',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
useUserStore(store).setDictMap({
  tmsOrderStatus: [
    {
      name: '待配载',
      code: 'pending_load',
      label: '待配载',
      value: 'pending_load',
      status: '1',
      sort: 1
    }
  ]
})
const restricted = new URLSearchParams(location.search).has('restricted')
useMenuStore(store).setButtonList(
  (restricted ? ['TmsOrderQuery:View'] : ['TmsOrderQuery:View', 'TmsContract:View']).map(
    (name) => ({
      name,
      path: '',
      type: 'button',
      meta: { title: name }
    })
  )
)

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/tms/order-query', component: { render: () => h('div', '订单综合查询') } },
    {
      path: '/tms/order-query/detail/:id',
      name: 'TmsOrderQueryDetail',
      component: OrderQueryDetail
    },
    {
      path: '/tms/basic-data/contract-detail/:id',
      component: { render: () => h('div', '合同详情') }
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
await router.push('/tms/order-query/detail/11111111-1111-4111-8111-111111111201')
await router.isReady()
app.mount('#tms-order-contract-visual')
window.addEventListener('tms-order-contract-route', (event) => {
  const path = (event as CustomEvent<string>).detail
  if (path) void router.push(path)
})
