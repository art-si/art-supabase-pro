import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import { initializeTheme } from '@/hooks/core/useTheme'
import language from '@/locales'
import { store } from '@/store'
import { useSettingStore } from '@/store/modules/setting'
import { useMenuStore } from '@/store/modules/menu'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useUserStore } from '@/store/modules/user'
import { writePlatformTenantScopeActive, writeTenantScopeId } from '@/utils/tenant-scope-context'
import ArtPageContent from '@/components/core/layouts/art-page-content/index.vue'
import SafetyInspectionPage from '@smis/views/dual-control-system/risk-control/safety-inspection/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = '22222222-2222-4222-8222-222222222222'
const params = new URLSearchParams(window.location.search)
const isPlatformSuper = params.get('role') !== 'ordinary'
const initialScope =
  params.get('scope') === 'b' ? tenantB : params.get('scope') === 'all' ? null : tenantA
const scope = useTenantScopeStore(store)
const app = createApp({
  render: () =>
    h('main', { class: 'art-page-view min-w-0 p-4' }, [
      h(
        'button',
        {
          hidden: true,
          'data-testid': 'change-scope-b',
          onClick: () => scope.setTenantScope(tenantB)
        },
        '切换到租户 B'
      ),
      h(
        'button',
        {
          hidden: true,
          'data-testid': 'revoke-delete',
          onClick: () =>
            useMenuStore(store).setButtonList(
              ['View', 'Add', 'Edit'].map((action) => ({
                name: `SmisDualControlSafetyInspection:${action}`,
                path: '',
                type: 'button',
                meta: { title: action }
              }))
            )
        },
        '撤销删除权限'
      ),
      h(ArtPageContent)
    ])
})

app.use(store)
initializeTheme()
document.documentElement.dataset.boxMode = useSettingStore(store).boxBorderMode
  ? 'border-mode'
  : 'shadow-mode'
app.use(language)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: SafetyInspectionPage },
    {
      path: '/smis/basic-data/position-risk-list',
      name: 'SmisPositionRiskList',
      component: { template: '<div>风险管控记录</div>' }
    }
  ]
})
app.use(router)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'smis-safety-write-tenant-test',
  tenantId: tenantA,
  tenant: {
    tenantCode: 'A',
    tenantName: '租户 A',
    builtinType: isPlatformSuper ? 'platform' : 'business'
  },
  platformSuper: isPlatformSuper
} as Api.Auth.UserInfo)
if (!isPlatformSuper)
  useMenuStore(store).setButtonList(
    ['View', 'Add', 'Edit', 'Delete'].map((action) => ({
      name: `SmisDualControlSafetyInspection:${action}`,
      path: '',
      type: 'button',
      meta: { title: action }
    }))
  )
scope.tenantOptions =
  params.get('tenantOptions') === 'fetch'
    ? []
    : [
        { id: tenantA, tenantCode: 'A', tenantName: '租户 A', builtinType: 'platform' },
        { id: tenantB, tenantCode: 'B', tenantName: '租户 B', builtinType: 'business' }
      ]
scope.scopeOwnerUserId = 'smis-safety-write-tenant-test'
scope.setTenantScope(initialScope)
writePlatformTenantScopeActive(isPlatformSuper)
if (!isPlatformSuper && params.get('forge') === 'b') {
  scope.selectedTenantId = tenantB
  writeTenantScopeId(tenantB)
}
await router.push('/')
await router.isReady()
app.mount('#app')
