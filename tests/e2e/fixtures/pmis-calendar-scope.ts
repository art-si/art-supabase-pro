import { createApp, h, onMounted } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import { initializeTheme, useTheme } from '@/hooks/core/useTheme'
import { SystemThemeEnum } from '@/enums/app-enum'
import CalendarWorkspace from '@pmis/views/components/calendar-workspace.vue'
import InspectionDashboardWorkspace from '@pmis/views/components/inspection-dashboard-workspace.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const scenario = new URLSearchParams(location.search).get('mode')
const darkTheme = new URLSearchParams(location.search).get('theme') === 'dark'
const configured = new URLSearchParams(location.search).get('configured') === 'true'
const mode = scenario === 'sheet' ? 'sheet' : 'detail'
const workspaceRoute =
  !configured || scenario === 'dashboard'
    ? '/'
    : mode === 'sheet'
      ? '/pmis/inspection/inspection-sheet'
      : '/pmis/inspection/inspection-detail'
const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = '22222222-2222-4222-8222-222222222222'
const scope = useTenantScopeStore(store)
const app = createApp({
  setup() {
    const { switchThemeStyles } = useTheme()
    onMounted(() => {
      if (darkTheme) switchThemeStyles(SystemThemeEnum.DARK)
    })
    return () =>
      h(
        'main',
        {
          class: 'art-page-view',
          style: { padding: '16px', minWidth: 0, '--art-full-height': 'calc(100dvh - 56px)' }
        },
        [
          h(
            'button',
            { type: 'button', onClick: () => scope.setTenantScope(tenantB) },
            '切换租户 B'
          ),
          scenario === 'dashboard'
            ? h(InspectionDashboardWorkspace)
            : h(CalendarWorkspace, { kind: 'inspection', mode })
        ]
      )
  }
})
app.use(store)
app.use(language)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: workspaceRoute, component: {} }]
})
app.use(router)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'pmis-calendar-test',
  tenantId: tenantA,
  platformSuper: true
})
scope.tenantOptions = [
  { id: tenantA, tenantCode: 'A', tenantName: '租户 A' },
  { id: tenantB, tenantCode: 'B', tenantName: '租户 B' }
]
scope.setTenantScope(tenantA)
await router.push(workspaceRoute)
await router.isReady()
initializeTheme()
document.documentElement.dataset.uiScope = 'workspace'
app.mount('#app')
