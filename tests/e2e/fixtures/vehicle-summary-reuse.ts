import { createApp, h } from 'vue'
import { createPinia } from 'pinia'
import Archive from '@vms/views/vehicle-query/modules/archive-panel.vue'
import { useUserStore } from '@/store/modules/user'
import Summary from '@vms/views/vehicle-query/modules/vehicle-query-summary.vue'
import { setupGlobDirectives } from '@/directives'
import '@/assets/styles/core/tailwind.css'
import '@/assets/styles/index.scss'
const app = createApp({
  render: () =>
    h('main', { class: 'p-4' }, [
      new URLSearchParams(location.search).has('archive')
        ? h(Archive, {
            vehicle: {
              id: 'test',
              plateNo: '测试车辆',
              companyName: '测试机构',
              fieldAccess: { documents: 'read' }
            }
          })
        : h(Summary, {
            vehicle: {
              id: 'test',
              plateNo: '测试车辆',
              companyName: '测试机构',
              manufacturer: '厂商',
              startUseDate: new URLSearchParams(location.search).get('start') ?? undefined,
              fieldAccess: { vehicleIdentifiers: 'hidden' }
            },
            summary: { runningMileage: 12345.67 }
          })
    ])
})
const store = createPinia()
app.use(store)
if (new URLSearchParams(location.search).has('archive'))
  useUserStore(store).setUserInfo({ userId: 'test', platformSuper: true })
setupGlobDirectives(app)
app.mount('#app')
