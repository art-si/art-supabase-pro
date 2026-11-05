import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { setLocalGlobalFocusPreference } from '@/hooks/core/useGlobalFocusPreference'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const fixtureParams = new URLSearchParams(location.search)
const mode = fixtureParams.get('mode')
const globalFocusEnabled = fixtureParams.has('global-focus')
const { default: Page } =
  mode === 'designer'
    ? await import('@/views/workflow/definition/modules/workflow-designer-workspace.vue')
    : mode === 'definition'
      ? await import('@/views/workflow/definition/index.vue')
      : mode === 'monitor'
        ? await import('@/views/workflow/monitor/index.vue')
        : mode === 'analytics'
          ? await import('@/views/workflow/analytics/index.vue')
          : mode === 'reference'
            ? await import('@/views/system/user/index.vue')
            : await import('@/views/workflow/workbench/index.vue')
const userStore = useUserStore(store)
userStore.setUserInfo({
  userId: 'workflow-focus-user',
  tenantId: 'workflow-focus-tenant',
  platformSuper: true
})
if (globalFocusEnabled) userStore.setLoginStatus(true)

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: {} }]
})
const app = createApp({
  render: () =>
    h(
      'main',
      {
        class: 'art-page-view',
        style: {
          display: 'flex',
          flexDirection: 'column',
          height: 'calc(100vh - 24px)',
          minHeight: '0',
          padding: '12px',
          overflow: 'hidden',
          '--art-full-height': 'calc(100vh - 48px)'
        }
      },
      [mode === 'designer' ? h(Page, { definitionId: 'definition-a' }) : h(Page)]
    )
})
app.use(store)
if (globalFocusEnabled) {
  setLocalGlobalFocusPreference(true)
  Object.assign(window, { setGlobalFocusPreference: setLocalGlobalFocusPreference })
}
app.use(language)
app.use(router)
setupGlobDirectives(app)
await router.isReady()
app.mount('#workflow-focus-preview')
