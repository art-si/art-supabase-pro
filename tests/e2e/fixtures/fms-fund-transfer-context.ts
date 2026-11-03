import { KeepAlive, createApp, defineComponent, h, type Component } from 'vue'
import { RouterView, createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import { SystemThemeEnum } from '@/enums/app-enum'
import { useAuth } from '@/hooks/core/useAuth'
import { initializeTheme } from '@/hooks/core/useTheme'
import language from '@/locales'
import { store } from '@/store'
import { useMenuStore } from '@/store/modules/menu'
import { useSettingStore } from '@/store/modules/setting'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useUserStore } from '@/store/modules/user'
import { financePaths, financeRouteNames } from '@/router/business-paths'
import FundTransfer from '@fms/views/treasury/fund-transfer/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const query = new URLSearchParams(location.search)
const platformSuper = !query.has('ordinary')
const permissions = [
  'FinanceFundTransfer:View',
  'FinanceFundTransfer:Submit',
  'FinanceFundTransfer:Approve',
  'FinanceFundTransfer:Reject',
  'FinanceFundTransfer:Execute',
  'FinanceFundTransfer:Reverse'
]
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    {
      path: financePaths.fundTransfer,
      name: financeRouteNames.fundTransfer,
      component: FundTransfer
    },
    {
      path: '/fund-transfer-context/other',
      name: 'FundTransferContextOther',
      component: { render: () => h('div', { 'data-testid': 'other-route' }, '其他页面') }
    }
  ]
})

const user = useUserStore(store)
user.setUserInfo({ userId: 'fund-transfer-context-user', tenantId: tenantA, platformSuper })
const scope = useTenantScopeStore(store)
scope.tenantOptions = [
  { id: tenantA, tenantCode: 'A', tenantName: '测试租户 A' },
  { id: tenantB, tenantCode: 'B', tenantName: '测试租户 B' }
]
scope.setTenantScope(tenantA)
const menu = useMenuStore(store)
function setPermissions(names: readonly string[]): void {
  menu.setButtonList(
    names.map((name) => ({ name, path: '', type: 'button', meta: { title: name } }))
  )
}
setPermissions(permissions)

const Fixture = defineComponent({
  setup() {
    const { hasAuth } = useAuth()
    return () =>
      h('main', { class: 'art-page-view min-w-0 p-4' }, [
        h('div', { class: 'flex min-w-0 flex-wrap gap-2', 'data-testid': 'context-controls' }, [
          h(
            'output',
            { class: 'min-w-0 break-all', 'data-testid': 'current-context' },
            `${router.currentRoute.value.path}:${scope.effectiveTenantId ?? 'all'}`
          ),
          h(
            'output',
            { class: 'w-full min-w-0 break-all', 'data-testid': 'permission-state' },
            menu.buttonList.map((item) => item.name).join(',')
          ),
          h(
            'output',
            { 'data-testid': 'submit-allowed' },
            String(hasAuth('FinanceFundTransfer:Submit'))
          ),
          h(
            'button',
            {
              type: 'button',
              'data-testid': 'switch-route',
              onClick: () => void router.push('/fund-transfer-context/other')
            },
            '切换测试路由'
          ),
          h(
            'button',
            {
              type: 'button',
              'data-testid': 'switch-tenant',
              onClick: () => scope.setTenantScope(tenantB)
            },
            '切换测试租户'
          ),
          ...(['submit', 'approve', 'reject', 'execute', 'reverse'] as const).map((action) =>
            h(
              'button',
              {
                type: 'button',
                'data-testid': `revoke-${action}`,
                onClick: () =>
                  setPermissions(
                    permissions.filter(
                      (name) =>
                        name !== `FinanceFundTransfer:${action[0].toUpperCase()}${action.slice(1)}`
                    )
                  )
              },
              `撤销${action}权限`
            )
          )
        ]),
        h(RouterView, null, {
          default: ({ Component: current }: { Component?: Component }) =>
            h(KeepAlive, null, { default: () => (current ? h(current) : null) })
        })
      ])
  }
})

const app = createApp(Fixture)
app.use(store)
const settings = useSettingStore(store)
settings.systemThemeType =
  query.get('theme') === 'dark' ? SystemThemeEnum.DARK : SystemThemeEnum.LIGHT
settings.systemThemeMode = settings.systemThemeType
settings.boxBorderMode = query.get('box') !== 'shadow'
initializeTheme()
document.documentElement.dataset.boxMode = settings.boxBorderMode ? 'border-mode' : 'shadow-mode'
app.use(language)
app.use(router)
setupGlobDirectives(app)
await router.replace(financePaths.fundTransfer)
await router.isReady()
app.mount('#fms-fund-transfer-context')
