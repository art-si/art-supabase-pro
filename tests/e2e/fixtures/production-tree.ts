import { createApp, defineAsyncComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const scenario = new URLSearchParams(location.search).get('scenario')
const component = defineAsyncComponent(
  scenario === 'scheduling'
    ? () => import('@mes/views/production-plan/scheduling/index.vue')
    : scenario === 'execution'
      ? () => import('@mes/views/production-execution/modules/production-workspace.vue')
      : scenario === 'workstation'
        ? () => import('@mdm/views/process-master/workstation/index.vue')
        : scenario === 'gantt'
          ? () => import('@mes/views/production-plan/gantt-scheduling/index.vue')
          : () => import('@mes/views/components/manufacturing/index.vue')
)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: {} }]
})
const app = createApp({
  setup: () => () => h('main', { class: 'art-page-view art-full-height p-4' }, [h(component)])
})
app.use(store)
app.use(language)
app.use(router)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'tree-test',
  tenantId: 'test-tenant',
  platformSuper: true
})
await router.push('/production-scope-test')
await router.isReady()
app.mount('#app')
