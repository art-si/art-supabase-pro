import { createApp, h, onMounted, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import ReturnTripDrawer from '@tms/views/order-list/modules/return-trip/return-trip-drawer.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const drawerRef = ref<{
  handleOpen: (row: Api.Tms.Order.OrderRecord, mode?: 'load' | 'empty') => Promise<void>
}>()

const app = createApp({
  setup() {
    onMounted(() =>
      drawerRef.value?.handleOpen(
        {
          id: 'order-return-test',
          orderNo: 'ORD-RETURN-001',
          originStation: '上海仓',
          destinationStation: '杭州门店',
          orderStatus: 'transporting',
          orderConfig: {
            loadType: 'ltl',
            vehicleType: '厢式货车',
            billingMode: 'weight',
            cargoCategory: 'general',
            packaging: 'bulk',
            attachmentUrls: ['https://example.invalid/old-order-proof.pdf'],
            payable: {
              driverFreight: 999,
              driverSettlementMethod: 'monthly',
              carrierSettlementMethod: 'monthly'
            },
            loading: {
              loadPhotoUrls: ['https://example.invalid/old-load.jpg'],
              signerName: '原单签收人'
            }
          }
        } as Api.Tms.Order.OrderRecord,
        new URLSearchParams(location.search).get('mode') === 'empty' ? 'empty' : 'load'
      )
    )
    return () => h('main', [h(ReturnTripDrawer, { ref: drawerRef })])
  }
})

app.use(store)
const userStore = useUserStore()
userStore.setUserInfo({
  ...userStore.getUserInfo,
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
useMenuStore(store).setButtonList([
  { name: 'TmsOrderList:AddReturnTrip', type: 'button', path: '', meta: { title: '录入返程配货' } }
])
app.use(language)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/tms/order-list', name: 'TmsOrderList', component: { template: '<div />' } }]
})
app.use(router)
setupGlobDirectives(app)
await router.push('/tms/order-list')
await router.isReady()
app.mount('#return-trip-preview')
