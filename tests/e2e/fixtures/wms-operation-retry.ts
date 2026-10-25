import { createApp, defineComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import { store } from '@/store'
import type { WmsProductionMaterialKind } from '../../../modules/art-supabase-wms/src/api/production-material.types'
import type {
  WmsIssueRequest,
  WmsTransferDocument,
  WmsSerial
} from '../../../modules/art-supabase-wms/src/api/warehouse.types'
import ReceiveDialog from '../../../modules/art-supabase-wms/src/views/transfer-business/step-transfer/modules/transfer-receive-dialog.vue'
import SerialDialog from '../../../modules/art-supabase-wms/src/views/inventory-trace/serial-trace/modules/serial-action-dialog.vue'
import TransferCreateDialog from '../../../modules/art-supabase-wms/src/views/transfer-business/step-transfer/modules/transfer-create-dialog.vue'
import AdjustmentDialog from '../../../modules/art-supabase-wms/src/views/adjustment-business/adjustment/modules/adjustment-dialog.vue'
import AssemblyDialog from '../../../modules/art-supabase-wms/src/views/adjustment-business/assembly/modules/assembly-dialog.vue'
import AssemblyDetail from '../../../modules/art-supabase-wms/src/views/adjustment-business/assembly/modules/assembly-detail-drawer.vue'
import CountCreateDialog from '../../../modules/art-supabase-wms/src/views/count-business/count/modules/count-create-dialog.vue'
import SectionDialog from '../../../modules/art-supabase-wms/src/views/project-warehouse/project-section/modules/section-dialog.vue'
import IssueCreateDialog from '../../../modules/art-supabase-wms/src/views/outbound-business/outbound-request/modules/issue-request-create-dialog.vue'
import ProductionDrawer from '../../../modules/art-supabase-wms/src/views/production-inout/shared/production-material-drawer.vue'
import CountAdjustmentDrawer from '../../../modules/art-supabase-wms/src/views/count-business/modules/count-adjustment-drawer.vue'
import TransferRequestDrawer from '../../../modules/art-supabase-wms/src/views/transfer-business/transfer-request/modules/transfer-request-drawer.vue'
import TransferBusinessDrawer from '../../../modules/art-supabase-wms/src/views/transfer-business/shared/transfer-business-drawer.vue'
import IssuePostDialog from '../../../modules/art-supabase-wms/src/views/outbound-business/outbound-request/modules/issue-request-post-dialog.vue'
import ProjectTransferDialog from '../../../modules/art-supabase-wms/src/views/inventory-trace/stock/modules/project-transfer-dialog.vue'
import { useUserStore } from '@/store/modules/user'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useMenuStore } from '@/store/modules/menu'
import ReceiptBinDialog from '@/components/business/scm-receipt-target-workspace/modules/receipt-bin-dialog.vue'
import ReceiptSerialDialog from '@/components/business/scm-receipt-target-workspace/modules/receipt-serial-dialog.vue'
import WmsBinPicker from '../../../modules/art-supabase-wms/src/views/shared/wms-bin-picker.vue'
import type { ScmReceiptTargetLine } from '@/api/scm-receipt-target'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const productionKinds: WmsProductionMaterialKind[] = [
  'issue',
  'return',
  'finished_inbound',
  'finished_return'
]
const requestedKind = new URLSearchParams(location.search).get('kind')
const productionKind = productionKinds.find((kind) => kind === requestedKind) || 'issue'

const transfer: WmsTransferDocument = {
  id: 'transfer-test',
  tenantId: 'tenant-test',
  sourceOrganizationId: 'source-org',
  targetOrganizationId: 'target-org',
  documentNo: 'TRANSFER-TEST-001',
  sourceBatchId: 'batch-test',
  sourceWarehouseId: 'source-warehouse',
  targetWarehouseId: 'target-warehouse',
  targetBinId: null,
  targetBatchId: null,
  materialId: 'material-test',
  quantity: 2,
  areaSqm: null,
  serialIds:
    new URLSearchParams(window.location.search).get('transferSerialManaged') === 'true'
      ? ['transfer-serial-1', 'transfer-serial-2']
      : [],
  projectId: null,
  constructionNo: null,
  status: 'in_transit',
  remark: null,
  createdAt: '2026-10-05',
  dispatchedAt: '2026-10-05',
  receivedAt: null,
  targetWarehouse: {
    warehouseCode: 'TEST-WH',
    warehouseName: '测试目标仓库',
    enableLocations: true
  },
  targetOrganization: { organizationName: '测试目标组织' }
}
const serial: WmsSerial = {
  id: 'serial-test',
  tenantId: 'tenant-test',
  organizationId: 'source-org',
  serialNo: 'SN-TEST-001',
  workOrderId: 'order-test',
  materialId: 'material-test',
  batchId: 'batch-test',
  projectId: null,
  constructionNo: null,
  parentSerialId: null,
  reservedWorkOrderId: null,
  consumedWorkOrderId: null,
  status: 'in_stock',
  warehouseId: 'source-warehouse',
  binId: null,
  createTime: '2026-10-05'
}
const issueRequest: WmsIssueRequest = {
  id: 'issue-test',
  tenantId: 'tenant-test',
  documentNo: 'ISSUE-TEST-001',
  warehouseId: 'source-warehouse',
  organizationId: 'source-org',
  workOrderId: 'order-test',
  projectId: 'project-test',
  constructionNo: 'TEST-SECTION-001',
  requestType: 'production',
  applicationDate: '2026-10-05',
  documentTypeId: null,
  businessTypeId: null,
  customerId: null,
  applicantId: null,
  usingDepartmentId: null,
  status: 'approved',
  remark: null,
  createdBy: 'user-test',
  createdAt: '2026-10-05',
  approvedAt: '2026-10-05',
  closedAt: null
}
const app = createApp(
  defineComponent({
    setup() {
      const pickerQuantity = ref(2)
      const pickerBin = ref<string | null>(null)
      const receive = ref<InstanceType<typeof ReceiveDialog>>()
      const receiptBin = ref<InstanceType<typeof ReceiptBinDialog>>()
      const receiptSerial = ref<InstanceType<typeof ReceiptSerialDialog>>()
      const receiptLine: ScmReceiptTargetLine = {
        id: 'receipt-line-test',
        sourceLineId: 'source-line-test',
        lineSnapshot: {
          materialId: 'material-test',
          materialCode: 'RECEIPT-MAT-001',
          materialDescription: '测试收料物料',
          stockQuantity: 2,
          warehouseId: 'receipt-warehouse'
        },
        serialNos: [],
        serialManagementEnabled: true,
        amount: 2
      }
      const serialDialog = ref<InstanceType<typeof SerialDialog>>()
      const transferCreate = ref<InstanceType<typeof TransferCreateDialog>>()
      const adjustment = ref<InstanceType<typeof AdjustmentDialog>>()
      const assembly = ref<InstanceType<typeof AssemblyDialog>>()
      const assemblyDetail = ref<InstanceType<typeof AssemblyDetail>>()
      const countCreate = ref<InstanceType<typeof CountCreateDialog>>()
      const section = ref<InstanceType<typeof SectionDialog>>()
      const issueCreate = ref<InstanceType<typeof IssueCreateDialog>>()
      const production = ref<InstanceType<typeof ProductionDrawer>>()
      const countAdjustment = ref<InstanceType<typeof CountAdjustmentDrawer>>()
      const transferRequest = ref<InstanceType<typeof TransferRequestDrawer>>()
      const transferBusiness = ref<InstanceType<typeof TransferBusinessDrawer>>()
      const issuePost = ref<InstanceType<typeof IssuePostDialog>>()
      const projectTransfer = ref<InstanceType<typeof ProjectTransferDialog>>()
      const context = {
        tenantId: 'tenant-test',
        projects: new URLSearchParams(location.search).has('sectionProjects')
          ? ['active', 'closed', 'cancelled', 'disabled', 'other-tenant'].map((state) => ({
              id: `project-${state}`,
              tenantId: state === 'other-tenant' ? 'other-tenant' : 'tenant-test',
              projectCode: `PROJECT-${state.toUpperCase()}`,
              projectName: `测试项目 ${state}`,
              projectStatus: state === 'closed' || state === 'cancelled' ? state : 'active',
              enabled: state !== 'disabled'
            }))
          : []
      }
      return () =>
        h(
          ElConfigProvider,
          { locale: zhCn },
          {
            default: () =>
              h('div', [
                h(
                  'button',
                  { type: 'button', onClick: () => useUserStore(store).clearDictionaryCache() },
                  '测试清空字典缓存'
                ),
                ...(new URLSearchParams(location.search).has('binPicker')
                  ? [
                      h(
                        'button',
                        {
                          onClick: () => {
                            pickerQuantity.value = pickerQuantity.value === 2 ? 3 : 2
                          }
                        },
                        '切换选位数量'
                      ),
                      h('p', `选位数量 ${pickerQuantity.value}`),
                      h(WmsBinPicker, {
                        modelValue: pickerBin.value,
                        'onUpdate:modelValue': (value: string | null) => {
                          pickerBin.value = value
                        },
                        warehouseId: 'target-warehouse',
                        materialId: 'material-test',
                        quantity: pickerQuantity.value,
                        enabled: true,
                        bins: [
                          {
                            id: 'old-bin',
                            warehouseId: 'target-warehouse',
                            binCode: 'OLD',
                            binName: '旧推荐库位',
                            status: 'available',
                            supportsSerial: true
                          },
                          {
                            id: 'new-bin',
                            warehouseId: 'target-warehouse',
                            binCode: 'NEW',
                            binName: '当前推荐库位',
                            status: 'available',
                            supportsSerial: true
                          }
                        ]
                      })
                    ]
                  : []),
                h(
                  'button',
                  {
                    onClick: () =>
                      issuePost.value?.handleOpen({
                        request: issueRequest,
                        projectName: '测试项目',
                        line: {
                          id: 'line-test',
                          requestId: 'issue-test',
                          materialId: 'material-test',
                          requestedQuantity: 2,
                          issuedQuantity: 0,
                          material: {
                            materialCode: 'MAT-TEST',
                            materialName: '测试序列号物料',
                            serialManagementEnabled: true
                          }
                        }
                      })
                  },
                  '测试办理领料'
                ),
                h(
                  'button',
                  {
                    onClick: () =>
                      projectTransfer.value?.handleOpen({
                        batchId: 'batch-test',
                        batchNo: 'BATCH-TEST-001',
                        materialName: '测试物料',
                        quantity: 2,
                        sourceProjectName: '测试来源项目',
                        tenantId: 'tenant-test'
                      })
                  },
                  '测试项目调拨'
                ),
                h(IssuePostDialog, { ref: issuePost }),
                h(ProjectTransferDialog, { ref: projectTransfer }),
                h('button', { onClick: () => receive.value?.handleOpen(transfer) }, '测试调拨收货'),
                h(
                  'button',
                  { onClick: () => serialDialog.value?.handleOpen({ action: 'reserve', serial }) },
                  '测试 SN 预留'
                ),
                h(
                  'button',
                  { onClick: () => serialDialog.value?.handleOpen({ action: 'bind', serial }) },
                  '测试 SN 绑定'
                ),
                h(ReceiveDialog, { ref: receive }),
                h(
                  'button',
                  {
                    onClick: () =>
                      receiptBin.value?.handleOpen({
                        tenantId: 'tenant-test',
                        documentNo: 'RECEIPT-001',
                        line: receiptLine
                      })
                  },
                  '测试收料库位'
                ),
                h(
                  'button',
                  {
                    onClick: () =>
                      receiptSerial.value?.handleOpen({
                        documentNo: 'RECEIPT-001',
                        line: receiptLine
                      })
                  },
                  '测试收料 SN'
                ),
                h(ReceiptBinDialog, { ref: receiptBin }),
                h(ReceiptSerialDialog, { ref: receiptSerial }),
                h(SerialDialog, { ref: serialDialog }),
                h(
                  'button',
                  { onClick: () => transferCreate.value?.handleOpen(context) },
                  '测试调拨创建'
                ),
                h(
                  'button',
                  { onClick: () => adjustment.value?.handleOpen(context) },
                  '测试库存调整'
                ),
                h('button', { onClick: () => assembly.value?.handleOpen(context) }, '测试库存组装'),
                h(TransferCreateDialog, { ref: transferCreate }),
                h(AdjustmentDialog, { ref: adjustment }),
                h(AssemblyDialog, { ref: assembly }),
                ...['a', 'b'].map((key) =>
                  h(
                    'button',
                    {
                      onClick: () =>
                        assemblyDetail.value?.handleOpen(
                          {
                            id: `assembly-${key}`,
                            tenantId: 'tenant-test',
                            organizationId: 'source-org',
                            warehouseId: 'source-warehouse',
                            documentNo: `ASSEMBLY-${key.toUpperCase()}`,
                            projectId: null,
                            constructionNo: null,
                            targetMaterialId: 'finished-test',
                            targetBatchId: `finished-${key}`,
                            targetQuantity: 2,
                            targetAreaSqm: null,
                            totalCost: null,
                            remark: `组装${key}备注`,
                            createdAt: '2026-10-06T01:00:00Z',
                            warehouse: { warehouseCode: 'WH-TEST', warehouseName: '测试组装仓库' },
                            targetMaterial: {
                              materialCode: 'FINISHED-001',
                              materialName: '测试组装成品'
                            },
                            targetBatch: {
                              batchNo: `FINISHED-${key}`,
                              lengthMm: null,
                              widthMm: null,
                              thicknessMm: null
                            }
                          },
                          '公共库存'
                        )
                    },
                    `测试组装详情${key}`
                  )
                ),
                h(AssemblyDetail, { ref: assemblyDetail }),
                h(
                  'button',
                  {
                    onClick: () =>
                      countCreate.value?.handleOpen({
                        ...context,
                        organizations: [
                          {
                            id: 'org-test',
                            tenantId: 'tenant-test',
                            organizationCode: 'ORG-TEST',
                            organizationName: '测试库存组织',
                            organizationType: 'company',
                            status: '1',
                            enabledOn: '2026-10-01',
                            isDefault: true,
                            initializationClosedAt: null
                          }
                        ],
                        warehouses: new URLSearchParams(location.search).has('countScope')
                          ? ['first', 'second'].map((name) => ({
                              id: `warehouse-${name}`,
                              tenantId: 'tenant-test',
                              organizationId: 'org-test',
                              warehouseCode: name.toUpperCase(),
                              warehouseName: `测试盘点仓库 ${name}`,
                              warehouseType: 'normal',
                              status: 'enabled',
                              enableLocations: false,
                              businessScopes: []
                            }))
                          : [],
                        sections: new URLSearchParams(location.search).has('countScope')
                          ? [
                              {
                                id: 'section-active',
                                tenantId: 'tenant-test',
                                projectId: 'project-active',
                                constructionNo: 'COUNT-SECTION',
                                sectionName: '测试盘点施工号',
                                status: 'active',
                                remark: null,
                                createdAt: '',
                                updatedAt: ''
                              }
                            ]
                          : []
                      })
                  },
                  '测试盘点创建'
                ),
                h(
                  'button',
                  { onClick: () => section.value?.handleOpen(context) },
                  '测试施工号创建'
                ),
                h(
                  'button',
                  { onClick: () => issueCreate.value?.handleOpen({ ...context, warehouses: [] }) },
                  '测试出库申请创建'
                ),
                h(
                  'button',
                  { onClick: () => production.value?.handleOpen({ mode: 'create' }) },
                  '测试生产单据创建'
                ),
                h(
                  'button',
                  {
                    onClick: () => countAdjustment.value?.handleOpen({ ...context, mode: 'create' })
                  },
                  '测试盘盈单创建'
                ),
                h(
                  'button',
                  {
                    onClick: () => transferRequest.value?.handleOpen({ ...context, mode: 'create' })
                  },
                  '测试调拨申请创建'
                ),
                h(
                  'button',
                  {
                    onClick: () =>
                      transferBusiness.value?.handleOpen({
                        tenantId: context.tenantId,
                        mode: 'create',
                        kind: 'direct'
                      })
                  },
                  '测试直接调拨单创建'
                ),
                h(
                  'button',
                  {
                    onClick: () =>
                      transferBusiness.value?.handleOpen({
                        tenantId: context.tenantId,
                        mode: 'create',
                        kind: 'step'
                      })
                  },
                  '测试分步调拨单创建'
                ),
                ...(['direct', 'step'] as const).map((kind) =>
                  h(
                    'button',
                    {
                      onClick: () =>
                        transferBusiness.value?.handleOpen({
                          tenantId: context.tenantId,
                          mode: 'view',
                          kind,
                          documentId: 'transfer-document-test'
                        })
                    },
                    `测试${kind === 'direct' ? '直接' : '分步'}调拨单查看`
                  )
                ),
                h(
                  'button',
                  {
                    onClick: () =>
                      transferBusiness.value?.handleOpen({
                        tenantId: context.tenantId,
                        mode: 'edit',
                        kind: 'step_receipt',
                        documentId: 'receipt-document-test'
                      })
                  },
                  '测试分步调拨收货单编辑'
                ),
                h(
                  'button',
                  {
                    onClick: () =>
                      countAdjustment.value?.handleOpen({
                        ...context,
                        mode: 'edit',
                        documentId: 'document-test'
                      })
                  },
                  '测试盘点调整 edit'
                ),
                h(
                  'button',
                  {
                    onClick: () =>
                      countAdjustment.value?.handleOpen({
                        ...context,
                        mode: 'copy',
                        documentId: 'document-test'
                      })
                  },
                  '测试盘点调整 copy'
                ),
                h(
                  'button',
                  {
                    onClick: () =>
                      countAdjustment.value?.handleOpen({
                        ...context,
                        mode: 'view',
                        documentId: 'document-test'
                      })
                  },
                  '测试盘点调整 view'
                ),
                h(
                  'button',
                  {
                    onClick: () =>
                      transferRequest.value?.handleOpen({
                        ...context,
                        mode: 'edit',
                        documentId: 'document-test'
                      })
                  },
                  '测试调拨申请 edit'
                ),
                h(
                  'button',
                  {
                    onClick: () =>
                      transferRequest.value?.handleOpen({
                        ...context,
                        mode: 'copy',
                        documentId: 'document-test'
                      })
                  },
                  '测试调拨申请 copy'
                ),
                h(
                  'button',
                  {
                    onClick: () =>
                      transferRequest.value?.handleOpen({
                        ...context,
                        mode: 'view',
                        documentId: 'document-test'
                      })
                  },
                  '测试调拨申请 view'
                ),
                h(CountCreateDialog, { ref: countCreate }),
                h(SectionDialog, { ref: section }),
                h(
                  'button',
                  {
                    onClick: () =>
                      section.value?.handleOpen({
                        ...context,
                        row: {
                          id: 'section-test',
                          tenantId: 'tenant-test',
                          projectId: 'project-test',
                          constructionNo: 'TEST-SECTION-001',
                          sectionName: '测试施工分项',
                          status: 'active',
                          remark: null,
                          createdAt: '2026-10-05',
                          updatedAt: '2026-10-05'
                        }
                      })
                  },
                  '测试施工号编辑'
                ),
                h(IssueCreateDialog, { ref: issueCreate }),
                ...(['edit', 'copy', 'view', 'create'] as const).map((mode) =>
                  h(
                    'button',
                    {
                      onClick: () =>
                        production.value?.handleOpen({
                          mode,
                          documentId: mode === 'create' ? undefined : 'production-test'
                        })
                    },
                    `测试生产单据 ${mode}`
                  )
                ),
                h(ProductionDrawer, { ref: production, kind: productionKind }),
                h(CountAdjustmentDrawer, {
                  ref: countAdjustment,
                  kind:
                    new URLSearchParams(location.search).get('adjustmentKind') === 'loss'
                      ? 'loss'
                      : 'gain'
                }),
                h(TransferRequestDrawer, { ref: transferRequest }),
                h(TransferBusinessDrawer, { ref: transferBusiness })
              ])
          }
        )
    }
  })
)
app.use(store)
useUserStore(store).setUserInfo({
  userId: 'user-test',
  tenantId: 'tenant-test',
  platformSuper: !new URLSearchParams(location.search).has('importPermission')
})
if (new URLSearchParams(location.search).get('importPermission') === 'allow') {
  useMenuStore(store).setButtonList(
    ['WmsCountGain:Import', 'WmsCountLoss:Import', 'WmsTransfer:Import'].map((name) => ({
      name,
      path: '',
      type: 'button',
      meta: { title: name }
    }))
  )
}
useTenantScopeStore(store).selectedTenantId = 'tenant-test'
useUserStore(store).setDictMap({
  wmsCountStockType: [
    { name: '正常库存', code: 'wmsCountStockType', label: '', value: 'normal', status: '1' }
  ],
  wmsStockStatus: [
    { name: '可用', code: 'wmsStockStatus', label: '', value: 'available', status: '1' }
  ],
  wmsInitialStockType: [
    { name: '库存类型', code: 'wmsInitialStockType', label: '普通', value: 'normal', status: '1' }
  ],
  wmsInitialStockCondition: [
    {
      name: '库存状态',
      code: 'wmsInitialStockCondition',
      label: '可用',
      value: 'available',
      status: '1'
    }
  ],
  mdmBusinessOwnerType: [
    { name: '货主类型', code: 'mdmBusinessOwnerType', label: '自有', value: 'self', status: '1' },
    {
      name: '货主类型',
      code: 'mdmBusinessOwnerType',
      label: '供应商',
      value: 'supplier',
      status: '1'
    },
    {
      name: '货主类型',
      code: 'mdmBusinessOwnerType',
      label: '客户',
      value: 'customer',
      status: '1'
    }
  ],
  wmsAdjustmentCondition: [
    {
      name: '测试库存状态',
      code: 'wmsAdjustmentCondition',
      label: '正常',
      value: 'normal',
      status: '1'
    },
    {
      name: '测试库存状态',
      code: 'wmsAdjustmentCondition',
      label: '测试冻结状态',
      value: 'test_frozen',
      status: '1'
    }
  ],
  wmsProjectSectionStatus: [
    {
      name: '施工号状态',
      code: 'wmsProjectSectionStatus',
      label: '启用',
      value: 'active',
      status: '1'
    },
    {
      name: '施工号状态',
      code: 'wmsProjectSectionStatus',
      label: '关闭',
      value: 'closed',
      status: '1'
    }
  ]
})
app.use(language)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  })
)
setupGlobDirectives(app)
app.mount('#operation-preview')
