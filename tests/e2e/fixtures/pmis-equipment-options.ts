import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import {
  fetchPmisEquipmentOptions,
  fetchPmisEquipmentSnapshot,
  type PmisEquipmentOption
} from '@pmis/api'
import CalendarWorkspace from '@pmis/views/components/calendar-workspace.vue'
import EquipmentSelect from '@pmis/views/components/equipment-select.vue'
import InspectionDashboardWorkspace from '@pmis/views/components/inspection-dashboard-workspace.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = '22222222-2222-4222-8222-222222222222'
const view = new URLSearchParams(location.search).get('view') ?? 'dashboard'
const scope = useTenantScopeStore(store)
const selectedTenant = ref(tenantA)
const selectedEquipment = ref<string>()
const selectedData = ref<PmisEquipmentOption[]>([])
const apiStatus = ref('idle')
const apiCount = ref(0)
const apiTotal = ref(0)
let equipmentController: AbortController | undefined
let activeSnapshotParams: { keyword: string; departmentId: string; tenantId: string } | undefined

const changeTenant = (): void => {
  selectedTenant.value = tenantB
  scope.setTenantScope(tenantB)
}
const fetchApi = async (complete: boolean): Promise<void> => {
  equipmentController?.abort()
  const controller = new AbortController()
  equipmentController = controller
  apiStatus.value = 'loading'
  apiCount.value = 0
  try {
    const params = {
      keyword: '泵',
      departmentId: 'department-a',
      tenantId: selectedTenant.value
    }
    activeSnapshotParams = params
    if (complete) {
      const rows = await fetchPmisEquipmentSnapshot(params, {
        signal: controller.signal,
        showErrorMessage: false
      })
      if (controller.signal.aborted) {
        apiStatus.value = 'cancelled'
        return
      }
      apiCount.value = rows.length
      apiTotal.value = rows.length
    } else {
      const page = await fetchPmisEquipmentOptions(
        { ...params, current: 1, size: 20 },
        { signal: controller.signal, showErrorMessage: false }
      )
      if (controller.signal.aborted) {
        apiStatus.value = 'cancelled'
        return
      }
      apiCount.value = page.data.length
      apiTotal.value = page.total
    }
    apiStatus.value = 'success'
  } catch {
    apiStatus.value = controller.signal.aborted ? 'cancelled' : 'error'
  } finally {
    if (equipmentController === controller) equipmentController = undefined
  }
}

const app = createApp({
  render: () =>
    h('main', { class: 'art-page-view min-w-0 p-4' }, [
      h('button', { type: 'button', onClick: changeTenant }, '切换租户 B'),
      view === 'api'
        ? [
            h('button', { type: 'button', onClick: () => void fetchApi(false) }, '加载单页20'),
            h('button', { type: 'button', onClick: () => void fetchApi(true) }, '加载完整设备'),
            h(
              'button',
              { type: 'button', onClick: () => equipmentController?.abort() },
              '取消设备读取'
            ),
            h(
              'button',
              {
                type: 'button',
                onClick: () => {
                  if (!activeSnapshotParams) return
                  activeSnapshotParams.keyword = '变更后关键词'
                  activeSnapshotParams.departmentId = 'department-b'
                }
              },
              '更改请求条件'
            ),
            h('output', { 'data-testid': 'api-status' }, apiStatus.value),
            h('output', { 'data-testid': 'api-count' }, String(apiCount.value)),
            h('output', { 'data-testid': 'api-total' }, String(apiTotal.value))
          ]
        : view === 'selector'
          ? h(EquipmentSelect, {
              modelValue: selectedEquipment.value,
              selectedData: selectedData.value,
              tenantId: selectedTenant.value,
              'onUpdate:modelValue': (value: string | undefined) => {
                selectedEquipment.value = value
              },
              'onUpdate:selectedData': (rows: PmisEquipmentOption[]) => {
                selectedData.value = rows
              }
            })
          : view === 'calendar'
            ? h(CalendarWorkspace, { kind: 'inspection', mode: 'detail' })
            : h(InspectionDashboardWorkspace)
    ])
})
app.use(store)
app.use(language)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: {} }]
})
app.use(router)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'pmis-equipment-options-test',
  tenantId: tenantA,
  platformSuper: true
})
scope.tenantOptions = [
  { id: tenantA, tenantCode: 'A', tenantName: '租户 A' },
  { id: tenantB, tenantCode: 'B', tenantName: '租户 B' }
]
scope.setTenantScope(tenantA)
await router.push('/')
await router.isReady()
app.mount('#app')
