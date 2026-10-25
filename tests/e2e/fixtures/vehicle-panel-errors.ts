import { createApp, h } from 'vue'
import { createPinia } from 'pinia'
import i18n from '@/locales'
import '@/assets/styles/core/tailwind.css'
import '@/assets/styles/index.scss'
import Panel0 from '@vms/views/vehicle-query/modules/accident-panel.vue'
import Panel1 from '@vms/views/vehicle-query/modules/inspection-panel.vue'
import Panel2 from '@vms/views/vehicle-query/modules/maintenance-panel.vue'
import Panel3 from '@vms/views/vehicle-query/modules/insurance-panel.vue'
import Panel4 from '@vms/views/vehicle-query/modules/parts-panel.vue'
import Panel5 from '@vms/views/vehicle-query/modules/mileage-panel.vue'
import Panel6 from '@vms/views/vehicle-query/modules/routine-inspection-panel.vue'
import Panel7 from '@vms/views/vehicle-query/modules/violation-panel.vue'
const panels = {
  accident: Panel0,
  inspection: Panel1,
  maintenance: Panel2,
  insurance: Panel3,
  parts: Panel4,
  mileage: Panel5,
  'routine-inspection': Panel6,
  violation: Panel7
}
const key = new URLSearchParams(location.search).get('panel')
const component = Object.entries(panels).find(([name]) => name === key)?.[1] ?? Panel0
createApp({
  render: () =>
    h(component, { vehicle: { id: 'panel-test', plateNo: '测试车辆', vehicleType: 'test' } })
})
  .use(createPinia())
  .use(i18n)
  .mount('#app')
