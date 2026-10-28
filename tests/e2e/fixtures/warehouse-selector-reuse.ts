import { createApp, h, shallowRef } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import type { SmisPpeIssuanceStandard } from '@smis/api'
import { setupGlobDirectives } from '@/directives'
import PpeIssue from '@smis/views/safety-production/protective-equipment-management/ppe-issuance-record/modules/issuance-record-dialog.vue'
import ToolIssue from '@smis/views/safety-production/tool-requisition/tool-issuance-record/modules/issuance-record-dialog.vue'
import IssuanceStandard from '@smis/views/safety-production/shared/issuance-standard-dialog.vue'
import PpePush from '@smis/views/safety-production/protective-equipment-management/ppe-personal-requisition/modules/requisition-push-dialog.vue'
import ToolPush from '@smis/views/safety-production/tool-requisition/tool-personal-requisition/modules/requisition-push-dialog.vue'
import PurchaseDialog from '@scm/views/purchase-document/modules/purchase-dialog.vue'
import type { ScmPurchaseDocument } from '@scm/api/purchase-document.types'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const app = createApp({
  setup() {
    const ppeIssue = shallowRef<InstanceType<typeof PpeIssue>>()
    const toolIssue = shallowRef<InstanceType<typeof ToolIssue>>()
    const ppeStandard = shallowRef<InstanceType<typeof IssuanceStandard>>()
    const toolStandard = shallowRef<InstanceType<typeof IssuanceStandard>>()
    const ppePush = shallowRef<InstanceType<typeof PpePush>>()
    const toolPush = shallowRef<InstanceType<typeof ToolPush>>()
    const purchase = shallowRef<InstanceType<typeof PurchaseDialog>>()
    const scope = useTenantScopeStore(store)
    const standardRow: SmisPpeIssuanceStandard = {
      id: 'standard-test',
      tenantId: '11111111-1111-4111-8111-111111111111',
      standardNo: 'STD-001',
      standardName: '现有发放标准',
      ratedQuantity: 2,
      issuanceCycle: 'month',
      issuanceFrequency: 2,
      status: 'enabled',
      description: '原有说明',
      positions: [{ id: 'position-test', code: 'POS-001', name: '测试岗位' }],
      organizations: [],
      details: [
        {
          materialId: 'material-test',
          materialCode: 'MAT-001',
          materialName: '现有物料',
          categoryName: '测试类别',
          basicUnit: '件',
          imageUrls: [],
          quotaQuantity: 2,
          issuanceCycle: 'month',
          issuanceFrequency: 2,
          status: 'enabled',
          remark: '',
          sort: 10
        }
      ]
    }
    const receipt: ScmPurchaseDocument = {
      id: 'receipt-test',
      tenantId: '11111111-1111-4111-8111-111111111111',
      kind: 'receipt_notice',
      documentNo: 'RN-001',
      documentTypeId: null,
      projectId: null,
      supplierId: null,
      sourceId: null,
      status: 'draft',
      documentDate: '2026-10-08',
      deliveryDate: null,
      details: {},
      lines: [
        {
          lineId: 'line-test',
          materialId: 'material-test',
          materialCode: 'MAT-001',
          materialDescription: '测试批号物料',
          specification: '',
          unit: '件',
          quantity: 1,
          unitPrice: 0,
          taxRate: 0,
          discountRate: 0,
          gift: false,
          batchNo: 'BATCH-001'
        }
      ],
      paymentPlans: [],
      deliveryPlans: [],
      clauses: [],
      subtotal: 0,
      taxAmount: 0,
      totalAmount: 0,
      remark: null,
      createdAt: '2026-10-08',
      updatedAt: '2026-10-08'
    }
    return () =>
      h('main', { class: 'p-4 space-x-3' }, [
        h('button', { onClick: () => ppeIssue.value?.handleOpen({ mode: 'add' }) }, '打开用品发放'),
        h('button', { onClick: () => ppeStandard.value?.handleOpen({}) }, '打开用品标准'),
        h('button', { onClick: () => toolStandard.value?.handleOpen({}) }, '打开工具标准'),
        h(
          'button',
          { onClick: () => ppeStandard.value?.handleOpen({ row: standardRow }) },
          '编辑用品标准'
        ),
        h(
          'button',
          { onClick: () => toolStandard.value?.handleOpen({ row: standardRow }) },
          '编辑工具标准'
        ),
        h(
          'button',
          { onClick: () => scope.setTenantScope('22222222-2222-4222-8222-222222222222') },
          '切换租户 B'
        ),
        h(
          'button',
          { onClick: () => toolIssue.value?.handleOpen({ mode: 'add' }) },
          '打开工具发放'
        ),
        h('button', { onClick: () => ppePush.value?.handleOpen([]) }, '打开用品下推'),
        h('button', { onClick: () => toolPush.value?.handleOpen([]) }, '打开工具下推'),
        h(
          'button',
          {
            onClick: () => purchase.value?.handleOpen({ kind: 'receipt_notice', record: receipt })
          },
          '打开收料批号'
        ),
        h(PpeIssue, { ref: ppeIssue }),
        h(
          'button',
          {
            onClick: () =>
              purchase.value?.handleOpen({ kind: 'purchase_order', initialSourceId: 'source-test' })
          },
          '打开采购加载校验'
        ),
        h(ToolIssue, { ref: toolIssue }),
        h(IssuanceStandard, { ref: ppeStandard, kind: 'ppe' }),
        h(IssuanceStandard, { ref: toolStandard, kind: 'tool' }),
        h(PpePush, { ref: ppePush }),
        h(ToolPush, { ref: toolPush }),
        h(PurchaseDialog, { ref: purchase })
      ])
  }
})
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'warehouse-selector-test',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: true
})
const scope = useTenantScopeStore(store)
scope.tenantOptions = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    tenantCode: 'A',
    tenantName: '租户 A',
    builtinType: 'platform'
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    tenantCode: 'B',
    tenantName: '租户 B',
    builtinType: 'business'
  }
]
scope.scopeOwnerUserId = 'warehouse-selector-test'
scope.setTenantScope('11111111-1111-4111-8111-111111111111')
app.mount('#warehouse-selector-preview')
