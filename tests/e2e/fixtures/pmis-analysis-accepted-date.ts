import { createApp, h, KeepAlive, onMounted, type Component } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { writePlatformTenantScopeActive, writeTenantScopeId } from '@/utils/tenant-scope-context'
import { useTheme } from '@/hooks/core/useTheme'
import { SystemThemeEnum } from '@/enums/app-enum'
import { setupGlobDirectives } from '@/directives'
import AnalysisWorkspace from '@pmis/views/components/analysis-workspace.vue'
import RepairAnalysisWorkspace from '@pmis/views/components/repair-analysis-workspace.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const params = new URLSearchParams(location.search)
const view = params.get('view')
const lifecycle = params.get('lifecycle') === '1'
const ordinary = params.get('identity') === 'ordinary'
const darkTheme = params.get('theme') === 'dark'
const ownRoute = view === 'repair' ? '/repair' : '/analysis'
const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = '22222222-2222-4222-8222-222222222222'
const user = useUserStore(store)
const scope = useTenantScopeStore(store)
user.setUserInfo({
  userId: 'pmis-analysis-date-test-A',
  tenantId: tenantA,
  platformSuper: !ordinary
})
user.setLoginStatus(true)
if (ordinary) {
  writeTenantScopeId(null)
  writePlatformTenantScopeActive(false)
} else {
  scope.tenantOptions = [
    { id: tenantA, tenantCode: 'A', tenantName: '租户 A' },
    { id: tenantB, tenantCode: 'B', tenantName: '租户 B' }
  ]
  scope.setTenantScope(tenantA)
}
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    {
      path: '/analysis',
      component: { render: () => h(AnalysisWorkspace, { kind: 'inspection' }) }
    },
    { path: '/repair', component: RepairAnalysisWorkspace },
    { path: '/other', component: { render: () => h('p', '已离开分析工作区') } }
  ]
})
const app = createApp({
  setup() {
    const { switchThemeStyles } = useTheme()
    onMounted(() => {
      if (darkTheme) switchThemeStyles(SystemThemeEnum.DARK)
    })
    return () =>
      h('main', { class: 'art-page-view min-h-screen p-4' }, [
        ...(lifecycle
          ? [
              h(
                'button',
                { type: 'button', onClick: () => void router.push('/other') },
                '离开工作区'
              ),
              h(
                'button',
                { type: 'button', onClick: () => void router.push(ownRoute) },
                '返回工作区'
              ),
              h(
                'button',
                { type: 'button', onClick: () => scope.setTenantScope(tenantB) },
                '切换租户 B'
              ),
              h(
                'button',
                {
                  type: 'button',
                  onClick: () =>
                    user.setUserInfo({
                      userId: 'pmis-analysis-date-test-B',
                      tenantId: tenantA,
                      platformSuper: false
                    })
                },
                '切换用户 B'
              )
            ]
          : []),
        lifecycle
          ? h(RouterView, null, {
              default: ({ Component: routeComponent }: { Component?: Component }) =>
                h(KeepAlive, null, routeComponent ? [h(routeComponent)] : [])
            })
          : h(RouterView)
      ])
  }
})
app.use(store)
app.use(language)
app.use(router)
setupGlobDirectives(app)
await router.push(ownRoute)
await router.isReady()
app.mount('#pmis-analysis-accepted-date')
