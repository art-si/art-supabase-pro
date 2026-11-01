import { createApp, defineAsyncComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useSettingStore } from '@/store/modules/setting'
import { SystemThemeEnum } from '@/enums/app-enum'
import { initializeTheme } from '@/hooks/core/useTheme'
import { setupGlobDirectives } from '@/directives'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

declare global {
  interface Window {
    mesReportOpenArgs?: unknown[]
  }
}

const params = new URLSearchParams(location.search),
  mode = params.get('mode') || ''
const pages = {
  event: () =>
    import('../../../modules/art-supabase-mes/src/views/production-execution/modules/execution-event-workspace.vue'),
  mold: () =>
    import('../../../modules/art-supabase-mes/src/views/production-execution/modules/mold-detail-ledger.vue'),
  reports: () =>
    import('../../../modules/art-supabase-mes/src/views/production-execution/modules/report-ledger.vue'),
  reportform: () =>
    import('../../../modules/art-supabase-mes/src/views/production-execution/modules/production-report-form.vue'),
  logs: () => import('@/views/widgets/table-query/index.vue'),
  packing: () =>
    import('../../../modules/art-supabase-mes/src/views/production-plan/packing/index.vue'),
  execution: () =>
    import('../../../modules/art-supabase-mes/src/views/production-execution/modules/production-workspace.vue'),
  dashboard: () =>
    import('../../../modules/art-supabase-pmis/src/views/components/inspection-dashboard-workspace.vue'),
  analytics: () => import('@/views/workflow/modules/workflow-analytics-panel.vue'),
  delegation: () => import('@/views/workflow/workbench/modules/workflow-delegation-dialog.vue'),
  navigator: () => import('@/components/business/production-work-center-navigator/index.vue'),
  directory: () =>
    import('../../../modules/art-supabase-hr/src/views/personnel/organization-position/index.vue'),
  vehicles: () =>
    import('../../../modules/art-supabase-vms/src/views/vehicle-archive-manage/index.vue'),
  writeoff: () =>
    import('../../../modules/art-supabase-fms/src/views/accounts-payable/writeoff/index.vue'),
  currency: () =>
    import('../../../modules/art-supabase-fms/src/views/accounting/accounting-currency/index.vue'),
  auxiliary: () =>
    import('../../../modules/art-supabase-fms/src/views/accounting/accounting-auxiliary/index.vue')
}
if (!Object.hasOwn(pages, mode)) throw new Error('Unknown scroll fixture')
const target = defineAsyncComponent(pages[mode as keyof typeof pages])
const selectedCenter = ref(''),
  selectedWorkshop = ref('shop-1'),
  saved = ref(0),
  entry = ref<{
    handleOpen?: (userId: string, tenantId: string) => Promise<void>
    open?: (...args: unknown[]) => Promise<void>
  }>()
const targetProps = () =>
  mode === 'event'
    ? {
        mode: params.get('eventMode') || 'mold',
        embedded: true,
        taskId: 'task-1',
        workCenterId: 'center-1'
      }
    : mode === 'navigator'
      ? {
          style: { width: 'min(100%,360px)', height: '560px' },
          workshops: [{ id: 'shop-1', code: 'SHOP1', name: '验收车间', path: '验收车间' }],
          workCenters: Array.from({ length: 35 }, (_, index) => ({
            id: `center-${index + 1}`,
            code: `WC${String(index + 1).padStart(2, '0')}`,
            name: `验收中心${String(index + 1).padStart(2, '0')}`
          })),
          selectedWorkshopId: selectedWorkshop.value,
          selectedWorkCenterId: selectedCenter.value,
          loading: false,
          error: '',
          showAllWorkCenters: true,
          onSelectWorkCenter: (value: string) => {
            selectedCenter.value = value
          },
          onSelectWorkshop: (value: string) => {
            selectedWorkshop.value = value
          }
        }
      : mode === 'execution'
        ? { entry: 'report' }
        : mode === 'reports'
          ? { mode: 'detail' }
          : {}
document.documentElement.style.setProperty('--art-full-height', 'calc(100vh - 32px)')
const app = createApp({
  render: () =>
    h('main', { class: 'art-page-view min-h-screen min-w-0 p-4', style: { height: '100vh' } }, [
      ...(mode === 'delegation'
        ? [
            h(
              'button',
              {
                disabled: !entry.value,
                onClick: () =>
                  entry.value?.handleOpen?.(
                    '22222222-2222-4222-8222-222222222222',
                    '11111111-1111-4111-8111-111111111111'
                  )
              },
              '打开审批委托'
            )
          ]
        : []),
      ...(mode === 'reportform'
        ? [
            h(
              'button',
              {
                disabled: !entry.value,
                onClick: () => entry.value?.open?.(...(window.mesReportOpenArgs || []))
              },
              '打开工序报工'
            ),
            h('output', { 'data-testid': 'report-saved' }, String(saved.value))
          ]
        : []),
      h(target, {
        ref: entry,
        ...targetProps(),
        onSaved: () => {
          saved.value++
        }
      })
    ])
})
app.use(store)
app.use(language)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: {} }]
})
app.use(router)
setupGlobDirectives(app)
const user = useUserStore(store)
user.setUserInfo({
  userId: '22222222-2222-4222-8222-222222222222',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
user.setDictMap({
  mesMoldRepairType: [{ label: '常规保养', value: 'repair-1', status: '1', sort: 1 }],
  mesExecutionEventStatus: [{ label: '待处理', value: 'open', status: '1', sort: 1 }],
  hrEmploymentStatus: [{ label: '在职', value: 'active', status: '1', sort: 1 }],
  fmsAuxiliarySourceType: [{ label: '手工', value: 'manual', status: '1', sort: 1 }],
  vehicleOwnership: Array.from({ length: 35 }, (_, index) => ({
    label: `车辆归属${String(index + 1).padStart(2, '0')}`,
    value: `owner-${index + 1}`,
    status: '1',
    sort: index
  })),
  vehicleType: [{ label: '验收车型', value: 'type-1', status: '1', sort: 1 }],
  fmsPayableWriteoffRelation: [
    { label: '应付核销付款', value: 'payable_payment', status: '1', sort: 1 }
  ]
})
useTenantScopeStore(store).selectedTenantId = '11111111-1111-4111-8111-111111111111'
useMenuStore(store).setButtonList(
  [
    'Hr:OrganizationPosition:View',
    'VehicleArchive:View',
    'FinancePayableWriteoff:View',
    'FinanceAccountingCurrency:View',
    'FinanceAccountingAuxiliary:View',
    'MesPacking:View',
    'MesProductionReport:View',
    'PmisInspectionDashboard:View',
    'PmisInspectionDashboard:ViewDetail',
    'MesReportDetail:View',
    'MesMoldDetail:View',
    ...(mode === 'event'
      ? [
          'MesMold',
          'MesInspection',
          'MesAndon',
          'MesException',
          'MesMiscPiecework',
          'MesMiscReport',
          'MesEquipment'
        ].flatMap((route) =>
          ['View', 'Add', 'Create', 'Edit', 'Handle', 'Repair', 'Unload'].map(
            (action) => `${route}:${action}`
          )
        )
      : [])
  ].map((name) => ({ name, path: '', type: 'button' }))
)
const theme = params.get('theme') === 'dark' ? SystemThemeEnum.DARK : SystemThemeEnum.LIGHT
useSettingStore(store).setGlobalTheme(theme, theme)
initializeTheme()
await router.push('/')
await router.isReady()
app.mount('#section-scroll-business')
