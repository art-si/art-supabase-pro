import { createApp, h, onMounted, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { setupGlobDirectives } from '@/directives'
import ReturnTripDrawer from '@tms/views/order-list/modules/return-trip/return-trip-drawer.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const drawerRef = ref<{ handleOpen: (row: Api.Tms.Order.OrderRecord) => Promise<void> }>()

const app = createApp({
  setup() {
    onMounted(() =>
      drawerRef.value?.handleOpen({
        id: 'order-return-test',
        orderNo: 'ORD-RETURN-001',
        originStation: '上海仓',
        destinationStation: '杭州门店',
        orderStatus: 'transporting'
      } as Api.Tms.Order.OrderRecord)
    )
    return () => h('main', [h(ReturnTripDrawer, { ref: drawerRef })])
  }
})

app.use(store)
app.use(language)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  })
)
setupGlobDirectives(app)
app.mount('#return-trip-preview')
