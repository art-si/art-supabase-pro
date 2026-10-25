import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import VehicleSummary from '@vms/views/vehicle-query/modules/vehicle-query-summary.vue'
import ReceiptPanel from '@tms/views/delivery-management/modules/waybill-receipt-ocr-panel.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const dates = ['2026-10-09 12:34:56', '', 'invalid', '12:34']
const stage = ref(0)
const app = createApp({
  render: () =>
    h('main', { class: 'art-page-view min-h-screen flex flex-col gap-4 p-4' }, [
      h(
        'button',
        {
          type: 'button',
          onClick: () => {
            stage.value = (stage.value + 1) % dates.length
          }
        },
        '切换日期样本'
      ),
      h(VehicleSummary, {
        vehicle: {
          plateNo: '测试车辆',
          vehicleType: '',
          invoiceDate: dates[stage.value],
          startUseDate: ''
        },
        summary: { runningMileage: 12345.6 }
      }),
      h(ReceiptPanel, {
        order: { id: 'test-order', orderNo: '测试运单', plannedArrivalTime: dates[stage.value] }
      })
    ])
})
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: {} }]
})
app.use(store)
app.use(language)
app.use(router)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'format-test',
  tenantId: 'test-tenant',
  platformSuper: false
})
await router.push('/')
await router.isReady()
app.mount('#business-date-formatting')
