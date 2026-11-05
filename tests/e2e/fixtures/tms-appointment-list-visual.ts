import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import PickupAppointments from '@tms/views/waybill-management/pickup-appointment/index.vue'
import DeliveryAppointments from '@tms/views/waybill-management/delivery-appointment/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const userStore = useUserStore(store)
userStore.setUserInfo({
  userId: 'tms-appointment-list-visual',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
const dict = (pairs: Array<[string, string]>) =>
  pairs.map(([value, label], sort) => ({
    name: label,
    code: value,
    label,
    value,
    sort,
    status: '1'
  }))
userStore.setDictMap({
  tmsAppointmentStatus: dict([['confirmed', '已确认']]),
  tmsWaybillStatus: dict([['accepted', '待装货']])
})
useMenuStore(store).setButtonList(
  [
    'TmsPickupAppointment:View',
    'TmsPickupAppointment:Add',
    'TmsPickupAppointment:Edit',
    'TmsDeliveryAppointment:View',
    'TmsDeliveryAppointment:Add',
    'TmsDeliveryAppointment:Edit'
  ].map((name) => ({ name, path: '', type: 'button', meta: { title: name } }))
)

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    {
      path: '/pickup',
      name: 'TmsPickupAppointment',
      component: PickupAppointments
    },
    {
      path: '/delivery',
      name: 'TmsDeliveryAppointment',
      component: DeliveryAppointments
    },
    {
      path: '/detail/:id',
      name: 'TmsWaybillDetail',
      component: { render: () => h('div', '运单详情') }
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
await router.push(
  new URLSearchParams(location.search).get('kind') === 'delivery' ? '/delivery' : '/pickup'
)
await router.isReady()
app.mount('#tms-appointment-list-visual')
