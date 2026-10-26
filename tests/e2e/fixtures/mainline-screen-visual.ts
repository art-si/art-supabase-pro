import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import MainlineScreen from '@tms/views/mainline-screen/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

useUserStore(store).setUserInfo({
  userId: 'mainline-screen-visual',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
const limited = new URLSearchParams(location.search).has('limited')
useMenuStore(store).setButtonList(
  (limited
    ? ['TmsMainlineScreen:View']
    : ['TmsMainlineScreen:View', 'TmsOrderQuery:View', 'VehicleQuery:View', 'TmsDriverQuery:View']
  ).map((name) => ({ name, path: '', type: 'button', meta: { title: name } }))
)

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/tms/mainline-screen', component: MainlineScreen },
    { path: '/tms/order-query', component: { render: () => h('h1', '运输订单综合查询') } },
    { path: '/tms/order-query/detail/:id', component: { render: () => h('h1', '订单目标页') } },
    { path: '/tms/driver-query', component: { render: () => h('h1', '司机综合查询') } },
    { path: '/tms/driver-query/detail/:id', component: { render: () => h('h1', '司机目标页') } },
    { path: '/vms/vehicle-query', component: { render: () => h('h1', '车辆综合查询') } },
    { path: '/vms/vehicle-query/detail/:id', component: { render: () => h('h1', '车辆目标页') } }
  ]
})

const app = createApp({ render: () => h(RouterView) })
app.use(store)
app.use(router)
app.use(language)
await router.push('/tms/mainline-screen')
await router.isReady()
app.mount('#mainline-screen-visual')
