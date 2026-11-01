import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElButton, ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useSettingStore } from '@/store/modules/setting'
import { initializeTheme, useTheme } from '@/hooks/core/useTheme'
import { SystemThemeEnum } from '@/enums/app-enum'
import { setupGlobDirectives } from '@/directives'
import AssemblyDetail from '@wms/views/adjustment-business/assembly/modules/assembly-detail-drawer.vue'
import IssueDetail from '@wms/views/outbound-business/outbound-request/modules/issue-request-detail-drawer.vue'
import TransferDetail from '@wms/views/transfer-business/direct-transfer/modules/direct-transfer-detail-drawer.vue'
import type { WmsAssemblyDocument, WmsDirectTransfer, WmsIssueRequest } from '@wms/api'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const tenantId = '11111111-1111-4111-8111-111111111111'
const assembly: WmsAssemblyDocument = {
  id: 'assembly-readonly',
  tenantId,
  documentNo: 'ASM-READ-001',
  warehouseId: 'warehouse',
  organizationId: 'organization',
  projectId: 'project',
  constructionNo: 'SECTION-READ-001',
  targetMaterialId: 'finished-material',
  targetBatchId: 'finished-batch',
  targetQuantity: 4,
  targetAreaSqm: 12,
  totalCost: 300,
  remark: '组装只读核对说明',
  createdAt: '2026-10-05T01:00:00Z',
  warehouse: { warehouseCode: 'WH-READ', warehouseName: '只读验收仓库' },
  targetMaterial: { materialCode: 'FIN-READ-001', materialName: '验收成品墙板' },
  targetBatch: {
    batchNo: 'FINISHED-READ-001',
    lengthMm: 1200,
    widthMm: 1000,
    thicknessMm: 50,
    bin: { binCode: 'BIN-FIN', binName: '成品库位' }
  }
}
const issue: WmsIssueRequest = {
  id: 'issue-readonly',
  tenantId,
  documentNo: 'ISSUE-READ-001',
  warehouseId: 'warehouse',
  organizationId: 'organization',
  workOrderId: 'work-order',
  projectId: 'project',
  constructionNo: 'SECTION-READ-001',
  requestType: 'production',
  applicationDate: '2026-10-05',
  documentTypeId: null,
  businessTypeId: null,
  customerId: null,
  applicantId: null,
  usingDepartmentId: null,
  status: 'fulfilled',
  remark: '领料只读核对说明',
  createdBy: 'reader',
  createdAt: '2026-10-05T01:00:00Z',
  approvedAt: '2026-10-05T02:00:00Z',
  closedAt: null,
  warehouse: { warehouseCode: 'WH-READ', warehouseName: '只读验收仓库' },
  workOrder: { workOrderNo: 'MO-READ-001' },
  applicantName: '只读申请人',
  departmentName: '制造一部'
}
const transfer: WmsDirectTransfer = {
  id: 'transfer-readonly',
  tenantId,
  sourceOrganizationId: null,
  targetOrganizationId: null,
  movementType: 'transfer',
  sourceBatchId: null,
  targetBatchId: null,
  materialId: 'material',
  quantity: 12,
  areaSqm: 24,
  referenceNo: 'TRANSFER-READ-001',
  workOrderId: null,
  projectId: 'project',
  constructionNo: 'SECTION-READ-001',
  targetProjectId: null,
  targetConstructionNo: null,
  occurredAt: '2026-10-05T01:00:00Z',
  remark: '直接调拨只读核对说明',
  material: { materialCode: 'MAT-READ-001', materialName: '验收调拨墙板' },
  sourceBatch: {
    batchNo: 'SOURCE-READ-001',
    warehouseId: 'source',
    binId: null,
    warehouse: { warehouseCode: 'WH-SOURCE', warehouseName: '验收来源仓库' },
    bin: null
  },
  targetBatch: {
    batchNo: 'TARGET-READ-001',
    warehouseId: 'target',
    binId: null,
    warehouse: { warehouseCode: 'WH-TARGET', warehouseName: '验收目标仓库' },
    bin: null
  },
  sourceOrganization: { organizationName: '验收来源库存组织' },
  targetOrganization: { organizationName: '验收目标库存组织' },
  serialMovements: [
    { serialId: 'serial-1', serial: { serialNo: 'SERIAL-READ-001' } },
    { serialId: 'serial-2', serial: { serialNo: 'SERIAL-READ-002' } }
  ]
}
const params = new URLSearchParams(location.search)
const entry = params.get('entry') || 'assembly'
const app = createApp({
  setup() {
    const assemblyRef = ref<InstanceType<typeof AssemblyDetail>>()
    const issueRef = ref<InstanceType<typeof IssueDetail>>()
    const transferRef = ref<InstanceType<typeof TransferDetail>>()
    function open() {
      if (entry === 'assembly') void assemblyRef.value?.handleOpen(assembly, '只读验收项目')
      else if (entry === 'issue') void issueRef.value?.handleOpen(issue, '只读验收项目')
      else void transferRef.value?.handleOpen(transfer, '只读验收项目')
    }
    return () =>
      h(ElConfigProvider, { locale: zhCn }, () =>
        h('main', { class: 'art-page-view p-4' }, [
          h(ElButton, { onClick: open }, () => '打开真实只读详情'),
          h(AssemblyDetail, { ref: assemblyRef }),
          h(IssueDetail, { ref: issueRef }),
          h(TransferDetail, { ref: transferRef })
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
user.setUserInfo({ userId: 'readonly-test', tenantId, platformSuper: false } as Api.Auth.UserInfo)
const scope = useTenantScopeStore(store)
scope.tenantOptions = [{ id: tenantId, tenantCode: 'TEST', tenantName: '验收租户' }]
scope.scopeOwnerUserId = 'readonly-test'
scope.setTenantScope(tenantId)
const theme = params.get('theme') === 'dark' ? SystemThemeEnum.DARK : SystemThemeEnum.LIGHT
useSettingStore(store).setGlobalTheme(theme, theme)
initializeTheme()
useTheme().switchThemeStyles(theme)
await router.push('/')
await router.isReady()
app.mount('#app')
