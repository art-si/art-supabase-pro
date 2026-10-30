import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import OrderList from '@tms/views/order-list/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const userStore = useUserStore(store)
userStore.setUserInfo({
  userId: 'tms-order-list-tabs',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
const statuses: Array<[string, string]> = [
  ['pending_load', '待配载'],
  ['partially_dispatched', '部分调度'],
  ['pending_order', '待接单'],
  ['pending_pickup', '待提货'],
  ['transporting', '运输中'],
  ['partially_signed', '部分签收'],
  ['signed', '已签收'],
  ['completed', '已完成'],
  ['cancelled', '已取消']
]
userStore.setDictMap({
  tmsOrderStatus: statuses.map(([value, label], sort) => ({
    name: label,
    code: value,
    label,
    value,
    status: '1',
    sort
  }))
})
useMenuStore(store).setButtonList([
  {
    name: 'TmsOrderList:View',
    path: '',
    type: 'button',
    meta: { title: '查看运输订单' }
  }
])

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/tms/order-list', name: 'TmsOrderList', component: OrderList }]
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
await router.push('/tms/order-list')
await router.isReady()
app.mount('#tms-order-list-tabs')
