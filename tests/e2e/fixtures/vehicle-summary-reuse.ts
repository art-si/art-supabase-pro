import { createApp, h, ref } from 'vue'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import Archive from '@vms/views/vehicle-query/modules/archive-panel.vue'
import FuelCardSourcePanel from '@vms/views/vehicle-query/modules/fuel-card-source-panel.vue'
import { useUserStore } from '@/store/modules/user'
import Summary from '@vms/views/vehicle-query/modules/vehicle-query-summary.vue'
import { setupGlobDirectives } from '@/directives'
import '@/assets/styles/core/tailwind.css'
import '@/assets/styles/index.scss'
const energyKind = ref<'archive' | 'ledger'>('archive')
const app = createApp({
  render: () =>
    h('main', { class: 'p-4' }, [
      new URLSearchParams(location.search).has('electric')
        ? h('div', [
            h(
              'button',
              { type: 'button', onClick: () => (energyKind.value = 'archive') },
              '电卡档案'
            ),
            h(
              'button',
              { type: 'button', onClick: () => (energyKind.value = 'ledger') },
              '电卡流水'
            ),
            h(FuelCardSourcePanel, {
              kind: energyKind.value,
              energy: 'electric',
              vehicleId: 'test-vehicle-id'
            })
          ])
        : new URLSearchParams(location.search).has('archive')
          ? h(Archive, {
              vehicle: {
                id: 'test',
                plateNo: '测试车辆',
                companyName: '测试机构',
                fieldAccess: { documents: 'read' },
                startUseDate: new URLSearchParams(location.search).get('start') ?? undefined
              },
              summary: { runningMileage: 12345.67 }
            })
          : h(Summary, {
              vehicle: {
                id: 'test',
                plateNo: '测试车辆',
                companyName: '测试机构',
                manufacturer: '厂商',
                vehicleType: '半挂车',
                specLengthM: 17.5,
                volumeM3: 130,
                loadTons: 32,
                startUseDate: new URLSearchParams(location.search).get('start') ?? undefined,
                fieldAccess: { vehicleIdentifiers: 'hidden' }
              },
              summary: { runningMileage: 12345.67 },
              showBack: true
            })
    ])
})
const store = createPinia()
app.use(store)
app.use(createRouter({ history: createMemoryHistory(), routes: [] }))
if (
  new URLSearchParams(location.search).has('archive') ||
  new URLSearchParams(location.search).has('electric')
)
  useUserStore(store).setUserInfo({ userId: 'test', platformSuper: true })
setupGlobDirectives(app)
app.mount('#app')
