import { createApp, defineComponent, h, ref } from 'vue'
import { ElButton, ElConfigProvider } from 'element-plus'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { store } from '@/store'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import ArtButtonMore, {
  type ButtonMoreItem
} from '@/components/core/forms/art-button-more/index.vue'
import HazardLedgerDetailDrawer from '../../../modules/art-supabase-smis/src/views/dual-control-system/dual-control-checklist/hidden-hazard-governance-ledger/modules/hazard-ledger-detail-drawer.vue'
import type { SmisHiddenHazardLedgerRecord } from '@smis/api'
import VehicleAccident from '../../../modules/art-supabase-vms/src/views/vehicle-manage/accident-record-detail/index.vue'
import VehicleMaintenance from '../../../modules/art-supabase-vms/src/views/vehicle-manage/maintenance-record-detail/index.vue'
import VehicleInspection from '../../../modules/art-supabase-vms/src/views/vehicle-manage/routine-inspection-detail/index.vue'
import VehicleInsurance from '../../../modules/art-supabase-vms/src/views/vehicle-manage/vehicle-insurance-detail/index.vue'
import VehicleAnnualInspection from '../../../modules/art-supabase-vms/src/views/vehicle-manage/vehicle-inspection-detail/index.vue'
import VehiclePartUsage from '../../../modules/art-supabase-vms/src/views/vehicle-manage/part-manage-detail/index.vue'
import { initializeTheme } from '@/hooks/core/useTheme'
import BusinessAttachmentRowActions from '@/components/business/business-attachment-row-actions/index.vue'
import ProfitAnalysis from '../../../modules/art-supabase-fms/src/views/settlement/waybill-profit/modules/waybill-profit-analysis-drawer.vue'
import CollectionAdvisor from '../../../modules/art-supabase-fms/src/views/workbench/modules/receivables-collection-advisor-drawer.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const record: SmisHiddenHazardLedgerRecord = {
  id: 'date-hazard',
  hazardNo: 'DATE-001',
  sourceType: 'inspection',
  description: '测试日期显示',
  location: '测试检查区',
  hazardLevel: 'general',
  status: 'draft',
  reporterEmployeeNo: 'DATE-EMP',
  reporterEmployeeName: '测试上报人',
  reportedAt: '2026-10-08T00:30:00Z',
  approvedAt: 'invalid',
  rectificationDeadline: '',
  rectificationCompletedAt: null,
  acceptedAt: '2026-10-08T02:45:59Z',
  closedAt: null,
  imageUrls: [],
  rectificationImageUrls: [],
  acceptanceImageUrls: [],
  overdue: false,
  evidenceCount: 0,
  events: [{ id: 'event-date', title: '测试流转日期', eventAt: 'invalid', evidenceUrls: [] }]
}

const Preview = defineComponent({
  setup() {
    const drawer = ref<InstanceType<typeof HazardLedgerDetailDrawer> | null>(null)
    const profit = ref<InstanceType<typeof ProfitAnalysis> | null>(null)
    const collection = ref<InstanceType<typeof CollectionAdvisor> | null>(null)
    const selected = ref('尚未选择')
    const removable = ref(false)
    const removed = ref(0)
    const attachmentActions = new URLSearchParams(location.search).has('attachmentActions')
    const explicitClick = new URLSearchParams(location.search).has('click')
    if (new URLSearchParams(location.search).has('compactActions')) {
      return () =>
        h(ElConfigProvider, { size: 'small' }, () =>
          h('main', { class: 'art-icon-label' }, [
            h(ElButton, { plain: true }, () => '批量打印'),
            h(
              ArtButtonMore,
              {
                trigger: 'click',
                list: [{ key: 'preview', label: '查看说明', auth: 'Fixture:View' }]
              },
              { trigger: () => h(ElButton, { plain: true }, () => '下推') }
            )
          ])
        )
    }
    if (new URLSearchParams(location.search).has('detailLayout')) return () => h(RouterView)
    return () =>
      h('main', [
        ...(attachmentActions
          ? [
              h(BusinessAttachmentRowActions, {
                file: { url: 'https://example.com/test.pdf', name: '测试附件.pdf' },
                removable: removable.value,
                onRemove: () => removed.value++
              }),
              h(
                'button',
                { type: 'button', onClick: () => (removable.value = !removable.value) },
                '切换附件编辑权限'
              ),
              h('p', { 'data-testid': 'attachment-remove-count' }, String(removed.value))
            ]
          : []),
        h(RouterView),
        h(
          'button',
          { type: 'button', onClick: () => void profit.value?.handleOpen() },
          '打开利润日期验收'
        ),
        h(
          'button',
          { type: 'button', onClick: () => void collection.value?.handleOpen() },
          '打开回款日期验收'
        ),
        h(ProfitAnalysis, { ref: profit }),
        h(CollectionAdvisor, { ref: collection }),
        h(ArtButtonMore, {
          trigger: explicitClick ? 'click' : undefined,
          list: [
            { key: 'preview', label: '查看说明', auth: 'Fixture:View' },
            { key: 'disabled', label: '禁用操作', disabled: true, auth: 'Fixture:View' },
            { key: 'denied', label: '未授权操作', auth: 'Fixture:Denied' }
          ],
          onClick: (item: ButtonMoreItem) => {
            selected.value = String(item.key)
          }
        }),
        h('p', { role: 'status' }, selected.value),
        h(
          'button',
          { type: 'button', onClick: () => void drawer.value?.handleOpen({ row: record }) },
          '打开日期验收'
        ),
        h(HazardLedgerDetailDrawer, { ref: drawer })
      ])
  }
})
const app = createApp(Preview)
app.use(store)
app.use(language)
setupGlobDirectives(app)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: { render: () => null } },
    { path: '/accident/:id', component: VehicleAccident },
    { path: '/maintenance/:id', component: VehicleMaintenance },
    { path: '/inspection/:id', component: VehicleInspection },
    { path: '/insurance/:id', component: VehicleInsurance },
    { path: '/annual-inspection/:id', component: VehicleAnnualInspection },
    { path: '/part/:id', component: VehiclePartUsage }
  ]
})
app.use(router)
useUserStore(store).setUserInfo({
  userId: 'date-test-user',
  tenantId: 'date-test-tenant',
  platformSuper: false
})
if (new URLSearchParams(location.search).has('detailLayout')) {
  initializeTheme()
  useUserStore(store).setDictMap({
    vehiclePartUsageStatus: [{ label: '已报废', value: 'scrapped' }],
    vehicleRecordProcessed: [{ label: '已处理', value: 'true' }],
    vehicleMaintenanceType: [{ label: '常规保养', value: 'routine' }],
    vehicleRoutineInspectionType: [{ label: '出车检查', value: 'pre_trip' }],
    vehicleRoutineInspectionResult: [{ label: '合格', value: 'passed' }]
  })
}
useMenuStore(store).setButtonList([
  { name: 'Fixture:View', path: '', type: 'button', meta: { title: '查看说明' } }
])
const vehicle = new URLSearchParams(location.search).get('vehicle')
await router.push(vehicle ? `/${vehicle}/display-test` : '/')
await router.isReady()
app.mount('#date-preview')
