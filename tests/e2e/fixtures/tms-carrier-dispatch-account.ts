import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import DispatchDialog from '@tms/views/waybill-management/modules/dispatch-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const tenantId = '11111111-1111-4111-8111-111111111111'
const dispatchRef = ref<InstanceType<typeof DispatchDialog>>()
const dict = (value: string, label: string) => ({
  name: label,
  code: value,
  value,
  label,
  status: '1',
  sort: 0
})
useUserStore(store).setUserInfo({
  userId: 'tms-carrier-dispatch-account',
  tenantId,
  platformSuper: false
})
useUserStore(store).setDictMap({
  tmsDispatchOperatorMode: [
    dict('carrier', '承运方'),
    dict('self_operated', '自营'),
    dict('individual_driver', '个体司机')
  ]
})
useMenuStore(store).setButtonList(
  ['TmsPendingWaybillList:Dispatch', 'TmsPendingWaybillList:View'].map((name) => ({
    name,
    path: '',
    type: 'button',
    meta: { title: name }
  }))
)
const row: Api.Tms.Waybill.WaybillRecord = {
  id: 'order-1',
  tenantId,
  orderNo: 'YD-TEST-001',
  originStation: '邯郸',
  destinationStation: '北京',
  deliveryMethod: 'delivery',
  shippingContactName: '发货人',
  shippingContactPhone: '13800138000',
  shippingAddressDetail: '发货地址',
  receivingContactName: '收货人',
  receivingContactPhone: '13900139000',
  receivingAddressDetail: '收货地址',
  paymentMethod: 'cash',
  cargoItems: [{ cargoName: '测试货物', quantity: 1, weightKg: 10, volumeM3: 1 }],
  cargoQuantityTotal: 1,
  cargoWeightTotal: 10,
  cargoVolumeTotal: 1
}
const app = createApp({
  render: () =>
    h('main', { class: 'art-page-view p-4' }, [
      h(
        'button',
        {
          type: 'button',
          onClick: () => void dispatchRef.value?.handleOpen({ rows: [row], mode: 'single' })
        },
        '打开调度'
      ),
      h(DispatchDialog, { ref: dispatchRef })
    ])
})
app.use(store).use(language)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: {} }]
})
app.use(router)
setupGlobDirectives(app)
await router.push('/')
await router.isReady()
app.mount('#app')
