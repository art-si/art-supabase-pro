import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import PendingWaybills from '@tms/views/waybill-management/pending/index.vue'
import LoadedWaybills from '@tms/views/waybill-management/loaded/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const userStore = useUserStore(store)
userStore.setUserInfo({
  userId: 'tms-waybill-list-visual',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
const dict = (pairs: Array<[string, string]>) =>
  pairs.map(([value, label], sort) => ({
    name: label,
    code: value,
    label,
    value,
    status: '1',
    sort
  }))
userStore.setDictMap({
  tmsOrderPaymentMethod: dict([['monthly', '月结']]),
  tmsWaybillDispatchStatus: dict([
    ['pending', '待派车'],
    ['dispatched', '已派车']
  ]),
  tmsWaybillStatus: dict([
    ['pending', '待接单'],
    ['accepted', '待装货'],
    ['loading', '装货中']
  ]),
  tmsDispatchOperatorMode: dict([['vehicle', '车辆调度']]),
  tmsDriverOwnership: dict([['company', '自有司机']])
})
useMenuStore(store).setButtonList(
  [
    'TmsPendingWaybillList:View',
    'TmsLoadedWaybillList:View',
    'TmsPickupAppointment:Add',
    'TmsWaybill:Accept'
  ].map((name) => ({ name, path: '', type: 'button', meta: { title: name } }))
)

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    {
      path: '/tms/waybill-management/pending',
      name: 'TmsPendingWaybillList',
      component: PendingWaybills
    },
    {
      path: '/tms/waybill-management/loaded',
      name: 'TmsLoadedWaybillList',
      component: LoadedWaybills
    },
    {
      path: '/tms/waybill-management/detail/:id',
      name: 'TmsWaybillDetail',
      component: { render: () => h('div', '运单详情') }
    },
    {
      path: '/tms/order-list/detail/:id',
      name: 'TmsOrderDetail',
      component: { render: () => h('div', '订单详情') }
    }
  ]
})
const app = createApp({
  render: () =>
    h(
      'main',
      {
        class: 'art-page-view min-h-screen p-4',
        style: {
          background: 'var(--el-bg-color-page)',
          '--art-full-height': 'calc(100dvh - 32px)'
        }
      },
      [h(RouterView)]
    )
})
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)
await router.push(
  new URLSearchParams(location.search).get('mode') === 'loaded'
    ? '/tms/waybill-management/loaded'
    : '/tms/waybill-management/pending'
)
await router.isReady()
app.mount('#tms-waybill-list-visual')
