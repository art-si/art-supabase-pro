import { createApp, defineAsyncComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const mode = new URLSearchParams(location.search).get('mode') || 'talent'
const active = ref(true)
const component = defineAsyncComponent(
  mode === 'skills'
    ? () => import('@hr/views/talent/skill-matrix/index.vue')
    : mode === 'risk'
      ? () => import('@hr/views/operations/workforce-risk/index.vue')
      : () => import('@hr/views/talent/talent-inventory/index.vue')
)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: {} }]
})
const app = createApp({
  setup: () => () =>
    h('main', { class: 'art-page-view p-4' }, [
      h(
        'button',
        {
          type: 'button',
          onClick: () => {
            active.value = !active.value
          }
        },
        active.value ? '离开看板' : '重新打开看板'
      ),
      active.value ? h(component) : h('p', '已离开看板')
    ])
})
app.use(store)
app.use(language)
app.use(router)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'hr-request-test',
  tenantId: 'test-tenant',
  platformSuper: true
})
await router.push('/hr-dashboard-test')
await router.isReady()
app.mount('#app')
