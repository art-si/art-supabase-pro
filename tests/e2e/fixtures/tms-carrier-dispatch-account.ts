import { dispatchFixtureDictionaries } from '../support/tms-dispatch-dictionaries'
import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import { initializeTheme } from '@/hooks/core/useTheme'
import { useSettingStore } from '@/store/modules/setting'
import DispatchDialog from '@tms/views/waybill-management/modules/dispatch-dialog.vue'
import SplitDispatchDialog from '@tms/views/waybill-management/modules/split-dispatch-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const tenantId = '11111111-1111-4111-8111-111111111111'
const dispatchRef = ref<InstanceType<typeof DispatchDialog>>()
const splitRef = ref<InstanceType<typeof SplitDispatchDialog>>()
useUserStore(store).setUserInfo({
  userId: 'tms-carrier-dispatch-account',
  tenantId,
  platformSuper: false
})
useUserStore(store).setDictMap(dispatchFixtureDictionaries)
useMenuStore(store).setButtonList(
  [
    'TmsPendingWaybillList:Dispatch',
    'TmsPendingWaybillList:View',
    'TmsPendingWaybillList:Split',
    'TmsPendingWaybillList:Merge'
  ].map((name) => ({
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
      h(
        'button',
        { type: 'button', onClick: () => void splitRef.value?.handleOpen(row) },
        '打开拆单'
      ),
      h(
        'button',
        {
          type: 'button',
          onClick: () =>
            void dispatchRef.value?.handleOpen({
              rows: [row, { ...row, id: 'order-2', orderNo: 'YD-TEST-002' }],
              mode: 'merge'
            })
        },
        '打开合单'
      ),
      h(DispatchDialog, { ref: dispatchRef }),
      h(SplitDispatchDialog, { ref: splitRef })
    ])
})
app.use(store).use(language)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/tms/waybill-pending-list', name: 'TmsPendingWaybillList', component: {} }]
})
app.use(router)
setupGlobDirectives(app)
initializeTheme()
document.documentElement.dataset.uiScope = 'workspace'
document.documentElement.dataset.boxMode = useSettingStore(store).boxBorderMode
  ? 'border-mode'
  : 'shadow-mode'
await router.push('/tms/waybill-pending-list')
await router.isReady()
app.mount('#app')
