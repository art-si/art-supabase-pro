import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import { useUserStore } from '@/store/modules/user'
import Dialog from '@tms/views/waybill-management/modules/execution-operation-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const row: Api.Tms.Waybill.WaybillRecord = {
  orderNo: '空驶验收订单',
  driverWaybillId: 'empty-mileage-test',
  waybillStatus: 'signed',
  tenantId: '11111111-1111-4111-8111-111111111111',
  originStation: '上海',
  destinationStation: '南京',
  deliveryMethod: '',
  shippingContactName: '',
  shippingContactPhone: '',
  shippingAddressDetail: '',
  receivingContactName: '验收人',
  receivingContactPhone: '',
  receivingAddressDetail: '',
  paymentMethod: '',
  loadType: 'ftl',
  billingMode: '',
  billingUnit: '',
  cargoCategory: '',
  packaging: '',
  selfPickup: false,
  insured: false,
  transportRequirements: [],
  trackingMethod: ''
}
const app = createApp({
  setup() {
    const dialog = ref<InstanceType<typeof Dialog>>()
    return () =>
      h('main', { class: 'p-4' }, [
        h(
          'button',
          { onClick: () => dialog.value?.handleOpen({ row, action: 'completion' }) },
          '确认回场'
        ),
        h(Dialog, { ref: dialog })
      ])
  }
})
app
  .use(store)
  .use(language)
  .use(createRouter({ history: createMemoryHistory(), routes: [] }))
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'mileage-preview',
  tenantId: row.tenantId,
  platformSuper: true
})
app.mount('#app')
