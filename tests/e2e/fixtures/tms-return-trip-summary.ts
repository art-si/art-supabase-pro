import { createApp, h, onMounted, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { setupGlobDirectives } from '@/directives'
import ReturnTripSummaryDialog from '@tms/views/order-list/modules/return-trip/return-trip-summary-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const dialogRef = ref<{ handleOpen: (row: Api.Tms.Order.OrderRecord) => Promise<void> }>()

const app = createApp({
  setup() {
    onMounted(() =>
      dialogRef.value?.handleOpen({
        id: 'order-return-summary-test',
        orderNo: 'ORD-RETURN-SUMMARY-001'
      } as Api.Tms.Order.OrderRecord)
    )
    return () => h('main', [h(ReturnTripSummaryDialog, { ref: dialogRef })])
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
app.mount('#return-trip-summary-preview')
