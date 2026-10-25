import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import QuoteDialog from '../../../modules/art-supabase-tms/src/views/order-list/modules/quote-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const order: Api.Tms.Order.OrderRecord = {
  id: 'quote-order',
  orderNo: 'ORDER-TEST',
  originStation: '测试始发站',
  destinationStation: '测试到货站',
  deliveryMethod: '自提',
  shippingContactName: '测试发货方',
  shippingContactPhone: '',
  shippingAddressDetail: '',
  receivingContactName: '测试收货方',
  receivingContactPhone: '',
  receivingAddressDetail: ''
}
const dialog = ref<InstanceType<typeof QuoteDialog>>()
useUserStore(store).setUserInfo({
  userId: 'fixture-user',
  tenantId: 'tenant-a',
  platformSuper: true
})
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: {} }]
})
const app = createApp({
  render: () =>
    h('main', [
      h('button', { onClick: () => dialog.value?.handleOpen(order) }, '打开报价'),
      h(QuoteDialog, { ref: dialog })
    ])
})
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)
await router.isReady()
app.mount('#order-quote-state')
