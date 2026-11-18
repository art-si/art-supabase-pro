import { createApp, defineAsyncComponent, h, type Component } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useSettingStore } from '@/store/modules/setting'
import { initializeTheme } from '@/hooks/core/useTheme'
import { SystemThemeEnum } from '@/enums/app-enum'
import { setupGlobDirectives } from '@/directives'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const pages = import.meta.glob<Component>(
  '../../../modules/art-supabase-hr/src/views/**/index.vue',
  { import: 'default' }
)
const page = new URLSearchParams(location.search).get('page')
const ordinary = new URLSearchParams(location.search).get('role') === 'ordinary'
const readEntry =
  page === 'personnel/organization-design'
    ? { name: 'HrOrganizationDesign', permission: 'Hr:OrganizationDesign:View' }
    : page === 'operations/policy-acknowledgement'
      ? { name: 'HrPolicyAcknowledgement', permission: 'Hr:PolicyAcknowledgement:View' }
      : page === 'operations/self-service'
        ? { name: 'HrSelfService', permission: 'Hr:SelfService:View' }
        : page === 'talent/performance'
          ? { name: 'HrPerformance', permission: 'Hr:Performance:View' }
          : undefined
const loader = pages[`../../../modules/art-supabase-hr/src/views/${page}/index.vue`]
if (!page || !loader) throw new Error('Unknown HR page fixture')
document.documentElement.style.setProperty('--art-full-height', 'calc(100vh - 32px)')
const component = defineAsyncComponent(loader)
const themeParam = new URLSearchParams(location.search).get('theme')
const scopeControls = new URLSearchParams(location.search).has('scope-test')
const routeControls = new URLSearchParams(location.search).has('route-test')
let routeQueryVersion = 0
const homeTenant = '11111111-1111-4111-8111-111111111111'
const otherTenant = '22222222-2222-4222-8222-222222222222'
const app = createApp({
  render: () =>
    h(ElConfigProvider, { locale: zhCn }, () =>
      h('main', { class: 'art-page-view', style: { padding: '16px', minWidth: 0 } }, [
        h(component),
        ...(scopeControls
          ? [
              h('div', { style: { position: 'fixed', top: 0, left: 0, zIndex: 9999 } }, [
                h(
                  'button',
                  { onClick: () => tenantScope.setTenantScope(homeTenant) },
                  '切换平台租户'
                ),
                h(
                  'button',
                  { onClick: () => tenantScope.setTenantScope(otherTenant) },
                  '切换业务租户'
                )
              ])
            ]
          : []),
        ...(routeControls
          ? [
              h(
                'button',
                {
                  type: 'button',
                  onClick: () =>
                    void router.replace({
                      path: router.currentRoute.value.path,
                      query: {
                        ...router.currentRoute.value.query,
                        race: String(++routeQueryVersion)
                      }
                    })
                },
                '切换同页查询'
              ),
              h(
                'output',
                { 'data-testid': 'hr-route-full-path' },
                router.currentRoute.value.fullPath
              )
            ]
          : [])
      ])
    )
})
app.use(store)
const tenantScope = useTenantScopeStore(store)
if (scopeControls) {
  tenantScope.tenantOptions = [
    { id: homeTenant, tenantName: '平台租户', tenantCode: 'PLATFORM', status: '1' },
    { id: otherTenant, tenantName: '业务租户', tenantCode: 'BUSINESS', status: '1' }
  ]
}
if (themeParam) {
  const theme = themeParam === 'dark' ? SystemThemeEnum.DARK : SystemThemeEnum.LIGHT
  useSettingStore(store).setGlobalTheme(theme, theme)
}
initializeTheme()
document.documentElement.dataset.uiScope = 'workspace'
document.documentElement.dataset.boxMode = useSettingStore(store).boxBorderMode
  ? 'border-mode'
  : 'shadow-mode'
app.use(language)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: {} },
    ...(readEntry ? [{ path: `/hr/${page}`, name: readEntry.name, component: {} }] : []),
    { path: '/employee/:id', component: {} }
  ]
})
app.use(router)
setupGlobDirectives(app)
const userStore = useUserStore(store)
userStore.setUserInfo({
  userId: 'hr-all-pages-test',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: !ordinary
})
if (page === 'operations/self-service' || page === 'talent/performance')
  await userStore.fetchDictList()
if (ordinary && readEntry) {
  useMenuStore(store).setButtonList([
    { name: readEntry.permission, type: 'button', path: '', meta: { title: readEntry.permission } }
  ])
  await router.push(`/hr/${page}`)
  await router.isReady()
}
if (page === 'personnel/employee-detail')
  await router.push('/employee/11111111-1111-4111-8111-111111111113')
app.mount('#hr-all-pages')
