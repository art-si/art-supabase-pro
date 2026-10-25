import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import Routes from '@tms/views/route-performance/index.vue'
import Capacity from '@tms/views/capacity-planning/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const params = new URLSearchParams(location.search)
document.documentElement.classList.toggle('dark', params.get('theme') === 'dark')
document.documentElement.dataset.boxMode = params.get('box') ?? 'border-mode'
const component = params.get('mode') === 'capacity' ? Capacity : Routes
const app = createApp({
  render: () => h('main', { class: 'art-page-view h-screen overflow-auto p-4' }, [h(component)])
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
  userId: 'overview-test',
  tenantId: 'test-tenant',
  platformSuper: false
})
useMenuStore(store).setButtonList(
  ['TmsRoutePerformance:View', 'TmsCapacityPlanning:View'].map((name) => ({
    name,
    path: '',
    type: 'button',
    meta: { title: name }
  }))
)
await router.push('/')
await router.isReady()
app.mount('#transport-overview-states')
