import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import VehicleTypeTab from '@vms/views/vehicle-archive-edit/modules/vehicle-type-tab.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const ownTenant = '11111111-1111-4111-8111-111111111111'
const otherTenant = '22222222-2222-4222-8222-222222222222'
const params = new URLSearchParams(location.search)
const platformSuper = params.get('role') !== 'ordinary'
const userStore = useUserStore(store)
userStore.setUserInfo({
  userId: 'vehicle-type-test-user',
  tenantId: ownTenant,
  platformSuper,
  nickName: '车型验收用户'
})
userStore.setLoginStatus(true)
userStore.setDictMap({
  vehicleTypeCategory: ['半挂车', '按载重'].map((label, sort) => ({
    name: label,
    label,
    value: label,
    code: label,
    status: '1',
    sort
  })),
  commonEnabledStatus: [
    { label: '启用', value: 'enabled', code: 'enabled', status: '1', sort: 0 },
    { label: '禁用', value: 'disabled', code: 'disabled', status: '1', sort: 1 }
  ],
  vehicleOperationStatus: [
    { label: '运营中', value: 'running', code: 'running', status: '1', sort: 0 }
  ]
})
useMenuStore(store).setButtonList(
  [
    'VehicleArchive:TabTypes',
    'VehicleArchive:TypeAdd',
    'VehicleArchive:TypeEdit',
    'VehicleArchive:TypeDelete'
  ].map((name) => ({ name, path: '', type: 'button', meta: { title: name } }))
)
const tenantScope = useTenantScopeStore(store)
tenantScope.tenantOptions = [
  { id: ownTenant, tenantCode: 'OWN', tenantName: '本租户' },
  { id: otherTenant, tenantCode: 'OTHER', tenantName: '目标租户' }
]
if (platformSuper && params.get('header') === 'selected') tenantScope.setTenantScope(ownTenant)
if (!platformSuper && params.has('forge')) {
  sessionStorage.setItem('art-platform-tenant-scope-id', otherTenant)
}

const target = ref<string | null>(
  params.get('target') === 'none' ? null : params.get('target') || ownTenant
)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/vms/vehicle-archive-edit', component: { render: () => h('div') } },
    {
      path: '/vms/vehicle-archive-detail/:id',
      name: 'VehicleArchiveDetail',
      component: { render: () => h('div') }
    },
    { path: '/vms/trailer-manage', name: 'TrailerManage', component: { render: () => h('div') } },
    { path: '/tms/basic-data/driver', name: 'TmsDriver', component: { render: () => h('div') } }
  ]
})
const app = createApp({
  setup() {
    return () => {
      const catalogTenantId =
        target.value || tenantScope.effectiveTenantId || userStore.getUserInfo.tenantId || ''
      const contextKey = `${catalogTenantId}:${tenantScope.effectiveTenantId}:${tenantScope.isAllTenants}:${tenantScope.revision}:${userStore.getUserInfo.userId}:${userStore.getUserInfo.tenantId}`
      return h('main', { class: 'art-page-view min-h-screen p-4' }, [
        h('div', { class: 'mb-3 flex flex-wrap gap-2' }, [
          h(
            'button',
            { type: 'button', onClick: () => (target.value = ownTenant) },
            '父表单选本租户'
          ),
          h(
            'button',
            { type: 'button', onClick: () => (target.value = otherTenant) },
            '父表单选目标租户'
          ),
          h('button', { type: 'button', onClick: () => (target.value = null) }, '清空父表单租户'),
          h(
            'button',
            { type: 'button', onClick: () => tenantScope.setTenantScope(ownTenant) },
            '顶部选择本租户'
          ),
          h(
            'button',
            { type: 'button', onClick: () => tenantScope.setTenantScope(null) },
            '顶部全部租户'
          ),
          h(
            'button',
            {
              type: 'button',
              onClick: () =>
                userStore.setUserInfo({
                  ...userStore.getUserInfo,
                  userId: 'vehicle-type-second-user'
                })
            },
            '同租户切换身份'
          )
        ]),
        h('output', { 'aria-label': '父表单租户' }, target.value ?? '未指定'),
        h('output', { 'aria-label': '当前业务路由' }, router.currentRoute.value.fullPath),
        h(VehicleTypeTab, { key: contextKey, tenantId: target.value })
      ])
    }
  }
})
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)
await router.push('/vms/vehicle-archive-edit')
await router.isReady()
app.mount('#vms-vehicle-type-scope')
