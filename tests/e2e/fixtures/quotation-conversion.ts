import { createApp, defineAsyncComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { setupGlobDirectives } from '@/directives'
import QuotationConversion from '../../../modules/art-supabase-scm/src/views/sales-document/modules/quotation-conversion-dialog.vue'
import QuotationBom from '../../../modules/art-supabase-scm/src/views/sales-document/modules/quotation-bom-dialog.vue'
import QuotationMaterial from '../../../modules/art-supabase-scm/src/views/sales-document/modules/quotation-material-dialog.vue'
import QuotationWorkOrder from '../../../modules/art-supabase-scm/src/views/sales-document/modules/quotation-work-order-dialog.vue'
import ScmDocumentDialog from '../../../modules/art-supabase-scm/src/views/sales-document/modules/scm-document-dialog.vue'
import type { ScmSalesDocument } from '../../../modules/art-supabase-scm/src/api'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const dialog = ref<InstanceType<typeof QuotationConversion>>()
const bom = ref<InstanceType<typeof QuotationBom>>()
const material = ref<InstanceType<typeof QuotationMaterial>>()
const workOrder = ref<InstanceType<typeof QuotationWorkOrder>>()
const salesDocument = ref<InstanceType<typeof ScmDocumentDialog>>()
const successes = ref(0)
const workspaceVisible = ref(false)
const QuotationWorkspace = defineAsyncComponent(
  () =>
    import('../../../modules/art-supabase-scm/src/views/sales-document/scm-document-workspace.vue')
)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }]
})
const quotation: ScmSalesDocument = {
  id: 'quote-a',
  tenantId: 'tenant-a',
  kind: 'sales_quotation',
  documentNo: 'TEST-A',
  documentTypeId: null,
  projectId: null,
  customerId: null,
  sourceId: null,
  status: 'draft',
  documentDate: '2026-10-05',
  deliveryDate: null,
  currency: 'CNY',
  details: {},
  lines: [
    {
      lineId: 'line-a',
      lineNo: 10,
      materialId: 'component-a',
      materialCode: 'C1',
      materialDescription: '转单物料',
      quantity: 2,
      unitPrice: 1,
      taxRate: 0
    }
  ],
  fees: [],
  paymentPlans: [],
  deliveryPlans: [],
  clauses: [],
  subtotal: 0,
  feeTotal: 0,
  taxAmount: 0,
  costTotal: 0,
  totalAmount: 0,
  grossProfit: 0,
  grossMargin: 0,
  remark: null,
  createdAt: '',
  updatedAt: ''
}
const app = createApp({
  render: () =>
    h('main', { class: 'art-page-view p-4 h-screen flex flex-col' }, [
      h(
        'button',
        {
          onClick: () => {
            useUserStore(store).setUserInfo({
              userId: 'scope-test-user',
              tenantId: 'tenant-a',
              platformSuper: true
            })
            workspaceVisible.value = true
          }
        },
        '报价列表验证'
      ),
      workspaceVisible.value ? h(QuotationWorkspace, { kind: 'sales_quotation' }) : null,
      h(
        'button',
        {
          onClick: () => {
            const selected = new URLSearchParams(location.search).get('scope') === 'selected'
            useUserStore(store).setUserInfo({
              userId: 'scope-test-user',
              tenantId: 'platform-tenant',
              platformSuper: true
            })
            useTenantScopeStore(store).selectedTenantId = selected ? 'selected-tenant' : null
            void salesDocument.value?.handleOpen({
              kind: 'sales_quotation',
              effectiveTenantId: selected ? 'selected-tenant' : null,
              tenantOptions: [
                { label: '平台租户', value: 'platform-tenant' },
                { label: '指定租户', value: 'selected-tenant' }
              ]
            })
          }
        },
        '新增报价'
      ),
      h(
        'button',
        {
          onClick: () =>
            salesDocument.value?.handleOpen({
              kind: 'sales_quotation',
              record: quotation,
              effectiveTenantId: 'tenant-a',
              tenantOptions: [{ label: '测试租户', value: 'tenant-a' }]
            })
        },
        '编辑报价'
      ),
      h(
        'button',
        {
          onClick: () => {
            useUserStore(store).setUserInfo({
              userId: 'scope-test-user',
              tenantId: 'tenant-a',
              platformSuper: true
            })
            void salesDocument.value?.handleOpen({
              kind: 'project_quotation',
              effectiveTenantId: 'tenant-a',
              tenantOptions: [{ label: '测试租户', value: 'tenant-a' }]
            })
          }
        },
        '新增项目报价单验证'
      ),
      h(ScmDocumentDialog, { ref: salesDocument, onSuccess: () => successes.value++ }),
      h('button', { onClick: () => router.push('/away') }, '离开报价页面'),
      h(
        'button',
        {
          onClick: () =>
            dialog.value?.handleOpen({ quotation, targets: ['sales_order', 'purchase_order'] })
        },
        '销售转单'
      ),
      h(
        'button',
        { onClick: () => dialog.value?.handleOpen({ quotation, targets: ['purchase_order'] }) },
        '采购转单'
      ),
      h('output', { 'data-testid': 'success-count' }, String(successes.value)),
      h(
        'button',
        {
          onClick: () =>
            bom.value?.handleOpen({
              ...quotation,
              status: 'effective',
              lines: [
                {
                  lineId: 'line-a',
                  lineNo: 1,
                  materialId: 'component-a',
                  materialCode: 'C1',
                  materialDescription: '测试组件',
                  quantity: 2,
                  unitPrice: 1,
                  taxRate: 0
                }
              ]
            })
        },
        '报价 BOM'
      ),
      h(QuotationBom, { ref: bom, onSuccess: () => successes.value++ }),
      h(
        'button',
        {
          onClick: () =>
            material.value?.handleOpen({
              ...quotation,
              lines: [
                {
                  lineId: 'line-a',
                  materialId: '',
                  materialCode: '',
                  materialDescription: '待编码物料',
                  lineNo: 10,
                  baseUnit: '米',
                  specification: 'M10×30',
                  brand: '测试品牌',
                  quantity: 2,
                  unitPrice: 1,
                  taxRate: 0
                },
                {
                  lineId: 'line-b',
                  lineNo: 20,
                  materialId: '',
                  materialCode: '',
                  materialDescription: '下批待编码物料',
                  baseUnit: '件',
                  specification: 'M8',
                  brand: '另一品牌',
                  quantity: 3,
                  unitPrice: 2,
                  taxRate: 0
                }
              ]
            })
        },
        '物料编码'
      ),
      h(
        'button',
        {
          onClick: () =>
            workOrder.value?.handleOpen({
              ...quotation,
              status: 'effective',
              lines: [
                {
                  lineId: 'line-a',
                  materialId: 'component-a',
                  materialCode: 'C1',
                  materialDescription: '工单组件',
                  quantity: 2,
                  unitPrice: 1,
                  taxRate: 0
                }
              ]
            })
        },
        '生产工单'
      ),
      h(QuotationMaterial, { ref: material, onSuccess: () => successes.value++ }),
      h(QuotationWorkOrder, { ref: workOrder, onSuccess: () => successes.value++ }),
      h(QuotationConversion, { ref: dialog, onSuccess: () => successes.value++ })
    ])
})
app.use(store)
app.use(language)
app.use(router)
setupGlobDirectives(app)
app.mount('#quotation-preview')
