import { createApp, defineComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import language from '@/locales'
import { store } from '@/store'
import type { WmsDirectTransfer } from '../../../modules/art-supabase-wms/src/api/warehouse.types'
import DirectTransferDetail from '../../../modules/art-supabase-wms/src/views/transfer-business/direct-transfer/modules/direct-transfer-detail-drawer.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const transfer: WmsDirectTransfer = {
  id: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  sourceOrganizationId: null,
  targetOrganizationId: null,
  movementType: 'transfer',
  sourceBatchId: null,
  targetBatchId: null,
  materialId: '33333333-3333-4333-8333-333333333333',
  quantity: 12,
  areaSqm: 24,
  referenceNo: 'TEST-TRANSFER-0001',
  workOrderId: null,
  projectId: null,
  constructionNo: 'TEST-SECTION-001',
  targetProjectId: null,
  targetConstructionNo: null,
  occurredAt: '2026-10-05T01:00:00Z',
  remark: '测试调拨原因：长说明应完整换行。'.repeat(18),
  material: { materialCode: 'TEST-MATERIAL-001', materialName: '测试长名称物料'.repeat(12) },
  sourceBatch: {
    batchNo: 'TEST-SOURCE-BATCH-001',
    warehouseId: 'source',
    binId: null,
    warehouse: { warehouseCode: 'TEST-WH', warehouseName: '测试来源仓库' },
    bin: null
  },
  targetBatch: {
    batchNo: 'TEST-TARGET-BATCH-001',
    warehouseId: 'target',
    binId: null,
    warehouse: { warehouseCode: 'TEST-WH', warehouseName: '测试目标仓库' },
    bin: null
  },
  sourceOrganization: { organizationName: '测试来源库存组织'.repeat(8) },
  targetOrganization: { organizationName: '测试目标库存组织'.repeat(8) },
  serialMovements: [
    { serialId: 'serial-1', serial: { serialNo: 'TEST-SERIAL-0001' } },
    { serialId: 'serial-2', serial: { serialNo: 'TEST-LONG-SERIAL-'.repeat(20) } },
    { serialId: '44444444-4444-4444-8444-444444444444', serial: null }
  ]
}

const app = createApp(
  defineComponent({
    setup() {
      const drawer = ref<InstanceType<typeof DirectTransferDetail>>()
      return () =>
        h(
          ElConfigProvider,
          { locale: zhCn },
          {
            default: () =>
              h('div', [
                h(
                  'button',
                  { onClick: () => drawer.value?.handleOpen(transfer, '测试项目'.repeat(12)) },
                  '查看测试调拨详情'
                ),
                h(DirectTransferDetail, { ref: drawer })
              ])
          }
        )
    }
  })
)
app.use(store)
app.use(language)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  })
)
app.mount('#detail-preview')
