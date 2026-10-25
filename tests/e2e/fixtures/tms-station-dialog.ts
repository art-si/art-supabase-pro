import { createApp } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useUserStore } from '@/store/modules/user'
import StationDialog from '../../../modules/art-supabase-tms/src/views/station/modules/station-dialog.vue'
import MasterDataDeleteGuard, {
  type MasterDataDeleteGuardOpenOptions
} from '@/components/business/master-data-delete-guard/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const businessTenantId = '11111111-1111-4111-8111-111111111111'
const platformTenantId = '55555555-5555-4555-8555-555555555555'
const secondStationId = '44444444-4444-4444-8444-444444444444'
const previewMode = new URLSearchParams(window.location.search).get('mode')
const isPlatformAll = previewMode === 'platform-all'
const isDeleteGuardPreview = previewMode === 'delete-guard' || previewMode === 'delete-guard-batch'

const app = createApp(isDeleteGuardPreview ? MasterDataDeleteGuard : StationDialog)
const previewRouter = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/orders', name: 'TmsOrderList', component: { template: '<div />' } }
  ]
})
previewRouter.afterEach((route) => {
  document.body.dataset.previewRoute = String(route.name ?? '')
})
app.use(store)
app.use(previewRouter)
app.use(language)
setupGlobDirectives(app)

const userStore = useUserStore(store)
userStore.setUserInfo({
  userId: '22222222-2222-4222-8222-222222222222',
  tenantId: isPlatformAll ? platformTenantId : businessTenantId,
  tenant: isPlatformAll
    ? { tenantCode: 'platform', tenantName: '平台管理员租户', builtinType: 'platform' }
    : { tenantCode: 'visual-test', tenantName: '视觉验收业务租户' },
  platformSuper: isPlatformAll
} as Api.Auth.UserInfo)
userStore.setDictMap({
  tmsStationType: [
    { name: '发货站', code: 'shipping', value: 'shipping', label: '发货站', status: '1' }
  ]
})

const tenantScopeStore = useTenantScopeStore(store)
tenantScopeStore.selectedTenantId = isPlatformAll ? null : businessTenantId
tenantScopeStore.tenantOptions = [
  {
    id: platformTenantId,
    tenantCode: 'platform',
    tenantName: '平台管理员租户',
    builtinType: 'platform',
    status: '1'
  },
  {
    id: businessTenantId,
    tenantCode: 'visual-test',
    tenantName: '视觉验收业务租户',
    builtinType: 'business',
    status: '1'
  } as Api.SystemManage.TenantListItem & { id: string }
]

const preview = app.mount('#station-preview') as unknown as {
  handleOpen?: () => Promise<void>
  inspect?: (options: MasterDataDeleteGuardOpenOptions) => Promise<boolean>
}
if (isDeleteGuardPreview) {
  const dependency = {
    resourceId: businessTenantId,
    dependencyCode: 'station_order',
    recordId: '33333333-3333-4333-8333-333333333333',
    targetId: '33333333-3333-4333-8333-333333333333',
    recordNo: 'TMS-2026-0018',
    recordSummary: '到达站',
    recordStatus: '待配载',
    recordAmount: null,
    createdAt: '2026-10-01T08:00:00Z',
    cleanupAllowed: false
  }
  void preview.inspect?.({
    resourceLabel: '站点',
    resources: [
      { id: businessTenantId, label: '东区分拨站' },
      ...(previewMode === 'delete-guard-batch'
        ? [{ id: secondStationId, label: '西区发货站' }]
        : [])
    ],
    navigationResource: { type: 'station', queryKey: 'stationId' },
    dependencyMeta: {
      station_order: {
        label: '关联订单',
        unit: '单',
        description: '订单仍引用该站点。请保留或停用站点，确需删除时先处理订单关联。',
        actionLabel: '查看订单',
        routeName: 'TmsOrderList',
        order: 10
      }
    },
    fetchDependencies: async () => [
      dependency,
      ...(previewMode === 'delete-guard-batch'
        ? [{ ...dependency, resourceId: secondStationId, recordSummary: '发货站' }]
        : [])
    ]
  })
} else {
  void preview.handleOpen?.()
}
