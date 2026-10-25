import { createApp, defineComponent, h, ref } from 'vue'
import { useEventListener } from '@vueuse/core'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { setupGlobDirectives } from '@/directives'
import { useUserStore } from '@/store/modules/user'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import ScmDocumentDetailDrawer from '../../../modules/art-supabase-scm/src/views/sales-document/modules/scm-document-detail-drawer.vue'
import type { ScmSalesDocument } from '@scm/api'
import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

import WorkflowAnalyticsDialog from '@/views/workflow/monitor/modules/workflow-analytics-dialog.vue'
import WorkflowHistoryDrawer from '@/components/business/workflow-business-history/workflow-business-history-drawer.vue'

type OverlayKind = 'drawer' | 'dialog'
const tenantId = '11111111-1111-4111-8111-111111111111'
const quotation: ScmSalesDocument = {
  id: '22222222-2222-4222-8222-222222222222',
  tenantId,
  kind: 'sales_quotation',
  documentNo: 'TEST-LONG-QUOTE',
  documentTypeId: null,
  projectId: null,
  customerId: null,
  sourceId: null,
  status: 'draft',
  documentDate: '2026-10-08',
  deliveryDate: null,
  currency: 'CNY',
  details: {},
  lines: Array.from({ length: 60 }, (_, index) => ({
    lineId: `test-line-${index}`,
    lineNo: index + 1,
    materialId: '44444444-4444-4444-8444-444444444444',
    materialCode: `TEST-${index}`,
    materialDescription: `验收物料 ${index + 1}`,
    quantity: 1,
    unitPrice: 1,
    taxRate: 0
  })),
  fees: [],
  paymentPlans: [],
  deliveryPlans: [],
  clauses: [],
  subtotal: 60,
  feeTotal: 0,
  taxAmount: 0,
  costTotal: 0,
  totalAmount: 60,
  grossProfit: 0,
  grossMargin: 0,
  remark: null,
  createdAt: '',
  updatedAt: ''
}
const Preview = defineComponent({
  setup() {
    const drawer = ref<ArtDrawerExpose>()
    const scmDrawer = ref<InstanceType<typeof ScmDocumentDetailDrawer>>()
    const dialog = ref<ArtDialogExpose>()
    const analytics = ref<InstanceType<typeof WorkflowAnalyticsDialog>>()
    const history = ref<InstanceType<typeof WorkflowHistoryDrawer>>()
    const drawerLoading = ref(false)
    const dialogLoading = ref(false)
    useEventListener(window, 'overlay-preview-loading', (event) => {
      const { kind, loading } = (event as CustomEvent<{ kind: OverlayKind; loading: boolean }>)
        .detail
      if (kind === 'drawer') drawerLoading.value = loading
      else dialogLoading.value = loading
    })
    const content = () =>
      h('div', { class: 'flex min-w-0 flex-col gap-4' }, [
        h('button', { type: 'button' }, '正文操作'),
        ...Array.from({ length: 50 }, (_, index) =>
          h('p', { class: 'py-4' }, `长内容测试行 ${index + 1}`)
        )
      ])
    return () =>
      h('main', [
        h(
          'button',
          { type: 'button', onClick: () => void scmDrawer.value?.handleOpen(quotation) },
          '打开长销售报价详情'
        ),
        h(ScmDocumentDetailDrawer, { ref: scmDrawer }),
        h(
          'button',
          { type: 'button', onClick: () => analytics.value?.handleOpen() },
          '打开审批分析'
        ),
        h(WorkflowAnalyticsDialog, { ref: analytics }),
        h(
          'button',
          {
            type: 'button',
            onClick: () =>
              history.value?.handleOpen({
                businessType: 'expense',
                businessId: 'test-business',
                businessTitle: '测试审批历程'
              })
          },
          '打开审批历程'
        ),
        h(WorkflowHistoryDrawer, { ref: history }),
        h(
          'button',
          { type: 'button', onClick: () => void drawer.value?.handleOpen() },
          '打开测试抽屉'
        ),
        h(
          'button',
          { type: 'button', onClick: () => void dialog.value?.handleOpen() },
          '打开测试弹窗'
        ),
        h(
          ArtDrawer,
          { ref: drawer, title: '加载视口抽屉', size: 'lg', loading: drawerLoading.value },
          { default: content }
        ),
        h(
          ArtDialog,
          {
            ref: dialog,
            title: '加载视口弹窗',
            size: 'lg',
            contentHeight: 360,
            loading: dialogLoading.value
          },
          { default: content }
        )
      ])
  }
})
const app = createApp(Preview)
app.use(store)
useUserStore(store).setUserInfo({
  userId: '33333333-3333-4333-8333-333333333333',
  tenantId,
  tenant: { tenantCode: 'visual-test', tenantName: '视觉验收租户' },
  platformSuper: false
})
useTenantScopeStore(store).selectedTenantId = tenantId
app.use(language)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  })
)
setupGlobDirectives(app)
app.mount('#overlay-loading-preview')
