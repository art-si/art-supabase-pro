import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import Insurance from '@vms/views/reminder-manage/insurance-expiry/index.vue'
import Inspection from '@vms/views/reminder-manage/inspection-expiry/index.vue'
import Maintenance from '@vms/views/reminder-manage/maintenance-expiry/index.vue'
import Part from '@vms/views/reminder-manage/part-service-life/index.vue'
import Vehicle from '@vms/views/reminder-manage/vehicle-service-life/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const params = new URLSearchParams(location.search)
document.documentElement.classList.toggle('dark', params.get('theme') === 'dark')
document.documentElement.dataset.boxMode = params.get('box') ?? 'border-mode'
const pages = {
  insurance: Insurance,
  inspection: Inspection,
  maintenance: Maintenance,
  part: Part,
  vehicle: Vehicle
}
const mode = params.get('mode')
const component = mode && mode in pages ? pages[mode as keyof typeof pages] : Insurance
const app = createApp({
  render: () => h('main', { class: 'art-page-view h-screen p-4' }, [h(component)])
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
  userId: 'reminder-controls-test',
  tenantId: 'test-tenant',
  platformSuper: false
})
await router.push(
  params.has('linked') ? '/?fromMasterDelete=1&sourceKey=source-test&recordId=record-test' : '/'
)
await router.isReady()
app.mount('#vehicle-reminder-controls')
