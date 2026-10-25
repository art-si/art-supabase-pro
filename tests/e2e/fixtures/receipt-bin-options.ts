import { createApp, h, ref } from 'vue'
import language from '@/locales'
import { store } from '@/store'
import { fetchScmReceiptPlacementBins } from '@/api/scm-receipt-target'
import {
  fetchScmRemainingSourceLines,
  fetchScmLoadingOutboundRows,
  fetchScmCustomerOptions,
  fetchScmMaterialOptions,
  fetchScmDocumentTypeOptions,
  fetchScmSourceOptions,
  fetchScmEngineeringReferenceOptions
} from '../../../modules/art-supabase-scm/src/api/sales-document'
import {
  fetchScmPurchaseMaterialCategories,
  fetchScmPurchaseProjectOptions,
  fetchScmPurchaseWarehouseOptions,
  fetchScmPurchaseBinOptions,
  fetchScmPurchaseCustomerOptions,
  fetchScmProjectSections,
  fetchScmPurchaseSourceOptions,
  fetchScmRecentPurchasePrices
} from '../../../modules/art-supabase-scm/src/api/purchase-document'

const optionLoaders = {
  recentPrices: async (tenantId: string) =>
    Object.fromEntries(
      await fetchScmRecentPurchasePrices(tenantId, [
        'material-first',
        'material-last',
        'material-last',
        ''
      ])
    ),
  emptyPrices: async (tenantId: string) =>
    Object.fromEntries(await fetchScmRecentPurchasePrices(tenantId, ['', ''])),
  purchaseSources: (tenantId: string) =>
    fetchScmPurchaseSourceOptions('purchase_contract', tenantId),
  purchaseRequestSources: (tenantId: string) =>
    fetchScmPurchaseSourceOptions('purchase_request', tenantId),
  engineering: fetchScmEngineeringReferenceOptions,
  salesSources: (tenantId: string) =>
    fetchScmSourceOptions('sales_order', tenantId, 'project-a', 'customer-a'),
  salesTypes: (tenantId: string) => fetchScmDocumentTypeOptions(tenantId, 'SalesOrder'),
  salesMaterials: fetchScmMaterialOptions,
  salesCustomers: (tenantId: string) => fetchScmCustomerOptions(tenantId, '测试'),
  outbound: fetchScmLoadingOutboundRows,
  projects: fetchScmPurchaseProjectOptions,
  warehouses: fetchScmPurchaseWarehouseOptions,
  bins: fetchScmPurchaseBinOptions,
  customers: fetchScmPurchaseCustomerOptions,
  sections: fetchScmProjectSections,
  remaining: (tenantId: string) =>
    fetchScmRemainingSourceLines({
      id: 'source-a',
      tenantId,
      kind: 'sales_order',
      lines: [
        {
          lineId: 'line-a',
          materialId: 'material-a',
          materialCode: 'A',
          materialDescription: '测试物料',
          quantity: 10010,
          unitPrice: 1,
          taxRate: 0
        }
      ]
    })
}

const result = ref('尚未查询')
const app = createApp({
  render: () =>
    h('main', [
      h(
        'button',
        {
          onClick: async () => {
            try {
              const mode = new URLSearchParams(location.search).get('mode')
              if (mode && mode in optionLoaders) {
                result.value = JSON.stringify(
                  await optionLoaders[mode as keyof typeof optionLoaders]('tenant-a')
                )
                return
              }
              result.value = JSON.stringify(
                await (new URLSearchParams(location.search).has('categories')
                  ? fetchScmPurchaseMaterialCategories('tenant-a')
                  : fetchScmReceiptPlacementBins('tenant-a', 'warehouse-a'))
              )
            } catch {
              result.value = '查询失败'
            }
          }
        },
        '加载库位'
      ),
      h('output', { 'data-testid': 'bin-result' }, result.value)
    ])
})
app.use(store)
app.use(language)
app.mount('#bin-options-preview')
