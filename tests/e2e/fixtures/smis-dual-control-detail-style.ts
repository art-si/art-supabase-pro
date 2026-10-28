import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import { initializeTheme } from '@/hooks/core/useTheme'
import type { SmisHiddenHazardLedgerRecord, SmisRiskControlInformationRecord } from '@smis/api'
import type { SmisHiddenHazardGovernanceRecord } from '../../../modules/art-supabase-smis/src/api/modules/hidden-hazard-governance'
import LedgerDrawer from '../../../modules/art-supabase-smis/src/views/dual-control-system/dual-control-checklist/hidden-hazard-governance-ledger/modules/hazard-ledger-detail-drawer.vue'
import RiskDrawer from '../../../modules/art-supabase-smis/src/views/dual-control-system/dual-control-checklist/risk-control-information-checklist/modules/risk-control-detail-drawer.vue'
import GovernanceDrawer from '../../../modules/art-supabase-smis/src/views/dual-control-system/hidden-hazard-governance/hidden-hazard-governance-tracking/modules/hazard-detail-drawer.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const kind = new URLSearchParams(location.search).get('kind')
const ledgerRecord: SmisHiddenHazardLedgerRecord = {
  id: 'ledger-test',
  hazardNo: 'HAZ-LEDGER-001',
  sourceType: 'inspection',
  description: '隐患台账身份栏布局测试',
  location: '一号车间',
  hazardLevel: 'general',
  status: 'draft',
  reporterEmployeeNo: 'EMP-001',
  reporterEmployeeName: '测试上报人',
  reportedAt: '2026-10-01T08:00:00Z',
  imageUrls: [],
  rectificationImageUrls: [],
  acceptanceImageUrls: [],
  overdue: false,
  evidenceCount: 0
}
const riskRecord: SmisRiskControlInformationRecord = {
  id: 'risk-test',
  hazardNo: 'RISK-001',
  pointNo: 'POINT-001',
  identificationLocation: '二号车间',
  organizationIds: ['org-test'],
  organizationNames: '测试责任单位',
  siteName: '二号车间',
  equipmentFacility: '测试设备',
  isSpecialEquipment: false,
  activityNames: '日常作业',
  hazardFactor: '测试危险因素',
  accidentTypes: [],
  measureCount: 0,
  linkedPositionCount: 0,
  generatedHazardCount: 0,
  riskLevelName: '一般风险',
  riskLevelColor: '#409eff'
}
const governanceRecord: SmisHiddenHazardGovernanceRecord = {
  id: 'governance-test',
  hazardNo: 'HAZ-GOV-001',
  sourceType: 'inspection',
  description: '隐患治理身份栏布局测试',
  location: '三号车间',
  hazardLevel: 'general',
  status: 'pending_approval',
  reporterEmployeeId: 'employee-test',
  reporterEmployeeNo: 'EMP-001',
  reporterEmployeeName: '测试上报人',
  reportedAt: '2026-10-01T08:00:00Z',
  imageUrls: [],
  createTime: '2026-10-01T08:00:00Z',
  updateTime: '2026-10-01T08:00:00Z'
}
const app = createApp({
  setup() {
    const ledger = ref<InstanceType<typeof LedgerDrawer>>()
    const risk = ref<InstanceType<typeof RiskDrawer>>()
    const governance = ref<InstanceType<typeof GovernanceDrawer>>()
    const open = () => {
      if (kind === 'risk') void risk.value?.handleOpen({ row: riskRecord })
      else if (kind === 'governance') void governance.value?.handleOpen({ row: governanceRecord })
      else void ledger.value?.handleOpen({ row: ledgerRecord })
    }
    return () =>
      h(ElConfigProvider, { locale: zhCn }, () =>
        h('main', { class: 'art-page-view min-w-0 p-4' }, [
          h('button', { type: 'button', onClick: open }, '打开双重预防详情'),
          h(LedgerDrawer, { ref: ledger }),
          h(RiskDrawer, { ref: risk }),
          h(GovernanceDrawer, { ref: governance })
        ])
      )
  }
})
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'smis-detail-test',
  tenantId: 'tenant-test',
  platformSuper: false
})
useUserStore(store).setDictMap({
  smisHiddenHazardGovernanceStatus: [
    {
      name: '状态',
      code: 'smisHiddenHazardGovernanceStatus',
      value: 'draft',
      label: '暂存',
      status: '1'
    },
    {
      name: '状态',
      code: 'smisHiddenHazardGovernanceStatus',
      value: 'pending_approval',
      label: '待核准',
      status: '1'
    }
  ],
  smisAccidentCategory: []
})
initializeTheme()
app.mount('#smis-detail-preview')
