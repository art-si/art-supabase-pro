import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import { initializeTheme } from '@/hooks/core/useTheme'
import language from '@/locales'
import { store } from '@/store'
import { useSettingStore } from '@/store/modules/setting'
import { useUserStore } from '@/store/modules/user'
import HiddenHazardPlan from '@smis/views/dual-control-system/hidden-hazard-governance/hidden-hazard-inspection-plan/index.vue'
import HiddenHazardTracking from '@smis/views/dual-control-system/hidden-hazard-governance/hidden-hazard-governance-tracking/index.vue'
import InspectionStandard from '@smis/views/dual-control-system/risk-control/inspection-standard/index.vue'
import QualificationCatalogNavigator from '@smis/views/qualification-training/safety-qualification-management/shared/qualification-catalog-navigator.vue'
import OperationTypeNavigator from '@smis/views/special-operation-management/shared/operation-type-navigator.vue'
import type { SmisQualificationCatalogNavigationNode, SmisSpecialOperationType } from '@smis/api'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const mode = new URLSearchParams(location.search).get('mode') || 'qualification'
const tenantId = '11111111-1111-4111-8111-111111111111'
const selectedQualification = ref('all')
const selectedOperation = ref<string | null>(null)
const qualificationData: SmisQualificationCatalogNavigationNode[] = [
  {
    id: 'qualification-1',
    tenantId,
    parentId: null,
    catalogType: 'work_item',
    nodeKind: 'item',
    itemCode: 'WORK-001',
    itemName: '特种作业项目',
    sort: 1,
    status: 'enabled',
    childCount: 0
  }
]
const operationData: SmisSpecialOperationType[] = [
  {
    id: 'operation-1',
    tenantId,
    typeCode: 'OP-001',
    typeName: '动火作业',
    remark: null,
    sort: 1,
    textColor: '#c77712',
    tagStyle: 'warning',
    status: 'enabled',
    fieldCount: 0,
    fieldDefinitions: [],
    createBy: null,
    createTime: '2026-10-28T00:00:00Z',
    updateBy: null,
    updateTime: '2026-10-28T00:00:00Z'
  },
  {
    id: 'operation-voided',
    tenantId,
    typeCode: 'OP-VOID',
    typeName: '已作废类型',
    remark: null,
    sort: 2,
    textColor: null,
    tagStyle: '',
    status: 'voided',
    fieldCount: 0,
    fieldDefinitions: [],
    createBy: null,
    createTime: '2026-10-28T00:00:00Z',
    updateBy: null,
    updateTime: '2026-10-28T00:00:00Z'
  }
]
const pageByMode = {
  plan: HiddenHazardPlan,
  tracking: HiddenHazardTracking,
  standard: InspectionStandard
} as const
const app = createApp({
  render: () =>
    h(
      'main',
      { class: 'art-page-view min-w-0 p-4', style: '--art-full-height: calc(100dvh - 32px)' },
      mode in pageByMode
        ? h(pageByMode[mode as keyof typeof pageByMode])
        : h('div', { class: 'w-full max-w-[460px]', style: 'height: 520px' }, [
            mode === 'operation'
              ? h(OperationTypeNavigator, {
                  data: operationData,
                  loading: false,
                  error: null,
                  selectedId: selectedOperation.value,
                  onSelect: (id: string | null) => (selectedOperation.value = id)
                })
              : h(QualificationCatalogNavigator, {
                  data: qualificationData,
                  loading: false,
                  error: null,
                  selectedKey: selectedQualification.value,
                  title: '项目',
                  onSelect: (id: string) => (selectedQualification.value = id)
                })
          ])
    )
})

app.use(store)
initializeTheme()
document.documentElement.dataset.boxMode = useSettingStore(store).boxBorderMode
  ? 'border-mode'
  : 'shadow-mode'
app.use(language)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: { template: '<div />' } }]
})
app.use(router)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({ userId: 'identity-icon-test', tenantId, platformSuper: true })
await router.push('/')
await router.isReady()
app.mount('#app')
