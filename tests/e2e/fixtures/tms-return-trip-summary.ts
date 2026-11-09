import { createApp, h, onMounted, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { setupGlobDirectives } from '@/directives'
import ReturnTripSummaryDialog from '@tms/views/order-list/modules/return-trip/return-trip-summary-dialog.vue'
import WaybillReturnLegPanel from '@tms/views/waybill-management/detail/modules/waybill-return-leg-panel.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const dialogRef = ref<{ handleOpen: (row: Api.Tms.Order.OrderRecord) => Promise<void> }>()
const panelMode = new URLSearchParams(window.location.search).has('panel')
const panelWaybill = {
  id: '00000000-0000-4000-a000-000000000011',
  waybillNo: 'YD202611-018-01',
  originCity: '上海',
  destinationCity: '杭州'
} as Api.Tms.Waybill.WaybillDetailRecord

const app = createApp({
  setup() {
    if (!panelMode)
      onMounted(() =>
        dialogRef.value?.handleOpen({
          id: 'order-return-summary-test',
          orderNo: 'ORD-RETURN-SUMMARY-001'
        } as Api.Tms.Order.OrderRecord)
      )
    return () =>
      panelMode
        ? h('main', { class: 'mx-auto max-w-5xl p-4' }, [
            h(WaybillReturnLegPanel, { waybill: panelWaybill })
          ])
        : h('main', [h(ReturnTripSummaryDialog, { ref: dialogRef })])
  }
})

app.use(store)
app.use(language)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      {
        path: '/tms/waybill-management/detail/:id',
        name: 'TmsWaybillDetail',
        component: { template: '<div />' }
      }
    ]
  })
)
setupGlobDirectives(app)
app.mount('#return-trip-summary-preview')
