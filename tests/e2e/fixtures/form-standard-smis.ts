import { createApp, defineAsyncComponent, h, reactive, ref, type Component } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElButton, ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useSettingStore } from '@/store/modules/setting'
import { initializeTheme, useTheme } from '@/hooks/core/useTheme'
import { SystemThemeEnum } from '@/enums/app-enum'
import { setupGlobDirectives } from '@/directives'
import {
  fetchAntiViolationStandardList,
  fetchEquipmentLedgerDetail,
  fetchRectificationNoticeList,
  fetchSiteList,
  type SmisPersonnelChecklistRecord,
  type SmisViolationRecord
} from '@smis/api'
import {
  controlOptions,
  controlPoint,
  dictionaries,
  itemId,
  operationType,
  organization,
  permit,
  plan,
  planOptions,
  riskOptions,
  riskPoint,
  secondSafetyRiskPoint,
  readonlyAttachmentUrls,
  supplier,
  tenantId
} from './form-standard-smis-data'
import '@styles/core/tailwind.css'
import '@styles/index.scss'
import {
  category,
  inspectionCategory,
  hazardSource,
  inspection,
  material,
  materialType,
  reportOptions,
  unit,
  wasteCatalog,
  wasteCategory
} from './form-standard-smis-batch-two-data'
import {
  depreciation,
  drillPlan,
  historicalCase,
  rescuePlan
} from './form-standard-smis-batch-three-data'
import {
  issuanceStandard,
  positionControl,
  riskItem,
  riskMeasure,
  site
} from './form-standard-smis-batch-four-data'
import {
  drillRecord,
  hazardGovernance,
  hazardLedger,
  hiddenTask,
  longHazardSource,
  longRiskMeasure,
  rectification,
  riskInformation,
  riskTask,
  violation
} from './form-standard-smis-readonly-data'
import {
  accidentReport,
  announcement,
  equipment,
  equipmentCategory,
  trainingPlan,
  trainingRecord
} from './form-standard-smis-batch-six-data'

const params = new URLSearchParams(location.search)
declare global {
  interface Window {
    smisReadSessionRecord?: 'a' | 'b'
  }
}
const readSessionIds = {
  a: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  b: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
}
const readGaugeIds = {
  a: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
  b: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4'
}
const readValveIds = {
  a: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5',
  b: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb6'
}
const tenantName = params.get('tenantName') || '验收租户'
type Entry = {
  load: () => Promise<{ default: Component }>
  data: unknown
  props?: Record<string, unknown>
  embedded?: boolean
}
const entries: Record<string, Entry> = {
  'shift-calendar': {
    load: () =>
      import('@smis/views/dual-control-system/dual-control-checklist/personnel-dual-control-checklist/modules/shift-calendar-dialog.vue'),
    get data() {
      const key = window.smisReadSessionRecord ?? 'a'
      const employee: SmisPersonnelChecklistRecord = {
        id: readSessionIds[key],
        employeeNo: `EMP-${key.toUpperCase()}`,
        employeeName: key === 'a' ? '旧人员甲' : '当前人员乙',
        organizationName: '验收安全部',
        positionName: '巡检员',
        riskCount: 1,
        inspectionCount: 1,
        hazardCount: 0,
        scheduleCount: 1
      }
      return { employee, month: '2026-11' }
    }
  },
  'inspection-rectification': {
    load: () =>
      import('@smis/views/dual-control-system/hidden-hazard-governance/hidden-hazard-inspection-rectification/modules/inspection-rectification-dialog.vue'),
    get data() {
      const key = window.smisReadSessionRecord ?? 'a'
      return {
        records: [],
        selectedId: readSessionIds[key],
        loadRecords: async () =>
          (await fetchRectificationNoticeList({ rectifiableOnly: true, from: 0, to: 999 })).data
      }
    }
  },
  'violation-record': {
    load: () =>
      import('@smis/views/safety-production/anti-violation-management/violation-record/modules/violation-record-dialog.vue'),
    get data() {
      const key = window.smisReadSessionRecord ?? 'a'
      const row: SmisViolationRecord = {
        id: readSessionIds[key],
        tenantId,
        recordNo: `VIOLATION-${key.toUpperCase()}`,
        violationTime: '2026-11-18 10:00:00',
        siteId: readSessionIds[key],
        siteName: key === 'a' ? '旧场所甲' : '当前场所乙',
        checkerEmployeeId: readSessionIds[key],
        checkerName: key === 'a' ? '旧检查人甲' : '当前检查人乙',
        deductionPoints: 0,
        fineAmount: 0,
        situationDescription: key === 'a' ? '旧记录甲现场情况' : '当前记录乙现场情况',
        imageUrls: [],
        violators: [],
        items: []
      }
      return {
        mode: 'edit',
        row,
        sites: [],
        standards: [],
        loadOptions: async () => {
          const [sites, standards] = await Promise.all([
            fetchSiteList(),
            fetchAntiViolationStandardList({ status: 'enabled', from: 0, to: 999 })
          ])
          return { sites: sites.data ?? [], standards: standards.data }
        }
      }
    }
  },
  'hazard-factor-category': {
    load: () =>
      import('@smis/views/dual-control-system/risk-control/hazard-factor-category/modules/hazard-factor-category-dialog.vue'),
    data: {
      tenantId,
      tenantName,
      row: {
        id: itemId,
        tenantId,
        factorType: 'human',
        categoryCode: 'HF-TEST',
        categoryName: '验收危害因素',
        sort: 10,
        status: 'enabled',
        textColor: '#409EFF',
        tagStyle: 'primary'
      }
    }
  },
  'inspection-category': {
    load: () =>
      import('@smis/views/basic-data/inspection-category/modules/inspection-category-dialog.vue'),
    data: { row: inspectionCategory, tenantId, tenantName }
  },
  'special-operation-catalog': {
    load: () =>
      import('@smis/views/special-operation-management/shared/special-operation-catalog-dialog.vue'),
    data: {
      operationTypes: [operationType],
      presetOperationTypeId: operationType.id,
      tenantId,
      tenantName
    },
    props: {
      catalogKind: 'hazard_factor',
      title: '特殊作业危害因素',
      singular: '危害因素',
      itemLabel: '危害因素名称'
    }
  },
  'risk-map-properties': {
    load: () =>
      import('@smis/views/dual-control-system/risk-control/risk-four-color-map/modules/risk-map-property-panel.vue'),
    data: {},
    embedded: true,
    props: {
      riskColors: ['#409EFF', '#67C23A'],
      riskPoints: [],
      modelValue: reactive({
        id: itemId,
        label: '验收风险图形',
        x: 10,
        y: 10,
        width: 100,
        height: 100,
        fillColor: '#409EFF',
        fillOpacity: 1,
        borderColor: '#909399',
        borderOpacity: 1,
        borderWidth: 1,
        rotation: 0
      })
    }
  },
  'hidden-task-execution': {
    load: () =>
      import('@smis/views/dual-control-system/hidden-hazard-governance/hidden-hazard-inspection-task/modules/task-execution-dialog.vue'),
    data: { row: hiddenTask }
  },
  'risk-evaluation': {
    load: () =>
      import('@smis/views/dual-control-system/risk-control/risk-evaluation-control/modules/evaluation-dialog.vue'),
    data: { item: riskItem, tenantId }
  },
  'hazard-statistics': {
    load: () =>
      import('@smis/views/safety-production/emergency-rescue/hazard-source-ledger/modules/hazard-statistics-dialog.vue'),
    data: { organizations: [organization] }
  },
  'document-register': {
    load: () =>
      import('@smis/views/safety-production/document-center/shared/document-register-dialog.vue'),
    data: {
      mode: 'edit',
      kind: 'required_knowledge',
      categories: [{ id: itemId, categoryName: '验收分类', children: [] }],
      row: {
        id: itemId,
        categoryId: itemId,
        fileName: '验收文件',
        documentCode: 'DOCUMENT-TEST',
        effectiveDate: '2026-10-31',
        attachmentName: '验收附件.pdf',
        remark: ''
      }
    }
  },
  'work-instruction': {
    load: () =>
      import('@smis/views/basic-data/position-work-instruction/modules/work-instruction-dialog.vue'),
    data: {
      treeData: [
        {
          key: 'position:' + itemId,
          label: '验收岗位',
          description: 'POSITION-TEST',
          nodeType: 'position',
          organizationId: organization.id,
          positionId: itemId
        }
      ],
      row: {
        id: itemId,
        instructionName: '验收指导书',
        scopes: [{ scopeKey: 'position:' + itemId }],
        fileNumber: 'WI-TEST',
        fileType: 'pdf',
        uploadDate: '2026-10-31',
        versionNo: 'V1',
        fileUrl: 'https://example.invalid/original.pdf',
        originalFileName: '验收附件.pdf'
      }
    }
  },
  'risk-task-execution': {
    load: () =>
      import('@smis/views/dual-control-system/risk-control/risk-inspection-task/modules/task-execution-dialog.vue'),
    data: { row: { ...riskTask, status: 'in_progress' } }
  },
  'risk-task-cancel': {
    load: () =>
      import('@smis/views/dual-control-system/risk-control/risk-inspection-task/modules/task-action-dialog.vue'),
    data: { row: riskTask, mode: 'cancel' }
  },
  'permit-void': {
    load: () =>
      import('@smis/views/special-operation-management/shared/special-operation-workflow-dialog.vue'),
    data: { row: permit, action: 'void' }
  },
  'permit-approval': {
    load: () =>
      import('@smis/views/special-operation-management/shared/special-operation-workflow-dialog.vue'),
    data: { row: permit, action: 'start' }
  },
  'safety-risk': {
    load: () =>
      import('@smis/views/dual-control-system/risk-control/safety-risk-list/modules/safety-risk-dialog.vue'),
    data: {
      options: { riskPoints: [riskPoint, secondSafetyRiskPoint], hazardCategories: [] }
    }
  },
  'inspection-plan-page': {
    load: () =>
      import('@smis/views/dual-control-system/hidden-hazard-governance/hidden-hazard-inspection-plan/index.vue'),
    data: undefined,
    embedded: true
  },
  'hazard-governance-page': {
    load: () =>
      import('@smis/views/dual-control-system/hidden-hazard-governance/hidden-hazard-governance-tracking/index.vue'),
    data: undefined,
    embedded: true
  },
  'inspection-standard-page': {
    load: () =>
      import('@smis/views/dual-control-system/risk-control/inspection-standard/index.vue'),
    data: undefined,
    embedded: true
  },
  'hazard-workspace': {
    load: () =>
      import('@smis/views/dual-control-system/risk-control/risk-identification/modules/hazard-workspace-dialog.vue'),
    data: { riskPoint, options: riskOptions }
  },
  course: {
    load: () => import('@smis/views/qualification-training/course-management/index.vue'),
    data: undefined,
    embedded: true
  },
  exam: {
    load: () => import('@smis/views/qualification-training/exam-management/index.vue'),
    data: undefined,
    embedded: true
  },
  question: {
    load: () => import('@smis/views/qualification-training/question-bank-management/index.vue'),
    data: undefined,
    embedded: true
  },
  'training-plan': {
    load: () =>
      import('@smis/views/qualification-training/training-management/safety-training-plan/modules/training-plan-dialog.vue'),
    data: { row: trainingPlan, organizations: [{ ...organization, sort: 10 }] }
  },
  'training-record': {
    load: () =>
      import('@smis/views/qualification-training/training-management/safety-training-record/modules/training-record-dialog.vue'),
    data: { planOptions: [trainingPlan] }
  },
  'training-record-detail': {
    load: () =>
      import('@smis/views/qualification-training/training-management/safety-training-record/modules/training-record-dialog.vue'),
    data: {
      row: {
        ...trainingRecord,
        status: 'submitted',
        ...(params.get('attachments') === 'long'
          ? {
              attachmentUrls: [readonlyAttachmentUrls[0]],
              signInAttachmentUrls: [readonlyAttachmentUrls[1]]
            }
          : {})
      },
      planOptions: [trainingPlan],
      readonly: true
    }
  },
  announcement: {
    load: () =>
      import('@smis/views/safety-production/anti-violation-management/announcement-view/modules/announcement-editor-dialog.vue'),
    data: {
      row: announcement,
      categories: [{ id: itemId, categoryName: '验收公告分类' }],
      organizations: [organization]
    }
  },
  equipment: {
    load: () =>
      import('@smis/views/equipment-ledger/equipment-ledger/modules/equipment-ledger-dialog.vue'),
    get data() {
      if (!params.has('read-session'))
        return { row: equipment, categoryTree: [equipmentCategory], locationTree: [] }
      const key = window.smisReadSessionRecord ?? 'a'
      const row = {
        ...equipment,
        id: readSessionIds[key],
        equipmentCode: `EQ-${key.toUpperCase()}`,
        equipmentName: key === 'a' ? '旧设备甲' : '当前设备乙',
        pressureGaugeIds: [readGaugeIds[key]],
        safetyValveIds: [readValveIds[key]]
      }
      return {
        row,
        loadDetail: async () => (await fetchEquipmentLedgerDetail(row.id)).data || row,
        categoryTree: [equipmentCategory],
        locationTree: []
      }
    }
  },
  'accident-report': {
    load: () =>
      import('@smis/views/safety-production/safety-accident/accident-flash-report/modules/accident-report-dialog.vue'),
    data: {
      row: accidentReport,
      organizations: [
        {
          id: organization.id,
          name: organization.organizationName,
          code: organization.organizationCode
        }
      ]
    }
  },
  'hazard-ledger-detail': {
    load: () =>
      import('@smis/views/dual-control-system/dual-control-checklist/hidden-hazard-governance-ledger/modules/hazard-ledger-detail-drawer.vue'),
    data: {
      row: {
        ...hazardLedger,
        ...(params.get('longValues') === '1' ? longHazardSource : {})
      }
    }
  },
  'risk-information-detail': {
    load: () =>
      import('@smis/views/dual-control-system/dual-control-checklist/risk-control-information-checklist/modules/risk-control-detail-drawer.vue'),
    data: {
      row: {
        ...riskInformation,
        ...(params.get('longValues') === '1'
          ? {
              measures: riskInformation.measures?.map((measure) => ({
                ...measure,
                ...longRiskMeasure
              }))
            }
          : {})
      }
    }
  },
  'hazard-governance-detail': {
    load: () =>
      import('@smis/views/dual-control-system/hidden-hazard-governance/hidden-hazard-governance-tracking/modules/hazard-detail-drawer.vue'),
    data: { row: hazardGovernance }
  },
  'hazard-workflow-icon': {
    load: () =>
      import('@smis/views/dual-control-system/hidden-hazard-governance/hidden-hazard-governance-tracking/modules/hazard-workflow-dialog.vue'),
    data: { mode: 'approve', row: { ...hazardGovernance, status: 'pending_approval' } }
  },
  'rectification-detail': {
    load: () =>
      import('@smis/views/dual-control-system/hidden-hazard-governance/hidden-hazard-inspection-rectification/modules/inspection-rectification-detail-dialog.vue'),
    data: rectification
  },
  'hidden-task-detail': {
    load: () =>
      import('@smis/views/dual-control-system/hidden-hazard-governance/hidden-hazard-inspection-task/modules/task-detail-drawer.vue'),
    data: { row: hiddenTask }
  },
  'risk-task-detail': {
    load: () =>
      import('@smis/views/dual-control-system/risk-control/risk-inspection-task/modules/task-detail-drawer.vue'),
    data: { row: riskTask }
  },
  'violation-detail': {
    load: () =>
      import('@smis/views/safety-production/anti-violation-management/three-violation-education/modules/three-violation-detail-dialog.vue'),
    data: violation
  },
  'drill-record-detail': {
    load: () =>
      import('@smis/views/safety-production/emergency-rescue/shared/emergency-record-detail-dialog.vue'),
    data: { kind: 'record', row: drillRecord }
  },
  'position-control': {
    load: () => import('@smis/views/basic-data/position-risk-list/modules/risk-control-dialog.vue'),
    data: {
      organizationId: organization.id,
      organizationName: organization.organizationName,
      positionId: positionControl.positionId,
      positionName: '验收安全岗',
      positionCode: 'POST-SMIS',
      row: positionControl
    }
  },
  site: {
    load: () => import('@smis/views/basic-data/site/modules/site-dialog.vue'),
    data: { organizations: [organization], sites: [], row: site }
  },
  measure: {
    load: () =>
      import('@smis/views/dual-control-system/risk-control/risk-evaluation-control/modules/measure-dialog.vue'),
    data: { item: riskItem, row: riskMeasure }
  },
  'operation-type': {
    load: () =>
      import('@smis/views/special-operation-management/operation-type/modules/operation-type-dialog.vue'),
    data: { row: operationType, tenantId, tenantName }
  },
  'issuance-standard': {
    load: () => import('@smis/views/safety-production/shared/issuance-standard-dialog.vue'),
    data: { row: issuanceStandard },
    props: { kind: 'ppe' }
  },
  'rescue-plan': {
    load: () =>
      import('@smis/views/safety-production/emergency-rescue/emergency-rescue-plan/modules/emergency-plan-dialog.vue'),
    data: {
      row: rescuePlan,
      organizations: [organization],
      positions: rescuePlan.applicablePositions
    }
  },
  'drill-plan': {
    load: () =>
      import('@smis/views/safety-production/emergency-rescue/emergency-drill-plan/modules/drill-plan-dialog.vue'),
    data: { row: drillPlan, organizations: [organization] }
  },
  'drill-record': {
    load: () =>
      import('@smis/views/safety-production/emergency-rescue/emergency-drill-record/modules/drill-record-dialog.vue'),
    data: { planOptions: [drillPlan] }
  },
  'historical-case': {
    load: () =>
      import('@smis/views/safety-production/safety-accident/historical-accident-cases/modules/historical-accident-case-dialog.vue'),
    data: { row: historicalCase, organizations: [organization] }
  },
  depreciation: {
    load: () =>
      import('@smis/views/equipment-ledger/equipment-depreciation/modules/equipment-depreciation-dialog.vue'),
    data: { row: depreciation }
  },
  'rescue-plan-detail': {
    load: () =>
      import('@smis/views/safety-production/emergency-rescue/shared/emergency-record-detail-dialog.vue'),
    data: { kind: 'rescue', row: rescuePlan }
  },
  'drill-plan-detail': {
    load: () =>
      import('@smis/views/safety-production/emergency-rescue/shared/emergency-record-detail-dialog.vue'),
    data: { kind: 'drill', row: drillPlan }
  },
  'inspection-declaration': {
    load: () =>
      import('@smis/views/equipment-ledger/inspection-declaration/modules/inspection-declaration-dialog.vue'),
    data: { row: inspection }
  },
  'public-report': {
    load: () =>
      import('@smis/views/dual-control-system/hidden-hazard-governance/public-hidden-hazard-report/modules/public-report-dialog.vue'),
    data: reportOptions
  },
  'hazard-source': {
    load: () =>
      import('@smis/views/safety-production/emergency-rescue/hazard-source-ledger/modules/hazard-source-dialog.vue'),
    data: { row: hazardSource, ...reportOptions }
  },
  'hazard-source-detail': {
    load: () =>
      import('@smis/views/safety-production/emergency-rescue/hazard-source-ledger/modules/hazard-source-detail-drawer.vue'),
    data: hazardSource
  },
  material: {
    load: () =>
      import('@smis/views/safety-production/protective-equipment-management/material-information/modules/material-dialog.vue'),
    data: { row: material, categoryTree: [category], units: [unit], materialTypes: [materialType] }
  },
  'material-detail': {
    load: () =>
      import('@smis/views/safety-production/protective-equipment-management/material-information/modules/material-detail-drawer.vue'),
    data: material
  },
  'waste-catalog': {
    load: () =>
      import('@smis/views/hazardous-waste-management/hazardous-waste-catalog/modules/catalog-dialog.vue'),
    data: { row: wasteCatalog, categories: [wasteCategory] }
  },
  supplier: {
    load: () => import('@smis/views/basic-data/supplier/modules/supplier-dialog.vue'),
    data: { row: supplier }
  },
  'risk-point': {
    load: () =>
      import('@smis/views/dual-control-system/risk-control/risk-identification/modules/risk-point-dialog.vue'),
    data: { row: riskPoint, options: riskOptions }
  },
  'risk-control-plan': {
    load: () =>
      import('@smis/views/dual-control-system/risk-control/risk-classification-control/modules/risk-control-plan-dialog.vue'),
    data: {
      row: {
        ...controlPoint,
        assignments: controlPoint.assignments.map((item) => ({
          ...item,
          duplicateConfigurationId:
            params.get('missing') === 'frequency' ? '' : item.duplicateConfigurationId
        }))
      },
      options: controlOptions
    }
  },
  'inspection-plan': {
    load: () =>
      import('@smis/views/dual-control-system/hidden-hazard-governance/hidden-hazard-inspection-plan/modules/plan-dialog.vue'),
    data: { row: plan, options: planOptions }
  },
  permit: {
    load: () =>
      import('@smis/views/special-operation-management/shared/special-operation-permit-dialog.vue'),
    data: {
      row: permit,
      mode: 'edit',
      operationTypes: [operationType],
      aiPrecheckPermission: 'SmisSpecialOperationWorkbench:AiPrecheck',
      tenantId
    }
  },
  'permit-detail': {
    load: () =>
      import('@smis/views/special-operation-management/shared/special-operation-permit-detail-dialog.vue'),
    data: { row: permit },
    props: {
      operationTypes: [operationType],
      printPermission: 'SmisSpecialOperationWorkbench:Print'
    }
  },
  'inspection-plan-detail': {
    load: () =>
      import('@smis/views/dual-control-system/hidden-hazard-governance/hidden-hazard-inspection-plan/modules/plan-detail-drawer.vue'),
    data: { row: plan }
  }
}
const entry = entries[params.get('entry') || 'supplier']
const CurrentDialog = defineAsyncComponent(entry.load)
const app = createApp({
  setup() {
    const dialog = ref<{ handleOpen: (data: unknown) => Promise<void> }>()
    const saved = ref('尚未保存')
    const completedOpens = ref(0)
    const open = async () => {
      try {
        await dialog.value?.handleOpen(entry.data)
      } finally {
        completedOpens.value++
      }
    }
    return () =>
      h(ElConfigProvider, { locale: zhCn }, () =>
        h('main', { class: 'art-page-view p-4', style: '--art-full-height: calc(100dvh - 32px)' }, [
          !entry.embedded &&
            h(ElButton, { disabled: !dialog.value, onClick: open }, () => '打开真实 SMIS 入口'),
          h('output', { 'data-testid': 'save-result' }, saved.value),
          params.has('read-session') &&
            h(
              'output',
              { 'data-testid': 'read-open-completions', hidden: true },
              String(completedOpens.value)
            ),
          h(CurrentDialog, {
            ...entry.props,
            ref: dialog,
            onSuccess: () => {
              saved.value = '已保存'
            }
          })
        ])
      )
  }
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
  userId: 'form-standard-test',
  userName: '验收管理员',
  tenantId,
  platformSuper: !params.has('ordinary')
} as Api.Auth.UserInfo)
if (params.has('ordinary'))
  useMenuStore(store).setButtonList(
    [
      'SmisDualControlHiddenHazardInspectionPlan:View',
      'SmisDualControlHiddenHazardInspectionTask:View',
      'SmisDualControlRiskInspectionTask:View',
      'SmisSafetyTrainingRecord:View'
    ].map((name) => ({
      name,
      path: '',
      type: 'button',
      meta: { title: name }
    }))
  )
const scope = useTenantScopeStore(store)
scope.tenantOptions = [{ id: tenantId, tenantCode: 'TEST', tenantName }]
scope.scopeOwnerUserId = 'form-standard-test'
scope.setTenantScope(tenantId)
user.setDictMap(dictionaries)
const settings = useSettingStore(store)
const theme = params.get('theme') === 'dark' ? SystemThemeEnum.DARK : SystemThemeEnum.LIGHT
settings.setGlobalTheme(theme, theme)
initializeTheme()
useTheme().switchThemeStyles(theme)
document.documentElement.dataset.uiScope = 'workspace'
document.documentElement.dataset.boxMode = settings.boxBorderMode ? 'border-mode' : 'shadow-mode'
await router.push('/')
await router.isReady()
app.mount('#app')
