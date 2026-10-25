import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import Geofence from '@/views/system/geofence-config/index.vue'
import Part from '@vms/views/vehicle-manage/part-manage-detail/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const part = new URLSearchParams(location.search).get('mode') === 'part'
const app = createApp({ render: () => h(part ? Part : Geofence) })
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: { render: () => null } },
    { path: '/detail/:id', component: { render: () => null } }
  ]
})
app.use(store)
app.use(language)
app.use(router)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'number-locale-test',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
await router.push('/detail/number-locale-test')
await router.isReady()
app.mount('#app')
