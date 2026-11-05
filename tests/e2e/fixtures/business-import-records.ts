import { createApp, defineComponent, h, KeepAlive, ref, watchEffect } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import { useMenuStore } from '@/store/modules/menu'
import { useUserStore } from '@/store/modules/user'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import CustomerPage from '@mdm/views/components/operational-master/index.vue'
import ProcessRoutePage from '@mdm/views/process-master/process-route/index.vue'
import ManufacturingPage from '@mes/views/components/manufacturing/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const params = new URLSearchParams(window.location.search)
const mode = params.get('mode')
const routeContextMode = mode === 'route' && params.get('context') === 'true'
const visualMode = routeContextMode && params.get('visual') === 'true'
const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = '22222222-2222-4222-8222-222222222222'
const routeActive = ref(true)
const RouteContextHost = defineComponent({
  setup: () => () =>
    h(KeepAlive, null, {
      default: () => (routeActive.value ? h(ProcessRoutePage) : h('div'))
    })
})
const RouteVisualHost = defineComponent({
  setup: () => () =>
    h('main', { class: 'art-page-view min-w-0 p-4', style: { height: '100vh' } }, [
      h(RouteContextHost)
    ])
})
const app = createApp(
  mode === 'customer'
    ? CustomerPage
    : mode === 'route'
      ? routeContextMode
        ? visualMode
          ? RouteVisualHost
          : RouteContextHost
        : ProcessRoutePage
      : ManufacturingPage
)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: {} }]
})
app.use(store)
app.use(language)
app.use(router)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: params.get('identity') === 'missing' ? '' : 'import-test-user',
  tenantId: params.get('identity') === 'missing' ? '' : tenantA,
  platformSuper: routeContextMode && params.get('role') !== 'ordinary'
})
if (routeContextMode) {
  const scope = useTenantScopeStore(store)
  scope.scopeOwnerUserId = useUserStore(store).getUserInfo.userId ?? null
  scope.tenantOptions = [
    { id: tenantA, tenantCode: 'A', tenantName: '测试租户 A' },
    { id: tenantB, tenantCode: 'B', tenantName: '测试租户 B' }
  ]
  scope.selectedTenantId = tenantA
  watchEffect(() => {
    document.body.dataset.importTenant = scope.effectiveTenantId ?? 'all'
    document.body.dataset.importSelectedTenant = scope.selectedTenantId ?? 'all'
  })
  const controls = document.createElement('div')
  controls.hidden = visualMode
  for (const [id, label, tenantId] of [
    ['scope-all', '全部租户', null],
    ['scope-b', '选择租户 B', tenantB]
  ] as const) {
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.testid = id
    button.textContent = label
    button.addEventListener('click', () => scope.setTenantScope(tenantId))
    controls.append(button)
  }
  if (params.get('role') === 'ordinary') {
    const forgeScope = document.createElement('button')
    forgeScope.type = 'button'
    forgeScope.dataset.testid = 'forge-scope-b'
    forgeScope.textContent = '伪造存储的租户 B'
    forgeScope.addEventListener('click', () => (scope.selectedTenantId = tenantB))
    controls.append(forgeScope)
  }
  const revokeImport = document.createElement('button')
  revokeImport.type = 'button'
  revokeImport.dataset.testid = 'revoke-import'
  revokeImport.textContent = '撤销导入权限'
  revokeImport.addEventListener('click', () => setImportPermission(false))
  controls.append(revokeImport)
  const restoreImport = document.createElement('button')
  restoreImport.type = 'button'
  restoreImport.dataset.testid = 'restore-import'
  restoreImport.textContent = '恢复导入权限'
  restoreImport.addEventListener('click', () => setImportPermission(true))
  controls.append(restoreImport)
  const deactivate = document.createElement('button')
  deactivate.type = 'button'
  deactivate.dataset.testid = 'deactivate-route'
  deactivate.textContent = '停用页面'
  deactivate.addEventListener('click', () => (routeActive.value = false))
  controls.append(deactivate)
  const activate = document.createElement('button')
  activate.type = 'button'
  activate.dataset.testid = 'activate-route'
  activate.textContent = '激活页面'
  activate.addEventListener('click', () => (routeActive.value = true))
  controls.append(activate)
  document.body.prepend(controls)
}
function setImportPermission(allowed: boolean): void {
  useMenuStore(store).setButtonList(
    ['MdmSalesCustomer', 'MdmProcessRoute', 'MesWorkOrder'].flatMap((name) =>
      (allowed ? ['View', 'Import'] : ['View']).map((action) => ({
        name: `${name}:${action}`,
        type: 'button',
        path: '',
        meta: { title: action }
      }))
    )
  )
}
setImportPermission(true)
await router.push(
  mode === 'customer'
    ? '/sales-master/customer'
    : mode === 'route'
      ? '/process-master/process-route'
      : '/manufacturing/work-order'
)
await router.isReady()
app.mount('#business-import-preview')
